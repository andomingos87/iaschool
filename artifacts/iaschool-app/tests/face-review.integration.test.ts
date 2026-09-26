// Testes de integração do M6 contra o Supabase real (migrations
// iaschool_fase3_biometric_events, iaschool_fase3_storage_purge_queue,
// iaschool_fase3_review_rpcs, iaschool_fase3_purge_expired_biometrics):
//   1. A tela lê a revisão do próprio evento e é recusada na de outra escola.
//   2. `confirm_faces_bulk` é tudo ou nada: rosto de outra escola no array
//      não confirma nenhum.
//   3. Dois revisores no mesmo aluno ao mesmo tempo não confirmam duas vezes
//      nem perdem face, e a trilha ganha uma linha por lote (spec §12.3).
//   4. Nenhuma linha `confirmed` sem `reviewed_by`/`reviewed_at` (D6, R7).
//   5. "Criança de fora"/"adulto" apagam recorte e vetor e mantêm
//      `bbox`/`det_score` (§9.3.1), enfileirando o objeto para expurgo.
//   6. `biometric_events` é append-only pela API e invisível para a outra
//      escola; `storage_purge_queue` é invisível para qualquer cliente.
//   7. Confirmar exige `biometric_sorting` ativo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminApproveSchool,
  adminInsert,
  adminRest,
  adminRpc,
  createTestUser,
  deleteTestUser,
  envReady,
  userInsert,
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
let studentA = "";
let studentB = "";
let authA = "";
let eventA = "";
let eventB = "";
let photoA = "";
let photoB = "";

const EMBEDDING = `[1${",0".repeat(511)}]`;
const BBOX = { x: 10, y: 20, w: 120, h: 120 };

