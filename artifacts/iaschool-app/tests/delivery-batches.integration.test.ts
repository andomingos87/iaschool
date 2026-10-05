// Integração do lote de entrega (Fase 5, W3) contra o projeto real, pelo
// pipeline de verdade: RPCs `delivery_preflight`/`create_delivery_batch`/
// `approve_delivery_batch`/`cancel_delivery_batch` + o `ingest-worker`
// publicado, que renderiza os derivados e conclui por
// `complete_delivery_render_job`, e a Edge Function `delivery-preview`.
//
// Exige a migration `iaschool_fase5_delivery_batches` aplicada, a função
// `delivery-preview` publicada e o `ingest-worker` no ar (o teste aguarda o
// pipeline; sem worker, ele estoura o timeout com mensagem explícita).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import {
  ANON_KEY,
  SERVICE_KEY,
  SUPABASE_URL,
  adminAddMember,
  adminApproveSchool,
  adminInsert,
  adminRest,
  cleanupTestData,
  createTestUser,
  envReady,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes de entrega exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const GUARDIAN_WHATSAPP = "+5511966665555";

// ---------- PNG mínimo (sem dependência): o worker precisa de imagem real ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** 8×8 RGB com um "rosto" texturizado no centro: o derivado tem o que desfocar. */
function tinyPng(): Buffer {
  const width = 8;
  const height = 8;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 3;
      const inFace = x >= 2 && x < 6 && y >= 2 && y < 6;
      const v = inFace ? ((x + y) % 2 === 0 ? 250 : 15) : 120;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadObject(
  bucket: string,
  path: string,
  contentType: string,
  body: Buffer,
): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(body),
  });
  if (!resp.ok) {
    throw new Error(`upload ${bucket}/${path}: ${resp.status} ${await resp.text()}`);
  }
}

// ---------- Helpers de RPC ----------

async function rpcAsUser(
  user: TestUser,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : null };
}

