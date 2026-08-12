// Implementação real do contrato de dados usando Supabase
// (auth + Postgres + Storage). Ativada em ../index.ts quando
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão definidas.
//
// Schema esperado: ver ../../../../supabase/setup.sql

import {
  createClient,
  type SupabaseClient,
  type Session as SbSession,
} from "@supabase/supabase-js";
import type {
  ApprovalRepository,
  AuthService,
  ClubRepository,
  DataLayer,
  GeneratedPostRepository,
  MetricRepository,
  PromptTemplateRepository,
  ReferenceRepository,
  StorageService,
  StudentRepository,
} from "../contract";
import type {
  AppUser,
  Club,
  GeneratedPost,
  Metric,
  PendingRegistration,
  PromptTemplateSetting,
  PromptTemplateVersion,
  ReferencePost,
  Session,
  StoredImage,
  Student,
} from "../types";
import { createOpenAIGenerationService } from "../openai-generation";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "erro desconhecido"}`);
}

// URL de assinatura válida por 1 ano (máximo do Supabase).
const SIGNED_URL_TTL = 365 * 24 * 3600;

// ---------- mapeadores snake_case ↔ domínio ----------

function toStudent(r: Row): Student {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    whatsapp: r["whatsapp"] as string,
    position: (r["position"] as string | null) ?? undefined,
    heightCm: (r["height_cm"] as number | null) ?? undefined,
    weightKg: (r["weight_kg"] as number | null) ?? undefined,
    birthDate: (r["birth_date"] as string | null) ?? undefined,
    notes: (r["notes"] as string | null) ?? undefined,
    photos: (r["photos"] as StoredImage[] | null) ?? [],
    clubId: (r["club_id"] as string | null) ?? undefined,
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}

function fromStudent(p: Partial<Omit<Student, "id">>): Row {
  const r: Row = {};
  if ("name" in p) r["name"] = p.name;
  if ("whatsapp" in p) r["whatsapp"] = p.whatsapp;
  if ("position" in p) r["position"] = p.position ?? null;
  if ("heightCm" in p) r["height_cm"] = p.heightCm ?? null;
  if ("weightKg" in p) r["weight_kg"] = p.weightKg ?? null;
  if ("birthDate" in p) r["birth_date"] = p.birthDate ?? null;
  if ("notes" in p) r["notes"] = p.notes ?? null;
  if ("photos" in p) r["photos"] = p.photos ?? [];
  if ("clubId" in p) r["club_id"] = p.clubId ?? null;
  return r;
}

function toClub(r: Row): Club {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    logo: (r["logo"] as StoredImage | null) ?? undefined,
    uniforms: (r["uniforms"] as StoredImage[] | null) ?? [],
    colors: (r["colors"] as string[] | null) ?? [],
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}

function fromClub(p: Partial<Omit<Club, "id">>): Row {
  const r: Row = {};
  if ("name" in p) r["name"] = p.name;
  if ("logo" in p) r["logo"] = p.logo ?? null;
  if ("uniforms" in p) r["uniforms"] = p.uniforms ?? [];
  if ("colors" in p) r["colors"] = p.colors ?? [];
  return r;
}

function toReference(r: Row): ReferencePost {
  return {
    id: r["id"] as string,
    image: r["image"] as StoredImage,
    title: (r["title"] as string | null) ?? undefined,
    uploadedBy: r["uploaded_by"] as string,
    createdAt: r["created_at"] as string,
  };
}

function toMetric(r: Row): Metric {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    predefined: r["predefined"] as boolean,
    createdAt: r["created_at"] as string,
  };
}

function toGeneratedPost(r: Row): GeneratedPost {
  return {
    id: r["id"] as string,
    studentId: r["student_id"] as string,
    imageUrl: r["image_url"] as string,
    metrics: (r["metrics"] as GeneratedPost["metrics"] | null) ?? [],
    createdAt: r["created_at"] as string,
  };
}

// ---------- factory ----------

export function createSupabaseDataLayer(): DataLayer {
  const url = required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
  const anonKey = required(
    "VITE_SUPABASE_ANON_KEY",
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
  const supabase: SupabaseClient = createClient(url, anonKey);

  // Cache do perfil (papel/nome vêm da tabela profiles).
  const profileCache = new Map<string, AppUser>();

  async function loadProfile(sb: SbSession): Promise<AppUser> {
    const userId = sb.user.id;
    const cached = profileCache.get(userId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, name, role, school_name, approval_status, school_id, student_record_id",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) fail("Falha ao carregar perfil", error);
    if (!data) {
      throw new Error(
        "Seu usuário não tem perfil cadastrado. Peça ao administrador para criar seu registro na tabela profiles.",
      );
    }
    const user: AppUser = {
      id: data.id,
      email: data.email ?? sb.user.email ?? "",
      name: data.name,
      role: data.role,
      schoolName: data.school_name ?? undefined,
      approvalStatus: data.approval_status ?? "approved",
      schoolId: data.school_id ?? undefined,
      studentRecordId: data.student_record_id ?? undefined,
    };
    // Não cachear perfis pendentes: o status pode mudar a qualquer momento.
    if (user.approvalStatus === "approved") profileCache.set(userId, user);
    return user;
  }

  async function toSession(sb: SbSession | null): Promise<Session | null> {
    if (!sb) return null;
    const user = await loadProfile(sb);
    return {
      user,
      expiresAt: sb.expires_at
        ? new Date(sb.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  /** Retorna o uid do usuário atual, ou lança erro se não houver sessão. */
  async function currentUserId(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw new Error("Você precisa estar logado para realizar esta ação.");
    return uid;
  }

  const auth: AuthService = {
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) fail("Falha ao recuperar sessão", error);
      try {
        return await toSession(data.session);
      } catch {
        // Sessão sem perfil válido → tratar como deslogado.
        await supabase.auth.signOut();
        return null;
      }
    },
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) {
        throw new Error(
          error?.message === "Invalid login credentials"
            ? "E-mail ou senha inválidos"
            : (error?.message ?? "Não foi possível entrar"),
        );
      }
      try {
        return (await toSession(data.session))!;
      } catch (err) {
        await supabase.auth.signOut();
        throw err;
      }
    },
    async signUp(input) {
      // O trigger handle_new_user (setup.sql) cria o profile pendente a
      // partir dos metadados — funciona mesmo com confirmação de e-mail ativa.
      const metadata =
        input.kind === "school"
          ? {
              signup_role: "school_user",
              signup_name: input.schoolName.trim(),
              signup_school_name: input.schoolName.trim(),
            }
          : {
              signup_role: "student",
              signup_name: input.name.trim(),
              signup_school_id: input.schoolId,
            };
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: metadata },
      });
      if (error) {
        throw new Error(
          error.message.includes("already registered")
            ? "Este e-mail já está cadastrado."
            : `Falha ao criar conta: ${error.message}`,
        );
      }
      // Cadastro fica pendente: não manter a sessão criada pelo signUp.
      if (data.session) await supabase.auth.signOut();
    },
    async listApprovedSchools() {
      const { data, error } = await supabase.rpc("list_approved_schools");
      if (error) fail("Falha ao listar escolas", error);
      return ((data ?? []) as Array<{ id: string; name: string }>).map(
        (s) => ({ id: s.id, name: s.name }),
      );
    },
    async resetPassword(email) {
      // O link do e-mail volta para o app com `type=recovery` no hash;
      // src/lib/recovery.ts detecta e abre a tela de nova senha.
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin)
        .href;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) fail("Falha ao enviar e-mail de recuperação", error);
    },
    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        throw new Error(
          error.message.includes("different from the old password")
            ? "A nova senha deve ser diferente da anterior."
            : `Falha ao atualizar senha: ${error.message}`,
        );
      }
    },
    async signOut() {
      profileCache.clear();
      const { error } = await supabase.auth.signOut();
      if (error) fail("Falha ao sair", error);
    },
    onAuthStateChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((event, sb) => {
        // Evita chamadas ao banco em refresh de token (sessão já mapeada).
        if (event === "TOKEN_REFRESHED") return;
        void toSession(sb)
          .then(cb)
          .catch(() => cb(null));
      });
      return () => data.subscription.unsubscribe();
    },
  };

  // ---------- Storage (buckets PRIVADOS, URLs assinadas) ----------
  // O caminho em cada bucket é sempre prefixado com o uid do usuário
  // para que as políticas RLS do Storage possam isolar por owner.
  // A URL retornada é uma URL assinada com 1 ano de validade.

  const storage: StorageService = {
    async upload(bucket, file, fileName) {
      const uid = await currentUserId();
      const safeName = fileName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-");
      // Prefixo com uid garante isolamento por usuário nas políticas de Storage.
      const objectPath = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (uploadErr) fail("Falha ao enviar imagem", uploadErr);

      // URL assinada válida por 1 ano (imagens privadas).
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, SIGNED_URL_TTL);
      if (signErr || !signed) fail("Falha ao assinar URL da imagem", signErr);

      return {
        id: objectPath,
        url: signed.signedUrl,
        path: `${bucket}/${objectPath}`,
        createdAt: new Date().toISOString(),
      };
    },

    async remove(bucket, path) {
      // `path` pode vir como "bucket/arquivo" (formato do StoredImage.path).
      const inBucket = path.startsWith(`${bucket}/`)
        ? path.slice(bucket.length + 1)
        : path;
      const { error } = await supabase.storage.from(bucket).remove([inBucket]);
      if (error) fail("Falha ao remover imagem", error);
    },
  };

  // ---------- Repositórios ----------

  const students: StudentRepository = {
    async list() {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) fail("Falha ao listar alunos", error);
      return (data ?? []).map(toStudent);
    },
    async get(id) {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Falha ao carregar aluno", error);
      return data ? toStudent(data) : null;
    },
    async create(input) {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("students")
        .insert({ ...fromStudent(input), owner_id: uid })
        .select("*")
        .single();
      if (error) fail("Falha ao criar aluno", error);
      return toStudent(data);
    },
    async update(id, patch) {
      const { data, error } = await supabase
        .from("students")
        .update({ ...fromStudent(patch), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) fail("Falha ao atualizar aluno", error);
      return toStudent(data);
    },
    async delete(id) {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) fail("Falha ao remover aluno", error);
    },
  };

  const clubs: ClubRepository = {
    async list() {
      const { data, error } = await supabase
        .from("clubs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) fail("Falha ao listar clubes", error);
      return (data ?? []).map(toClub);
    },
    async get(id) {
      const { data, error } = await supabase
        .from("clubs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Falha ao carregar clube", error);
      return data ? toClub(data) : null;
    },
    async create(input) {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("clubs")
        .insert({ ...fromClub(input), owner_id: uid })
        .select("*")
        .single();
      if (error) fail("Falha ao criar clube", error);
      return toClub(data);
    },
    async update(id, patch) {
      const { data, error } = await supabase
        .from("clubs")
        .update({ ...fromClub(patch), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) fail("Falha ao atualizar clube", error);
      return toClub(data);
    },
    async delete(id) {
      const { error } = await supabase.from("clubs").delete().eq("id", id);
      if (error) fail("Falha ao remover clube", error);
    },
  };

  const references: ReferenceRepository = {
    async list() {
      const { data, error } = await supabase
        .from("reference_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) fail("Falha ao listar referências", error);
      return (data ?? []).map(toReference);
    },
    async create(input) {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("reference_posts")
        .insert({
          image: input.image,
          title: input.title ?? null,
          uploaded_by: input.uploadedBy,
          owner_id: uid,
        })
        .select("*")
        .single();
      if (error) fail("Falha ao salvar referência", error);
      return toReference(data);
    },
    async delete(id) {
      const { error } = await supabase
        .from("reference_posts")
        .delete()
        .eq("id", id);
      if (error) fail("Falha ao remover referência", error);
    },
  };

  const metrics: MetricRepository = {
    async list() {
      const { data, error } = await supabase
        .from("metrics")
        .select("*")
        .order("predefined", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) fail("Falha ao listar métricas", error);
      return (data ?? []).map(toMetric);
    },
    async createCustom(name) {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("metrics")
        .insert({ name: name.trim(), predefined: false, owner_id: uid })
        .select("*")
        .single();
      if (error) fail("Falha ao criar métrica", error);
      return toMetric(data);
    },
    async delete(id) {
      const { error } = await supabase
        .from("metrics")
        .delete()
        .eq("id", id)
        .eq("predefined", false);
      if (error) fail("Falha ao remover métrica", error);
    },
  };

  const generatedPosts: GeneratedPostRepository = {
    async list() {
      const { data, error } = await supabase
        .from("generated_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) fail("Falha ao listar posts gerados", error);
      return (data ?? []).map(toGeneratedPost);
    },
    async create(input) {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("generated_posts")
        .insert({
          student_id: input.studentId,
          image_url: input.imageUrl,
          metrics: input.metrics,
          owner_id: uid,
        })
        .select("*")
        .single();
      if (error) fail("Falha ao salvar post gerado", error);
      return toGeneratedPost(data);
    },
  };

  // ---------- Aprovações (apenas super_admin — RLS garante) ----------

  const approvals: ApprovalRepository = {
    async listPending() {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, name, role, school_name, school_id, student_record_id, created_at",
        )
        .eq("approval_status", "pending")
        .order("created_at", { ascending: true });
      if (error) fail("Falha ao listar cadastros pendentes", error);
      const rows = data ?? [];
      // Nome do registro students vinculado (se houver — vínculo é feito pela
      // escola, mas o admin vê o estado atual na tela de Aprovações).
      const recordIds = [
        ...new Set(rows.map((r) => r.student_record_id).filter(Boolean)),
      ] as string[];
      const recordNames = new Map<string, string>();
      if (recordIds.length > 0) {
        const { data: recs, error: recsErr } = await supabase
          .from("students")
          .select("id, name")
          .in("id", recordIds);
        if (recsErr) fail("Falha ao carregar registros de alunos", recsErr);
        for (const rec of recs ?? []) recordNames.set(rec.id, rec.name);
      }
      // Nome da escola escolhida pelos alunos pendentes.
      const schoolIds = [
        ...new Set(rows.map((r) => r.school_id).filter(Boolean)),
      ] as string[];
      const schoolNames = new Map<string, string>();
      if (schoolIds.length > 0) {
        const { data: schools, error: schoolsErr } = await supabase
          .from("profiles")
          .select("id, school_name, name")
          .in("id", schoolIds);
        if (schoolsErr) fail("Falha ao carregar escolas", schoolsErr);
        for (const s of schools ?? []) {
          schoolNames.set(s.id, s.school_name ?? s.name);
        }
      }
      return rows.map(
        (r): PendingRegistration => ({
          id: r.id,
          email: r.email,
          name: r.name,
          role: r.role,
          schoolName: r.school_name ?? undefined,
          schoolLabel: r.school_id
            ? (schoolNames.get(r.school_id) ?? undefined)
            : undefined,
          studentRecordId: r.student_record_id ?? undefined,
          studentRecordLabel: r.student_record_id
            ? (recordNames.get(r.student_record_id) ?? undefined)
            : undefined,
          createdAt: r.created_at,
        }),
      );
    },
    async countPending() {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      if (error) fail("Falha ao contar cadastros pendentes", error);
      return count ?? 0;
    },
    onPendingCountChange(cb) {
      // Realtime: qualquer INSERT/UPDATE/DELETE em profiles pode mudar a
      // contagem de pendências. Requer a tabela na publicação
      // supabase_realtime (ver supabase/setup.sql). Se o Realtime estiver
      // indisponível, o badge segue atualizando por polling.
      const channel = supabase
        .channel("pending-registrations")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => cb(),
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
    async approve(profileId) {
      // student_record_id é deixado null: a escola vincula manualmente após a
      // aprovação (para evitar que nomes ambíguos ou com wildcards exponham
      // dados de outro aluno — veja task #20 "vincular manualmente").
      const { error } = await supabase
        .from("profiles")
        .update({ approval_status: "approved" })
        .eq("id", profileId);
      if (error) fail("Falha ao aprovar cadastro", error);
      profileCache.delete(profileId);
    },
    async reject(profileId) {
      const { error } = await supabase
        .from("profiles")
        .update({ approval_status: "rejected" })
        .eq("id", profileId);
      if (error) fail("Falha ao recusar cadastro", error);
      profileCache.delete(profileId);
    },
    async listLinkableStudentAccounts() {
      // RPC security definer (setup.sql): school_user vê só os alunos da
      // própria escola; super_admin vê todos.
      const { data, error } = await supabase.rpc(
        "list_linkable_student_accounts",
      );
      if (error) fail("Falha ao listar contas de aluno sem vínculo", error);
      return (
        (data ?? []) as Array<{ id: string; name: string; email: string }>
      ).map((r) => ({ id: r.id, name: r.name, email: r.email }));
    },
    async linkStudentAccount(profileId, studentRecordId) {
      // RPC security definer (setup.sql) valida escola, registro e duplicidade.
      const { error } = await supabase.rpc("link_student_account", {
        p_profile_id: profileId,
        p_student_record_id: studentRecordId,
      });
      if (error) fail("Falha ao vincular conta de aluno", error);
      profileCache.delete(profileId);
    },
    async listStudentAccounts() {
      // Visão do super_admin (RLS de profiles permite ler todos).
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, name, school_id, student_record_id")
        .eq("role", "student")
        .eq("approval_status", "approved")
        .order("name", { ascending: true });
      if (error) fail("Falha ao listar contas de aluno", error);
      const rows = data ?? [];
      const schoolIds = [
        ...new Set(rows.map((r) => r.school_id).filter(Boolean)),
      ] as string[];
      const schoolNames = new Map<string, string>();
      if (schoolIds.length > 0) {
        const { data: schools, error: schoolsErr } = await supabase
          .from("profiles")
          .select("id, school_name, name")
          .in("id", schoolIds);
        if (schoolsErr) fail("Falha ao carregar escolas", schoolsErr);
        for (const s of schools ?? [])
          schoolNames.set(s.id, s.school_name ?? s.name);
      }
      const recordIds = [
        ...new Set(rows.map((r) => r.student_record_id).filter(Boolean)),
      ] as string[];
      const recordNames = new Map<string, string>();
      if (recordIds.length > 0) {
        const { data: recs, error: recsErr } = await supabase
          .from("students")
          .select("id, name")
          .in("id", recordIds);
        if (recsErr) fail("Falha ao carregar registros de alunos", recsErr);
        for (const rec of recs ?? []) recordNames.set(rec.id, rec.name);
      }
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        schoolLabel: r.school_id
          ? (schoolNames.get(r.school_id) ?? undefined)
          : undefined,
        studentRecordId: r.student_record_id ?? undefined,
        studentRecordLabel: r.student_record_id
          ? (recordNames.get(r.student_record_id) ?? undefined)
          : undefined,
      }));
    },
  };

  // ---------- Prompt template ----------

  const promptTemplate: PromptTemplateRepository = {
    async get() {
      const { data, error } = await supabase
        .from("prompt_settings")
        .select("template, updated_at")
        .eq("id", "default")
        .maybeSingle();
      if (error) fail("Falha ao carregar o template do prompt", error);
      if (!data) return null;
      return {
        template: data.template as string,
        updatedAt: data.updated_at as string,
      } satisfies PromptTemplateSetting;
    },
    async save(template) {
      if (!template.trim()) throw new Error("O template não pode ficar vazio.");
      const { data, error } = await supabase
        .from("prompt_settings")
        .upsert({
          id: "default",
          template,
          updated_at: new Date().toISOString(),
        })
        .select("template, updated_at")
        .single();
      if (error) fail("Falha ao salvar o template do prompt", error);
      // A versão do histórico é gravada por trigger no banco
      // (on_prompt_settings_saved em setup.sql), na MESMA transação do
      // upsert — save e versão são atômicos.
      return {
        template: data.template as string,
        updatedAt: data.updated_at as string,
      };
    },
    async listVersions() {
      const { data, error } = await supabase
        .from("prompt_template_versions")
        .select("id, template, saved_by_name, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) fail("Falha ao carregar o histórico do template", error);
      return (data ?? []).map(
        (r): PromptTemplateVersion => ({
          id: r.id as string,
          template: r.template as string,
          savedBy: (r.saved_by_name as string | null) ?? "Administrador",
          savedAt: r.created_at as string,
        }),
      );
    },
    async reset() {
      const { error } = await supabase
        .from("prompt_settings")
        .delete()
        .eq("id", "default");
      if (error) fail("Falha ao restaurar o template padrão", error);
    },
  };

  // Geração continua no api-server (OpenAI), autenticada com o access token.
  const generation = createOpenAIGenerationService(
    async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async () => (await promptTemplate.get())?.template ?? null,
  );

  return {
    auth,
    approvals,
    storage,
    students,
    clubs,
    references,
    metrics,
    generatedPosts,
    promptTemplate,
    generation,
    isMock: false,
  };
}
