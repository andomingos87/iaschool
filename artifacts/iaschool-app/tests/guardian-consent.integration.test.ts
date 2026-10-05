// Integração do consentimento direto do responsável (Fase 5, W2):
// `request-guardian-consent` (convite) → `guardian-consent` (página pública)
// → RPC `consume_guardian_consent_token` → `authorizations` com
// `source = guardian_link`.
//
// Roda contra o Supabase real configurado via env vars. Os testes da página
// pública criam o token direto pela RPC `create_guardian_consent_token` (service
// role): assim o fluxo de aceite/recusa é exercitável mesmo com o provedor
// pausado — o convite por WhatsApp é a única parte que depende dele, e essa
// fecha em `503` quando `WHATSAPP_MODE` não está configurado.
//
// A migration `iaschool_fase5_guardian_consent` e as Edge Functions
// `request-guardian-consent` e `guardian-consent` precisam estar aplicadas e
// publicadas para este arquivo rodar por inteiro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  ANON_KEY,
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
    "Testes do consentimento exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const GUARDIAN_WHATSAPP = "+5511977776666";
const OTHER_WHATSAPP = "+5511977775555";
const TERMS_VERSION = "delivery_whatsapp.v1";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token hexadecimal válido e distinto por nome. */
function tokenFor(label: string): string {
  const seed = hashToken(`token-${label}`);
  return seed;
}

async function rpcAdmin(path: string, body: Record<string, unknown>): Promise<Response> {
  return adminRest(`rpc/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

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

async function requestConsent(
  user: TestUser | null,
  studentId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/request-guardian-consent`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ studentId }),
  });
  return { status: resp.status, body: await resp.json() };
}

