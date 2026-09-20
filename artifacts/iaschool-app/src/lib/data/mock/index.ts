// Implementação mock (localStorage) do contrato Supabase — ver ../contract.ts
// Troca futura: substituir createMockDataLayer() por createSupabaseDataLayer()
// em ../index.ts, mantendo as mesmas interfaces.

import type {
  ApprovalRepository,
  AuthService,
  ClassRepository,
  SchoolBrandRepository,
  DataLayer,
  GeneratedPostRepository,
  ImageGenerationService,
  PromptTemplateRepository,
  GuardianVerificationService,
  ReferenceRepository,
  ShareLogRepository,
  StorageService,
  StudentRepository,
} from "../contract";
import type {
  AppUser,
  SchoolBrand,
  SchoolClass,
  GeneratedPost,
  PendingRegistration,
  PromptTemplateSetting,
  PromptTemplateVersion,
  ReferencePost,
  Session,
  ShareLog,
  StoredImage,
  Student,
} from "../types";
import { TRASH_RETENTION_DAYS, isPlatformAdmin } from "../types";
import { MOCK_SCHOOLS, MOCK_USERS } from "./seed";
import {
  delay,
  newId,
  nowIso,
  readCollection,
  readValue,
  writeCollection,
  writeValue,
} from "./store";
import { createOpenAIGenerationService } from "../openai-generation";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(blob);
  });
}

// Cadastros feitos pelo fluxo público (modo demo): ficam em localStorage
// com o mesmo ciclo pendente → aprovado/recusado do Supabase real. Desde o
// M1 só existe cadastro de escola.
interface MockRegistration {
  user: AppUser;
  createdAt: string;
}

function readRegistrations(): MockRegistration[] {
  return readCollection<MockRegistration>("registrations", []);
}

const PENDING_CHANGED_EVENT = "iaschool:pending-registrations-changed";