async function invokePreview(
  user: TestUser | null,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/delivery-preview`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : {} };
}

async function waitFor<T>(
  fn: () => Promise<T | null>,
  label: string,
  timeoutMs = 150_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timeout aguardando ${label} (o worker está no ar?)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

async function readBatch(batchId: string): Promise<Record<string, unknown>> {
  const resp = await adminRest(
    `delivery_batches?id=eq.${batchId}&select=status,recipient_count,item_count,rendered_count,failed_count,approved_by,terms_version`,
  );
  const [row] = (await resp.json()) as Array<Record<string, unknown>>;
  return row!;
}

/** PostgREST não aceita subquery em `in.(...)`: buscar os ids antes. */
async function recipientIdsOf(batchId: string): Promise<string[]> {
  const resp = await adminRest(`delivery_recipients?batch_id=eq.${batchId}&select=id`);
  return ((await resp.json()) as Array<{ id: string }>).map((r) => r.id);
}

async function itemsOf<T = Record<string, unknown>>(
  batchId: string,
  select: string,
  filter = "",
): Promise<T[]> {
  const ids = await recipientIdsOf(batchId);
  if (ids.length === 0) return [];
  const resp = await adminRest(
    `delivery_items?recipient_id=in.(${ids.join(",")})${filter}&select=${select}`,
  );
  const rows = (await resp.json()) as T[];
  if (!resp.ok) throw new Error(`delivery_items: ${JSON.stringify(rows)}`);
  return rows;
}

// ---------- Estado do arquivo ----------

let school: TestUser;
let teacher: TestUser;
let otherSchool: TestUser;
let schoolId = "";
let guardianId = "";
let studentId = "";
let eventId = "";
let photoMissing = "";
const createdUsers: string[] = [];

beforeAll(async () => {
  school = await createTestUser({
    label: "delivery-school",
    signupRole: "school",
    schoolName: "Escola da Entrega",
  });
  teacher = await createTestUser({
    label: "delivery-teacher",
    signupRole: "school",
    schoolName: "Professora da Entrega",
  });
  otherSchool = await createTestUser({
    label: "delivery-other",
    signupRole: "school",
    schoolName: "Escola Vizinha da Entrega",
  });
  createdUsers.push(school.id, teacher.id, otherSchool.id);

  schoolId = await adminApproveSchool(school.id);
  await adminApproveSchool(otherSchool.id);
  await adminAddMember(schoolId, teacher.id, "teacher");
  await adminRest(`profiles?id=eq.${teacher.id}`, {
    method: "PATCH",
    body: JSON.stringify({ approval_status: "approved" }),
  });

  guardianId = await adminInsert("guardians", {
    school_id: schoolId,
    name: "Mãe da Entrega",
    whatsapp: GUARDIAN_WHATSAPP,
    relationship: "mãe",
  });
  const verify = await adminRest("rpc/create_guardian_verification_code", {
    method: "POST",
    body: JSON.stringify({
      p_guardian_id: guardianId,
      p_code: "123456",
      p_phone_e164: GUARDIAN_WHATSAPP,
      p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
  });
  if (!verify.ok) throw new Error(`verificação falhou: ${verify.status}`);
  const confirmed = await rpcAsUser(school, "confirm_guardian_code", {
    p_guardian_id: guardianId,
    p_code: "123456",
  });
  if (confirmed.status !== 200 || confirmed.body !== true) {
    throw new Error(`confirm_guardian_code falhou: ${confirmed.status}`);
  }

  studentId = await adminInsert("students", {
    school_id: schoolId,
    name: "Aluna da Entrega",
    whatsapp: "+5511955554444",
    birth_date: "2015-02-20",
    owner_id: school.id,
    primary_guardian_id: guardianId,
  });
  await adminInsert("authorizations", {
    school_id: schoolId,
    student_id: studentId,
    scope: "delivery_whatsapp",
    granted_at: new Date().toISOString(),
    guardian_id: guardianId,
    evidence: {
      source: "guardian_link",
      termsVersion: "delivery_whatsapp.v1",
      acceptedAt: new Date().toISOString(),
    },
  });

  eventId = await adminInsert("events", {
    school_id: schoolId,
    name: "Festa da Entrega",
    event_date: "2026-05-02",
    created_by: school.id,
  });

  const photoA = await adminInsert("photos", {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/a.png`,
    content_hash: "a".repeat(64),
    original_filename: "a.png",
    bytes: 100,
    uploaded_by: school.id,
  });
  const photoB = await adminInsert("photos", {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/b.png`,
    content_hash: "b".repeat(64),
    original_filename: "b.png",
    bytes: 100,
    uploaded_by: school.id,
  });
  photoMissing = await adminInsert("photos", {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/missing.png`,
    content_hash: "c".repeat(64),
    original_filename: "missing.png",
    bytes: 100,
    uploaded_by: school.id,
  });

  await uploadObject("event-photos", `${schoolId}/${eventId}/a.png`, "image/jpeg", tinyPng());
  await uploadObject("event-photos", `${schoolId}/${eventId}/b.png`, "image/jpeg", tinyPng());

  for (const [photoId, state] of [
    [photoA, "confirmed"],
    [photoB, "confirmed"],
    [photoMissing, "confirmed"],
  ] as const) {
    await adminInsert("photo_faces", {
      school_id: schoolId,
      photo_id: photoId,
      bbox: { x: 2, y: 2, w: 4, h: 4 },
      det_score: 0.99,
      state,
      student_id: studentId,
      reviewed_by: school.id,
      reviewed_at: new Date().toISOString(),
    });
  }
  await adminInsert("photo_faces", {
    school_id: schoolId,
    photo_id: photoB,
    bbox: { x: 6, y: 6, w: 1, h: 1 },
    det_score: 0.99,
    state: "unassigned",
    student_id: null,
  });
}, 120_000);

