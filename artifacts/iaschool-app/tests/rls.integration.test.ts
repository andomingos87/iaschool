// Testes de integração das políticas de RLS no modelo por escola (M1).
// Rodam contra o Supabase real configurado via env vars; verificam que:
//   1. Contas pendentes e recusadas não leem NENHUM dado de domínio.
//   2. Conta `user` aprovada mas sem vínculo em school_members não lê nada.
//   3. Membro da escola A não lê nem escreve dados da escola B.
//   4. Quem é membro de A e de B (admin de rede) lê as duas.
//   5. Lixeira de generated_posts: escrita entre escolas bloqueada.
//   6. Storage: o prefixo do caminho é o id da escola.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminAddMember,
  adminApproveSchool,
  adminInsert,
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
  "schools",
  "school_members",
  "classes",
  "guardians",
  "events",
  "students",
  "clubs",
  "reference_posts",
  "generated_posts",
  "share_logs",
  "prompt_settings",
] as const;

if (!envReady()) {
  throw new Error(
    "Testes de RLS exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let schoolA: TestUser;
let schoolB: TestUser;
let networkAdmin: TestUser; // membro de A e de B
let orphan: TestUser; // aprovado, sem escola
let pending: TestUser;
const createdUsers: string[] = [];

let schoolAId = "";
let schoolBId = "";
let classA = "";
let guardianA = "";
let eventA = "";
let studentA1 = "";
let studentA2 = "";
let studentB = "";
let postA1 = "";
let postA2 = "";

function ids(rows: unknown[]): string[] {
  return rows.map((r) => (r as { id: string }).id);
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "school-a", signupRole: "school", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "school-b", signupRole: "school", schoolName: "Escola B" });
  networkAdmin = await createTestUser({ label: "network", signupRole: "school", schoolName: "Rede AB" });
  orphan = await createTestUser({ label: "orphan", signupRole: "school", schoolName: "Sem Escola" });
  pending = await createTestUser({ label: "pending", signupRole: "school", schoolName: "Escola Pendente" });
  createdUsers.push(schoolA.id, schoolB.id, networkAdmin.id, orphan.id, pending.id);

  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);

  // Admin de rede: vinculado às duas escolas ANTES de aprovar, para que o
  // trigger não crie uma terceira escola para ele.
  await adminAddMember(schoolAId, networkAdmin.id, "school_admin");
  await adminAddMember(schoolBId, networkAdmin.id, "school_staff");
  await adminUpdateProfile(networkAdmin.id, { approval_status: "approved" });

  // Órfão: aprovado, mas removemos o vínculo que o trigger criou.
  await adminApproveSchool(orphan.id);
  await adminRest(`school_members?user_id=eq.${orphan.id}`, { method: "DELETE" });
  await adminRest(`schools?id=eq.${orphan.id}`, { method: "DELETE" });

  // pending fica com approval_status = 'pending' (criado pelo trigger).

  classA = await adminInsert("classes", {
    school_id: schoolAId, school_year: 2026, grade: "3EF", name: "A",
  });
  guardianA = await adminInsert("guardians", {
    school_id: schoolAId, name: "Responsável A1", whatsapp: "+5511999990101",
  });
  eventA = await adminInsert("events", {
    school_id: schoolAId, name: "Festa Junina", event_date: "2026-06-20", created_by: schoolA.id,
  });

  studentA1 = await adminInsert("students", {
    name: "Aluno A1", whatsapp: "+5511999990001", owner_id: schoolA.id,
    school_id: schoolAId, class_id: classA, primary_guardian_id: guardianA,
  });
  studentA2 = await adminInsert("students", {
    name: "Aluno A2", whatsapp: "+5511999990002", owner_id: schoolA.id, school_id: schoolAId,
  });
  studentB = await adminInsert("students", {
    name: "Aluno B1", whatsapp: "+5511999990003", owner_id: schoolB.id, school_id: schoolBId,
  });

  postA1 = await adminInsert("generated_posts", {
    owner_id: schoolA.id, school_id: schoolAId, student_id: studentA1,
    image_url: "https://example.com/a1.png",
  });
  postA2 = await adminInsert("generated_posts", {
    owner_id: schoolA.id, school_id: schoolAId, student_id: studentA2,
    image_url: "https://example.com/a2.png",
  });
}, 120_000);

