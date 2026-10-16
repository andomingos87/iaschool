/** Opt-in: UMA geração paga pelo lote publicado, com escola/aluno sintéticos.
 * Não chama OpenAI diretamente nem repete tentativa; a chave fica na API.
 * IASCHOOL_BATCH_REAL_SMOKE=approved_single_synthetic_generation
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, it } from "vitest";
import sharp from "sharp";
import { ANON_KEY, SERVICE_KEY, SUPABASE_URL, adminRest, adminUpdateProfile, cleanupTestData, envReady, testUserExists } from "./supabase-test-utils";

const enabled = process.env["IASCHOOL_BATCH_REAL_SMOKE"] === "approved_single_synthetic_generation";
const origin = "https://iaschool-app.vercel.app";
let conta = "", token = "", aluno = "", lote = "", caminhoEntrada = "", caminhoModelo = "", caminhoResultado = "";
let pedidoEnviado = false;
function check(value: unknown, label: string): asserts value { if (!value) throw new Error(`Lote sintético: ${label}`); }
async function rows(path: string): Promise<Record<string, unknown>[]> {
  const r = await adminRest(path, { signal: AbortSignal.timeout(20_000) });
  check(r.ok, "consulta administrativa recusada");
  const data: unknown = await r.json(); check(Array.isArray(data), "consulta inválida"); return data;
}
async function insert(table: string, data: Record<string, unknown>): Promise<void> {
  const r = await adminRest(table, { method: "POST", body: JSON.stringify(data), signal: AbortSignal.timeout(20_000) });
  check(r.ok, `cadastro sintético recusado (${table}, HTTP ${r.status})`);
}
async function api(path: string, body?: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${origin}/api/generation/batches${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  check(r.ok, `API recusou pedido (HTTP ${r.status})`); return r.json();
}
async function storageDelete(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  check(paths.every(p => p.startsWith(`${conta}/`)), "limpeza fora da escola sintética");
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }), signal: AbortSignal.timeout(30_000) });
  check(r.ok, "limpeza Storage recusada");
  for (const path of paths) {
    // Download pode responder do CDN após remoção. Conferir metadados atuais.
    const slash = path.lastIndexOf("/"), name = path.slice(slash + 1);
    const listed = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, { method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: path.slice(0, slash), search: name, limit: 100 }), signal: AbortSignal.timeout(15_000),
    }); check(listed.ok, "conferência Storage recusada");
    const entries: unknown = await listed.json(); check(Array.isArray(entries), "listagem Storage inválida");
    check(!entries.some((item: {name?: string}) => item.name === name), "objeto sintético permaneceu no Storage");
  }
}

afterAll(async () => {
  if (!enabled || !conta) return;
  if (pedidoEnviado && !lote) {
    const batches = await rows(`generation_batches?created_by=eq.${conta}&select=id`);
    check(batches.length <= 1, "mais de um lote no teste de orçamento único");
    lote = String(batches[0]?.id ?? "");
  }
  // Antes de limpar, aguarda a tentativa em voo sem iniciar outra geração.
  if (pedidoEnviado && lote) {
    const until = Date.now() + 240_000;
    while (Date.now() < until) {
      const items = await rows(`generation_batch_items?batch_id=eq.${lote}&select=status`);
      if (items.every(i => !["pending", "processing"].includes(String(i.status)))) break;
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    check((await rows(`generation_batch_items?batch_id=eq.${lote}&select=status`)).every(i => !["pending", "processing"].includes(String(i.status))), "tentativa ainda em voo; não apagar durante geração");
  }
  const resultPaths = new Set<string>(caminhoResultado ? [caminhoResultado] : []);
  for (const art of await rows(`generated_posts?school_id=eq.${conta}&select=image_url`)) {
    const prefix = "/storage/v1/object/public/generated/";
    if (typeof art.image_url === "string" && art.image_url.startsWith(prefix)) resultPaths.add(art.image_url.slice(prefix.length));
  }
  const jobs = await rows(`student_reference_jobs?school_id=eq.${conta}&select=storage_path`);
  const removedJobs = await adminRest(`student_reference_jobs?school_id=eq.${conta}`, { method: "DELETE" }); check(removedJobs.ok, "limpeza fila recusada");
  const removedAluno = await adminRest(`students?school_id=eq.${conta}`, { method: "DELETE" }); check(removedAluno.ok, "limpeza aluno recusada");
  const purge = await rows(`storage_purge_queue?school_id=eq.${conta}&select=bucket,path`);
  const buckets = new Map<string, Set<string>>([["students", new Set(caminhoEntrada ? [caminhoEntrada] : [])], ["generated", resultPaths], ["references", new Set(caminhoModelo ? [caminhoModelo] : [])]]);
  for (const row of [...jobs.map(j => ({ bucket: "student-refs", path: j.storage_path })), ...purge]) {
    if (typeof row.bucket === "string" && typeof row.path === "string" && row.path.startsWith(`${conta}/`)) {
      if (!buckets.has(row.bucket)) buckets.set(row.bucket, new Set()); buckets.get(row.bucket)!.add(row.path);
    }
  }
  for (const [bucket, paths] of buckets) await storageDelete(bucket, [...paths]);
  await cleanupTestData({ users: [conta] });
  for (const table of ["generation_usage", "generation_logs"]) {
    const r = await adminRest(`${table}?user_id=eq.${conta}`, { method: "DELETE" }); check(r.ok, "limpeza cota/log recusada");
    check((await rows(`${table}?user_id=eq.${conta}&select=user_id`)).length === 0, "resíduo de cota/log");
  }
  check(!await testUserExists(conta), "conta sintética permaneceu");
  check((await rows(`schools?id=eq.${conta}&select=id`)).length === 0, "escola sintética permaneceu");
  for (const table of ["generation_batches", "students", "generated_posts", "student_reference_jobs", "storage_purge_queue"]) {
    check((await rows(`${table}?school_id=eq.${conta}&select=id`)).length === 0, "resíduo de fixture");
  }
}, 300_000);

describe.skipIf(!enabled)("lote real único com material sintético", () => {
  it("worker gera, salva, retoma, deduplica e respeita revogação sem WhatsApp", async () => {
    check(envReady() && new URL(SUPABASE_URL).hostname === "jtyyauivokutperouqyh.supabase.co", "ambiente deve ser o IAschool");
    const email = `batch-synthetic-${randomUUID()}@example.com`, password = randomBytes(24).toString("base64url");
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { signup_role: "school", signup_name: "Operador sintético", signup_school_name: "Escola sintética descartável" } }), signal: AbortSignal.timeout(30_000) });
    check(created.ok, "criação da conta recusada"); const record = await created.json(); conta = record.id; check(conta, "conta sem ID");
    const signed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30_000) });
    check(signed.ok, "login recusado"); token = (await signed.json()).access_token; check(token, "sessão ausente");
    await adminUpdateProfile(conta, { approval_status: "approved" });
    aluno = randomUUID(); const foto = randomUUID(); caminhoEntrada = `${conta}/${aluno}/synthetic.png`;
    const bytes = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#faf3e7"/><circle cx="160" cy="100" r="60" fill="#9c6550"/><circle cx="140" cy="95" r="5"/><circle cx="180" cy="95" r="5"/><path d="M135 125 Q160 145 185 125" fill="none" stroke="#fff" stroke-width="5"/><path d="M100 175 L220 175 L245 330 L75 330Z" fill="#328778"/><rect x="95" y="330" width="55" height="100" fill="#315373"/><rect x="170" y="330" width="55" height="100" fill="#315373"/></svg>')).png().toBuffer();
    const uploaded = await fetch(`${SUPABASE_URL}/storage/v1/object/students/${caminhoEntrada}`, { method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "image/png" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30_000) }); check(uploaded.ok, "upload sintético recusado");
    await insert("students", { id: aluno, school_id: conta, owner_id: conta, name: "Aluno adulto inteiramente sintético", birth_date: "1990-01-01", photos: [{ id: foto, path: `students/${caminhoEntrada}` }] });
    check((await api(`/eligibility?schoolId=${conta}`)).students.length === 0, "sem autorização deve estar oculto");
    await insert("authorizations", { school_id: conta, student_id: aluno, scope: "biometric_sorting", granted_at: new Date().toISOString(), created_by: conta, guardian_channel: "synthetic_no_send", evidence: { synthetic: true, source: "synthetic_test" } });
    const eligible = await api(`/eligibility?schoolId=${conta}`); check(eligible.students.length === 1 && eligible.students[0].photoId === foto, "principal não elegível");
    const photos = await api(`/photos?studentId=${aluno}`); check(photos.photos.length === 1 && photos.photos[0].id === foto, "seletor de fotos divergente");
    const modelo = randomUUID(); caminhoModelo = `${conta}/modelo-sintetico.png`;
    const modeloBytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2563eb" } }).png().toBuffer();
    const modeloUp = await fetch(`${SUPABASE_URL}/storage/v1/object/references/${caminhoModelo}`, { method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "image/png" }, body: new Uint8Array(modeloBytes), signal: AbortSignal.timeout(30_000) });
    check(modeloUp.ok, "upload do modelo sintético recusado");
    await insert("reference_posts", { id: modelo, owner_id: conta, uploaded_by: conta, school_id: conta, image: { id: modelo, path: `references/${caminhoModelo}`, url: "synthetic" } });
    const requestId = randomUUID(), body = { requestId, schoolId: conta, prompt: "Crie uma arte escolar alegre com o personagem ilustrado sintético da referência no centro, fundo com formas geométricas em azul e verde, sem texto, sem logo, sem outras pessoas. Preserve as características do personagem.", referenceId: modelo, noLogo: true, noText: true, students: [{ studentId: aluno, photo: { source: "profile", id: foto } }] };
    // Uma única criação de tentativa; repetir o mesmo requestId valida idempotência.
    pedidoEnviado = true; lote = (await api("", body)).id; check(lote, "lote sem identificação");
    check((await api("", body)).id === lote, "resposta repetida criou outro lote");
    const until = Date.now() + 240_000; let detail: Record<string, any> = {};
    while (Date.now() < until) {
      detail = await api(`/${lote}`);
      if (detail.completed === 1) break;
      check(!detail.items?.some((i: any) => ["failed", "unknown"].includes(i.status)), "tentativa falhou/incerta; não gerar novamente");
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    check(detail.completed === 1 && detail.total === 1, "worker não concluiu no prazo");
    check((await api(`?schoolId=${conta}`)).batches.some((b: any) => b.id === lote), "lote não recuperado por listagem");
    const item = detail.items[0]; check(typeof item.imageUrl === "string" && typeof item.postId === "string", "arte não persistida");
    const downloaded = await fetch(item.imageUrl, { signal: AbortSignal.timeout(30_000) }); check(downloaded.ok, "download real falhou");
    const output = Buffer.from(await downloaded.arrayBuffer()); const meta = await sharp(output).metadata();
    check(meta.format === "png" && meta.width === 1024 && meta.height === 1024, "resultado não é PNG1024");
    const arts = await rows(`generated_posts?school_id=eq.${conta}&select=id,image_url,details`); check(arts.length === 1 && arts[0]!.id === item.postId, "galeria duplicada ou incompleta");
    caminhoResultado = String(arts[0]!.image_url).replace("/storage/v1/object/public/generated/", "");
    check((await rows(`generation_usage?user_id=eq.${conta}&select=count`))[0]?.count === 1, "consumo deve ser exatamente uma cota");
    const attempt = (await rows(`generation_batch_items?batch_id=eq.${lote}&select=attempt,provider_started_at,status`))[0];
    check(attempt?.attempt === 1 && attempt.provider_started_at && attempt.status === "completed", "tentativa indevida");
    check((await rows(`whatsapp_messages?school_id=eq.${conta}&select=id`)).length === 0, "WhatsApp não pode enviar");
    const revoked = await adminRest(`authorizations?student_id=eq.${aluno}`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) }); check(revoked.ok, "revogação recusada");
    check((await api(`/eligibility?schoolId=${conta}`)).students.length === 0, "revogado ainda aparece");
    check(!(await api(`/${lote}`)).items[0]?.imageUrl, "revogado recebeu nova assinatura");
    console.log("Lote real: 1 PNG1024 salvo/baixado, 1 cota, 1 tentativa, idempotência/retomada/revogação confirmadas; zero WhatsApp.");
  }, 330_000);
});
