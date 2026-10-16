/**
 * S04–S07 integrado, SOMENTE com autorização explícita do usuário.
 * Executar apenas este arquivo com IASCHOOL_ADJUSTMENTS_INTEGRATED=1.
 * Usa escola/conta/nomes descartáveis e original inteiramente sintético.
 * Não simula reconhecimento bem-sucedido: checkerboard não é rosto humano.
 * Exercita worker de render publicado, Edge Functions e proxy de álbum no
 * mesmo domínio. Token de álbum é seed privilegiado de teste, nunca enviado.
 * Nenhuma configuração de WhatsApp ou secret é ligada/alterada pelo teste.
 */
import { afterAll, describe, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ANON_KEY, SERVICE_KEY, SUPABASE_URL, adminApproveSchool, adminRest,
  cleanupTestData, envReady, type TestUser,
} from "./supabase-test-utils";

type Row = Record<string, unknown>;
const enabled = process.env["IASCHOOL_ADJUSTMENTS_INTEGRATED"] === "1";
const publicUrl = (process.env["APP_PUBLIC_URL"] ?? "").replace(/\/+$/, "");
const users: string[] = [];
let user: TestUser | undefined;
let schoolId = "";
let batchId = "";
const knownObjects = new Map<string, Set<string>>();
const runId = randomUUID();

