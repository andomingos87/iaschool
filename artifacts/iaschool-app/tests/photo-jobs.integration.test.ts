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
  cleanupTestData,
  createTestUser,
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

async function retirePhotoJobs(photoId: string): Promise<void> {
  const resp = await adminRest(`photo_jobs?photo_id=eq.${photoId}`, { method: "DELETE" });
  expect(resp.ok).toBe(true);
}

/** O ingest-worker remoto também chama `claim_photo_jobs`. Devolve o job desta foto. */
async function claimExact(photoId: string, leaseSeconds = 120): Promise<PhotoJobRow> {
  for (let i = 0; i < 6; i++) {
    const rows = await claim(5, leaseSeconds);
    const mine = rows.find((j) => j.photo_id === photoId);
    const foreign = rows.filter((j) => j.photo_id !== photoId);
    if (foreign.length > 0) {
      const resp = await adminRest(`photo_jobs?id=in.(${foreign.map((j) => j.id).join(",")})`, {
        method: "PATCH",
        body: JSON.stringify({ status: "queued", leased_until: null }),
      });
      expect(resp.ok).toBe(true);
    }
    if (mine) return mine;
    await new Promise((r) => setTimeout(r, 80));
  }
  const [row] = await adminJobs(`photo_id=eq.${photoId}&kind=eq.ingest&order=id.desc&limit=1`);
  throw new Error(`job da foto ${photoId} não voltou no claim (status=${row?.status ?? "ausente"})`);
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
  // Tudo o que o teste criou cascateia pela escola; o usuário sai depois.
  await cleanupTestData({ users: createdUsers, schools: [schoolAId, schoolBId] });
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
    // O worker remoto pode reivindicar o job antes desta leitura.
    expect(jobs[0]).toMatchObject({ kind: "ingest", batch_id: batch, photo_id: p.row!["id"] });
    expect(["queued", "leased", "done", "failed"]).toContain(jobs[0].status);

    const legacy = await addPhoto(schoolA, schoolAId, eventA, null);
    expect(legacy.status).toBe(201);
    expect(await adminJobs(`photo_id=eq.${legacy.row!["id"]}`)).toHaveLength(0);
    await retirePhotoJobs(p.row!["id"] as string);
  });

  it("batch_id de lote de outro evento/escola é recusado (23514)", async () => {
    const batchB = await openBatch(schoolB, schoolBId, eventB);
    const wrong = await addPhoto(schoolA, schoolAId, eventA, batchB);
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.row).toBeNull();
  });
});

