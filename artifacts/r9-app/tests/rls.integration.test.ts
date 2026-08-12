// Testes de integração das políticas de RLS (fluxo de aprovação).
// Rodam contra o Supabase real configurado via env vars; verificam que:
//   1. Contas pendentes não leem NENHUM dado de domínio (e não escrevem).
//   2. Aluno aprovado vê apenas o próprio registro e posts.
//   3. Isolamento de tenant entre escolas aprovadas.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminRest,
  adminUpdateProfile,
  createTestUser,
  deleteTestUser,
  envReady,
  userInsert,
  userSelect,
  type TestUser,
} from "./supabase-test-utils";

const DOMAIN_TABLES = [
  "students",
  "clubs",
  "reference_posts",
  "metrics",
  "generated_posts",
  "prompt_settings",
] as const;

if (!envReady()) {
  throw new Error(
    "Testes de RLS exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let schoolA: TestUser;
let schoolB: TestUser;
let pending: TestUser;
let studentUser: TestUser;
const createdUsers: string[] = [];

let studentRecordA1 = ""; // vinculado ao studentUser
let studentRecordA2 = ""; // outro aluno da mesma escola
let studentRecordB = ""; // aluno de outra escola
let postA1 = "";
let postA2 = "";

async function adminInsert(table: string, row: Record<string, unknown>): Promise<string> {
  const resp = await adminRest(table, { method: "POST", body: JSON.stringify(row) });
  if (!resp.ok) throw new Error(`insert ${table}: ${resp.status} ${await resp.text()}`);
  const [created] = (await resp.json()) as Array<{ id: string }>;
  return created!.id;
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "school-a", signupRole: "school_user", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "school-b", signupRole: "school_user", schoolName: "Escola B" });
  pending = await createTestUser({ label: "pending", signupRole: "school_user", schoolName: "Escola Pendente" });
  studentUser = await createTestUser({ label: "student", signupRole: "student", schoolId: undefined });
  createdUsers.push(schoolA.id, schoolB.id, pending.id, studentUser.id);

  await adminUpdateProfile(schoolA.id, { approval_status: "approved" });
  await adminUpdateProfile(schoolB.id, { approval_status: "approved" });
  // pending fica com approval_status = 'pending' (criado pelo trigger).

  studentRecordA1 = await adminInsert("students", { name: "Aluno A1", whatsapp: "+5511999990001", owner_id: schoolA.id });
  studentRecordA2 = await adminInsert("students", { name: "Aluno A2", whatsapp: "+5511999990002", owner_id: schoolA.id });
  studentRecordB = await adminInsert("students", { name: "Aluno B1", whatsapp: "+5511999990003", owner_id: schoolB.id });

  postA1 = await adminInsert("generated_posts", {
    owner_id: schoolA.id,
    student_id: studentRecordA1,
    image_url: "https://example.com/a1.png",
  });
  postA2 = await adminInsert("generated_posts", {
    owner_id: schoolA.id,
    student_id: studentRecordA2,
    image_url: "https://example.com/a2.png",
  });

  await adminUpdateProfile(studentUser.id, {
    approval_status: "approved",
    role: "student",
    student_record_id: studentRecordA1,
  });
}, 120_000);

afterAll(async () => {
  // Apagar dados de domínio criados (delete de usuários cascateia owner_id,
  // mas garantimos limpeza explícita dos registros semeados).
  for (const id of [postA1, postA2]) {
    if (id) await adminRest(`generated_posts?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of [studentRecordA1, studentRecordA2, studentRecordB]) {
    if (id) await adminRest(`students?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of createdUsers) await deleteTestUser(id);
}, 120_000);

describe("conta pendente não vaza nenhum dado", () => {
  for (const table of DOMAIN_TABLES) {
    it(`não lê nada de ${table}`, async () => {
      const { status, rows } = await userSelect(pending, table);
      // RLS filtra silenciosamente: vazio ou erro, nunca dados.
      if (status === 200) {
        expect(rows).toHaveLength(0);
      } else {
        expect(status).toBeGreaterThanOrEqual(400);
      }
    });
  }

  it("não consegue inserir alunos", async () => {
    const status = await userInsert(pending, "students", {
      name: "Intruso", whatsapp: "+5511999990004",
      owner_id: pending.id,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it("lê apenas o próprio profile (para ver o status pendente)", async () => {
    const { status, rows } = await userSelect(pending, "profiles", "select=id,approval_status");
    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { id: string }).id).toBe(pending.id);
    expect((rows[0] as { approval_status: string }).approval_status).toBe("pending");
  });
});

describe("conta recusada não vaza nenhum dado", () => {
  it("após recusa, todas as tabelas de domínio ficam vazias", async () => {
    const rejected = await createTestUser({
      label: "rejected",
      signupRole: "school_user",
      schoolName: "Escola Recusada",
    });
    createdUsers.push(rejected.id);
    await adminUpdateProfile(rejected.id, { approval_status: "rejected" });
    for (const table of DOMAIN_TABLES) {
      const { status, rows } = await userSelect(rejected, table);
      if (status === 200) expect(rows).toHaveLength(0);
      else expect(status).toBeGreaterThanOrEqual(400);
    }
  }, 60_000);
});

describe("aluno aprovado vê apenas o próprio registro e posts", () => {
  it("students: apenas o próprio registro", async () => {
    const { status, rows } = await userSelect(studentUser, "students", "select=id");
    expect(status).toBe(200);
    expect(rows.map((r) => (r as { id: string }).id)).toEqual([studentRecordA1]);
  });

  it("generated_posts: apenas os posts do próprio registro", async () => {
    const { status, rows } = await userSelect(studentUser, "generated_posts", "select=id,student_id");
    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { student_id: string }).student_id).toBe(studentRecordA1);
  });

  it("não consegue inserir alunos (somente leitura)", async () => {
    const status = await userInsert(studentUser, "students", {
      name: "Aluno Malicioso", whatsapp: "+5511999990005",
      owner_id: studentUser.id,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe("isolamento entre escolas aprovadas", () => {
  it("escola A não vê alunos da escola B", async () => {
    const { status, rows } = await userSelect(schoolA, "students", "select=id");
    expect(status).toBe(200);
    const ids = rows.map((r) => (r as { id: string }).id);
    expect(ids).toContain(studentRecordA1);
    expect(ids).toContain(studentRecordA2);
    expect(ids).not.toContain(studentRecordB);
  });

  it("escola B não vê posts da escola A", async () => {
    const { status, rows } = await userSelect(schoolB, "generated_posts", "select=id");
    expect(status).toBe(200);
    const ids = rows.map((r) => (r as { id: string }).id);
    expect(ids).not.toContain(postA1);
    expect(ids).not.toContain(postA2);
  });
});