async function consentEdge(
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/guardian-consent`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : {} };
}

/** Apaga os pedidos anteriores: o antiflood compara `created_at`. */
async function clearConsentTokens(guardianId: string): Promise<void> {
  await adminRest(`guardian_action_tokens?guardian_id=eq.${guardianId}`, {
    method: "DELETE",
  });
}

async function createConsentToken(guardianId: string, token: string): Promise<Response> {
  return rpcAdmin("create_guardian_consent_token", {
    p_guardian_id: guardianId,
    p_token_hash: hashToken(token),
    p_expires_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
    p_created_by: null,
    p_whatsapp_message_id: null,
  });
}

interface AuthRow {
  id: string;
  revoked_at: string | null;
  evidence: { source?: string; termsVersion?: string } | null;
}

async function readDeliveryAuthorizations(studentId: string): Promise<AuthRow[]> {
  const resp = await adminRest(
    `authorizations?student_id=eq.${studentId}&scope=eq.delivery_whatsapp&select=id,revoked_at,evidence&order=created_at`,
  );
  if (!resp.ok) throw new Error(`Falha ao ler authorizations: ${resp.status}`);
  return (await resp.json()) as AuthRow[];
}

let school: TestUser;
let teacher: TestUser;
let otherSchool: TestUser;
let schoolId = "";
let guardianId = "";
let studentA = "";
let studentB = "";
const createdUsers: string[] = [];

beforeAll(async () => {
  school = await createTestUser({
    label: "consent-school",
    signupRole: "school",
    schoolName: "Escola do Consentimento",
  });
  teacher = await createTestUser({
    label: "consent-teacher",
    signupRole: "school",
    schoolName: "Professora do Consentimento",
  });
  otherSchool = await createTestUser({
    label: "consent-other",
    signupRole: "school",
    schoolName: "Escola Vizinha do Consentimento",
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
    name: "Mãe da Dupla",
    whatsapp: GUARDIAN_WHATSAPP,
    relationship: "mãe",
  });

  studentA = await adminInsert("students", {
    name: "Aluna A do Consentimento",
    whatsapp: "+5511911113333",
    birth_date: "2015-04-10",
    owner_id: school.id,
    school_id: schoolId,
    primary_guardian_id: guardianId,
  });
  studentB = await adminInsert("students", {
    name: "Aluno B do Consentimento",
    whatsapp: "+5511922224444",
    birth_date: "2016-08-01",
    owner_id: school.id,
    school_id: schoolId,
    primary_guardian_id: guardianId,
  });

  // Verifica o canal pela RPC real: só número verificado recebe convite.
  const created = await rpcAdmin("create_guardian_verification_code", {
    p_guardian_id: guardianId,
    p_code: "123456",
    p_phone_e164: GUARDIAN_WHATSAPP,
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (!created.ok) {
    throw new Error(
      `Não foi possível preparar a verificação: ${created.status} ${await created.text()}`,
    );
  }
  const confirmed = await rpcAsUser(school, "confirm_guardian_code", {
    p_guardian_id: guardianId,
    p_code: "123456",
  });
  if (confirmed.status !== 200 || confirmed.body !== true) {
    throw new Error(`Falha ao verificar o responsável: ${confirmed.status}`);
  }
}, 120_000);

afterAll(async () => {
  await adminRest(`students?school_id=eq.${schoolId}`, { method: "DELETE" });
  await adminRest(`guardians?school_id=eq.${schoolId}`, { method: "DELETE" });
  await cleanupTestData({ users: createdUsers });
}, 120_000);

describe("request-guardian-consent", () => {
  it("recusa chamada sem sessão (ou falha fechado sem provedor)", async () => {
    const result = await requestConsent(null, studentA);
    expect([401, 503]).toContain(result.status);
    if (result.status === 503) {
      expect(result.body.error).toMatch(/pausado|não configurado|indisponível/i);
    }
  });

  it("a professora não pode pedir (só admin/staff)", async () => {
    const result = await requestConsent(teacher, studentA);
    if (result.status === 503) return; // provedor pausado: caminho coberto acima
    expect(result.status).toBe(403);
  });

  it("o admin da escola pede; no modo controlado, a escola de teste é barrada antes do envio", async () => {
    await clearConsentTokens(guardianId);
    const result = await requestConsent(school, studentA);
    if (result.status === 503) return; // provedor pausado
    if (result.status === 429) {
      // `controlled_zapi`: uma única escola habilitada e allowlist de 1–4.
      // A escola de teste não é a habilitada, então o convite é barrado ANTES
      // de qualquer HTTP para a Z-API — exatamente o contrato do modo.
      expect(result.body.error).toMatch(/indisponível|limite/i);
      return;
    }
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("accepted");
    // O link não volta ao navegador em nenhuma hipótese.
    expect(JSON.stringify(result.body)).not.toContain("consentimento/");
  });

  it("o estado fica pendente enquanto o link não é respondido", async () => {
    await clearConsentTokens(guardianId);
    const token = tokenFor("pendente");
    expect((await createConsentToken(guardianId, token)).ok).toBe(true);
    const status = await rpcAsUser(school, "get_guardian_consent_status", {
      p_student_id: studentA,
    });
    expect(status.status).toBe(200);
    expect((status.body as { state: string }).state).toBe("pending");
  });

  it("o status protege aluno de outra escola", async () => {
    const status = await rpcAsUser(otherSchool, "get_guardian_consent_status", {
      p_student_id: studentA,
    });
    expect(status.status).toBeGreaterThanOrEqual(400);
  });
});

describe("guardian-consent (página pública)", () => {
  it("recusa token desconhecido com 404", async () => {
    const result = await consentEdge({ token: tokenFor("desconhecido"), action: "view" });
    expect(result.status).toBe(404);
  });

  it("antiflood também vale na criação direta do token", async () => {
    await clearConsentTokens(guardianId);
    const first = await createConsentToken(guardianId, tokenFor("antiflood"));
    expect(first.ok).toBe(true);
    const second = await createConsentToken(guardianId, tokenFor("antiflood-2"));
    expect(second.ok).toBe(false);
  });

  it("a recusa fica registrada e não cria autorização", async () => {
    await clearConsentTokens(guardianId);
    const token = tokenFor("recusa");
    expect((await createConsentToken(guardianId, token)).ok).toBe(true);

    const view = await consentEdge({ token, action: "view" });
    expect(view.status).toBe(200);
    expect(view.body.state).toBe("pending");
    expect(view.body.schoolName).toBe("Escola do Consentimento");
    expect(view.body.studentFirstNames).toContain("Aluna");

    const declined = await consentEdge({ token, action: "decline" });
    expect(declined.status).toBe(200);
    expect(declined.body.outcome).toBe("declined");

    const auths = await readDeliveryAuthorizations(studentB);
    expect(auths).toHaveLength(0);

    const status = await rpcAsUser(school, "get_guardian_consent_status", {
      p_student_id: studentB,
    });
    expect((status.body as { state: string }).state).toBe("declined");

    // Uso único: o mesmo link não responde de novo.
    const reused = await consentEdge({ token, action: "accept" });
    expect(reused.status).toBe(409);
  });

  it("o aceite do responsável substitui a declaração da escola", async () => {
    // Declaração antiga da escola para o mesmo aluno e escopo.
    const declared = await fetch(`${SUPABASE_URL}/rest/v1/authorizations`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${school.token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        school_id: schoolId,
        student_id: studentB,
        scope: "delivery_whatsapp",
        granted_at: new Date().toISOString(),
        guardian_id: guardianId,
        evidence: { source: "school_declaration" },
        created_by: school.id,
      }),
    });
    expect(declared.ok).toBe(true);

    await clearConsentTokens(guardianId);
    const token = tokenFor("aceite");
    expect((await createConsentToken(guardianId, token)).ok).toBe(true);

    const accepted = await consentEdge({ token, action: "accept" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.outcome).toBe("accepted");

    const auths = await readDeliveryAuthorizations(studentB);
    const active = auths.filter((a) => a.revoked_at === null);
    expect(active).toHaveLength(1);
    expect(active[0]?.evidence?.source).toBe("guardian_link");
    expect(active[0]?.evidence?.termsVersion).toBe(TERMS_VERSION);
    // A declaração da escola saiu de cena como revogada, não apagada.
    expect(auths.filter((a) => a.revoked_at !== null)).toHaveLength(1);

    const status = await rpcAsUser(school, "get_guardian_consent_status", {
      p_student_id: studentB,
    });
    expect((status.body as { state: string }).state).toBe("accepted");
  });

  it("trocar o número do responsável invalida o link pendente", async () => {
    await clearConsentTokens(guardianId);
    const token = tokenFor("troca-de-numero");
    expect((await createConsentToken(guardianId, token)).ok).toBe(true);

    const changed = await adminRest(`guardians?id=eq.${guardianId}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp: OTHER_WHATSAPP }),
    });
    expect(changed.ok).toBe(true);

    const accepted = await consentEdge({ token, action: "accept" });
    expect(accepted.status).toBe(409);
    expect(String(accepted.body.error)).toMatch(/cancelado|número mudou/i);
  });
});