function check(condition: unknown, label: string): asserts condition {
  // Nunca inclui respostas, cookie, chave, URL assinada ou token em falha.
  if (!condition) throw new Error(`Ensaio integrado: ${label}`);
}
function remember(bucket: string, path: string) {
  if (!knownObjects.has(bucket)) knownObjects.set(bucket, new Set());
  knownObjects.get(bucket)!.add(path);
}
async function createAccount(): Promise<TestUser> {
  const email = `adjustments-${runId}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { signup_role: "school", signup_name: "Operador adulto sintético", signup_school_name: "Escola integrada sintética" } }), signal: AbortSignal.timeout(30_000) });
  check(created.ok, "criação da conta sintética recusada");
  const record = await created.json() as Row;
  check(typeof record.id === "string", "conta sintética sem identificação");
  // Registrar ANTES do login: falha de autenticação também deve ser limpa.
  users.push(record.id);
  const signed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30_000) });
  check(signed.ok, "login sintético recusado");
  const session = await signed.json() as Row;
  check(typeof session.access_token === "string", "login sintético sem sessão");
  return { id: record.id, email, token: session.access_token };
}
async function rows(path: string): Promise<Row[]> {
  const response = await adminRest(path);
  check(response.ok, "consulta administrativa recusada");
  const value: unknown = await response.json();
  check(Array.isArray(value), "projeção administrativa inválida");
  return value as Row[];
}
async function insert(table: string, value: Row): Promise<string> {
  const response = await adminRest(table, { method: "POST", body: JSON.stringify(value) });
  check(response.ok, `cadastro sintético recusado (${table})`);
  const result = await response.json() as Row[];
  check(typeof result[0]?.id === "string", "cadastro sintético sem identificação");
  return result[0].id;
}
async function rpc(name: string, args: Row, asAdmin = false): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: asAdmin ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${asAdmin ? SERVICE_KEY : user!.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { ok: response.ok, data: text ? JSON.parse(text) : null };
}
async function edge(name: string, body: Row): Promise<{ ok: boolean; status: number; data: Row }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${user!.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  return { ok: response.ok, status: response.status, data: await response.json() as Row };
}
async function album(body: Row, cookie?: string): Promise<{ ok: boolean; status: number; data: Row; cookie?: string }> {
  const response = await fetch(`${publicUrl}/api/guardian-album`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(publicUrl).origin,
      "Sec-Fetch-Site": "same-origin", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: "error",
  });
  const fullCookie = response.headers.get("set-cookie") ?? "";
  if (fullCookie) {
    const maxAge = Number(fullCookie.match(/;\s*Max-Age=(\d+)(?:;|$)/i)?.[1]);
    check(/^__Host-iaschool-album=[0-9a-f]{64};/.test(fullCookie) && /;\s*HttpOnly(?:;|$)/i.test(fullCookie) && /;\s*Secure(?:;|$)/i.test(fullCookie)
      && /;\s*Path=\/(?:;|$)/i.test(fullCookie) && /;\s*SameSite=Lax(?:;|$)/i.test(fullCookie) && Number.isInteger(maxAge) && maxAge >= 1 && maxAge <= 86400
      && !/[,\r\n]|;\s*Domain=/i.test(fullCookie), "cookie de álbum sem proteção ou com cookie de infraestrutura agregado");
  }
  return { ok: response.ok, status: response.status, data: await response.json() as Row,
    cookie: fullCookie ? fullCookie.split(";")[0] : undefined };
}
async function upload(bucket: string, path: string, buffer: Buffer) {
  remember(bucket, path);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "image/jpeg", "x-upsert": "false" },
    body: new Uint8Array(buffer), signal: AbortSignal.timeout(30_000),
  });
  check(response.ok, "upload sintético recusado");
}
async function waitForRender(itemId: string): Promise<Row> {
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    const current = (await rows(`delivery_items?id=eq.${itemId}&select=id,render_status,asset_path,thumb_path,asset_hash,render_policy,retention_until`))[0];
    check(current, "item de render ausente");
    for (const name of ["asset_path", "thumb_path"]) if (typeof current[name] === "string") remember("delivery-assets", current[name]);
    if (current.render_status === "done") return current;
    check(current.render_status !== "failed", "worker publicado não concluiu o render sintético");
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error("Ensaio integrado: timeout aguardando o worker de render publicado");
}

// Limpeza limitada à escola e aos caminhos desta execução. Não varre outros tenants.
afterAll(async () => {
  if (!enabled) return;
  if (!schoolId) { if (users.length) await cleanupTestData({ users }); return; }
  const failures: string[] = [];
  try {
    if (batchId && user) await rpc("cancel_delivery_batch", { p_batch_id: batchId });
    for (const row of await rows(`delivery_recipients?school_id=eq.${schoolId}&select=id`)) {
      for (const item of await rows(`delivery_items?recipient_id=eq.${row.id}&select=asset_path,thumb_path`)) {
        for (const field of ["asset_path", "thumb_path"]) if (typeof item[field] === "string") remember("delivery-assets", item[field]);
      }
    }
    for (const row of await rows(`student_reference_jobs?school_id=eq.${schoolId}&select=storage_path`)) if (typeof row.storage_path === "string") remember("student-refs", row.storage_path);
    for (const row of await rows(`storage_purge_queue?school_id=eq.${schoolId}&select=bucket,path`)) if (typeof row.bucket === "string" && typeof row.path === "string") remember(row.bucket, row.path);
    const removed = await adminRest(`student_reference_jobs?school_id=eq.${schoolId}`, { method: "DELETE" });
    check(removed.ok, "limpeza da fila de referências recusada");
    // Filhos primeiro: os triggers de expurgo ainda precisam da escola viva.
    for (const table of ["students", "events", "guardians"]) {
      const removedChild = await adminRest(`${table}?school_id=eq.${schoolId}`, { method: "DELETE" });
      check(removedChild.ok, "limpeza de cadastro sintético recusada");
    }
    for (const row of await rows(`storage_purge_queue?school_id=eq.${schoolId}&select=bucket,path`)) if (typeof row.bucket === "string" && typeof row.path === "string") remember(row.bucket, row.path);
  } catch { failures.push("coleta/encerramento dos trabalhos sintéticos"); }
  for (const [bucket, paths] of knownObjects) {
    const allowed = [...paths].filter(path => path.startsWith(`${schoolId}/`));
    if (!allowed.length) continue;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: allowed }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) failures.push(`limpeza do bucket ${bucket}`);
  }
  try {
    await cleanupTestData({ users, schools: [schoolId] });
    const purge = await adminRest(`storage_purge_queue?path=like.${schoolId}/*`, { method: "DELETE" });
    if (!purge.ok) failures.push("limpeza da fila de expurgo");
    check((await rows(`schools?id=eq.${schoolId}&select=id`)).length === 0, "escola sintética permaneceu");
    for (const [bucket, paths] of knownObjects) {
      for (const path of paths) {
        if (!path.startsWith(`${schoolId}/`)) continue;
        const split = path.lastIndexOf("/");
        const listed = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: path.slice(0, split), limit: 1000, offset: 0 }), signal: AbortSignal.timeout(30_000) });
        if (!listed.ok || (await listed.json() as Row[]).some(row => row.name === path.slice(split + 1))) failures.push(`objeto sintético permaneceu em ${bucket}`);
      }
    }
  } catch { failures.push("remoção da escola/conta sintética ou conferência final"); }
  check(failures.length === 0, `limpeza incompleta: ${failures.join("; ")}`);
}, 180_000);

describe.skipIf(!enabled)("ajustes integrados com material sintético e envio desligado", () => {
  it("fotos nítidas sem revisão de proteção, falha isolada, aprovação e álbum", async () => {
    check(envReady() && new URL(SUPABASE_URL).hostname === "jtyyauivokutperouqyh.supabase.co", "ambiente do produto não confirmado");
    check(/^https:\/\/[^\s?#]+$/.test(publicUrl), "APP_PUBLIC_URL HTTPS do app é obrigatória");
    user = await createAccount();
    schoolId = await adminApproveSchool(user.id);
    check((await rows(`whatsapp_controlled_settings?school_id=eq.${schoolId}&select=enabled`)).every(row => row.enabled !== true), "escola sintética não pode enviar WhatsApp");
    const guardianId = await insert("guardians", { school_id: schoolId, name: "Responsável adulto sintético", whatsapp: "+5511000000000", relationship: "responsável sintético" });
    const code = randomBytes(3).readUIntBE(0, 3).toString().slice(0, 6).padStart(6, "0");
    check((await rpc("create_guardian_verification_code", { p_guardian_id: guardianId, p_code: code, p_phone_e164: "+5511000000000", p_expires_at: new Date(Date.now() + 600_000).toISOString() }, true)).ok, "seed da verificação sintética recusado");
    const verified = await rpc("confirm_guardian_code", { p_guardian_id: guardianId, p_code: code });
    check(verified.ok && verified.data === true, "verificação local do número sintético falhou");
    const alunoId = await insert("students", { school_id: schoolId, owner_id: user.id, name: "Aluno adulto sintético", birth_date: "1990-01-01", whatsapp: "+5511000000000", photos: [], primary_guardian_id: guardianId });
    const grantedAt = new Date().toISOString();
    for (const scope of ["biometric_sorting", "delivery_whatsapp"]) await insert("authorizations", { school_id: schoolId, student_id: alunoId, guardian_id: guardianId, scope, granted_at: grantedAt, created_by: user.id, guardian_channel: "synthetic_no_send", evidence: { source: scope === "delivery_whatsapp" ? "guardian_link" : "synthetic_test", termsVersion: "delivery_whatsapp.v1", acceptedAt: grantedAt, synthetic: true } });
    const eventId = await insert("events", { school_id: schoolId, name: "Evento integrado sintético", event_date: "2026-10-12", created_by: user.id });
    const bytes = await readFile(new URL("./fixtures/authorized-synthetic-scene.jpg", import.meta.url));
    const photoId = randomUUID();const path = `${schoolId}/${eventId}/${photoId}.jpg`;
    await upload("event-photos", path, bytes);
    await insert("photos", { id: photoId, school_id: schoolId, event_id: eventId, storage_path: path, content_hash: createHash("sha256").update(bytes).digest("hex"), original_filename: "authorized-synthetic-scene.jpg", bytes: bytes.length, width: 320, height: 240, status: "processed", uploaded_by: user.id });
    // Duas caixas sintéticas confirmam o vínculo de domínio; NÃO detecção real.
    const faceId = await insert("photo_faces", { school_id: schoolId, photo_id: photoId, student_id: alunoId, state: "confirmed", bbox: { x: 45, y: 25, w: 45, h: 45 }, det_score: 0.99, reviewed_by: user.id, reviewed_at: grantedAt });
    const unknownId = await insert("photo_faces", { school_id: schoolId, photo_id: photoId, state: "unassigned", bbox: { x: 205, y: 25, w: 45, h: 45 }, det_score: 0.99 });
    const candidates = await rpc("confirmed_reference_photos", { p_student_id: alunoId });
    check(candidates.ok && Array.isArray(candidates.data) && candidates.data.length === 1, "projeção confirmada não corresponde à origem");
    const enqueued = await rpc("enqueue_confirmed_event_reference", { p_student_id: alunoId, p_face_id: faceId });
    check(enqueued.ok, "enfileiramento da origem confirmado recusado");
    const readiness = await rpc("list_student_reference_faces", { p_student: alunoId });
    check(readiness.ok && Array.isArray(readiness.data) && readiness.data.length === 0, "rosto sintético foi apresentado como referência processada");
    // Nenhuma região nem conferência de proteção, mesmo com outro rosto não identificado.
    const untouched = (await rows(`photos?id=eq.${photoId}&select=all_people_reviewed`))[0];
    check(untouched?.all_people_reviewed === false && typeof unknownId === "string", "cena sintética deve permanecer sem revisão de proteção");
    // Arquivo corrompido deve falhar isoladamente; a falta de revisão já não é erro.
    const badPhotoId = randomUUID(), badPath = `${schoolId}/${eventId}/${badPhotoId}.jpg`;
    const badBytes = Buffer.from("synthetic-invalid-image-file");
    await upload("event-photos", badPath, badBytes);
    await insert("photos", { id: badPhotoId, school_id: schoolId, event_id: eventId, storage_path: badPath,
      content_hash: createHash("sha256").update(badBytes).digest("hex"), original_filename: "synthetic-invalid-image.jpg",
      bytes: badBytes.length, width: 320, height: 240, status: "processed", uploaded_by: user.id });
    await insert("photo_faces", { school_id: schoolId, photo_id: badPhotoId, student_id: alunoId, state: "confirmed",
      bbox: { x: 45, y: 25, w: 45, h: 45 }, det_score: 0.99, reviewed_by: user.id, reviewed_at: grantedAt });
    const created = await rpc("create_delivery_batch", { p_event_id: eventId, p_guardian_ids: [guardianId], p_terms_version: "delivery_whatsapp.v1" });
    check(created.ok && typeof created.data === "string", "lote integrado não criado");batchId = created.data;
    const draft = await rpc("delivery_draft_detail", { p_batch_id: batchId });check(draft.ok, "rascunho não disponível");
    const recipient = ((draft.data as Row).recipients as Row[])[0];check(recipient, "destinatário sintético ausente");
    const item = (recipient.items as Row[]).find(row => row.photoId === photoId);check(item, "foto autorizada fora do rascunho");
    const badItem = (recipient.items as Row[]).find(row => row.photoId === badPhotoId);check(badItem, "foto problemática fora do rascunho");
    const rendered = await waitForRender(String(item.id));
    check(rendered.render_policy === "original_v1", "render publicado não usou foto nítida");
    const preview = await edge("delivery-preview", { batchId, itemId: item.id });
    check(preview.ok && typeof preview.data.url === "string", "prévia publicada não assinou o derivado");
    const previewResponse = await fetch(preview.data.url as string, { signal: AbortSignal.timeout(30_000) });check(previewResponse.ok, "prévia privada indisponível");
    const previewBytes = Buffer.from(await previewResponse.arrayBuffer());
    check(createHash("sha256").update(previewBytes).digest("hex") === rendered.asset_hash, "prévia não é o arquivo produzido pelo worker");
    const failedUntil = Date.now() + 90_000;
    let badJob: Row | undefined;
    do {
      badJob = (await rows(`delivery_render_jobs?item_id=eq.${badItem.id}&select=status,last_error`))[0];
      if (badJob?.status === "failed") break;
      await new Promise(resolve => setTimeout(resolve, 2_000));
    } while (Date.now() < failedUntil);
    check(badJob?.status === "failed" && badJob.last_error === "render_imagem_invalida", "arquivo inválido não recebeu motivo correto");
    const partial = await edge("delivery-preview", { batchId });
    const entries = partial.data.items as Row[];
    check(partial.ok && Array.isArray(entries), "prévia parcial recusou todo o lote");
    check(entries.some(row => row.itemId === item.id && typeof row.url === "string"), "foto pronta não ficou disponível");
    check(entries.some(row => row.itemId === badItem.id && row.problem === "render_failed" && !row.url), "foto com falha recebeu assinatura ou ocultou o motivo");
    const originalBatch = (draft.data as Row).batch as Row;
    const kept = await rpc("save_delivery_draft", { p_batch_id: batchId, p_expected_version: originalBatch.version,
      p_fields: originalBatch.fields, p_selection: [{ recipientId: recipient.id, photoIds: [photoId] }] });
    check(kept.ok, "retirada da foto problemática recusada");
    const afterRemoval = (await rows(`delivery_batches?id=eq.${batchId}&select=status,item_count,failed_count`))[0];
    check(afterRemoval?.status === "awaiting_review" && afterRemoval.item_count === 1 && afterRemoval.failed_count === 0, "foto retirada ainda bloqueou o lote");
    check((await rows(`photos?id=eq.${badPhotoId}&select=id`)).length === 1, "retirar do álbum apagou o original");
    const approved = await rpc("approve_delivery_batch", { p_batch_id: batchId });check(approved.ok, "aprovação da versão revisada recusada");
    const batch = (await rows(`delivery_batches?id=eq.${batchId}&select=approved_version,approved_mode`))[0];check(batch?.approved_mode === "paused", "lote sintético não ficou em modo pausado");
    const disabled = await edge("school-delivery", { action: "dispatch", recipientId: recipient.id });
    check(!disabled.ok && ["sending_disabled", "dispatch_blocked"].includes(String(disabled.data.code)), "envio não foi bloqueado antes do provedor");
    check((await rows(`whatsapp_messages?school_id=eq.${schoolId}&select=id`)).length === 0, "ensaio não deve criar mensagem WhatsApp");
    // Seed apenas para testar S07 sem habilitar/disparar o provedor.
    const token = randomBytes(32).toString("hex");
    await insert("delivery_album_tokens", { recipient_id: recipient.id, approval_version: batch.approved_version, token_hash: createHash("sha256").update(token).digest("hex"), expires_at: new Date(Date.now() + 3600_000).toISOString(), created_by: user.id });
    const opened = await album({ action: "consume", token });
    if (!opened.ok || !opened.cookie || !Array.isArray(opened.data.items) || opened.data.items.length !== 1) {
      const allowed = ["used", "revoked", "expired", "authorization_revoked", "unsafe_or_expired_asset", "unavailable", "approval_required"];
      const code = allowed.includes(String(opened.data.error)) ? String(opened.data.error) : "other_redacted";
      const tokens = await rows(`delivery_album_tokens?recipient_id=eq.${recipient.id}&select=used_at`);
      const sessions = await rows(`delivery_access_sessions?recipient_id=eq.${recipient.id}&select=session_hash`);
      const sessionHash = sessions[0]?.session_hash;
      let directCode = "not_checked";
      if (typeof sessionHash === "string") {
        const direct = await rpc("delivery_album_session", { p_session_hash: sessionHash }, true);
        directCode = direct.ok && Array.isArray((direct.data as Row)?.items) ? "snapshot_ok" : "rpc_error_redacted";
      } else {
        const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
        const direct = await rpc("consume_delivery_album_token", { p_token_hash: createHash("sha256").update(token).digest("hex"), p_session_hash: hash }, true);
        directCode = direct.ok && (direct.data as Row)?.ok === true ? "consume_ok" : "rpc_error_redacted";
      }
      const diagnosticToken = randomBytes(32).toString("hex");
      await insert("delivery_album_tokens", { recipient_id: recipient.id, approval_version: batch.approved_version, token_hash: createHash("sha256").update(diagnosticToken).digest("hex"), expires_at: new Date(Date.now() + 3600_000).toISOString(), created_by: user.id });
      const directResponse = await fetch(`${SUPABASE_URL}/functions/v1/guardian-album`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "consume", token: diagnosticToken }), signal: AbortSignal.timeout(30_000) });
      const edgeCookie = directResponse.headers.get("set-cookie") ?? "";
      const cookieFlags = { present: !!edgeCookie, hostPrefix: /^__Host-iaschool-album=/.test(edgeCookie), httpOnly: /;\s*HttpOnly(?:;|$)/i.test(edgeCookie), secure: /;\s*Secure(?:;|$)/i.test(edgeCookie), path: /;\s*Path=\/(?:;|$)/i.test(edgeCookie), sameSite: /;\s*SameSite=Lax(?:;|$)/i.test(edgeCookie), maxAge: /;\s*Max-Age=\d+(?:;|$)/i.test(edgeCookie), commaOrDomain: /[,\r\n]|;\s*Domain=/i.test(edgeCookie) };
      throw new Error(`Ensaio integrado: álbum HTTP ${opened.status}; code ${code}; cookie ${Boolean(opened.cookie)}; tokensUsed ${tokens.filter(row => row.used_at).length}; sessions ${sessions.length}; direct ${directCode}; EdgeHTTP ${directResponse.status}; EdgeCookieFlags ${JSON.stringify(cookieFlags)}`);
    }
    check(!JSON.stringify(opened.data).includes(token), "segredo do link foi exposto no corpo do álbum");
    const sessionLifetime = Date.parse(String(opened.data.sessionExpiresAt)) - Date.now();
    check(sessionLifetime > 23 * 3600_000 && sessionLifetime <= 24 * 3600_000, "sessão de álbum não tem validade de 24 horas");
    const second = await album({ action: "consume", token });check(second.ok && second.data.error !== "used" && Array.isArray(second.data.items), "segunda abertura do link reutilizável foi recusada");
    const returned = await album({ action: "consume", token }, opened.cookie);check(returned.ok && returned.cookie === undefined && returned.data.sessionExpiresAt === opened.data.sessionExpiresAt, "retorno renovou/consumiu a sessão");
    const download = await album({ action: "download", itemId: item.id }, opened.cookie);
    check(download.ok && typeof download.data.url === "string", "download da versão aprovada não assinou");
    const response = await fetch(download.data.url as string, { signal: AbortSignal.timeout(30_000) });check(response.ok, "arquivo aprovado indisponível");
    const downloaded = Buffer.from(await response.arrayBuffer());
    check(downloaded[0] === 0xff && downloaded[1] === 0xd8 && createHash("sha256").update(downloaded).digest("hex") === rendered.asset_hash, "download diverge da prévia/hash ou não é JPEG");
    const signedExpiry = Date.parse(String(download.data.expiresAt));check(signedExpiry > Date.now() && signedExpiry <= Date.now() + 300_000, "URL assinada ultrapassa cinco minutos");
    const revoked = await edge("school-delivery", { action: "revoke", recipientId: recipient.id });check(revoked.ok, "revogação integrada recusada");
    const refused = await album({ action: "list" }, opened.cookie);check(refused.status === 410, "sessão privada sobreviveu à revogação");
  }, 360_000);
});