afterAll(async () => {
  for (const id of [postA1, postA2]) {
    if (id) await adminRest(`generated_posts?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of [studentA1, studentA2, studentB]) {
    if (id) await adminRest(`students?id=eq.${id}`, { method: "DELETE" });
  }
  if (eventA) await adminRest(`events?id=eq.${eventA}`, { method: "DELETE" });
  if (guardianA) await adminRest(`guardians?id=eq.${guardianA}`, { method: "DELETE" });
  if (classA) await adminRest(`classes?id=eq.${classA}`, { method: "DELETE" });
  // Apagar o usuário cascateia school_members; a escola (id = uid) sai junto
  // porque schools.id referencia nada — apagamos explicitamente.
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("aprovação cria o tenant", () => {
  it("escola A é membro school_admin da própria escola (id = uid)", async () => {
    expect(schoolAId).toBe(schoolA.id);
    const { status, rows } = await userSelect(schoolA, "school_members", "select=school_id,role");
    expect(status).toBe(200);
    expect(rows).toContainEqual({ school_id: schoolAId, role: "school_admin" });
  });

  it("my_schools() devolve só as escolas do usuário", async () => {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_schools`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${networkAdmin.token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(resp.status).toBe(200);
    const rows = (await resp.json()) as Array<{ id: string; role: string }>;
    expect(ids(rows).sort()).toEqual([schoolAId, schoolBId].sort());
  });
});

describe("conta pendente não vaza nenhum dado", () => {
  for (const table of DOMAIN_TABLES) {
    it(`não lê nada de ${table}`, async () => {
      const { status, rows } = await userSelect(pending, table);
      if (status === 200) expect(rows).toHaveLength(0);
      else expect(status).toBeGreaterThanOrEqual(400);
    });
  }

  it("não consegue inserir alunos", async () => {
    const status = await userInsert(pending, "students", {
      name: "Intruso", whatsapp: "+5511999990004", owner_id: pending.id, school_id: schoolAId,
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
      label: "rejected", signupRole: "school", schoolName: "Escola Recusada",
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

describe("conta aprovada sem escola não lê nada", () => {
  for (const table of DOMAIN_TABLES) {
    it(`não lê nada de ${table}`, async () => {
      const { status, rows } = await userSelect(orphan, table);
      if (status === 200) expect(rows).toHaveLength(0);
      else expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("isolamento entre escolas", () => {
  it("escola A vê os próprios alunos e não os da escola B", async () => {
    const { status, rows } = await userSelect(schoolA, "students", "select=id");
    expect(status).toBe(200);
    expect(ids(rows)).toContain(studentA1);
    expect(ids(rows)).toContain(studentA2);
    expect(ids(rows)).not.toContain(studentB);
  });

  it("escola B não vê posts, turmas, responsáveis nem eventos da escola A", async () => {
    expect(ids((await userSelect(schoolB, "generated_posts", "select=id")).rows)).not.toContain(postA1);
    expect(ids((await userSelect(schoolB, "classes", "select=id")).rows)).not.toContain(classA);
    expect(ids((await userSelect(schoolB, "guardians", "select=id")).rows)).not.toContain(guardianA);
    expect(ids((await userSelect(schoolB, "events", "select=id")).rows)).not.toContain(eventA);
  });

  it("escola B não vê a escola A nem seus membros", async () => {
    expect(ids((await userSelect(schoolB, "schools", "select=id")).rows)).not.toContain(schoolAId);
    const members = await userSelect(schoolB, "school_members", "select=user_id");
    expect(members.rows.map((r) => (r as { user_id: string }).user_id)).not.toContain(schoolA.id);
  });

  it("escola B não insere aluno, turma nem evento na escola A", async () => {
    expect(
      await userInsert(schoolB, "students", {
        name: "Invasor", whatsapp: "+5511999990009", owner_id: schoolB.id, school_id: schoolAId,
      }),
    ).toBeGreaterThanOrEqual(400);
    expect(
      await userInsert(schoolB, "classes", {
        school_id: schoolAId, school_year: 2026, grade: "1EF", name: "Z",
      }),
    ).toBeGreaterThanOrEqual(400);
    expect(
      await userInsert(schoolB, "events", {
        school_id: schoolAId, name: "Invasão", event_date: "2026-01-01", created_by: schoolB.id,
      }),
    ).toBeGreaterThanOrEqual(400);
  });

  it("escola A não consegue mover um aluno seu para a escola B", async () => {
    const { status, rows } = await userUpdate(
      schoolA, "students", `id=eq.${studentA1}`, { school_id: schoolBId },
    );
    if (status < 400) expect(rows).toHaveLength(0);
    const resp = await adminRest(`students?id=eq.${studentA1}&select=school_id`);
    const [row] = (await resp.json()) as Array<{ school_id: string }>;
    expect(row?.school_id).toBe(schoolAId);
  });

  it("escola B não se adiciona como membro da escola A", async () => {
    const status = await userInsert(schoolB, "school_members", {
      school_id: schoolAId, user_id: schoolB.id, role: "school_admin",
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe("admin de rede (membro de A e de B) lê as duas", () => {
  it("students: vê alunos de A e de B", async () => {
    const { status, rows } = await userSelect(networkAdmin, "students", "select=id");
    expect(status).toBe(200);
    expect(ids(rows)).toEqual(expect.arrayContaining([studentA1, studentA2, studentB]));
  });

  it("schools: vê as duas escolas", async () => {
    const { rows } = await userSelect(networkAdmin, "schools", "select=id");
    expect(ids(rows).sort()).toEqual([schoolAId, schoolBId].sort());
  });

  it("como school_staff em B, não edita os dados da escola B", async () => {
    const { status, rows } = await userUpdate(
      networkAdmin, "schools", `id=eq.${schoolBId}`, { name: "Escola B (editada)" },
    );
    if (status < 400) expect(rows).toHaveLength(0);
  });

  it("como school_admin em A, edita os dados da escola A", async () => {
    const { status, rows } = await userUpdate(
      networkAdmin, "schools", `id=eq.${schoolAId}`, { plan: "pilot" },
    );
    expect(status).toBeLessThan(300);
    expect(rows).toHaveLength(1);
  });
});

// Estado real do post no banco, lido com service role (bypassa RLS).
async function adminGetPost(id: string): Promise<{ id: string; deleted_at: string | null } | undefined> {
  const resp = await adminRest(`generated_posts?id=eq.${id}&select=id,deleted_at`);
  const rows = (await resp.json()) as Array<{ id: string; deleted_at: string | null }>;
  return rows[0];
}

describe("lixeira de generated_posts: escrita entre escolas bloqueada", () => {
  const NOW = "2026-01-01T00:00:00Z";

  it("escola B não move post da escola A para a lixeira", async () => {
    const { status, rows } = await userUpdate(
      schoolB, "generated_posts", `id=eq.${postA1}`, { deleted_at: NOW },
    );
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA1);
    expect(post?.deleted_at ?? null).toBeNull();
  });

  it("escola B não restaura post da escola A", async () => {
    await adminRest(`generated_posts?id=eq.${postA2}`, {
      method: "PATCH", body: JSON.stringify({ deleted_at: NOW }),
    });
    const { status, rows } = await userUpdate(
      schoolB, "generated_posts", `id=eq.${postA2}`, { deleted_at: null },
    );
    if (status < 400) expect(rows).toHaveLength(0);
    const post = await adminGetPost(postA2);
    expect(post?.deleted_at).not.toBeNull();
    await adminRest(`generated_posts?id=eq.${postA2}`, {
      method: "PATCH", body: JSON.stringify({ deleted_at: null }),
    });
  });

  it("escola B não exclui definitivamente post da escola A", async () => {
    const { status, rows } = await userDelete(schoolB, "generated_posts", `id=eq.${postA1}`);
    if (status < 400) expect(rows).toHaveLength(0);
    expect(await adminGetPost(postA1)).toBeDefined();
  });

  it("escola A consegue mover e restaurar o próprio post (sanidade da política)", async () => {
    const moved = await userUpdate(schoolA, "generated_posts", `id=eq.${postA1}`, { deleted_at: NOW });
    expect(moved.status).toBeLessThan(300);
    expect(moved.rows).toHaveLength(1);
    const restored = await userUpdate(schoolA, "generated_posts", `id=eq.${postA1}`, { deleted_at: null });
    expect(restored.status).toBeLessThan(300);
    expect(restored.rows).toHaveLength(1);
    expect((await adminGetPost(postA1))?.deleted_at ?? null).toBeNull();
  });
});

describe("storage: o prefixo do caminho é o id da escola", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  async function upload(user: TestUser, path: string): Promise<number> {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/students/${path}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "image/png",
      },
      body: PNG,
    });
    return resp.status;
  }

  it("membro sobe na pasta da própria escola e não na de outra", async () => {
    const own = `${schoolAId}/rls-test-${Date.now()}.png`;
    const foreign = `${schoolBId}/rls-test-${Date.now()}.png`;
    expect(await upload(schoolA, own)).toBeLessThan(300);
    expect(await upload(schoolA, foreign)).toBeGreaterThanOrEqual(400);
    await fetch(`${SUPABASE_URL}/storage/v1/object/students/${own}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${schoolA.token}` },
    });
  });

  it("caminho sem prefixo de escola é recusado", async () => {
    expect(await upload(schoolA, `solto-${Date.now()}.png`)).toBeGreaterThanOrEqual(400);
  });
});