afterAll(async () => {
  // Objetos que o worker gerou para estes lotes (o expurgo do cancelamento
  // pode não ter passado ainda; apagar o que não existe é inofensivo).
  const batches = await adminRest(`delivery_batches?school_id=eq.${schoolId}&select=id`);
  const batchIds = ((await batches.json()) as Array<{ id: string }>).map((b) => b.id);
  const paths: string[] = [];
  for (const batchId of batchIds) {
    const rows = await itemsOf<{ asset_path: string | null; thumb_path: string | null }>(
      batchId,
      "asset_path,thumb_path",
    );
    for (const row of rows) {
      if (row.asset_path) paths.push(row.asset_path);
      if (row.thumb_path) paths.push(row.thumb_path);
    }
  }
  if (paths.length > 0) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/delivery-assets`, {
      method: "DELETE",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
    });
  }
  await adminRest(`storage_purge_queue?school_id=eq.${schoolId}`, { method: "DELETE" });
  await adminRest(`students?school_id=eq.${schoolId}`, { method: "DELETE" });
  await adminRest(`guardians?school_id=eq.${schoolId}`, { method: "DELETE" });
  await cleanupTestData({ users: createdUsers });
}, 180_000);

describe("preflight", () => {
  it("mostra o responsável apto e o rosto sem atribuição", async () => {
    const result = await rpcAsUser(school, "delivery_preflight", { p_event_id: eventId });
    expect(result.status).toBe(200);
    const data = result.body as {
      unassigned_pending_faces: number;
      recipients: Array<Record<string, unknown>>;
    };
    expect(data.unassigned_pending_faces).toBe(1);
    expect(data.recipients).toHaveLength(1);
    expect(data.recipients[0]).toMatchObject({
      guardian_id: guardianId,
      eligible: true,
      blocked_reason: null,
      verified: true,
    });
  });

  it("protege o evento de outra escola", async () => {
    const result = await rpcAsUser(otherSchool, "delivery_preflight", { p_event_id: eventId });
    expect(result.status).toBeGreaterThanOrEqual(400);
  });
});

describe("lote de entrega (pipeline real)", () => {
  let batchId = "";
  let assetPaths: Array<{ asset: string; thumb: string }> = [];

  it("a professora cria o lote; cliente não reivindica render; o worker renderiza", async () => {
    const created = await rpcAsUser(teacher, "create_delivery_batch", {
      p_event_id: eventId,
      p_guardian_ids: [guardianId],
      p_terms_version: "delivery_whatsapp.v1",
    });
    expect(created.status).toBe(200);
    batchId = created.body as string;

    const initial = await readBatch(batchId);
    expect(initial).toMatchObject({
      status: "preparing",
      recipient_count: 1,
      item_count: 3,
      terms_version: "delivery_whatsapp.v1",
    });

    const asTeacher = await rpcAsUser(teacher, "claim_delivery_render_jobs", {
      p_limit: 10,
      p_lease_seconds: 60,
    });
    expect(asTeacher.status).toBeGreaterThanOrEqual(400);

    // O worker faz o trabalho; a foto "missing" falha depois de 5 tentativas.
    await waitFor(async () => {
      const batch = await readBatch(batchId);
      return Number(batch.rendered_count) >= 2 && Number(batch.failed_count) >= 1 ? batch : null;
    }, "o worker renderizar 2 derivados e falhar o ausente");

    const items = await itemsOf<{
      asset_path: string | null;
      thumb_path: string | null;
      render_status: string;
      asset_hash: string | null;
    }>(batchId, "asset_path,thumb_path,render_status,asset_hash");
    expect(items).toHaveLength(3);
    const done = items.filter((i) => i.render_status === "done");
    const failed = items.filter((i) => i.render_status === "failed");
    expect(done).toHaveLength(2);
    expect(failed).toHaveLength(1);
    assetPaths = done.map((i) => ({ asset: i.asset_path!, thumb: i.thumb_path! }));
    for (const item of done) expect(item.asset_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 200_000);

  it("reenfileirar falhas devolve o item à fila", async () => {
    const retry = await rpcAsUser(school, "retry_failed_delivery_render_jobs", {
      p_batch_id: batchId,
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toBe(1);

    // O worker tenta de novo e falha de novo (o objeto não existe).
    await waitFor(async () => {
      const rows = await itemsOf<{ id: string }>(batchId, "id", "&render_status=eq.failed");
      return rows.length >= 1 ? rows : null;
    }, "a segunda rodada de render");
  }, 200_000);

  it("sem todos os derivados prontos, a aprovação é recusada", async () => {
    const approved = await rpcAsUser(school, "approve_delivery_batch", {
      p_batch_id: batchId,
    });
    expect(approved.status).toBe(400);
    expect(String((approved.body as { message?: string }).message ?? "")).toMatch(
      /aguardando revisão/i,
    );
    await rpcAsUser(school, "cancel_delivery_batch", { p_batch_id: batchId });
  });
});

describe("prévia e cancelamento de um lote sadio", () => {
  let healthyBatchId = "";
  let firstAssetPath = "";

  it("o worker renderiza o evento sem a foto ausente (apagada antes do lote)", async () => {
    await adminRest(`photos?id=eq.${photoMissing}`, { method: "DELETE" });
    const created = await rpcAsUser(school, "create_delivery_batch", {
      p_event_id: eventId,
      p_guardian_ids: [guardianId],
      p_terms_version: "delivery_whatsapp.v1",
    });
    expect(created.status).toBe(200);
    healthyBatchId = created.body as string;

    await waitFor(async () => {
      const batch = await readBatch(healthyBatchId);
      return batch.status === "awaiting_review" ? batch : null;
    }, "o lote sadio chegar em awaiting_review");
    const batch = await readBatch(healthyBatchId);
    expect(batch).toMatchObject({ rendered_count: 2, failed_count: 0 });
  }, 200_000);

  it("a prévia assina URLs só para membro da escola", async () => {
    const anon = await invokePreview(null, { batchId: healthyBatchId });
    expect(anon.status).toBe(401);

    const outsider = await invokePreview(otherSchool, { batchId: healthyBatchId });
    expect(outsider.status).toBe(403);

    const preview = await invokePreview(school, { batchId: healthyBatchId });
    expect(preview.status).toBe(200);
    const items = preview.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(String(item.url)).toContain("/storage/v1/object/sign/delivery-assets/");
      expect(item.studentName).toBe("Aluna da Entrega");
    }
    firstAssetPath = String(items[0]!.url);
  });

  it("a professora não aprova; a administração aprova e o lote enfileira", async () => {
    const asTeacher = await rpcAsUser(teacher, "approve_delivery_batch", {
      p_batch_id: healthyBatchId,
    });
    expect(asTeacher.status).toBeGreaterThanOrEqual(400);

    const approved = await rpcAsUser(school, "approve_delivery_batch", {
      p_batch_id: healthyBatchId,
    });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ approved: 1, blocked: 0 });

    const batch = await readBatch(healthyBatchId);
    expect(batch.status).toBe("queued");
    expect(batch.approved_by).toBe(school.id);

    const items = await itemsOf<{ preview_reviewed_by: string | null }>(
      healthyBatchId,
      "preview_reviewed_by",
    );
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.preview_reviewed_by).toBe(school.id);
  });

  it("cancelar antes do envio enfileira o expurgo dos derivados", async () => {
    const canceled = await rpcAsUser(school, "cancel_delivery_batch", {
      p_batch_id: healthyBatchId,
    });
    expect(canceled.status).toBe(200);
    expect((canceled.body as { canceled_recipients: number }).canceled_recipients).toBe(1);

    const resp = await adminRest(
      `storage_purge_queue?school_id=eq.${schoolId}&reason=eq.delivery_batch_canceled&select=id`,
    );
    const rows = (await resp.json()) as unknown[];
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(firstAssetPath.length).toBeGreaterThan(0);
  });
});