describe("claim_photo_jobs", () => {
  it("lease expirado é reclamado com attempts incrementado", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    let first: PhotoJobRow | undefined;
    for (let attempt = 0; attempt < 5 && !first; attempt++) {
      const p = await addPhoto(schoolA, schoolAId, eventA, batch);
      const photoId = p.row!["id"] as string;
      try {
        first = await claimExact(photoId, 120);
      } catch {
        await retirePhotoJobs(photoId);
      }
    }
    expect(first).toBeTruthy();

    // Encurta o lease sem esperar 1,5 s com o job reivindicável pelo worker.
    const expired = await adminRest(`photo_jobs?id=eq.${first!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ leased_until: new Date(Date.now() - 1000).toISOString() }),
    });
    expect(expired.ok).toBe(true);
    const again = await claimExact(first!.photo_id, 120);
    expect(again.id).toBe(first!.id);
    // O worker remoto pode reivindicar o lease vencido no mesmo instante.
    expect(again.attempts).toBeGreaterThan(first!.attempts);
    await complete(again.id, true);
  });
});

describe("ciclo completo do lote", () => {
  it("fim do upload, conclusão ok, 5 falhas, fechamento e retry", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const p1 = await addPhoto(schoolA, schoolAId, eventA, batch);
    const p2 = await addPhoto(schoolA, schoolAId, eventA, batch);
    const photo1 = p1.row!["id"] as string;
    const photo2 = p2.row!["id"] as string;
    // Reserva os dois antes do worker remoto e das chamadas lentas de fechamento.
    const held1 = await claimExact(photo1);
    const held2 = await claimExact(photo2);
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

    // Job 1: ok. O lease já é nosso.
    expect(held1.photo_id).toBe(photo1);
    expect(await complete(held1.id, true, { p_width: 1600, p_height: 1200, p_thumb_path: "x/y/z.webp", p_taken_at: "2026-03-14T18:09:26Z" })).toBe("done");
    expect(await complete(held1.id, true)).toBe("noop");
    const photo1Row = await adminPhoto(photo1);
    expect(photo1Row).toMatchObject({ status: "processed", width: 1600, height: 1200, thumb_path: "x/y/z.webp" });
    expect(await adminJobs(`photo_id=eq.${photo1}&kind=eq.recognize`)).toHaveLength(1);
    b = await adminBatch(batch);
    expect(b.processed).toBe(1);

    // Job 2: a quinta falha fecha o job. O lease continua nosso, então o
    // worker não pega o job no meio das tentativas; attempts vai a 5 direto.
    const bumped = await adminRest(`photo_jobs?id=eq.${held2.id}&status=eq.leased`, {
      method: "PATCH",
      body: JSON.stringify({ attempts: 5 }),
    });
    expect(bumped.ok).toBe(true);
    expect((await bumped.json()) as PhotoJobRow[]).toHaveLength(1);
    const last = await complete(held2.id, false, { p_error: "erro simulado 5" });
    expect(last).toBe("failed");
    const photo2Row = await adminPhoto(photo2);
    expect(photo2Row).toMatchObject({ status: "failed", error: "erro simulado 5" });
    b = await adminBatch(batch);
    expect(b).toMatchObject({ failed: 1, processed: 1, status: "failed" });
    expect(b.finished_at).not.toBeNull();
    expect(b.updated_at > b.upload_finished_at!).toBe(true);
    expect(await adminJobs(`batch_id=eq.${batch}&kind=eq.ingest&status=eq.queued`)).toHaveLength(0);

    // Retry: outra escola não pode; a dona reabre o lote e a foto volta a pending.
    const denied = await userRpc(schoolB, "retry_failed_photo_jobs", { p_event_id: eventA });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    const retry = await userRpc(schoolA, "retry_failed_photo_jobs", { p_event_id: eventA });
    expect(retry.status).toBe(200);
    expect(retry.body).toBe(1);
    expect((await adminPhoto(photo2))["status"]).toBe("pending");
    b = await adminBatch(batch);
    expect(b).toMatchObject({ failed: 0, status: "running" });
    expect(b.finished_at).toBeNull();
    const [reopened] = await adminJobs(`photo_id=eq.${photo2}&kind=eq.ingest`);
    expect(reopened.last_error).toBeNull();
    expect(["queued", "leased"]).toContain(reopened.status);
    expect(await adminEventStatus(eventA)).toBe("processing");

    // Fecha para não deixar job na fila. Se o worker já levou o retry,
    // a conclusão dele pode ser noop e a gente reivindica de novo.
    const taken = await adminRest(`photo_jobs?id=eq.${reopened.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "leased",
        leased_until: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
    expect(taken.ok).toBe(true);
    let closed = await complete(reopened.id, true);
    if (closed === "noop") {
      const j3 = await claimExact(photo2);
      closed = await complete(j3.id, true);
    }
    expect(closed).toBe("done");
    expect((await adminBatch(batch)).status).toBe("done");
  }, 90_000);
});

describe("claim_photo_jobs em paralelo", () => {
  it("4 chamadas paralelas sobre 40 jobs nunca devolvem o mesmo id", async () => {
    const batch = await openBatch(schoolA, schoolAId, eventA);
    const created = await Promise.all(
      Array.from({ length: 40 }, () => addPhoto(schoolA, schoolAId, eventA, batch)),
    );
    expect(created.every((row) => row.status === 201)).toBe(true);

    const results = await Promise.all([claim(10), claim(10), claim(10), claim(10)]);
    let claimed = results.flat();
    expect(new Set(claimed.map((j) => j.id)).size).toBe(claimed.length);
    const ours = claimed.filter((j) => j.batch_id === batch);
    expect(ours.every((j) => j.status === "leased" && j.attempts >= 1)).toBe(true);

    for (let round = 0; round < 4; round++) {
      const queued = await adminJobs(`batch_id=eq.${batch}&kind=eq.ingest&status=eq.queued`);
      if (queued.length === 0) break;
      const more = await claim(20);
      expect(new Set([...claimed, ...more].map((j) => j.id)).size).toBe(claimed.length + more.length);
      claimed = [...claimed, ...more];
    }

    const jobs = await adminJobs(`batch_id=eq.${batch}&kind=eq.ingest`);
    expect(jobs).toHaveLength(40);
    expect(jobs.filter((j) => j.status === "queued")).toHaveLength(0);

    const foreign = claimed.filter((j) => j.batch_id !== batch);
    if (foreign.length > 0) {
      const restored = await adminRest(`photo_jobs?id=in.(${foreign.map((j) => j.id).join(",")})`, {
        method: "PATCH",
        body: JSON.stringify({ status: "queued", leased_until: null }),
      });
      expect(restored.ok).toBe(true);
    }
    for (const job of claimed.filter((j) => j.batch_id === batch)) await complete(job.id, true);
    const leftover = await adminRest(`photo_jobs?batch_id=eq.${batch}`, { method: "DELETE" });
    expect(leftover.ok).toBe(true);
  }, 60_000);
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
