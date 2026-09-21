// Testes de integração do M3 contra o Supabase real (migrations
// iaschool_fase2_photo_jobs_queue e iaschool_fase2_batch_progress_rpcs):
//   1. `photo_jobs` é invisível e intocável pela API autenticada.
//   2. Inserir foto com `batch_id` cria o job `ingest`; lote de outro evento é recusado.
//   3. `claim_photo_jobs` com 4 chamadas paralelas nunca devolve o mesmo job duas vezes.
//   4. Lease expirado volta a ser reivindicável.
//   5. Ciclo completo: fim do upload → evento `processing`; `complete_photo_job`
//      ok e 5 falhas → contadores, `recognize`, lote fechado como `failed`.
//   6. `retry_failed_photo_jobs`: recusado para outra escola; reabre o lote e
//      volta a foto para `pending` (prova a flag do trigger de UPDATE).
//   7. `claim`/`complete` são só do service_role.
//   8. `finish_batch_upload` só para quem criou; idempotente.
//   9. `stalled_batch_jobs` respeita a RLS de `batch_jobs`.
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
  userInsertReturning,
  userRpc,
  userSelect,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes de integração exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let schoolA: TestUser;
let schoolB: TestUser;
const createdUsers: string[] = [];
let schoolAId = "";
let schoolBId = "";
let eventA = "";
let eventB = "";

interface PhotoJobRow {
  id: number;
  batch_id: string;
  photo_id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

interface BatchRow {
  id: string;
  status: string;
  total: number;
  processed: number;
  failed: number;
  upload_finished_at: string | null;
  updated_at: string;
  finished_at: string | null;
}

let hashSeq = 0;
function hash(): string {
  hashSeq++;
  return hashSeq.toString(16).padStart(64, "0");
}

async function openBatch(user: TestUser, schoolId: string, eventId: string): Promise<string> {
  const r = await userInsertReturning(user, "batch_jobs", {
    school_id: schoolId,
    event_id: eventId,
    kind: "ingest",
    status: "running",
    total: 0,
    created_by: user.id,
  });
  expect(r.status).toBe(201);
  return r.row!["id"] as string;
}

async function addPhoto(user: TestUser, schoolId: string, eventId: string, batchId: string | null) {
  return userInsertReturning(user, "photos", {
    school_id: schoolId,
    event_id: eventId,
    batch_id: batchId,
    storage_path: `${schoolId}/${eventId}/${crypto.randomUUID()}.jpg`,
    content_hash: hash(),
    original_filename: "IMG_0001.jpg",
    bytes: 1234,
    uploaded_by: user.id,
  });
}

async function adminJobs(query: string): Promise<PhotoJobRow[]> {
  const resp = await adminRest(`photo_jobs?${query}`);
  expect(resp.ok).toBe(true);
  return (await resp.json()) as PhotoJobRow[];
}

async function adminBatch(id: string): Promise<BatchRow> {
  const resp = await adminRest(`batch_jobs?id=eq.${id}`);
  const [row] = (await resp.json()) as BatchRow[];
  return row!;
}

async function adminPhoto(id: string): Promise<Record<string, unknown>> {
  const resp = await adminRest(`photos?id=eq.${id}`);
  const [row] = (await resp.json()) as Array<Record<string, unknown>>;
  return row!;
}

async function adminEventStatus(id: string): Promise<string> {
  const resp = await adminRest(`events?id=eq.${id}&select=status`);
  const [row] = (await resp.json()) as Array<{ status: string }>;
  return row!.status;
}

async function claim(limit: number, leaseSeconds = 120): Promise<PhotoJobRow[]> {
  const r = await adminRpc("claim_photo_jobs", { p_kind: "ingest", p_limit: limit, p_lease_seconds: leaseSeconds });
  expect(r.status).toBe(200);
  return r.body as PhotoJobRow[];
}

async function complete(jobId: number, ok: boolean, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await adminRpc("complete_photo_job", { p_job_id: jobId, p_ok: ok, ...extra });
  expect(r.status).toBe(200);
  return r.body as string;
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "jobs-a", signupRole: "school", schoolName: "Escola Jobs A" });
  schoolB = await createTestUser({ label: "jobs-b", signupRole: "school", schoolName: "Escola Jobs B" });
  createdUsers.push(schoolA.id, schoolB.id);
  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);
  eventA = await adminInsert("events", {
    school_id: schoolAId, name: "Evento Jobs A", event_date: "2026-06-20", created_by: schoolA.id, status: "uploading",
  });
  eventB = await adminInsert("events", {
    school_id: schoolBId, name: "Evento Jobs B", event_date: "2026-06-20", created_by: schoolB.id, status: "uploading",
  });
  // Fila limpa: jobs de execuções anteriores que sobraram não podem disputar os claims.
  await adminRest("photo_jobs?status=in.(queued,leased)&kind=eq.ingest", { method: "DELETE" });
}, 120_000);

