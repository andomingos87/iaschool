// Utilitários de teste de RLS contra o Supabase real.
// Cria usuários descartáveis via Admin API (service role) e obtém sessões
// autenticadas via senha, para exercitar as policies exatamente como o app.

export const SUPABASE_URL = (
  process.env["SUPABASE_URL"] ??
  process.env["VITE_SUPABASE_URL"] ??
  ""
).replace(/\/$/, "");
export const ANON_KEY =
  process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
export const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export function envReady(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);
}

const TEST_PASSWORD = "rls-test-Passw0rd!";

function adminHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/**
 * Cria um usuário de teste (e-mail confirmado) com metadados de signup para
 * o trigger handle_new_user criar o profile pendente, e retorna a sessão.
 */
export async function createTestUser(opts: {
  label: string;
  /**
   * "school" é o único cadastro público desde o M1 (autocadastro de aluno
   * aposentado). "school_user" é o valor legado, ainda aceito pelo trigger.
   */
  signupRole: "school" | "school_user";
  schoolName?: string;
}): Promise<TestUser> {
  const email = `rls-test-${opts.label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        signup_role: opts.signupRole,
        signup_name: `RLS Test ${opts.label}`,
        signup_school_name: opts.schoolName ?? null,
      },
    }),
  });
  if (!createResp.ok) {
    throw new Error(`Falha ao criar usuário de teste: ${createResp.status} ${await createResp.text()}`);
  }
  const created = (await createResp.json()) as { id: string };

  const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!tokenResp.ok) {
    throw new Error(`Falha ao logar usuário de teste: ${tokenResp.status} ${await tokenResp.text()}`);
  }
  const session = (await tokenResp.json()) as { access_token: string };
  return { id: created.id, email, token: session.access_token };
}

export async function deleteTestUser(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

/** Executa SQL-like via PostgREST com o service role (bypassa RLS). */
export async function adminRest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      Prefer: "return=representation",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/** PATCH em profiles com service role (aprovar, mudar papel, vincular aluno). */
export async function adminUpdateProfile(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const resp = await adminRest(`profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    throw new Error(`Falha ao atualizar profile: ${resp.status} ${await resp.text()}`);
  }
}

/** Consulta uma tabela como o usuário (RLS aplicada). Retorna { status, rows }. */
export async function userSelect(
  user: TestUser,
  table: string,
  query = "select=*",
): Promise<{ status: number; rows: unknown[] }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      Accept: "application/json",
    },
  });
  const body = resp.ok ? ((await resp.json()) as unknown[]) : [];
  return { status: resp.status, rows: Array.isArray(body) ? body : [] };
}

/**
 * UPDATE como o usuário (RLS aplicada). Retorna o status e as linhas
 * efetivamente atualizadas — RLS filtra silenciosamente, então "bloqueado"
 * aparece como 0 linhas afetadas (ou erro >= 400).
 */
export async function userUpdate(
  user: TestUser,
  table: string,
  filter: string,
  patch: Record<string, unknown>,
): Promise<{ status: number; rows: unknown[] }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const body = resp.ok ? ((await resp.json()) as unknown[]) : [];
  return { status: resp.status, rows: Array.isArray(body) ? body : [] };
}

/**
 * DELETE como o usuário (RLS aplicada). Retorna o status e as linhas
 * efetivamente excluídas (mesma semântica de userUpdate).
 */
export async function userDelete(
  user: TestUser,
  table: string,
  filter: string,
): Promise<{ status: number; rows: unknown[] }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      Prefer: "return=representation",
    },
  });
  const body = resp.ok ? ((await resp.json()) as unknown[]) : [];
  return { status: resp.status, rows: Array.isArray(body) ? body : [] };
}

/** INSERT como o usuário (RLS aplicada). Retorna o status HTTP. */
export async function userInsert(
  user: TestUser,
  table: string,
  row: Record<string, unknown>,
): Promise<number> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  return resp.status;
}

/**
 * Aprova um cadastro de escola. O trigger `profiles_ensure_school_on_approval`
 * (M1) cria a `schools` com id = uid e o vínculo como school_admin, então o
 * id do usuário É o id da escola dele.
 */
export async function adminApproveSchool(userId: string): Promise<string> {
  await adminUpdateProfile(userId, { approval_status: "approved" });
  const resp = await adminRest(`school_members?user_id=eq.${userId}&select=school_id`);
  const rows = (await resp.json()) as Array<{ school_id: string }>;
  const schoolId = rows[0]?.school_id;
  if (!schoolId) {
    throw new Error(`Aprovação não criou a escola de ${userId} — migration M1 aplicada?`);
  }
  return schoolId;
}

/** Vincula um usuário a uma escola com o papel dado (service role). */
export async function adminAddMember(
  schoolId: string,
  userId: string,
  role: "school_admin" | "school_staff" | "teacher",
): Promise<void> {
  const resp = await adminRest("school_members", {
    method: "POST",
    body: JSON.stringify({ school_id: schoolId, user_id: userId, role }),
  });
  if (!resp.ok) {
    throw new Error(`Falha ao vincular membro: ${resp.status} ${await resp.text()}`);
  }
}

/** Insere uma linha com service role e devolve o id criado. */
export async function adminInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const resp = await adminRest(table, { method: "POST", body: JSON.stringify(row) });
  if (!resp.ok) throw new Error(`insert ${table}: ${resp.status} ${await resp.text()}`);
  const [created] = (await resp.json()) as Array<{ id: string }>;
  return created!.id;
}

/** Chama uma RPC com service role (o que o worker faz). Devolve status e corpo JSON. */
export async function adminRpc(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: resp.status, body: parsed };
}

/** Chama uma RPC como o usuário (RLS e grants aplicados). */
export async function userRpc(
  user: TestUser,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown; rows: unknown[] }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: resp.status, body: parsed, rows: resp.ok && Array.isArray(parsed) ? parsed : [] };
}

/** INSERT como o usuário devolvendo a linha criada (ou null se recusado). */
export async function userInsertReturning(
  user: TestUser,
  table: string,
  row: Record<string, unknown>,
): Promise<{ status: number; row: Record<string, unknown> | null }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) return { status: resp.status, row: null };
  const [created] = (await resp.json()) as Array<Record<string, unknown>>;
  return { status: resp.status, row: created ?? null };
}
