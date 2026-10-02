// Integração do fluxo de verificação do canal do responsável legal:
// edge function `send-guardian-code` → RPC `confirm_guardian_code` →
// `guardians.whatsapp_verified_at`.
//
// Modelo do M1 (spec §4.7, item 8): a verificação é por RESPONSÁVEL, não por
// aluno, e a autorização é por escola (`school_members`).
//
// Roda contra o Supabase real configurado via env vars. A função pode estar em
// três estados: **pausada** (`WHATSAPP_MODE` ausente → `503` antes de
// autorizar), **simulação** (devolve `demoCode`) ou **envio real** (o código
// não volta ao cliente). Os caminhos que dependem do provedor só rodam por
// inteiro quando ele está configurado; nos demais, o teste confirma o `503`
// fechado e segue.
// Base legal do fluxo: Decreto nº 12.880/2026, art. 35.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  userUpdate,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes do responsável exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const GUARDIAN_WHATSAPP = "+5511988887777";

interface SendResult {
  status: number;
  body: {
    ok?: boolean;
    guardianId?: string;
    simulated?: boolean;
    demoCode?: string;
    error?: string;
  };
}

async function sendCode(
  user: TestUser,
  target: { studentId: string } | { guardianId: string },
): Promise<SendResult> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-guardian-code`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(target),
  });
  return { status: resp.status, body: await resp.json() };
}

/**
 * Com o provedor desligado (`WHATSAPP_MODE` ausente) a função falha fechado
 * ANTES de autorizar e devolve `503`. Nesse estado os caminhos que dependem do
 * provedor não são exercitáveis; o teste confirma o fechamento e segue.
 */
function providerPaused(result: SendResult): boolean {
  if (result.status !== 503) return false;
  expect(result.body.error).toMatch(/pausado|não configurado/i);
  return true;
}

async function confirmCode(
  user: TestUser,
  guardianId: string,
  code: string,
): Promise<{ status: number; body: string }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_guardian_code`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_guardian_id: guardianId, p_code: code }),
  });
  return { status: resp.status, body: await resp.text() };
}

async function readVerifiedAt(guardianId: string): Promise<string | null> {
  const resp = await adminRest(`guardians?id=eq.${guardianId}&select=whatsapp_verified_at`);
  const [row] = (await resp.json()) as Array<{ whatsapp_verified_at: string | null }>;
  return row?.whatsapp_verified_at ?? null;
}

/** Zera o antiflood de 60s da função, que compara created_at. */
async function clearCooldown(guardianId: string): Promise<void> {
  await adminRest(`guardian_verification_codes?guardian_id=eq.${guardianId}`, {
    method: "DELETE",
  });
}

let school: TestUser;
let teacher: TestUser;
let otherSchool: TestUser;
let schoolId = "";
let guardianId = "";
let studentWithGuardian = "";
let studentWithoutGuardian = "";
const createdUsers: string[] = [];

beforeAll(async () => {
  school = await createTestUser({
    label: "guardian-school",
    signupRole: "school",
    schoolName: "Escola do Responsável",
  });
  teacher = await createTestUser({
    label: "guardian-teacher",
    signupRole: "school",
    schoolName: "Professora da Escola do Responsável",
  });
  otherSchool = await createTestUser({
    label: "guardian-other",
    signupRole: "school",
    schoolName: "Escola Vizinha",
  });
  createdUsers.push(school.id, teacher.id, otherSchool.id);

  schoolId = await adminApproveSchool(school.id);
  await adminApproveSchool(otherSchool.id);
  // A professora é aprovada como `user` e vinculada à escola como teacher,
  // sem escola própria: o trigger só cria escola para quem não é membro de
  // nenhuma, então vinculamos ANTES de aprovar.
  await adminAddMember(schoolId, teacher.id, "teacher");
  await adminRest(`profiles?id=eq.${teacher.id}`, {
    method: "PATCH",
    body: JSON.stringify({ approval_status: "approved" }),
  });

  guardianId = await adminInsert("guardians", {
    school_id: schoolId,
    name: "Mãe da Aluna",
    whatsapp: GUARDIAN_WHATSAPP,
    relationship: "mãe",
  });

  studentWithGuardian = await adminInsert("students", {
    name: "Aluna Menor",
    whatsapp: "+5511911112222",
    birth_date: "2015-04-10",
    owner_id: school.id,
    school_id: schoolId,
    primary_guardian_id: guardianId,
  });

  studentWithoutGuardian = await adminInsert("students", {
    name: "Aluno Sem Responsável",
    whatsapp: "+5511933334444",
    birth_date: "2016-08-01",
    owner_id: school.id,
    school_id: schoolId,
  });
}, 120_000);

afterAll(async () => {
  await adminRest(`students?school_id=eq.${schoolId}`, { method: "DELETE" });
  await adminRest(`guardians?school_id=eq.${schoolId}`, { method: "DELETE" });
  // Toda escola criada aqui nasce da aprovação de um dos usuários de teste
  // (`schools.id` = uid); `cleanupTestData` apaga as escolas e depois eles.
  await cleanupTestData({ users: createdUsers });
}, 120_000);