afterAll(async () => {
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("photo_jobs: só o service_role", () => {
  it("authenticated não lê nem insere na fila", async () => {
    const read = await userSelect(schoolA, "photo_jobs");
    expect(read.status === 401 || read.status === 403 || (read.status === 200 && read.rows.length === 0)).toBe(true);
    const ins = await userInsert(schoolA, "photo_jobs", { batch_id: crypto.randomUUID(), photo_id: crypto.randomUUID(), kind: "ingest" });
    expect(ins).toBeGreaterThanOrEqual(400);
  });

  it("claim e complete são recusados para authenticated", async () => {
    const c = await userRpc(schoolA, "claim_photo_jobs", { p_kind: "ingest", p_limit: 1, p_lease_seconds: 10 });
    expect(c.status).toBeGreaterThanOrEqual(400);
    const k = await userRpc(schoolA, "complete_photo_job", { p_job_id: 1, p_ok: true });
    expect(k.status).toBeGreaterThanOrEqual(400);
  });
});

describe("enfileiramento pelo insert em photos", () => {
  it("foto com batch_id cria job ingest queued; sem batch_id não cria nada", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const p = await addPhoto(schoolA, schoolAId, eventA, batch);
    expect(p.status).toBe(201);
    const jobs = await adminJobs(`photo_id=eq.${p.row!["id"]}`);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: "ingest", status: "queued", attempts: 0, batch_id: batch });

    const legacy = await addPhoto(schoolA, schoolAId, eventA, null);
    expect(legacy.status).toBe(201);
    expect(await adminJobs(`photo_id=eq.${legacy.row!["id"]}`)).toHaveLength(0);
  });

  it("batch_id de lote de outro evento/escola é recusado (23514)", async () => {
    const batchB = await openBatch(schoolB, schoolBId, eventB);
    const wrong = await addPhoto(schoolA, schoolAId, eventA, batchB);
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.row).toBeNull();
  });
});

describe("claim_photo_jobs", () => {
  it("4 chamadas paralelas sobre 40 jobs nunca devolvem o mesmo id", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    for (let i = 0; i < 40; i++) expect((await addPhoto(schoolA, schoolAId, eventA, batch)).status).toBe(201);

    // Jobs de outros testes deste arquivo podem estar na fila: só o nosso lote conta.
    const results = await Promise.all([claim(10), claim(10), claim(10), claim(10)]);
    const all = results.flat();
    const ours = all.filter((j) => j.batch_id === batch);
    const ids = ours.map((j) => j.id);
    expect(new Set(all.map((j) => j.id)).size).toBe(all.length);
    expect(ids.length).toBeGreaterThanOrEqual(39);
    expect(ours.every((j) => j.status === "leased" && j.attempts === 1)).toBe(true);
    const rest = await claim(10);
    const claimedIds = new Set([...all, ...rest].map((j) => j.id));
    expect(claimedIds.size).toBe(all.length + rest.length);
    expect([...all, ...rest].filter((j) => j.batch_id === batch)).toHaveLength(40);
    expect((await claim(10)).filter((j) => j.batch_id === batch)).toHaveLength(0);

    // Limpa: conclui tudo o que reivindicou para não disputar os testes seguintes.
    for (const id of claimedIds) await complete(id, true);
  }, 60_000);

  it("lease expirado é reclamado com attempts incrementado", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const p = await addPhoto(schoolA, schoolAId, eventA, batch);
    const [first] = await claim(1, 1);
    expect(first!.photo_id).toBe(p.row!["id"]);
    await new Promise((r) => setTimeout(r, 1_500));
    const [again] = await claim(1, 120);
    expect(again!.id).toBe(first!.id);
    expect(again!.attempts).toBe(2);
    await complete(again!.id, true);
  });
});