async function newPhoto(schoolId: string, eventId: string, uid: string) {
  return adminInsert("photos", {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/${crypto.randomUUID()}.jpg`,
    content_hash: crypto.randomUUID().replace(/-/g, "").repeat(2),
    original_filename: "cena.jpg",
    bytes: 1000,
    status: "processed",
    uploaded_by: uid,
  });
}

/** Rosto sugerido do aluno A, com vetor (só existe sob consentimento — D5). */
async function newFace(
  schoolId: string,
  photoId: string,
  opts: { studentId?: string; embedding?: boolean; state?: string } = {},
) {
  return adminInsert("photo_faces", {
    school_id: schoolId,
    photo_id: photoId,
    bbox: BBOX,
    crop_path: `${schoolId}/crops/${crypto.randomUUID()}.jpg`,
    det_score: 0.94,
    ...(opts.embedding ? { embedding: EMBEDDING } : {}),
    ...(opts.studentId ? { student_id: opts.studentId, match_score: 0.9 } : {}),
    state: opts.state ?? (opts.studentId ? "suggested" : "unassigned"),
  });
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "rev-a", signupRole: "school", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "rev-b", signupRole: "school", schoolName: "Escola B" });
  createdUsers.push(schoolA.id, schoolB.id);
  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);

  studentA = await adminInsert("students", {
    school_id: schoolAId,
    owner_id: schoolA.id,
    name: "Aluno A",
    whatsapp: `+5511${Math.floor(1e8 + Math.random() * 8e8)}`,
    photos: [],
    enrollment_number: `MAT-${Date.now()}`,
  });
  studentB = await adminInsert("students", {
    school_id: schoolBId,
    owner_id: schoolB.id,
    name: "Aluno B",
    whatsapp: `+5511${Math.floor(1e8 + Math.random() * 8e8)}`,
    photos: [],
  });

  authA = await adminInsert("authorizations", {
    school_id: schoolAId,
    student_id: studentA,
    scope: "biometric_sorting",
    granted_at: new Date().toISOString(),
    created_by: schoolA.id,
  });
  await adminInsert("authorizations", {
    school_id: schoolBId,
    student_id: studentB,
    scope: "biometric_sorting",
    granted_at: new Date().toISOString(),
    created_by: schoolB.id,
  });

  eventA = await adminInsert("events", {
    school_id: schoolAId,
    name: "Festa A",
    event_date: "2026-06-20",
    status: "review",
    created_by: schoolA.id,
  });
  eventB = await adminInsert("events", {
    school_id: schoolBId,
    name: "Festa B",
    event_date: "2026-06-20",
    status: "review",
    created_by: schoolB.id,
  });
  photoA = await newPhoto(schoolAId, eventA, schoolA.id);
  photoB = await newPhoto(schoolBId, eventB, schoolB.id);
}, 120_000);

afterAll(async () => {
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("leitura da revisão", () => {
  it("o membro vê os rostos pendentes do próprio evento, com nome e faixa de confiança", async () => {
    const face = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const res = await userRpc(schoolA, "event_review_faces", { p_event: eventA });
    expect(res.status).toBeLessThan(300);
    const row = (res.rows as Array<Record<string, unknown>>).find((r) => r["face_id"] === face);
    expect(row).toBeTruthy();
    expect(row!["student_name"]).toBe("Aluno A");
    // 0,90 de semelhança sem segundo colocado: passa nos dois cortes.
    expect(row!["high_confidence"]).toBe(true);
    // O vetor não está entre as colunas devolvidas.
    expect(Object.keys(row!)).not.toContain("embedding");
    await adminRest(`photo_faces?id=eq.${face}`, { method: "DELETE" });
  });

  it("evento de outra escola é recusado, não devolvido vazio", async () => {
    const res = await userRpc(schoolA, "event_review_faces", { p_event: eventB });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const counts = await userRpc(schoolA, "event_review_counts", { p_event: eventB });
    expect(counts.status).toBeGreaterThanOrEqual(400);
  });

  it("anon não abre a revisão", async () => {
    const resp = await fetch(
      `${process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]}/rest/v1/rpc/event_review_faces`,
      {
        method: "POST",
        headers: {
          apikey: process.env["VITE_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_event: eventA }),
      },
    );
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });
});

describe("confirm_faces_bulk", () => {
  it("confirma o lote, grava o revisor em cada linha e uma só linha na trilha", async () => {
    const f1 = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const f2 = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });

    const before = await userSelect(
      schoolA,
      "biometric_events",
      `student_id=eq.${studentA}&kind=eq.face_confirmed&select=id`,
    );

    const res = await userRpc(schoolA, "confirm_faces_bulk", {
      p_face_ids: [f1, f2],
      p_student_id: studentA,
    });
    expect(res.status).toBeLessThan(300);
    expect(res.body).toBe(2);

    const rows = await userSelect(
      schoolA,
      "photo_faces",
      `id=in.(${f1},${f2})&select=id,state,student_id,reviewed_by,reviewed_at`,
    );
    expect(rows.rows).toHaveLength(2);
    for (const r of rows.rows as Array<Record<string, unknown>>) {
      expect(r["state"]).toBe("confirmed");
      expect(r["student_id"]).toBe(studentA);
      // D6/R7: nenhuma linha confirmada sem quem confirmou, nem vinda de lote.
      expect(r["reviewed_by"]).toBe(schoolA.id);
      expect(r["reviewed_at"]).toBeTruthy();
    }

    const after = await userSelect(
      schoolA,
      "biometric_events",
      `student_id=eq.${studentA}&kind=eq.face_confirmed&select=id,detail`,
    );
    expect(after.rows.length).toBe(before.rows.length + 1);
    const detail = (after.rows.at(-1) as Record<string, Record<string, unknown>>)["detail"]!;
    expect(detail["count"]).toBe(2);
    expect(detail["face_ids"]).toHaveLength(2);

    await adminRest(`photo_faces?id=in.(${f1},${f2})`, { method: "DELETE" });
  });

  it("dois revisores no mesmo aluno ao mesmo tempo: confirma uma vez só, sem perder face", async () => {
    const f1 = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const f2 = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });

    const [r1, r2] = await Promise.all([
      userRpc(schoolA, "confirm_faces_bulk", { p_face_ids: [f1, f2], p_student_id: studentA }),
      userRpc(schoolA, "confirm_faces_bulk", { p_face_ids: [f1, f2], p_student_id: studentA }),
    ]);
    expect(r1.status).toBeLessThan(300);
    expect(r2.status).toBeLessThan(300);
    // Uma das chamadas faz o trabalho; a outra é no-op. Nenhuma face escapa.
    expect(Number(r1.body) + Number(r2.body)).toBe(2);

    const rows = await userSelect(
      schoolA,
      "photo_faces",
      `id=in.(${f1},${f2})&select=id,state`,
    );
    expect(
      (rows.rows as Array<Record<string, unknown>>).every((r) => r["state"] === "confirmed"),
    ).toBe(true);

    await adminRest(`photo_faces?id=in.(${f1},${f2})`, { method: "DELETE" });
  });

  it("rosto de outra escola no array não confirma nenhum", async () => {
    const mine = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const theirs = await newFace(schoolBId, photoB);

    const res = await userRpc(schoolA, "confirm_faces_bulk", {
      p_face_ids: [mine, theirs],
      p_student_id: studentA,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const rows = await userSelect(schoolA, "photo_faces", `id=eq.${mine}&select=state`);
    expect((rows.rows[0] as Record<string, unknown>)["state"]).toBe("suggested");

    await adminRest(`photo_faces?id=in.(${mine},${theirs})`, { method: "DELETE" });
  });

  it("rosto inexistente no array não confirma nenhum", async () => {
    const mine = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const res = await userRpc(schoolA, "confirm_faces_bulk", {
      p_face_ids: [mine, crypto.randomUUID()],
      p_student_id: studentA,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await userSelect(schoolA, "photo_faces", `id=eq.${mine}&select=state`);
    expect((rows.rows[0] as Record<string, unknown>)["state"]).toBe("suggested");
    await adminRest(`photo_faces?id=eq.${mine}`, { method: "DELETE" });
  });

  it("confirmar exige biometric_sorting ativo", async () => {
    const face = await newFace(schoolAId, photoA, { studentId: studentA });
    await adminRest(`authorizations?id=eq.${authA}`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    const res = await userRpc(schoolA, "confirm_face", {
      p_face_id: face,
      p_student_id: studentA,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Reconceder é linha nova (a tabela é indelével): volta o consentimento.
    authA = await adminInsert("authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "biometric_sorting",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
    });
    const ok = await userRpc(schoolA, "confirm_face", {
      p_face_id: face,
      p_student_id: studentA,
    });
    expect(ok.status).toBeLessThan(300);
    expect(ok.body).toBe(1);
    await adminRest(`photo_faces?id=eq.${face}`, { method: "DELETE" });
  });
});

describe("reject_face", () => {
  it('"adulto / equipe" apaga recorte e vetor, mantém bbox e det_score', async () => {
    const face = await newFace(schoolAId, photoA, { studentId: studentA, embedding: true });
    const res = await userRpc(schoolA, "reject_face", {
      p_face_id: face,
      p_state: "adult_or_staff",
      p_reason: "professora",
    });
    expect(res.status).toBeLessThan(300);
    // A RPC devolve o caminho do recorte para o cliente apagar o objeto.
    expect(typeof res.body).toBe("string");

    const rows = await userSelect(
      schoolA,
      "photo_faces",
      `id=eq.${face}&select=state,crop_path,student_id,bbox,det_score,reviewed_by`,
    );
    const row = rows.rows[0] as Record<string, unknown>;
    expect(row["state"]).toBe("adult_or_staff");
    expect(row["crop_path"]).toBeNull();
    expect(row["student_id"]).toBeNull();
    // §9.3.1: sem bbox não há o que desfocar na entrega.
    expect(row["bbox"]).toMatchObject(BBOX);
    expect(row["det_score"]).toBeCloseTo(0.94, 2);
    expect(row["reviewed_by"]).toBe(schoolA.id);

    // O objeto do recorte entrou na fila de expurgo do Storage.
    const queued = await adminRest(
      `storage_purge_queue?path=eq.${encodeURIComponent(String(res.body))}&select=bucket,reason`,
    );
    const queuedRows = (await queued.json()) as Array<Record<string, unknown>>;
    expect(queuedRows[0]?.["bucket"]).toBe("face-crops");

    await adminRest(`photo_faces?id=eq.${face}`, { method: "DELETE" });
  });

  it("estado inválido é recusado", async () => {
    const face = await newFace(schoolAId, photoA);
    const res = await userRpc(schoolA, "reject_face", { p_face_id: face, p_state: "confirmed" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await adminRest(`photo_faces?id=eq.${face}`, { method: "DELETE" });
  });

  it("rosto de outra escola não é recusável", async () => {
    const face = await newFace(schoolBId, photoB);
    const res = await userRpc(schoolA, "reject_face", { p_face_id: face, p_state: "rejected" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await adminRest(`photo_faces?id=eq.${face}`, { method: "DELETE" });
  });
});

describe("biometric_events", () => {
  it("é append-only pela API: o cliente não insere, não altera e não apaga", async () => {
    const insert = await userInsert(schoolA, "biometric_events", {
      school_id: schoolAId,
      student_id: studentA,
      kind: "face_confirmed",
      detail: { forjado: true },
    });
    expect(insert).toBeGreaterThanOrEqual(400);

    const existing = await userSelect(
      schoolA,
      "biometric_events",
      `school_id=eq.${schoolAId}&select=id&limit=1`,
    );
    const id = (existing.rows[0] as Record<string, unknown> | undefined)?.["id"];
    expect(id).toBeTruthy();

    const patch = await userUpdate(schoolA, "biometric_events", `id=eq.${id}`, {
      kind: "face_purged",
    });
    // Sem privilégio de update a API recusa; nem chega à RLS.
    expect(patch.status).toBeGreaterThanOrEqual(400);

    const del = await fetch(
      `${process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]}/rest/v1/biometric_events?id=eq.${id}`,
      {
        method: "DELETE",
        headers: {
          apikey: process.env["VITE_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "",
          Authorization: `Bearer ${schoolA.token}`,
        },
      },
    );
    expect(del.status).toBeGreaterThanOrEqual(400);
  });

  it("o aceite e a revogação viram linha sozinhos, e a escola B não as lê", async () => {
    const mine = await userSelect(
      schoolA,
      "biometric_events",
      `student_id=eq.${studentA}&kind=in.(consent_granted,consent_revoked)&select=kind,student_ref`,
    );
    const kinds = (mine.rows as Array<Record<string, unknown>>).map((r) => r["kind"]);
    expect(kinds).toContain("consent_granted");
    expect(kinds).toContain("consent_revoked");
    // A trilha guarda a matrícula, nunca o nome do aluno.
    const refs = (mine.rows as Array<Record<string, unknown>>).map((r) => r["student_ref"]);
    expect(refs.every((r) => typeof r === "string" && !String(r).includes("Aluno"))).toBe(true);

    const theirs = await userSelect(
      schoolB,
      "biometric_events",
      `student_id=eq.${studentA}&select=id`,
    );
    expect(theirs.rows).toHaveLength(0);
  });
});

describe("fila de expurgo e limiares", () => {
  it("storage_purge_queue é invisível para o cliente", async () => {
    const res = await userSelect(schoolA, "storage_purge_queue", "select=id");
    expect(res.rows).toHaveLength(0);
    const claim = await userRpc(schoolA, "claim_storage_purge", { p_limit: 10 });
    expect(claim.status).toBeGreaterThanOrEqual(400);
  });

  it("o cliente não dispara o expurgo", async () => {
    const res = await userRpc(schoolA, "purge_expired_biometrics", {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    // O `service_role` (pg_cron) dispara.
    const asService = await adminRpc("purge_expired_biometrics", {});
    expect(asService.status).toBeLessThan(300);
  });

  it("os cortes da confirmação em lote são legíveis e só o papel dev os muda", async () => {
    const res = await userSelect(
      schoolA,
      "face_recognition_settings",
      "id=eq.1&select=bulk_min_sim,bulk_min_margin",
    );
    const row = res.rows[0] as Record<string, number>;
    expect(row["bulk_min_sim"]).toBeCloseTo(0.64, 2);
    expect(row["bulk_min_margin"]).toBeCloseTo(0.15, 2);

    // Aqui existe policy de update (só `dev`): a RLS não deixa linha nenhuma
    // passar, então a API responde sem erro e sem ter alterado nada.
    const patch = await userUpdate(schoolA, "face_recognition_settings", "id=eq.1", {
      bulk_min_sim: 0.2,
    });
    expect(patch.rows).toHaveLength(0);
    const after = await userSelect(
      schoolA,
      "face_recognition_settings",
      "id=eq.1&select=bulk_min_sim",
    );
    expect((after.rows[0] as Record<string, number>)["bulk_min_sim"]).toBeCloseTo(0.64, 2);
  });
});
