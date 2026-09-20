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
  ClassRepository,
  SchoolBrandRepository,
  DataLayer,
  GeneratedPostRepository,
  GuardianVerificationService,
  PromptTemplateRepository,
  ReferenceRepository,
  ShareLogRepository,
  StorageService,
  StudentRepository,
} from "../contract";
import type {
  AppUser,
  Grade,
  SchoolAddress,
  SchoolBrand,
  SchoolClass,
  SchoolContact,
  SchoolMembership,
  GeneratedPost,
  PendingRegistration,
  PromptTemplateSetting,
  PromptTemplateVersion,
  Guardian,
  ReferencePost,
  Session,
  ShareLog,
  StoredImage,
  Student,
} from "../types";
import { TRASH_RETENTION_DAYS, isPlatformAdmin } from "../types";
import { createOpenAIGenerationService } from "../openai-generation";

/** `guardians.whatsapp` é E.164 (+55…); o domínio usa só dígitos. */
function toE164(digits: string): string {
  return `+${digits.replace(/\D/g, "")}`;
}
function fromE164(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Chave da escola ativa escolhida na interface, por usuário. */
function activeSchoolKey(userId: string): string {
  return `iaschool:active-school:${userId}`;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "erro desconhecido"}`);
}

/**
 * Mensagem de erro de uma edge function. O supabase-js só entrega
 * "Edge Function returned a non-2xx status code"; a razão real vem no corpo
 * JSON (`{ error }`), acessível pela Response guardada em `context`.
 */
async function edgeFunctionMessage(
  error: unknown,
  context: string,
): Promise<string> {
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Corpo vazio ou não-JSON: cai no texto genérico abaixo.
    }
  }
  const message = error instanceof Error ? error.message : "erro desconhecido";
  return `${context}: ${message}`;
}

/** Erro de lixeira com dica quando a migração ainda não foi aplicada. */
/**
 * `unique (school_id, school_year, grade, name)` em `classes`: o banco é a
 * autoridade sobre duplicidade (não a tela), então traduzimos o 23505.
 */
function failDuplicateClass(
  context: string,
  error: { message: string; code?: string } | null,
): never {
  if (error?.code === "23505") {
    throw new Error(
      "Já existe uma turma com essa série, nome e ano letivo nesta escola.",
    );
  }
  fail(context, error);
}

function failTrash(
  context: string,
  error: { message: string; code?: string } | null,
): never {
  // 42703: coluna inexistente (select/filter); PGRST204: coluna fora do
  // schema cache do PostgREST (update) — ambos indicam migração pendente.
  if (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (error?.message ?? "").includes("deleted_at")
  ) {
    throw new Error(
      `${context}: a lixeira ainda não está habilitada no banco. Rode o script supabase/setup.sql no SQL Editor do Supabase.`,
    );
  }
  fail(context, error);
}
const SIGNED_URL_TTL = 365 * 24 * 3600;

// ---------- mapeadores snake_case ↔ domínio ----------

/** Colunas de `guardians` embutidas na consulta de alunos. */
const GUARDIAN_EMBED =
  "primary_guardian:guardians!students_primary_guardian_id_fkey(id, name, whatsapp, email, relationship, whatsapp_verified_at)";
const STUDENT_SELECT = `*, ${GUARDIAN_EMBED}`;

type GuardianRow = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  relationship: string | null;
  whatsapp_verified_at: string | null;
};

/**
 * Responsável composto: identidade e verificação do canal vêm da linha em
 * `guardians` (M1); consentimento continua no jsonb `students.guardian`,
 * que é a origem até o M4 (spec §4.7, item 4).
 */
function composeGuardian(
  json: Guardian | null,
  row: GuardianRow | null,
): Guardian | undefined {
  if (!row) {
    if (!json) return undefined;
    // Sem linha em guardians não há canal verificado, seja o que for que o
    // jsonb antigo diga.
    const { whatsappVerifiedAt: _ignored, ...rest } = json;
    return rest;
  }
  return {
    ...(json ?? {}),
    name: row.name,
    whatsapp: fromE164(row.whatsapp),
    email: row.email ?? json?.email,
    relationship: row.relationship ?? json?.relationship,
    whatsappVerifiedAt: row.whatsapp_verified_at ?? undefined,
  };
}

function toStudent(r: Row): Student {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    whatsapp: r["whatsapp"] as string,
    birthDate: (r["birth_date"] as string | null) ?? undefined,
    notes: (r["notes"] as string | null) ?? undefined,
    photos: (r["photos"] as StoredImage[] | null) ?? [],
    guardian: composeGuardian(
      (r["guardian"] as Guardian | null) ?? null,
      (r["primary_guardian"] as GuardianRow | null) ?? null,
    ),
    schoolId: r["school_id"] as string,
    classId: (r["class_id"] as string | null) ?? undefined,
    enrollmentNumber: (r["enrollment_number"] as string | null) ?? undefined,
    primaryGuardianId: (r["primary_guardian_id"] as string | null) ?? undefined,
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
    deletedAt: (r["deleted_at"] as string | null) ?? undefined,
  };
}

function fromStudent(p: Partial<Omit<Student, "id">>): Row {
  const r: Row = {};
  if ("name" in p) r["name"] = p.name;
  if ("whatsapp" in p) r["whatsapp"] = p.whatsapp;
  if ("birthDate" in p) r["birth_date"] = p.birthDate ?? null;
  if ("notes" in p) r["notes"] = p.notes ?? null;
  if ("photos" in p) r["photos"] = p.photos ?? [];
  if ("schoolId" in p && p.schoolId) r["school_id"] = p.schoolId;
  if ("classId" in p) r["class_id"] = p.classId ?? null;
  if ("enrollmentNumber" in p) r["enrollment_number"] = p.enrollmentNumber?.trim() || null;
  if ("guardian" in p) {
    // O jsonb guarda o consentimento; a verificação do canal vive em guardians.
    if (p.guardian) {
      const { whatsappVerifiedAt: _ignored, ...rest } = p.guardian;
      r["guardian"] = rest;
    } else {
      r["guardian"] = null;
    }
  }
  return r;
}

function toShareLog(r: Row): ShareLog {
  return {
    id: r["id"] as string,
    postId: r["post_id"] as string,
    studentId: r["student_id"] as string,
    studentName: r["student_name"] as string,
    channel: r["channel"] as ShareLog["channel"],
    targetWhatsapp: r["target_whatsapp"] as string,
    targetLabel: r["target_label"] as string,
    studentAgeBracket: r["student_age_bracket"] as ShareLog["studentAgeBracket"],
    guardianConsentAt: (r["guardian_consent_at"] as string | null) ?? undefined,
    sentByUserId: r["sent_by_user_id"] as string,
    sentByName: r["sent_by_name"] as string,
    createdAt: r["created_at"] as string,
  };
}

function toSchoolBrand(r: Row): SchoolBrand {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    logo: (r["logo"] as StoredImage | null) ?? undefined,
    colors: (r["colors"] as string[] | null) ?? [],
    cnpj: (r["cnpj"] as string | null) ?? undefined,
    address: (r["address"] as SchoolAddress | null) ?? undefined,
    contact: (r["contact"] as SchoolContact | null) ?? undefined,
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}

function fromSchoolBrand(p: Partial<Omit<SchoolBrand, "id">>): Row {
  const r: Row = {};
  if ("name" in p) r["name"] = p.name;
  if ("logo" in p) r["logo"] = p.logo ?? null;
  if ("colors" in p) r["colors"] = p.colors ?? [];
  // CNPJ tem unique no banco: string vazia viraria uma segunda escola "com
  // CNPJ vazio" e estouraria a chave na terceira. Vazio grava null.
  if ("cnpj" in p) r["cnpj"] = p.cnpj?.replace(/\D/g, "") || null;
  if ("address" in p) r["address"] = emptyToNull(p.address);
  if ("contact" in p) r["contact"] = emptyToNull(p.contact);
  return r;
}

/** jsonb só com campos vazios vira null — evita `{}` ocupando a coluna. */
function emptyToNull<T extends object>(value: T | undefined): T | null {
  if (!value) return null;
  const filled = Object.values(value).some(
    (v) => typeof v === "string" && v.trim() !== "",
  );
  return filled ? value : null;
}

function toSchoolClass(r: Row): SchoolClass {
  return {
    id: r["id"] as string,
    schoolId: r["school_id"] as string,
    schoolYear: r["school_year"] as number,
    grade: r["grade"] as Grade,
    name: r["name"] as string,
    teacherId: (r["teacher_id"] as string | null) ?? undefined,
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}

function fromSchoolClass(p: Partial<Omit<SchoolClass, "id">>): Row {
  const r: Row = {};
  if ("schoolYear" in p) r["school_year"] = p.schoolYear;
  if ("grade" in p) r["grade"] = p.grade;
  if ("name" in p) r["name"] = p.name?.trim();
  if ("teacherId" in p) r["teacher_id"] = p.teacherId ?? null;
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

function toGeneratedPost(r: Row): GeneratedPost {
  return {
    id: r["id"] as string,
    studentId: r["student_id"] as string,
    imageUrl: r["image_url"] as string,
    details: (r["details"] as GeneratedPost["details"] | null) ?? null,
    createdAt: r["created_at"] as string,
    deletedAt: (r["deleted_at"] as string | null) ?? undefined,
  };
}

/**
 * Extrai bucket + caminho do objeto a partir de uma URL do Supabase Storage
 * (assinada ou pública). Retorna null para data URLs ou URLs externas —
 * nesses casos não há arquivo nosso a remover.
 */
function storageLocationFromUrl(
  url: string,
): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1]!, path: decodeURIComponent(m[2]!) };
}
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
      .select("id, email, name, role, school_name, approval_status")
      .eq("id", userId)
      .maybeSingle();
    if (error) fail("Falha ao carregar perfil", error);
    if (!data) {
      throw new Error(
        "Seu usuário não tem perfil cadastrado. Peça ao administrador para criar seu registro na tabela profiles.",
      );
    }
    // Escolas de que a pessoa é membro (RPC security definer, M1).
    let schools: SchoolMembership[] = [];
    if (data.approval_status === "approved") {
      const { data: memberships, error: mErr } = await supabase.rpc("my_schools");
      if (mErr) fail("Falha ao carregar escolas do usuário", mErr);
      schools = (
        (memberships ?? []) as Array<{ id: string; name: string; role: string }>
      ).map((m) => ({
        schoolId: m.id,
        schoolName: m.name,
        role: m.role as SchoolMembership["role"],
      }));
    }
    const user: AppUser = {
      id: data.id,
      email: data.email ?? sb.user.email ?? "",
      name: data.name,
      role: data.role,
      schoolName: data.school_name ?? schools[0]?.schoolName ?? undefined,
      approvalStatus: data.approval_status ?? "approved",
      schools,
    };
    // Não cachear perfis pendentes: o status pode mudar a qualquer momento.
    if (user.approvalStatus === "approved") profileCache.set(userId, user);
    return user;
  }

  /**
   * Escola ativa: a última escolhida na interface, se ainda for uma escola
   * da pessoa; senão a primeira. Nunca decide RLS — só preenche `school_id`
   * ao criar registros e o prefixo dos uploads.
   */
  function resolveActiveSchool(user: AppUser): string | undefined {
    if (user.schools.length === 0) return undefined;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(activeSchoolKey(user.id));
    } catch {
      // sem localStorage: cai na primeira escola
    }
    const found = stored && user.schools.find((m) => m.schoolId === stored);
    return (found || user.schools[0])!.schoolId;
  }

  async function toSession(sb: SbSession | null): Promise<Session | null> {
    if (!sb) return null;
    const user = await loadProfile(sb);
    return {
      user,
      expiresAt: sb.expires_at
        ? new Date(sb.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600_000).toISOString(),
      activeSchoolId: resolveActiveSchool(user),
    };
  }

  /** Retorna o uid do usuário atual, ou lança erro se não houver sessão. */
  async function currentUserId(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw new Error("Você precisa estar logado para realizar esta ação.");
    return uid;
  }

  /** Sessão de domínio atual (perfil + escolas), ou erro se deslogado. */
  async function currentSession(): Promise<Session> {
    const { data } = await supabase.auth.getSession();
    const session = await toSession(data.session);
    if (!session) throw new Error("Você precisa estar logado para realizar esta ação.");
    return session;
  }

  /**
   * Escola em que registros novos nascem. Obrigatória para quem é membro de
   * escola; super_admin sem vínculo precisa informar a escola explicitamente.
   */
  async function requireActiveSchool(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    const session = await currentSession();
    if (session.activeSchoolId) return session.activeSchoolId;
    throw new Error(
      isPlatformAdmin(session.user.role)
        ? "Selecione a escola em que este registro deve ser criado."
        : "Sua conta ainda não está vinculada a uma escola.",
    );
  }

  /**
   * Garante a linha do responsável em `guardians` (por escola + número) e
   * devolve o id. Trocar o número é outra linha, e nasce sem verificação —
   * exatamente o que o Decreto nº 12.880/2026, art. 35 pede.
   */
  async function upsertGuardian(schoolId: string, g: Guardian): Promise<string> {
    const whatsapp = toE164(g.whatsapp);
    const { data: existing, error: findErr } = await supabase
      .from("guardians")
      .select("id")
      .eq("school_id", schoolId)
      .eq("whatsapp", whatsapp)
      .is("deleted_at", null)
      .maybeSingle();
    if (findErr) fail("Falha ao localizar responsável", findErr);
    const fields = {
      name: g.name,
      email: g.email ?? null,
      relationship: g.relationship ?? null,
    };
    if (existing) {
      const { error } = await supabase
        .from("guardians")
        .update(fields)
        .eq("id", existing.id);
      if (error) fail("Falha ao atualizar responsável", error);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("guardians")
      .insert({ school_id: schoolId, whatsapp, ...fields })
      .select("id")
      .single();
    if (error) fail("Falha ao cadastrar responsável", error);
    return data.id;
  }

  /** Ouvintes do app, para a troca de escola ativa também ser notificada. */
  const authListeners: Array<(s: Session | null) => void> = [];

  const auth: AuthService = {
    async getAccessToken() {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
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
      // O trigger handle_new_user (M1) cria o profile pendente a partir dos
      // metadados — funciona mesmo com confirmação de e-mail ativa. Só
      // existe cadastro de escola: menor de 16 não tem conta própria
      // (Lei 15.211/2025, art. 24).
      const metadata = {
        signup_role: "school",
        signup_name: input.schoolName.trim(),
        signup_school_name: input.schoolName.trim(),
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
    async setActiveSchool(schoolId) {
      const session = await currentSession();
      if (!session.user.schools.some((m) => m.schoolId === schoolId)) {
        throw new Error("Você não é membro desta escola.");
      }
      try {
        localStorage.setItem(activeSchoolKey(session.user.id), schoolId);
      } catch {
        // sem localStorage: a escolha vale só até recarregar
      }
      const updated = { ...session, activeSchoolId: schoolId };
      for (const cb of authListeners) cb(updated);
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
      authListeners.push(cb);
      const { data } = supabase.auth.onAuthStateChange((_event, sb) => {
        void toSession(sb)
          .then((session) => cb(session))
          .catch(() => cb(null));
      });
      return () => {
        const i = authListeners.indexOf(cb);
        if (i >= 0) authListeners.splice(i, 1);
        data.subscription.unsubscribe();
      };
    },
  };

  // ---------- Storage (buckets PRIVADOS, URLs assinadas) ----------
  // O caminho em cada bucket é sempre prefixado com o uid do usuário
  // para que as políticas RLS do Storage possam isolar por owner.
  // A URL retornada é uma URL assinada com 1 ano de validade.

  const storage: StorageService = {
    async upload(bucket, file, fileName) {
      const safeName = fileName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-");
      // O primeiro segmento do caminho é o id da ESCOLA (M1): é ele que a
      // policy de Storage confere com is_member_of(). super_admin sem escola
      // sobe na própria pasta (a policy o deixa passar).
      const session = await currentSession();
      const prefix = session.activeSchoolId ?? session.user.id;
      const objectPath = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

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

  // ---------- Re-assinatura de URLs ao exibir ----------
  // As URLs assinadas gravadas no banco expiram (SIGNED_URL_TTL). Em vez de
  // depender da URL gravada, guardamos o caminho do objeto (StoredImage.path
  // ou derivado da própria URL) e re-assinamos na hora de listar/carregar.
  // Cache em memória evita re-assinar a cada refetch na mesma sessão.

  const signedUrlCache = new Map<string, string>(); // "bucket/path" -> url

  /** Assina em lote os caminhos de um bucket; falhas mantêm a URL antiga. */
  async function signPaths(
    bucket: string,
    paths: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const missing: string[] = [];
    for (const p of paths) {
      const cached = signedUrlCache.get(`${bucket}/${p}`);
      if (cached) result.set(p, cached);
      else missing.push(p);
    }
    if (missing.length > 0) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(missing, SIGNED_URL_TTL);
      if (!error && data) {
        for (const item of data) {
          if (item.signedUrl && item.path) {
            result.set(item.path, item.signedUrl);
            signedUrlCache.set(`${bucket}/${item.path}`, item.signedUrl);
          }
        }
      }
      // Erros aqui são best-effort: quem chamou mantém a URL gravada.
    }
    return result;
  }

  /** Localiza bucket/caminho de um StoredImage (via path ou pela URL). */
  function storedImageLocation(
    img: StoredImage,
  ): { bucket: string; path: string } | null {
    if (img.path) {
      const i = img.path.indexOf("/");
      if (i > 0) {
        return { bucket: img.path.slice(0, i), path: img.path.slice(i + 1) };
      }
    }
    return storageLocationFromUrl(img.url);
  }

  type SignTarget = {
    bucket: string;
    path: string;
    apply: (url: string) => void;
  };

  /** Re-assina os alvos em lote (uma chamada por bucket). */
  async function refreshTargets(targets: SignTarget[]): Promise<void> {
    if (targets.length === 0) return;
    const byBucket = new Map<string, SignTarget[]>();
    for (const t of targets) {
      byBucket.set(t.bucket, [...(byBucket.get(t.bucket) ?? []), t]);
    }
    await Promise.all(
      [...byBucket.entries()].map(async ([bucket, list]) => {
        const map = await signPaths(bucket, [
          ...new Set(list.map((t) => t.path)),
        ]);
        for (const t of list) {
          const url = map.get(t.path);
          if (url) t.apply(url);
        }
      }),
    );
  }

  function imageTarget(img: StoredImage): SignTarget | null {
    const loc = storedImageLocation(img);
    if (!loc) return null; // data URL / URL externa: nada a re-assinar
    return {
      ...loc,
      apply: (url) => {
        img.url = url;
      },
    };
  }

  /** Re-assina as URLs de todas as imagens dos registros dados. */
  async function refreshImages<T>(
    rows: T[],
    imagesOf: (row: T) => Array<StoredImage | null | undefined>,
  ): Promise<T[]> {
    const targets: SignTarget[] = [];
    for (const row of rows) {
      for (const img of imagesOf(row)) {
        if (!img) continue;
        const t = imageTarget(img);
        if (t) targets.push(t);
      }
    }
    await refreshTargets(targets);
    return rows;
  }

  /** Re-assina image_url dos posts gerados (caminho derivado da URL). */
  async function refreshPostUrls(posts: GeneratedPost[]): Promise<GeneratedPost[]> {
    const targets: SignTarget[] = [];
    for (const post of posts) {
      const loc = storageLocationFromUrl(post.imageUrl);
      if (!loc) continue;
      targets.push({
        ...loc,
        apply: (url) => {
          post.imageUrl = url;
        },
      });
    }
    await refreshTargets(targets);
    return posts;
  }

  const studentImages = (s: Student) => s.photos;
  const schoolBrandImages = (b: SchoolBrand) => [b.logo];

  // ---------- Repositórios ----------

  /**
   * Exclui definitivamente os alunos dados: primeiro as fotos no Storage
   * (quando o caminho é conhecido), depois o registro. Se a remoção no
   * Storage falhar, o registro correspondente é PRESERVADO — assim a
   * exclusão pode ser tentada de novo e nenhum arquivo fica órfão.
   * (Mesmo padrão de hardDeletePosts.)
   */
  async function hardDeleteStudents(
    rows: Array<{ id: string; photos: StoredImage[] | null }>,
  ): Promise<void> {
    if (rows.length === 0) return;

    const byBucket = new Map<string, Array<{ id: string; path: string }>>();
    const deletableIds = new Set<string>();
    for (const r of rows) {
      const locs = (r.photos ?? [])
        .map((img) => storedImageLocation(img))
        .filter((l): l is { bucket: string; path: string } => l !== null);
      if (locs.length === 0) {
        deletableIds.add(r.id); // sem arquivo nosso no Storage
        continue;
      }
      for (const loc of locs) {
        byBucket.set(loc.bucket, [
          ...(byBucket.get(loc.bucket) ?? []),
          { id: r.id, path: loc.path },
        ]);
      }
    }

    let storageFailure: string | null = null;
    const failedIds = new Set<string>();
    for (const [bucket, entries] of byBucket) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(entries.map((e) => e.path));
      if (error) {
        storageFailure = error.message;
        for (const e of entries) failedIds.add(e.id);
      }
    }
    for (const r of rows) {
      if (!failedIds.has(r.id)) deletableIds.add(r.id);
    }

    if (deletableIds.size > 0) {
      const { error } = await supabase
        .from("students")
        .delete()
        .in("id", [...deletableIds]);
      if (error) fail("Falha ao excluir alunos definitivamente", error);
    }
    if (storageFailure) {
      throw new Error(
        `Falha ao remover foto(s) no Storage: ${storageFailure}. Os alunos afetados foram mantidos — tente excluir de novo.`,
      );
    }
  }

  /**
   * Expurgo oportunista: alunos há mais de 30 dias na lixeira.
   * Usa a RPC `purge_expired_student_trash()` (SECURITY DEFINER) para
   * contornar a política RLS students_delete (restrita a super_admin) —
   * assim qualquer usuário autenticado dispara o expurgo de registros.
   * Fotos no Storage tornam-se órfãs; a limpeza do Storage deve ser feita
   * por um job/Edge Function agendado (ver SUPABASE.md).
   */
  async function purgeExpiredStudentTrash(): Promise<void> {
    try {
      await supabase.rpc("purge_expired_student_trash");
    } catch {
      // Best-effort: tentará de novo no próximo carregamento.
      // Se a RPC ainda não existir no banco (setup.sql não re-executado),
      // o erro é silenciado — a lixeira funcionará sem expurgo até que o
      // setup.sql seja re-executado no SQL Editor do Supabase.
    }
  }

  const students: StudentRepository = {
    async list() {
      void purgeExpiredStudentTrash();
      const { data, error } = await supabase
        .from("students")
        .select(STUDENT_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        // Banco ainda sem a migração da lixeira (coluna deleted_at ausente):
        // lista sem o filtro para não quebrar a tela de Alunos.
        // Rode supabase/setup.sql para habilitar a lixeira.
        if (error.code === "42703") {
          const { data: all, error: err2 } = await supabase
            .from("students")
            .select(STUDENT_SELECT)
            .order("created_at", { ascending: false });
          if (err2) fail("Falha ao listar alunos", err2);
          return refreshImages((all ?? []).map(toStudent), studentImages);
        }
        fail("Falha ao listar alunos", error);
      }
      return refreshImages((data ?? []).map(toStudent), studentImages);
    },
    async listTrash() {
      await purgeExpiredStudentTrash();
      const { data, error } = await supabase
        .from("students")
        .select(STUDENT_SELECT)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) failTrash("Falha ao listar a lixeira de alunos", error);
      return refreshImages((data ?? []).map(toStudent), studentImages);
    },
    async moveToTrash(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("students")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) failTrash("Falha ao mover alunos para a lixeira", error);
    },
    async restore(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("students")
        .update({ deleted_at: null })
        .in("id", ids);
      if (error) failTrash("Falha ao restaurar alunos", error);
    },
    async deletePermanently(ids) {
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("students")
        .select("id, photos")
        .in("id", ids);
      if (error) fail("Falha ao excluir alunos definitivamente", error);
      await hardDeleteStudents(
        (data ?? []) as Array<{ id: string; photos: StoredImage[] | null }>,
      );
    },
    async get(id) {
      const { data, error } = await supabase
        .from("students")
        .select(STUDENT_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Falha ao carregar aluno", error);
      if (!data) return null;
      const [student] = await refreshImages([toStudent(data)], studentImages);
      return student!;
    },
    async create(input) {
      const uid = await currentUserId();
      const schoolId = await requireActiveSchool(input.schoolId);
      const row = fromStudent(input);
      if (input.guardian?.whatsapp) {
        row["primary_guardian_id"] = await upsertGuardian(schoolId, input.guardian);
      }
      const { data, error } = await supabase
        .from("students")
        .insert({ ...row, school_id: schoolId, owner_id: uid })
        .select(STUDENT_SELECT)
        .single();
      if (error) fail("Falha ao criar aluno", error);
      return toStudent(data);
    },
    async update(id, patch) {
      const row = fromStudent(patch);
      if ("guardian" in patch) {
        if (patch.guardian?.whatsapp) {
          const { data: current, error: curErr } = await supabase
            .from("students")
            .select("school_id")
            .eq("id", id)
            .single();
          if (curErr) fail("Falha ao carregar aluno", curErr);
          row["primary_guardian_id"] = await upsertGuardian(
            current.school_id as string,
            patch.guardian,
          );
        } else {
          row["primary_guardian_id"] = null;
        }
      }
      const { data, error } = await supabase
        .from("students")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(STUDENT_SELECT)
        .single();
      if (error) fail("Falha ao atualizar aluno", error);
      return toStudent(data);
    },
  };

  // Identidade visual = a própria escola (tabela `schools`, M1). A RLS já
  // limita às escolas de que a pessoa é membro.
  const SCHOOL_SELECT =
    "id, name, logo, colors, cnpj, address, contact, created_at, updated_at";
  const schoolBrands: SchoolBrandRepository = {
    async list() {
      const { data, error } = await supabase
        .from("schools")
        .select(SCHOOL_SELECT)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) fail("Falha ao listar escolas", error);
      return refreshImages((data ?? []).map(toSchoolBrand), schoolBrandImages);
    },
    async get(id) {
      const { data, error } = await supabase
        .from("schools")
        .select(SCHOOL_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Falha ao carregar escola", error);
      if (!data) return null;
      const [brand] = await refreshImages([toSchoolBrand(data)], schoolBrandImages);
      return brand!;
    },
    async update(id, patch) {
      const { data, error } = await supabase
        .from("schools")
        .update(fromSchoolBrand(patch))
        .eq("id", id)
        .select(SCHOOL_SELECT)
        .single();
      if (error) {
        // `schools.cnpj` é unique: outra escola já cadastrou este CNPJ.
        if (error.code === "23505") {
          throw new Error("Este CNPJ já está cadastrado em outra escola.");
        }
        fail("Falha ao atualizar escola", error);
      }
      profileCache.clear(); // o nome da escola aparece no seletor da sessão
      return toSchoolBrand(data);
    },
  };

  // Salas (`classes`). A RLS já limita às escolas de que a pessoa é membro;
  // o filtro por escola aqui é da interface (escola ativa), não de segurança.
  const CLASS_SELECT =
    "id, school_id, school_year, grade, name, teacher_id, created_at, updated_at";
  const classes: ClassRepository = {
    async list(schoolId) {
      let query = supabase.from("classes").select(CLASS_SELECT);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query
        .order("school_year", { ascending: false })
        .order("grade", { ascending: true })
        .order("name", { ascending: true });
      if (error) fail("Falha ao listar turmas", error);
      return (data ?? []).map(toSchoolClass);
    },
    async get(id) {
      const { data, error } = await supabase
        .from("classes")
        .select(CLASS_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Falha ao carregar turma", error);
      return data ? toSchoolClass(data) : null;
    },
    async create(input) {
      const schoolId = await requireActiveSchool(input.schoolId);
      const { data, error } = await supabase
        .from("classes")
        .insert({ ...fromSchoolClass(input), school_id: schoolId })
        .select(CLASS_SELECT)
        .single();
      if (error) failDuplicateClass("Falha ao criar turma", error);
      return toSchoolClass(data);
    },
    async update(id, patch) {
      const { data, error } = await supabase
        .from("classes")
        .update({ ...fromSchoolClass(patch), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(CLASS_SELECT)
        .single();
      if (error) failDuplicateClass("Falha ao atualizar turma", error);
      return toSchoolClass(data);
    },
    async delete(id) {
      // `students.class_id` é `on delete set null`: os alunos ficam sem turma,
      // não somem junto.
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) fail("Falha ao excluir turma", error);
    },
  };

  const references: ReferenceRepository = {
    async list() {
      const { data, error } = await supabase
        .from("reference_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) fail("Falha ao listar referências", error);
      return refreshImages((data ?? []).map(toReference), (r) => [r.image]);
    },
    async create(input) {
      // Referência de escola leva school_id; a do super_admin sem escola é
      // global (school_id nulo — só ele a vê).
      const session = await currentSession();
      const { data, error } = await supabase
        .from("reference_posts")
        .insert({
          image: input.image,
          title: input.title ?? null,
          uploaded_by: input.uploadedBy,
          owner_id: session.user.id,
          school_id: session.activeSchoolId ?? null,
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

  /**
   * Exclui definitivamente as linhas dadas: primeiro o arquivo no Storage
   * (quando o caminho é conhecido), depois o registro. Se a remoção no
   * Storage falhar, o registro correspondente é PRESERVADO — assim a
   * exclusão pode ser tentada de novo (pelo usuário ou pelo expurgo) e
   * nenhum arquivo fica órfão.
   */
  async function hardDeletePosts(
    rows: Array<{ id: string; image_url: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;

    // Agrupa por bucket os arquivos conhecidos, lembrando os ids das linhas.
    const byBucket = new Map<string, Array<{ id: string; path: string }>>();
    const deletableIds = new Set<string>();
    for (const r of rows) {
      const loc = storageLocationFromUrl(r.image_url);
      if (loc) {
        byBucket.set(loc.bucket, [
          ...(byBucket.get(loc.bucket) ?? []),
          { id: r.id, path: loc.path },
        ]);
      } else {
        // Sem arquivo nosso no Storage (data URL / URL externa): pode excluir.
        deletableIds.add(r.id);
      }
    }

    let storageFailure: string | null = null;
    for (const [bucket, entries] of byBucket) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(entries.map((e) => e.path));
      if (error) {
        // Mantém os registros deste bucket para tentar de novo depois.
        storageFailure = error.message;
      } else {
        // remove() não falha para arquivos inexistentes — ok excluir a linha.
        for (const e of entries) deletableIds.add(e.id);
      }
    }

    if (deletableIds.size > 0) {
      const { error } = await supabase
        .from("generated_posts")
        .delete()
        .in("id", [...deletableIds]);
      if (error) fail("Falha ao excluir posts definitivamente", error);
    }
    if (storageFailure) {
      throw new Error(
        `Falha ao remover arquivo(s) no Storage: ${storageFailure}. Os posts afetados foram mantidos — tente excluir de novo.`,
      );
    }
  }

  /** Expurgo oportunista: itens há mais de 30 dias na lixeira. */
  async function purgeExpiredTrash(): Promise<void> {
    const cutoff = new Date(
      Date.now() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000,
    ).toISOString();
    const { data, error } = await supabase
      .from("generated_posts")
      .select("id, image_url")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);
    if (error || !data || data.length === 0) return; // expurgo é best-effort
    try {
      await hardDeletePosts(data as Array<{ id: string; image_url: string }>);
    } catch {
      // Best-effort: tentará de novo no próximo carregamento.
    }
  }

  const generatedPosts: GeneratedPostRepository = {
    async list() {
      void purgeExpiredTrash();
      const { data, error } = await supabase
        .from("generated_posts")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        // Banco ainda sem a migração da lixeira (coluna deleted_at ausente):
        // lista sem o filtro para não quebrar dashboard/área do aluno.
        // Rode supabase/setup.sql para habilitar a lixeira.
        if (error.code === "42703") {
          const { data: all, error: err2 } = await supabase
            .from("generated_posts")
            .select("*")
            .order("created_at", { ascending: false });
          if (err2) fail("Falha ao listar posts gerados", err2);
          return refreshPostUrls((all ?? []).map(toGeneratedPost));
        }
        fail("Falha ao listar posts gerados", error);
      }
      return refreshPostUrls((data ?? []).map(toGeneratedPost));
    },
    async listTrash() {
      await purgeExpiredTrash();
      const { data, error } = await supabase
        .from("generated_posts")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) failTrash("Falha ao listar a lixeira", error);
      return refreshPostUrls((data ?? []).map(toGeneratedPost));
    },
    async moveToTrash(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("generated_posts")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) failTrash("Falha ao mover posts para a lixeira", error);
    },
    async restore(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("generated_posts")
        .update({ deleted_at: null })
        .in("id", ids);
      if (error) failTrash("Falha ao restaurar posts", error);
    },
    async deletePermanently(ids) {
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("generated_posts")
        .select("id, image_url")
        .in("id", ids);
      if (error) fail("Falha ao excluir posts definitivamente", error);
      await hardDeletePosts(
        (data ?? []) as Array<{ id: string; image_url: string }>,
      );
    },
    async create(input) {
      const uid = await currentUserId();
      // A arte pertence à escola do aluno, não à escola ativa da sessão.
      const { data: student, error: sErr } = await supabase
        .from("students")
        .select("school_id")
        .eq("id", input.studentId)
        .single();
      if (sErr) fail("Falha ao localizar o aluno da arte", sErr);
      const { data, error } = await supabase
        .from("generated_posts")
        .insert({
          student_id: input.studentId,
          image_url: input.imageUrl,
          details: input.details ?? null,
          owner_id: uid,
          school_id: student.school_id,
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
        .select("id, email, name, role, school_name, created_at")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: true });
      if (error) fail("Falha ao listar cadastros pendentes", error);
      return (data ?? []).map(
        (r): PendingRegistration => ({
          id: r.id,
          email: r.email,
          name: r.name,
          role: r.role,
          schoolName: r.school_name ?? undefined,
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
      // O trigger profiles_ensure_school_on_approval (M1) cria a escola e o
      // vínculo school_admin no mesmo UPDATE.
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

  // ---------- Conformidade ECA Digital ----------

  /**
   * Verificação do WhatsApp do responsável legal.
   * O código sai por uma edge function (`send-guardian-code`); a confirmação é
   * feita por RPC `confirm_guardian_code`, que grava
   * `guardian.whatsappVerifiedAt` com security definer.
   * Base: Decreto nº 12.880/2026, art. 35.
   *
   * Enquanto a função estiver em modo simulação (fase MVP — pendência 7 de
   * docs/pendencias-producao.md) ela devolve `demoCode` e a tela exibe o aviso
   * "Modo demonstração". Com o envio real ligado, `demoCode` some da resposta
   * e o código passa a existir só no WhatsApp do responsável.
   */
  const guardianVerification: GuardianVerificationService = {
    async requestCode(studentId) {
      const { data, error } = await supabase.functions.invoke<{
        demoCode?: string;
      }>("send-guardian-code", { body: { studentId } });
      if (error) {
        throw new Error(
          await edgeFunctionMessage(
            error,
            "Falha ao enviar o código para o responsável",
          ),
        );
      }
      return { demoCode: data?.demoCode };
    },
    async confirmCode(studentId, code) {
      // A verificação é por responsável (M1): resolve a linha em guardians.
      const current = await students.get(studentId);
      if (!current) throw new Error("Aluno não encontrado.");
      if (!current.primaryGuardianId) {
        throw new Error("Cadastre o responsável legal antes de verificar o WhatsApp.");
      }
      const { error } = await supabase.rpc("confirm_guardian_code", {
        p_guardian_id: current.primaryGuardianId,
        p_code: code.replace(/\D/g, ""),
      });
      if (error) {
        throw new Error(
          error.message.includes("expired")
            ? "O código expirou. Peça um novo."
            : error.message.includes("invalid")
              ? "Código incorreto."
              : `Falha ao confirmar o código: ${error.message}`,
        );
      }
      const student = await students.get(studentId);
      if (!student) throw new Error("Aluno não encontrado.");
      return student;
    },
  };

  /**
   * Trilha append-only dos envios de imagem de aluno.
   * A RLS de `share_logs` permite INSERT e SELECT, nunca UPDATE nem DELETE.
   */
  const shareLogs: ShareLogRepository = {
    async list(studentId) {
      let query = supabase
        .from("share_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (studentId) query = query.eq("student_id", studentId);
      const { data, error } = await query;
      if (error) fail("Falha ao listar o histórico de envios", error);
      return (data ?? []).map(toShareLog);
    },
    async record(input) {
      const { data, error } = await supabase
        .from("share_logs")
        .insert({
          post_id: input.postId,
          student_id: input.studentId,
          student_name: input.studentName,
          channel: input.channel,
          target_whatsapp: input.targetWhatsapp,
          target_label: input.targetLabel,
          student_age_bracket: input.studentAgeBracket,
          guardian_consent_at: input.guardianConsentAt ?? null,
          sent_by_user_id: input.sentByUserId,
          sent_by_name: input.sentByName,
        })
        .select("*")
        .single();
      if (error) fail("Falha ao registrar o envio", error);
      return toShareLog(data);
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
    schoolBrands,
    classes,
    references,
    generatedPosts,
    promptTemplate,
    generation,
    guardianVerification,
    shareLogs,
    isMock: false,
  };
}