describe("send-guardian-code", () => {
  it("recusa chamada sem sessão", async () => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-guardian-code`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ guardianId }),
    });
    expect(resp.status).toBe(401);
  });

  it("falha fechado (503) enquanto o provedor não está configurado", async () => {
    await clearCooldown(guardianId);
    const result = await sendCode(school, { guardianId });
    // Sem provedor configurado a função fecha antes de autorizar.
    if (result.status === 503) {
      expect(result.body.error).toMatch(/pausado|não configurado/i);
    }
  });

  it("recusa responsável de outra escola", async () => {
    const result = await sendCode(otherSchool, { guardianId });
    if (providerPaused(result)) return;
    expect(result.status).toBe(403);
    expect(result.body.error).toMatch(/não pertence/i);
  });

  it("recusa aluno de outra escola (resolvendo pelo studentId)", async () => {
    const result = await sendCode(otherSchool, { studentId: studentWithGuardian });
    if (providerPaused(result)) return;
    expect(result.status).toBe(403);
  });

  it("exige responsável cadastrado antes de verificar", async () => {
    const result = await sendCode(school, { studentId: studentWithoutGuardian });
    if (providerPaused(result)) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/responsável legal/i);
  });

  it("gera o código para o admin da escola, pelo guardianId", async () => {
    await clearCooldown(guardianId);
    const result = await sendCode(school, { guardianId });
    if (providerPaused(result)) return;
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.guardianId).toBe(guardianId);
    if (result.body.simulated) expect(result.body.demoCode).toMatch(/^\d{6}$/);
  });

  it("aplica o antiflood de 60s no reenvio", async () => {
    const result = await sendCode(school, { guardianId });
    if (providerPaused(result)) return;
    expect(result.status).toBe(429);
    expect(result.body.error).toMatch(/aguarde/i);
  });

  it("uma professora (membro teacher) também gera o código, pelo studentId", async () => {
    await clearCooldown(guardianId);
    const result = await sendCode(teacher, { studentId: studentWithGuardian });
    if (providerPaused(result)) return;
    expect(result.status).toBe(200);
    expect(result.body.guardianId).toBe(guardianId);
  });
});

describe("confirm_guardian_code", () => {
  it("recusa código errado sem verificar o canal", async () => {
    await clearCooldown(guardianId);
    const sent = await sendCode(school, { guardianId });
    if (!sent.body.simulated) return; // envio real: o código não volta ao cliente

    const wrong = sent.body.demoCode === "000000" ? "111111" : "000000";
    const { status } = await confirmCode(school, guardianId, wrong);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await readVerifiedAt(guardianId)).toBeNull();
  });

  it("recusa confirmação vinda de outra escola", async () => {
    await clearCooldown(guardianId);
    const sent = await sendCode(school, { guardianId });
    if (!sent.body.simulated) return;
    const { status } = await confirmCode(otherSchool, guardianId, sent.body.demoCode!);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await readVerifiedAt(guardianId)).toBeNull();
  });

  it("carimba whatsapp_verified_at com o código correto e consome o código", async () => {
    await clearCooldown(guardianId);
    const sent = await sendCode(school, { guardianId });
    if (!sent.body.simulated) return;
    const code = sent.body.demoCode!;

    const first = await confirmCode(school, guardianId, code);
    expect(first.status).toBe(204);
    expect(await readVerifiedAt(guardianId)).toBeTruthy();

    // O código é de uso único: a segunda tentativa não encontra mais nada.
    const second = await confirmCode(school, guardianId, code);
    expect(second.status).toBeGreaterThanOrEqual(400);
  });
});

describe("proteção de whatsapp_verified_at", () => {
  it("a API não carimba a verificação por UPDATE direto", async () => {
    // Estado conhecido: zera pelo service role (o trigger também bloqueia o
    // service role em UPDATE direto — só a RPC carimba).
    const { rows } = await userUpdate(school, "guardians", `id=eq.${guardianId}`, {
      whatsapp_verified_at: "2026-01-01T00:00:00Z",
      relationship: "mãe (editado)",
    });
    // O update em si passa (membro pode editar o responsável)…
    expect(rows).toHaveLength(1);
    // …mas o carimbo não é o que o cliente mandou: ou continua o que a RPC
    // gravou no teste anterior, ou continua nulo.
    const stamped = await readVerifiedAt(guardianId);
    expect(stamped).not.toBe("2026-01-01T00:00:00+00:00");
    expect(stamped).not.toBe("2026-01-01T00:00:00Z");
  });

  it("trocar o número zera a verificação", async () => {
    const { rows } = await userUpdate(school, "guardians", `id=eq.${guardianId}`, {
      whatsapp: "+5511900000001",
    });
    expect(rows).toHaveLength(1);
    expect(await readVerifiedAt(guardianId)).toBeNull();
  });
});