describe("ciclo completo do lote", () => {
  it("fim do upload, conclusão ok, 5 falhas, fechamento e retry", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const p1 = await addPhoto(schoolA, schoolAId, eventA, batch);
    const p2 = await addPhoto(schoolA, schoolAId, eventA, batch);
    await adminRest(`events?id=eq.${eventA}`, { method: "PATCH", body: JSON.stringify({ status: "uploading" }), headers: { "Content-Type": "application/json" } });

    // Só quem criou o lote fecha o envio.
    const notOwner = await userRpc(schoolB, "finish_batch_upload", { p_batch_id: batch, p_total: 2 });
    expect(notOwner.status).toBeGreaterThanOrEqual(400);

    const fin = await userRpc(schoolA, "finish_batch_upload", { p_batch_id: batch, p_total: 2 });
    expect(fin.status).toBe(200);
    let b = await adminBatch(batch);
    expect(b.total).toBe(2);
    expect(b.upload_finished_at).not.toBeNull();
    expect(b.status).toBe("running");
    expect(await adminEventStatus(eventA)).toBe("processing");

    // Idempotente: segunda chamada não muda nada.
    const fin2 = await userRpc(schoolA, "finish_batch_upload", { p_batch_id: batch, p_total: 99 });
    expect(fin2.status).toBe(200);
    expect((await adminBatch(batch)).upload_finished_at).toBe(b.upload_finished_at);

    // Job 1: ok.
    const [j1] = await claim(1);
    expect(j1!.photo_id).toBe(p1.row!["id"]);
    expect(await complete(j1!.id, true, { p_width: 1600, p_height: 1200, p_thumb_path: "x/y/z.webp", p_taken_at: "2026-03-14T18:09:26Z" })).toBe("done");
    expect(await complete(j1!.id, true)).toBe("noop");
    const photo1 = await adminPhoto(p1.row!["id"] as string);
    expect(photo1).toMatchObject({ status: "processed", width: 1600, height: 1200, thumb_path: "x/y/z.webp" });
    expect(await adminJobs(`photo_id=eq.${p1.row!["id"]}&kind=eq.recognize`)).toHaveLength(1);
    b = await adminBatch(batch);
    expect(b.processed).toBe(1);

    // Job 2: 5 falhas → failed, foto failed, lote fecha como failed.
    let last = "";
    for (let i = 1; i <= 5; i++) {
      const [j2] = await claim(1);
      expect(j2!.photo_id).toBe(p2.row!["id"]);
      last = await complete(j2!.id, false, { p_error: `erro simulado ${i}` });
    }
    expect(last).toBe("failed");
    const photo2 = await adminPhoto(p2.row!["id"] as string);
    expect(photo2).toMatchObject({ status: "failed", error: "erro simulado 5" });
    b = await adminBatch(batch);
    expect(b).toMatchObject({ failed: 1, processed: 1, status: "failed" });
    expect(b.finished_at).not.toBeNull();
    expect(b.updated_at > b.upload_finished_at!).toBe(true);
    expect(await claim(5)).toHaveLength(0);

    // Retry: outra escola não pode; a dona reabre o lote e a foto volta a pending.
    const denied = await userRpc(schoolB, "retry_failed_photo_jobs", { p_event_id: eventA });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    const retry = await userRpc(schoolA, "retry_failed_photo_jobs", { p_event_id: eventA });
    expect(retry.status).toBe(200);
    expect(retry.body).toBe(1);
    expect((await adminPhoto(p2.row!["id"] as string))["status"]).toBe("pending");
    b = await adminBatch(batch);
    expect(b).toMatchObject({ failed: 0, status: "running" });
    expect(b.finished_at).toBeNull();
    const [requeued] = await adminJobs(`photo_id=eq.${p2.row!["id"]}&kind=eq.ingest`);
    expect(requeued).toMatchObject({ status: "queued", attempts: 0, last_error: null });
    expect(await adminEventStatus(eventA)).toBe("processing");

    // Fecha para não deixar job na fila.
    const [j3] = await claim(1);
    expect(await complete(j3!.id, true)).toBe("done");
    expect((await adminBatch(batch)).status).toBe("done");
  }, 90_000);
});

describe("stalled_batch_jobs", () => {
  it("é legível pelo membro e respeita a RLS de batch_jobs", async () => {
    const a = await userSelect(schoolA, "stalled_batch_jobs");
    expect(a.status).toBe(200);
    // Lote de A recém-criado não está parado; e B jamais vê lote de A.
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const b = await userSelect(schoolB, "stalled_batch_jobs");
    expect(b.status).toBe(200);
    expect((b.rows as Array<{ id: string }>).some((r) => r.id === batch)).toBe(false);
    const a2 = await userSelect(schoolA, "stalled_batch_jobs");
    expect((a2.rows as Array<{ id: string }>).some((r) => r.id === batch)).toBe(false);
  });
});
