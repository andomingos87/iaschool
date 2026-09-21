// Testes de integração do M2 contra o Supabase real (migration
// iaschool_fase2_photos_batch_jobs_buckets):
//   1. `unique (event_id, content_hash)` barra a foto repetida no mesmo evento
//      e deixa passar o mesmo hash em outro evento.
//   2. Membro da escola A não lê nem insere fotos na escola B.
//   3. UPDATE pela API autenticada só alcança `deleted_at` (trigger).
//   4. `batch_jobs`: membro abre e fecha o próprio lote; não lê o de outra escola.
//   5. `event_photo_counts` conta só fotos ativas da escola pedida.
//   6. Storage: `event-photos` exige o id da escola no caminho e só aceita JPEG.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminApproveSchool,
  adminInsert,
  adminRest,
  createTestUser,
  deleteTestUser,
  envReady,
  userInsert,
  userInsertReturning,
  userRpc,
  userSelect,
  userUpdate,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes de RLS exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let schoolA: TestUser;
let schoolB: TestUser;
const createdUsers: string[] = [];
let schoolAId = "";
let schoolBId = "";
let eventA1 = "";
let eventA2 = "";
let eventB = "";
const HASH = "a".repeat(64);

function photoRow(schoolId: string, eventId: string, uid: string, hash: string) {
  return {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/${crypto.randomUUID()}.jpg`,
    content_hash: hash,
    original_filename: "IMG_0001.jpg",
    bytes: 1234,
    uploaded_by: uid,
  };
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "photos-a", signupRole: "school", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "photos-b", signupRole: "school", schoolName: "Escola B" });
  createdUsers.push(schoolA.id, schoolB.id);
  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);

  eventA1 = await adminInsert("events", {
    school_id: schoolAId, name: "Evento A1", event_date: "2026-06-20", created_by: schoolA.id,
  });
  eventA2 = await adminInsert("events", {
    school_id: schoolAId, name: "Evento A2", event_date: "2026-06-21", created_by: schoolA.id,
  });
  eventB = await adminInsert("events", {
    school_id: schoolBId, name: "Evento B", event_date: "2026-06-20", created_by: schoolB.id,
  });
}, 120_000);

afterAll(async () => {
  // Fotos e lotes cascateiam pelo evento; evento pela escola.
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("photos: dedup por (event_id, content_hash)", () => {
  it("a segunda foto com o mesmo hash no mesmo evento falha com 23505; em outro evento passa", async () => {
    const first = await userInsertReturning(schoolA, "photos", photoRow(schoolAId, eventA1, schoolA.id, HASH));
    expect(first.status).toBe(201);

    const dup = await fetch(`${SUPABASE_URL}/rest/v1/photos`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${schoolA.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(photoRow(schoolAId, eventA1, schoolA.id, HASH)),
    });
    expect(dup.status).toBe(409);
    const body = (await dup.json()) as { code?: string };
    expect(body.code).toBe("23505");

    const other = await userInsert(schoolA, "photos", photoRow(schoolAId, eventA2, schoolA.id, HASH));
    expect(other).toBe(201);
  });
});

describe("photos: isolamento por escola", () => {
  it("membro de B não vê fotos de A", async () => {
    const { status, rows } = await userSelect(schoolB, "photos", `select=id&event_id=eq.${eventA1}`);
    expect(status).toBe(200);
    expect(rows).toHaveLength(0);
  });

  it("membro de A não insere foto na escola B, nem com uploaded_by de outro", async () => {
    expect(await userInsert(schoolA, "photos", photoRow(schoolBId, eventB, schoolA.id, "b".repeat(64)))).toBeGreaterThanOrEqual(400);
    expect(await userInsert(schoolA, "photos", photoRow(schoolAId, eventA2, schoolB.id, "c".repeat(64)))).toBeGreaterThanOrEqual(400);
  });

  it("a foto não pode apontar para um evento de outra escola (trigger, 23514)", async () => {
    // school_id de A com event_id de B: a policy por school_id deixaria
    // passar; o trigger photos_check_event_school barra.
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/photos`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${schoolA.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(photoRow(schoolAId, eventB, schoolA.id, "d".repeat(64))),
    });
    expect(resp.status).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as { code?: string };
    expect(body.code).toBe("23514");

    const batch = await userInsert(schoolA, "batch_jobs", {
      school_id: schoolAId, event_id: eventB, kind: "ingest", created_by: schoolA.id,
    });
    expect(batch).toBeGreaterThanOrEqual(400);
  });
});

