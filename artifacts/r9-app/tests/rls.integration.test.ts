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
  userDelete,
  userInsert,
  userSelect,
  userUpdate,
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

// Os testes da lixeira exigem a coluna generated_posts.deleted_at (setup.sql
// atualizado aplicado no Supabase). Se a migração ainda não rodou, os testes
// são PULADOS com aviso — e voltam a rodar sozinhos após aplicar o setup.sql.
const probeResp = await adminRest("generated_posts?select=deleted_at&limit=1");
const trashMigrationApplied = probeResp.ok;
if (!trashMigrationApplied) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rls.integration] Testes da lixeira PULADOS: coluna generated_posts.deleted_at " +
      "não existe no banco. Rode artifacts/r9-app/supabase/setup.sql no Supabase.",
  );
}

// Estado real do post no banco, lido com service role (bypassa RLS).
async function adminGetPost(id: string): Promise<{ id: string; deleted_at: string | null } | undefined> {
  const resp = await adminRest(`generated_posts?id=eq.${id}&select=id,deleted_at`);
  const rows = (await resp.json()) as Array<{ id: string; deleted_at: string | null }>;
  return rows[0];
}

describe.skipIf(!trashMigrationApplied)("lixeira de generated_posts: escrita entre tenants bloqueada", () => {
  const NOW = "2026-01-01T00:00:00Z";

  it("escola B não move post da escola A para a lixeira (update deleted_at)", async () => {
    const { status, rows } = await userUpdate(
      schoolB, "generated_posts", `id=eq.${postA1}`, { deleted_at: NOW },
    );
    // RLS filtra silenciosamente (0 linhas) ou rejeita com erro — nunca altera.
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA1);
    expect(post?.deleted_at ?? null).toBeNull();
  });

  it("escola B não restaura post da escola A (update deleted_at → null)", async () => {
    // Coloca o post na lixeira via admin para testar a restauração indevida.
    await adminRest(`generated_posts?id=eq.${postA2}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: NOW }),
    });
    const { status, rows } = await userUpdate(
      schoolB, "generated_posts", `id=eq.${postA2}`, { deleted_at: null },
    );
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA2);
    expect(post?.deleted_at).not.toBeNull();
    // Restaura o estado original para os demais testes.
    await adminRest(`generated_posts?id=eq.${postA2}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: null }),
    });
  });

  it("escola B não exclui definitivamente post da escola A", async () => {
    const { status, rows } = await userDelete(schoolB, "generated_posts", `id=eq.${postA1}`);
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA1);
    expect(post).toBeDefined();
  });

  it("escola A consegue mover e restaurar o próprio post (sanidade da política)", async () => {
    const moved = await userUpdate(schoolA, "generated_posts", `id=eq.${postA1}`, { deleted_at: NOW });
    expect(moved.status).toBeLessThan(300);
    expect(moved.rows).toHaveLength(1);
    const restored = await userUpdate(schoolA, "generated_posts", `id=eq.${postA1}`, { deleted_at: null });
    expect(restored.status).toBeLessThan(300);
    expect(restored.rows).toHaveLength(1);
    const post = await adminGetPost(postA1);
    expect(post?.deleted_at ?? null).toBeNull();
  });
});

describe.skipIf(!trashMigrationApplied)("lixeira de generated_posts: aluno é somente leitura", () => {
  const NOW = "2026-01-01T00:00:00Z";

  it("aluno não move o próprio post para a lixeira", async () => {
    const { status, rows } = await userUpdate(
      studentUser, "generated_posts", `id=eq.${postA1}`, { deleted_at: NOW },
    );
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA1);
    expect(post?.deleted_at ?? null).toBeNull();
  });

  it("aluno não exclui nenhum post (nem o próprio)", async () => {
    for (const id of [postA1, postA2]) {
      const { status, rows } = await userDelete(studentUser, "generated_posts", `id=eq.${id}`);
      if (status < 400) expect(rows).toHaveLength(0);
      const post = await adminGetPost(id);
      expect(post).toBeDefined();
    }
  });
});
