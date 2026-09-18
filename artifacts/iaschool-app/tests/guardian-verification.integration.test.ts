// Integração do fluxo de verificação do canal do responsável legal:
// edge function `send-guardian-code` → RPC `confirm_guardian_code` →
// `students.guardian.whatsappVerifiedAt`.
//
// Roda contra o Supabase real configurado via env vars. Enquanto a função
// estiver em modo simulação (pendência 7 de docs/pendencias-producao.md), ela
// devolve `demoCode`; quando o envio real por WhatsApp entrar, o código deixa
// de voltar ao cliente e os testes que dependem dele são pulados sozinhos.
// Base legal do fluxo: Decreto nº 12.880/2026, art. 35.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminRest,
  adminUpdateProfile,
  createTestUser,
  deleteTestUser,
  envReady,
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
  body: { ok?: boolean; simulated?: boolean; demoCode?: string; error?: string };
}

async function sendCode(user: TestUser, studentId: string): Promise<SendResult> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-guardian-code`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ studentId }),
  });
  return { status: resp.status, body: await resp.json() };
}

async function confirmCode(
  user: TestUser,
  studentId: string,
  code: string,
): Promise<{ status: number; body: string }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_guardian_code`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_student_id: studentId, p_code: code }),
  });
  return { status: resp.status, body: await resp.text() };
}

async function readGuardian(
  studentId: string,
): Promise<{ whatsappVerifiedAt?: string } | null> {
  const resp = await adminRest(`students?id=eq.${studentId}&select=guardian`);
  const [row] = (await resp.json()) as Array<{ guardian: Record<string, string> | null }>;
  return row?.guardian ?? null;
}

/** Zera o antiflood de 60s da função, que compara created_at. */
async function clearCooldown(studentId: string): Promise<void> {
  await adminRest(`guardian_verification_codes?student_id=eq.${studentId}`, {
    method: "DELETE",
  });
}

let school: TestUser;
let otherSchool: TestUser;
let studentWithGuardian = "";
let studentWithoutGuardian = "";
const createdUsers: string[] = [];

beforeAll(async () => {
  school = await createTestUser({
    label: "guardian-school",
    signupRole: "school_user",
    schoolName: "Escola do Responsável",
  });
  otherSchool = await createTestUser({
    label: "guardian-other",
    signupRole: "school_user",
    schoolName: "Escola Vizinha",
  });
  createdUsers.push(school.id, otherSchool.id);

  await adminUpdateProfile(school.id, { approval_status: "approved" });
  await adminUpdateProfile(otherSchool.id, { approval_status: "approved" });

  const withGuardian = await adminRest("students", {
    method: "POST",
    body: JSON.stringify({
      name: "Aluna Menor",
      whatsapp: "+5511911112222",
      birth_date: "2015-04-10",
      owner_id: school.id,
      guardian: {
        name: "Mãe da Aluna",
        whatsapp: GUARDIAN_WHATSAPP,
        relationship: "mãe",
        consentAt: new Date().toISOString(),
      },
    }),
  });
  [{ id: studentWithGuardian }] = (await withGuardian.json()) as Array<{ id: string }>;

  const withoutGuardian = await adminRest("students", {
    method: "POST",
    body: JSON.stringify({
      name: "Aluno Sem Responsável",
      whatsapp: "+5511933334444",
      birth_date: "2016-08-01",
      owner_id: school.id,
    }),
  });
  [{ id: studentWithoutGuardian }] = (await withoutGuardian.json()) as Array<{ id: string }>;
});

afterAll(async () => {
  await adminRest(`students?owner_id=eq.${school.id}`, { method: "DELETE" });
  for (const id of createdUsers) await deleteTestUser(id);
});

describe("send-guardian-code", () => {
  it("recusa chamada sem sessão", async () => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-guardian-code`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: studentWithGuardian }),
    });
    expect(resp.status).toBe(401);
  });

  it("recusa aluno de outra escola", async () => {
    const { status, body } = await sendCode(otherSchool, studentWithGuardian);
    expect(status).toBe(403);
    expect(body.error).toMatch(/não pertence/i);
  });

  it("exige responsável cadastrado antes de verificar", async () => {
    const { status, body } = await sendCode(school, studentWithoutGuardian);
    expect(status).toBe(400);
    expect(body.error).toMatch(/responsável legal/i);
  });

  it("gera o código para o dono do aluno", async () => {
    await clearCooldown(studentWithGuardian);
    const { status, body } = await sendCode(school, studentWithGuardian);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    if (body.simulated) expect(body.demoCode).toMatch(/^\d{6}$/);
  });

  it("aplica o antiflood de 60s no reenvio", async () => {
    const { status, body } = await sendCode(school, studentWithGuardian);
    expect(status).toBe(429);
    expect(body.error).toMatch(/aguarde/i);
  });
});

describe("confirm_guardian_code", () => {
  it("recusa código errado sem verificar o canal", async () => {
    await clearCooldown(studentWithGuardian);
    const sent = await sendCode(school, studentWithGuardian);
    if (!sent.body.simulated) return; // envio real: o código não volta ao cliente

    const wrong = sent.body.demoCode === "000000" ? "111111" : "000000";
    const { status } = await confirmCode(school, studentWithGuardian, wrong);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await readGuardian(studentWithGuardian)).not.toHaveProperty(
      "whatsappVerifiedAt",
    );
  });

  it("carimba whatsappVerifiedAt com o código correto e consome o código", async () => {
    await clearCooldown(studentWithGuardian);
    const sent = await sendCode(school, studentWithGuardian);
    if (!sent.body.simulated) return;
    const code = sent.body.demoCode!;

    const first = await confirmCode(school, studentWithGuardian, code);
    expect(first.status).toBe(204);

    const guardian = await readGuardian(studentWithGuardian);
    expect(guardian?.whatsappVerifiedAt).toBeTruthy();

    // O código é de uso único: a segunda tentativa não encontra mais nada.
    const second = await confirmCode(school, studentWithGuardian, code);
    expect(second.status).toBeGreaterThanOrEqual(400);
  });
});