describe("photos: UPDATE do cliente só alcança deleted_at", () => {
  it("mover para a lixeira funciona; mudar status/hash/caminho é ignorado", async () => {
    const created = await userInsertReturning(schoolA, "photos", photoRow(schoolAId, eventA2, schoolA.id, "e".repeat(64)));
    const id = created.row!["id"] as string;

    const tampered = await userUpdate(schoolA, "photos", `id=eq.${id}`, {
      status: "processed",
      content_hash: "f".repeat(64),
      storage_path: "hack/hack.jpg",
      faces_count: 99,
    });
    expect(tampered.status).toBeLessThan(300);
    const after = tampered.rows[0] as Record<string, unknown>;
    expect(after["status"]).toBe("pending");
    expect(after["content_hash"]).toBe("e".repeat(64));
    expect(after["faces_count"]).toBeNull();
    expect(after["storage_path"]).toBe(created.row!["storage_path"]);

    const trashed = await userUpdate(schoolA, "photos", `id=eq.${id}`, {
      deleted_at: new Date().toISOString(),
    });
    expect(trashed.status).toBeLessThan(300);
    expect((trashed.rows[0] as Record<string, unknown>)["deleted_at"]).not.toBeNull();

    // Membro de B não atualiza nada de A (0 linhas).
    const foreign = await userUpdate(schoolB, "photos", `id=eq.${id}`, { deleted_at: null });
    expect(foreign.rows).toHaveLength(0);
  });

  it("membro não faz hard delete", async () => {
    const created = await userInsertReturning(schoolA, "photos", photoRow(schoolAId, eventA2, schoolA.id, "1".repeat(64)));
    const id = created.row!["id"] as string;
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/photos?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${schoolA.token}`, Prefer: "return=representation" },
    });
    const rows = resp.ok ? ((await resp.json()) as unknown[]) : [];
    expect(rows).toHaveLength(0);
    const still = await userSelect(schoolA, "photos", `select=id&id=eq.${id}`);
    expect(still.rows).toHaveLength(1);
  });
});

describe("batch_jobs", () => {
  it("membro abre e fecha o próprio lote; B não o vê", async () => {
    const created = await userInsertReturning(schoolA, "batch_jobs", {
      school_id: schoolAId, event_id: eventA1, kind: "ingest", status: "running", total: 10, created_by: schoolA.id,
    });
    expect(created.status).toBe(201);
    const id = created.row!["id"] as string;

    const closed = await userUpdate(schoolA, "batch_jobs", `id=eq.${id}`, {
      status: "done", total: 8, failed: 2, finished_at: new Date().toISOString(),
    });
    expect(closed.rows).toHaveLength(1);
    expect((closed.rows[0] as Record<string, unknown>)["status"]).toBe("done");

    const foreign = await userSelect(schoolB, "batch_jobs", `select=id&id=eq.${id}`);
    expect(foreign.rows).toHaveLength(0);
  });

  it("created_by de outra pessoa é recusado", async () => {
    const status = await userInsert(schoolA, "batch_jobs", {
      school_id: schoolAId, event_id: eventA1, kind: "ingest", created_by: schoolB.id,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe("event_photo_counts", () => {
  it("conta só fotos ativas da escola pedida e nada da escola alheia", async () => {
    const mine = await userRpc(schoolA, "event_photo_counts", { p_school: schoolAId });
    expect(mine.status).toBe(200);
    const byEvent = new Map(
      (mine.rows as Array<{ event_id: string; photos: number }>).map((r) => [r.event_id, Number(r.photos)]),
    );
    expect(byEvent.get(eventA1)).toBe(1);
    // eventA2: HASH + "1".repeat + ("e" foi para a lixeira) = 2 ativas
    expect(byEvent.get(eventA2)).toBe(2);

    const foreign = await userRpc(schoolB, "event_photo_counts", { p_school: schoolAId });
    expect(foreign.status).toBe(200);
    expect(foreign.rows).toHaveLength(0);
  });
});

describe("storage: event-photos", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

  async function upload(user: TestUser, bucket: string, path: string, type = "image/jpeg", body: Uint8Array = JPEG) {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}`, "Content-Type": type },
      body,
    });
    return resp.status;
  }

  async function del(user: TestUser, bucket: string, path: string) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}` },
    });
  }

  it("membro sobe na pasta da própria escola, não na de outra nem sem prefixo", async () => {
    const own = `${schoolAId}/${eventA1}/${crypto.randomUUID()}.jpg`;
    expect(await upload(schoolA, "event-photos", own)).toBeLessThan(300);
    expect(await upload(schoolA, "event-photos", `${schoolBId}/${eventB}/x.jpg`)).toBeGreaterThanOrEqual(400);
    expect(await upload(schoolA, "event-photos", `solto-${Date.now()}.jpg`)).toBeGreaterThanOrEqual(400);
    // O membro consegue apagar o que subiu (desfazer corrida da chave única).
    await del(schoolA, "event-photos", own);
  });

  it("event-photos só aceita JPEG", async () => {
    const path = `${schoolAId}/${eventA1}/${crypto.randomUUID()}.png`;
    expect(await upload(schoolA, "event-photos", path, "image/png")).toBeGreaterThanOrEqual(400);
  });
});