function writeRegistrations(items: MockRegistration[]): void {
  writeCollection("registrations", items);
  // Notifica o badge de aprovações (mesma aba). Entre abas, o evento
  // nativo "storage" do localStorage cumpre o mesmo papel.
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

function allUsers(): AppUser[] {
  return [...MOCK_USERS, ...readRegistrations().map((r) => r.user)];
}

/** Tabela `schools` do mock, semeada com a escola de demonstração. */
function readSchools(): SchoolBrand[] {
  const stored = readCollection<SchoolBrand>("schools", []);
  const missing = MOCK_SCHOOLS.filter((m) => !stored.some((s) => s.id === m.id));
  if (missing.length > 0) {
    const merged = [...stored, ...missing];
    writeCollection("schools", merged);
    return merged;
  }
  return stored;
}

/** Escola ativa: a última escolhida, se ainda for da pessoa; senão a primeira. */
function resolveActiveSchool(user: AppUser): string | undefined {
  // Sessão gravada antes do M1 pode não ter `schools`.
  const schools = user.schools ?? [];
  if (schools.length === 0) return undefined;
  const stored = readValue<string>(`active-school:${user.id}`);
  const found = stored && schools.find((m) => m.schoolId === stored);
  return (found || schools[0])!.schoolId;
}

function buildSession(user: AppUser, expiresAt?: string): Session {
  return {
    user,
    expiresAt:
      expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    activeSchoolId: resolveActiveSchool(user),
  };
}

/** Sessão atual com usuário e escola ativa frescos. */
function currentSession(): Session | null {
  const session = readValue<Session>("session");
  if (!session) return null;
  const fresh = allUsers().find((u) => u.id === session.user.id) ?? session.user;
  return buildSession(fresh, session.expiresAt);
}

/** Escolas que a sessão enxerga: todas para admin de plataforma. */
function visibleSchoolIds(session: Session | null): string[] | "all" {
  if (!session) return [];
  if (isPlatformAdmin(session.user.role)) return "all";
  return (session.user.schools ?? []).map((m) => m.schoolId);
}

function canSee(session: Session | null, schoolId: string | undefined): boolean {
  const ids = visibleSchoolIds(session);
  if (ids === "all") return true;
  // Registros antigos sem escola ficam visíveis para quem os criou ver a
  // migração acontecer; no Supabase eles ganham school_id na migration.
  if (!schoolId) return true;
  return ids.includes(schoolId);
}

const auth: AuthService = {
  // Mock não tem JWT real — rotas autenticadas do api-server ficam
  // indisponíveis em modo demonstração.
  async getAccessToken() {
    return null;
  },
  async getSession() {
    await delay(200);
    // Reflete aprovação/recusa feita após o login (dados sempre frescos).
    const session = currentSession();
    if (session) writeValue("session", session);
    return session;
  },
  async signIn(email, password) {
    await delay(600);
    const user = allUsers().find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!user || password.length < 4) {
      throw new Error("E-mail ou senha inválidos");
    }
    const session = buildSession(user);
    writeValue("session", session);
    listeners.forEach((cb) => cb(session));
    return session;
  },
  async signUp(input) {
    await delay(700);
    const email = input.email.trim().toLowerCase();
    if (allUsers().some((u) => u.email.toLowerCase() === email)) {
      throw new Error("Este e-mail já está cadastrado.");
    }
    if (input.password.length < 4) {
      throw new Error("A senha deve ter ao menos 4 caracteres");
    }
    const regs = readRegistrations();
    regs.unshift({
      user: {
        id: newId(),
        email,
        name: input.schoolName.trim(),
        role: "user",
        schoolName: input.schoolName.trim(),
        approvalStatus: "pending",
        schools: [],
      },
      createdAt: nowIso(),
    });
    writeRegistrations(regs);
  },
  async setActiveSchool(schoolId) {
    const session = currentSession();
    if (!session) throw new Error("Você precisa estar logado.");
    if (!session.user.schools.some((m) => m.schoolId === schoolId)) {
      throw new Error("Você não é membro desta escola.");
    }
    writeValue(`active-school:${session.user.id}`, schoolId);
    const updated = { ...session, activeSchoolId: schoolId };
    writeValue("session", updated);
    listeners.forEach((cb) => cb(updated));
  },
  async resetPassword(email) {
    await delay(600);
    const exists = allUsers().some(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!exists) throw new Error("E-mail não cadastrado");
    // Modo demo: nenhum e-mail é enviado de fato.
  },
  async updatePassword(newPassword) {
    await delay(400);
    if (newPassword.length < 4) {
      throw new Error("A senha deve ter ao menos 4 caracteres");
    }
    // Modo demo: qualquer senha com 4+ caracteres continua válida no login.
  },
  async signOut() {
    await delay(200);
    writeValue("session", null);
    listeners.forEach((cb) => cb(null));
  },
  onAuthStateChange(cb) {
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
};
const listeners: Array<(s: Session | null) => void> = [];

const storage: StorageService = {
  async upload(bucket, file, fileName) {
    await delay(250);
    const url = await blobToDataUrl(file);
    const img: StoredImage = {
      id: newId(),
      url,
      path: `${bucket}/${Date.now()}-${fileName}`,
      createdAt: nowIso(),
    };
    return img;
  },
  async remove() {
    await delay(100);
  },
};

function makeCrud<T extends { id: string; createdAt: string }>(key: string) {
  return {
    async list(): Promise<T[]> {
      await delay();
      return readCollection<T>(key, []);
    },
    async get(id: string): Promise<T | null> {
      await delay(200);
      return readCollection<T>(key, []).find((x) => x.id === id) ?? null;
    },
    async create(input: Record<string, unknown>): Promise<T> {
      await delay(400);
      const item = {
        ...input,
        id: newId(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as unknown as T;
      const items = readCollection<T>(key, []);
      items.unshift(item);
      writeCollection(key, items);
      return item;
    },
    async update(id: string, patch: Record<string, unknown>): Promise<T> {
      await delay(400);
      const items = readCollection<T>(key, []);
      const idx = items.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("Registro não encontrado");
      items[idx] = { ...items[idx], ...patch, updatedAt: nowIso() } as T;
      writeCollection(key, items);
      return items[idx];
    },
    async delete(id: string): Promise<void> {
      await delay(300);
      writeCollection(
        key,
        readCollection<T>(key, []).filter((x) => x.id !== id),
      );
    },
  };
}

// Espelha o owner_id do Supabase: registros criados guardam a escola dona,
// para que o vínculo de conta valide a posse também no modo mock.
type OwnedStudent = Student & { ownerId?: string };
const studentsCrud = makeCrud<OwnedStudent>("students");

/** Expurgo oportunista da lixeira de alunos: itens com mais de 30 dias. */
function purgeExpiredStudents(): void {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000;
  const items = readCollection<OwnedStudent>("students", []);
  const expired = items.filter(
    (s) => s.deletedAt && new Date(s.deletedAt).getTime() < cutoff,
  );
  if (expired.length === 0) return;
  // No mock as fotos são data URLs (sem arquivo no Storage a remover).
  writeCollection(
    "students",
    items.filter((s) => !expired.some((e) => e.id === s.id)),
  );
}

/** Espelha `guardians` (uma linha por escola + número) com um id estável. */
function guardianIdFor(schoolId: string, whatsapp: string): string {
  return `guardian:${schoolId}:${whatsapp.replace(/\D/g, "")}`;
}

const students: StudentRepository = {
  async list() {
    purgeExpiredStudents();
    const session = currentSession();
    return (await studentsCrud.list()).filter(
      (s) => !s.deletedAt && canSee(session, s.schoolId),
    );
  },
  async get(id) {
    const s = await studentsCrud.get(id);
    return s && canSee(currentSession(), s.schoolId) ? s : null;
  },
  create: (input) => {
    const session = currentSession();
    const schoolId = input.schoolId ?? session?.activeSchoolId;
    if (!schoolId) {
      throw new Error(
        isPlatformAdmin(session?.user.role)
          ? "Selecione a escola em que este registro deve ser criado."
          : "Sua conta ainda não está vinculada a uma escola.",
      );
    }
    return studentsCrud.create({
      ...input,
      schoolId,
      primaryGuardianId: input.guardian?.whatsapp
        ? guardianIdFor(schoolId, input.guardian.whatsapp)
        : undefined,
      ownerId: session?.user.id,
    });
  },
  async update(id, patch) {
    const current = await studentsCrud.get(id);
    if (!current) throw new Error("Registro não encontrado");
    const next: Record<string, unknown> = { ...patch };
    if ("guardian" in patch) {
      next["primaryGuardianId"] = patch.guardian?.whatsapp
        ? guardianIdFor(current.schoolId, patch.guardian.whatsapp)
        : undefined;
    }
    return studentsCrud.update(id, next);
  },
  async listTrash() {
    purgeExpiredStudents();
    const session = currentSession();
    return (await studentsCrud.list())
      .filter((s) => Boolean(s.deletedAt) && canSee(session, s.schoolId))
      .sort(
        (a, b) =>
          new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime(),
      );
  },
  async moveToTrash(ids) {
    await delay(300);
    const deletedAt = nowIso();
    const items = readCollection<OwnedStudent>("students", []);
    writeCollection(
      "students",
      items.map((s) => (ids.includes(s.id) ? { ...s, deletedAt } : s)),
    );
  },
  async restore(ids) {
    await delay(300);
    const items = readCollection<OwnedStudent>("students", []);
    writeCollection(
      "students",
      items.map((s) =>
        ids.includes(s.id) ? { ...s, deletedAt: undefined } : s,
      ),
    );
  },
  async deletePermanently(ids) {
    await delay(300);
    // Espelha a política RLS students_delete (super_admin only):
    // school_user deve usar moveToTrash (UPDATE) para garantir a retenção.
    const session = readValue<Session>("session");
    if (!isPlatformAdmin(session?.user.role)) {
      throw new Error("Apenas administradores podem excluir alunos definitivamente.");
    }
    // No mock as fotos são data URLs (sem arquivo no Storage a remover).
    const items = readCollection<OwnedStudent>("students", []);
    writeCollection(
      "students",
      items.filter((s) => !ids.includes(s.id)),
    );
  },
};

// Identidade visual = a própria escola (tabela `schools`, M1).
const schoolBrands: SchoolBrandRepository = {
  async list() {
    await delay();
    const session = currentSession();
    return readSchools().filter((sc) => canSee(session, sc.id));
  },
  async get(id) {
    await delay(200);
    const sc = readSchools().find((x) => x.id === id) ?? null;
    return sc && canSee(currentSession(), sc.id) ? sc : null;
  },
  async update(id, patch) {
    await delay(400);
    const items = readSchools();
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error("Escola não encontrada");
    items[idx] = { ...items[idx]!, ...patch, updatedAt: nowIso() };
    writeCollection("schools", items);
    // O nome da escola também aparece nos vínculos dos usuários.
    if (patch.name) {
      const regs = readRegistrations();
      for (const r of regs) {
        for (const m of r.user.schools) if (m.schoolId === id) m.schoolName = patch.name;
      }
      writeRegistrations(regs);
    }
    return items[idx]!;
  },
};

const classesCrud = makeCrud<SchoolClass>("classes");

/** Mesma chave do banco: `unique (school_id, school_year, grade, name)`. */
function classKey(c: {
  schoolId: string;
  schoolYear: number;
  grade: string;
  name: string;
}): string {
  return [c.schoolId, c.schoolYear, c.grade, c.name.trim().toLowerCase()].join("|");
}

const classes: ClassRepository = {
  async list(schoolId) {
    const session = currentSession();
    return (await classesCrud.list())
      .filter((c) => canSee(session, c.schoolId))
      .filter((c) => !schoolId || c.schoolId === schoolId)
      .sort(
        (a, b) =>
          b.schoolYear - a.schoolYear ||
          a.grade.localeCompare(b.grade) ||
          a.name.localeCompare(b.name),
      );
  },
  async get(id) {
    const c = await classesCrud.get(id);
    return c && canSee(currentSession(), c.schoolId) ? c : null;
  },
  async create(input) {
    const session = currentSession();
    const schoolId = input.schoolId ?? session?.activeSchoolId;
    if (!schoolId) {
      throw new Error(
        isPlatformAdmin(session?.user.role)
          ? "Selecione a escola em que este registro deve ser criado."
          : "Sua conta ainda não está vinculada a uma escola.",
      );
    }
    const next = { ...input, schoolId, name: input.name.trim() };
    const existing = readCollection<SchoolClass>("classes", []);
    if (existing.some((c) => classKey(c) === classKey(next))) {
      throw new Error(
        "Já existe uma turma com essa série, nome e ano letivo nesta escola.",
      );
    }
    return classesCrud.create(next as unknown as Record<string, unknown>);
  },
  async update(id, patch) {
    const current = await classesCrud.get(id);
    if (!current) throw new Error("Registro não encontrado");
    const next = {
      ...current,
      ...patch,
      name: (patch.name ?? current.name).trim(),
    };
    const clash = readCollection<SchoolClass>("classes", []).some(
      (c) => c.id !== id && classKey(c) === classKey(next),
    );
    if (clash) {
      throw new Error(
        "Já existe uma turma com essa série, nome e ano letivo nesta escola.",
      );
    }
    return classesCrud.update(id, { ...patch, name: next.name });
  },
  async delete(id) {
    await classesCrud.delete(id);
    // Espelha `on delete set null` em students.class_id: o aluno perde a
    // turma, não o cadastro.
    const students = readCollection<OwnedStudent>("students", []);
    const touched = students.map((s) =>
      s.classId === id ? { ...s, classId: undefined } : s,
    );
    writeCollection("students", touched);
  },
};

const referencesCrud = makeCrud<ReferencePost>("references");
const references: ReferenceRepository = {
  list: () => referencesCrud.list(),
  create: (input) => referencesCrud.create(input as Record<string, unknown>),
  delete: (id) => referencesCrud.delete(id),
};

const generatedPostsCrud = makeCrud<GeneratedPost>("generated-posts");

/** Expurgo oportunista: remove da lixeira itens com mais de 30 dias. */
function purgeExpiredGeneratedPosts(): void {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000;
  const items = readCollection<GeneratedPost>("generated-posts", []);
  const kept = items.filter(
    (p) => !p.deletedAt || new Date(p.deletedAt).getTime() >= cutoff,
  );
  if (kept.length !== items.length) writeCollection("generated-posts", kept);
}

const generatedPosts: GeneratedPostRepository = {
  async list() {
    purgeExpiredGeneratedPosts();
    return (await generatedPostsCrud.list()).filter((p) => !p.deletedAt);
  },
  async listTrash() {
    purgeExpiredGeneratedPosts();
    return (await generatedPostsCrud.list())
      .filter((p) => Boolean(p.deletedAt))
      .sort(
        (a, b) =>
          new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime(),
      );
  },
  create: (input) =>
    generatedPostsCrud.create(input as Record<string, unknown>),
  async moveToTrash(ids) {
    await delay(300);
    const deletedAt = nowIso();
    const items = readCollection<GeneratedPost>("generated-posts", []);
    writeCollection(
      "generated-posts",
      items.map((p) => (ids.includes(p.id) ? { ...p, deletedAt } : p)),
    );
  },
  async restore(ids) {
    await delay(300);
    const items = readCollection<GeneratedPost>("generated-posts", []);
    writeCollection(
      "generated-posts",
      items.map((p) =>
        ids.includes(p.id) ? { ...p, deletedAt: undefined } : p,
      ),
    );
  },
  async deletePermanently(ids) {
    await delay(300);
    // No mock as imagens são data URLs (sem arquivo no Storage a remover).
    const items = readCollection<GeneratedPost>("generated-posts", []);
    writeCollection(
      "generated-posts",
      items.filter((p) => !ids.includes(p.id)),
    );
  },
};

const approvals: ApprovalRepository = {
  async listPending(): Promise<PendingRegistration[]> {
    await delay(300);
    return readRegistrations()
      .filter((r) => r.user.approvalStatus === "pending")
      .map((r) => ({
        id: r.user.id,
        email: r.user.email,
        name: r.user.name,
        role: r.user.role,
        schoolName: r.user.schoolName,
        createdAt: r.createdAt,
      }));
  },
  async countPending(): Promise<number> {
    await delay(150);
    return readRegistrations().filter(
      (r) => r.user.approvalStatus === "pending",
    ).length;
  },
  onPendingCountChange(cb: () => void): () => void {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("registrations")) cb();
    };
    window.addEventListener(PENDING_CHANGED_EVENT, cb);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PENDING_CHANGED_EVENT, cb);
      window.removeEventListener("storage", onStorage);
    };
  },
  async approve(profileId: string): Promise<void> {
    await delay(400);
    const regs = readRegistrations();
    const reg = regs.find((r) => r.user.id === profileId);
    if (!reg) throw new Error("Cadastro não encontrado");
    reg.user.approvalStatus = "approved";
    // Espelha o trigger do M1: a aprovação cria a escola (id = uid) e o
    // vínculo school_admin, se a pessoa ainda não é membro de nenhuma.
    if (reg.user.role === "user" && reg.user.schools.length === 0) {
      const schoolName = reg.user.schoolName ?? reg.user.name;
      const schools = readSchools();
      if (!schools.some((sc) => sc.id === reg.user.id)) {
        schools.push({
          id: reg.user.id,
          name: schoolName,
          colors: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        writeCollection("schools", schools);
      }
      reg.user.schools = [
        { schoolId: reg.user.id, schoolName, role: "school_admin" },
      ];
    }
    writeRegistrations(regs);
  },
  async reject(profileId: string): Promise<void> {
    await delay(400);
    const regs = readRegistrations();
    const reg = regs.find((r) => r.user.id === profileId);
    if (!reg) throw new Error("Cadastro não encontrado");
    reg.user.approvalStatus = "rejected";
    writeRegistrations(regs);
  },
};

// Escrita restrita a super_admin, espelhando as políticas RLS do Supabase.
function assertSuperAdmin(): void {
  const session = readValue<Session>("session");
  if (!isPlatformAdmin(session?.user.role)) {
    throw new Error("Apenas administradores podem alterar o template do prompt.");
  }
}

const MAX_PROMPT_VERSIONS = 50;
const promptTemplate: PromptTemplateRepository = {
  async get() {
    await delay(200);
    return readValue<PromptTemplateSetting>("prompt-template");
  },
  async save(template) {
    await delay(350);
    assertSuperAdmin();
    if (!template.trim()) throw new Error("O template não pode ficar vazio.");
    const setting: PromptTemplateSetting = { template, updatedAt: nowIso() };
    writeValue("prompt-template", setting);
    // Grava uma versão no histórico (espelha a tabela prompt_template_versions).
    const session = readValue<Session>("session");
    const versions = readCollection<PromptTemplateVersion>(
      "prompt-template-versions",
      [],
    );
    versions.unshift({
      id: newId(),
      template,
      savedBy: session?.user.name ?? "Administrador",
      savedAt: setting.updatedAt,
    });
    writeCollection(
      "prompt-template-versions",
      versions.slice(0, MAX_PROMPT_VERSIONS),
    );
    return setting;
  },
  async listVersions() {
    await delay(200);
    return readCollection<PromptTemplateVersion>("prompt-template-versions", []);
  },
  async reset() {
    await delay(250);
    assertSuperAdmin();
    writeValue("prompt-template", null);
  },
};

// Geração é REAL (OpenAI GPT Image via backend), mesmo com o resto mock.
const generation: ImageGenerationService = createOpenAIGenerationService(
  undefined,
  async () =>
    readValue<PromptTemplateSetting>("prompt-template")?.template ?? null,
);

// ---------- Conformidade ECA Digital ----------

/** Código de confirmação do WhatsApp do responsável (modo demo). */
interface GuardianCode {
  code: string;
  /** ISO de expiração — códigos velhos não valem. */
  expiresAt: string;
}

const GUARDIAN_CODE_TTL_MINUTES = 10;

function readGuardianCodes(): Record<string, GuardianCode> {
  return readValue<Record<string, GuardianCode>>("guardian-codes") ?? {};
}

/**
 * Verificação do canal do responsável. No modo demo o código é devolvido à
 * tela; em produção ele sai por WhatsApp/SMS e nunca volta ao cliente.
 */
const guardianVerification: GuardianVerificationService = {
  async requestCode(studentId) {
    await delay(500);
    const student = await studentsCrud.get(studentId);
    if (!student) throw new Error("Aluno não encontrado.");
    if (!student.guardian?.whatsapp) {
      throw new Error(
        "Cadastre o responsável legal antes de verificar o WhatsApp.",
      );
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codes = readGuardianCodes();
    codes[studentId] = {
      code,
      expiresAt: new Date(
        Date.now() + GUARDIAN_CODE_TTL_MINUTES * 60 * 1000,
      ).toISOString(),
    };
    writeValue("guardian-codes", codes);
    return { demoCode: code };
  },
  async confirmCode(studentId, code) {
    await delay(500);
    const codes = readGuardianCodes();
    const entry = codes[studentId];
    if (!entry) throw new Error("Peça um novo código.");
    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      delete codes[studentId];
      writeValue("guardian-codes", codes);
      throw new Error("O código expirou. Peça um novo.");
    }
    if (entry.code !== code.replace(/\D/g, "")) {
      throw new Error("Código incorreto.");
    }
    const student = await studentsCrud.get(studentId);
    if (!student?.guardian) throw new Error("Aluno sem responsável cadastrado.");
    delete codes[studentId];
    writeValue("guardian-codes", codes);
    return studentsCrud.update(studentId, {
      guardian: { ...student.guardian, whatsappVerifiedAt: nowIso() },
    });
  },
};

const shareLogs: ShareLogRepository = {
  async list(studentId) {
    await delay(200);
    const all = readCollection<ShareLog>("share-logs", []);
    const filtered = studentId
      ? all.filter((l) => l.studentId === studentId)
      : all;
    return [...filtered].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },
  async record(input) {
    await delay(150);
    const entry: ShareLog = { ...input, id: newId(), createdAt: nowIso() };
    // Trilha append-only: nada na UI apaga um registro de envio.
    writeCollection("share-logs", [entry, ...readCollection<ShareLog>("share-logs", [])]);
    return entry;
  },
};

export function createMockDataLayer(): DataLayer {
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
    isMock: true,
  };
}
