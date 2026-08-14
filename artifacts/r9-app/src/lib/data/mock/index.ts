// Implementação mock (localStorage) do contrato Supabase — ver ../contract.ts
// Troca futura: substituir createMockDataLayer() por createSupabaseDataLayer()
// em ../index.ts, mantendo as mesmas interfaces.

import type {
  ApprovalRepository,
  AuthService,
  ClubRepository,
  DataLayer,
  GeneratedPostRepository,
  ImageGenerationService,
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
import { TRASH_RETENTION_DAYS } from "../types";
import { PREDEFINED_METRICS, MOCK_USERS } from "./seed";
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
// com o mesmo ciclo pendente → aprovado/recusado do Supabase real.
interface MockRegistration {
  user: AppUser;
  schoolLabel?: string;
  createdAt: string;
}

function readRegistrations(): MockRegistration[] {
  return readCollection<MockRegistration>("registrations", []);
}

const PENDING_CHANGED_EVENT = "r9:pending-registrations-changed";

function writeRegistrations(items: MockRegistration[]): void {
  writeCollection("registrations", items);
  // Notifica o badge de aprovações (mesma aba). Entre abas, o evento
  // nativo "storage" do localStorage cumpre o mesmo papel.
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

// Vínculos conta de aluno → registro students (profiles.student_record_id).
// Guardados à parte para também cobrir os usuários seed (MOCK_USERS).
function readStudentLinks(): Record<string, string> {
  return readValue<Record<string, string>>("student-links") ?? {};
}

function allUsers(): AppUser[] {
  const links = readStudentLinks();
  return [...MOCK_USERS, ...readRegistrations().map((r) => r.user)].map((u) =>
    links[u.id] ? { ...u, studentRecordId: links[u.id] } : u,
  );
}

const auth: AuthService = {
  async getSession() {
    await delay(200);
    const session = readValue<Session>("session");
    if (!session) return null;
    // Reflete aprovação/recusa feita após o login (dados sempre frescos).
    const fresh = allUsers().find((u) => u.id === session.user.id);
    if (fresh) {
      const updated: Session = { ...session, user: fresh };
      writeValue("session", updated);
      return updated;
    }
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
    const session: Session = {
      user,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
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
    if (input.kind === "school") {
      regs.unshift({
        user: {
          id: newId(),
          email,
          name: input.schoolName.trim(),
          role: "school_user",
          schoolName: input.schoolName.trim(),
          approvalStatus: "pending",
        },
        createdAt: nowIso(),
      });
    } else {
      const school = (await auth.listApprovedSchools()).find(
        (s) => s.id === input.schoolId,
      );
      if (!school) throw new Error("Escola não encontrada.");
      regs.unshift({
        user: {
          id: newId(),
          email,
          name: input.name.trim(),
          role: "student",
          approvalStatus: "pending",
          schoolId: input.schoolId,
        },
        schoolLabel: school.name,
        createdAt: nowIso(),
      });
    }
    writeRegistrations(regs);
  },
  async listApprovedSchools() {
    await delay(300);
    return allUsers()
      .filter((u) => u.role === "school_user" && u.approvalStatus === "approved")
      .map((u) => ({ id: u.id, name: u.schoolName ?? u.name }));
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
const students: StudentRepository = {
  list: () => studentsCrud.list(),
  get: (id) => studentsCrud.get(id),
  create: (input) => {
    const session = readValue<Session>("session");
    return studentsCrud.create({ ...input, ownerId: session?.user.id });
  },
  update: (id, patch) => studentsCrud.update(id, patch),
  delete: async (id) => {
    await studentsCrud.delete(id);
    // Espelha a FK on delete set null do Supabase: excluir o registro
    // desfaz o vínculo, e a conta volta a aparecer no seletor.
    const links = readStudentLinks();
    const orphaned = Object.keys(links).filter((pid) => links[pid] === id);
    if (orphaned.length > 0) {
      for (const pid of orphaned) delete links[pid];
      writeValue("student-links", links);
    }
  },
};
const clubs = makeCrud<Club>("clubs") as ClubRepository;

const referencesCrud = makeCrud<ReferencePost>("references");
const references: ReferenceRepository = {
  list: () => referencesCrud.list(),
  create: (input) => referencesCrud.create(input as Record<string, unknown>),
  delete: (id) => referencesCrud.delete(id),
};

const metrics: MetricRepository = {
  async list() {
    await delay(250);
    const custom = readCollection<Metric>("custom-metrics", []);
    return [...PREDEFINED_METRICS, ...custom];
  },
  async createCustom(name) {
    await delay(350);
    const metric: Metric = {
      id: newId(),
      name: name.trim(),
      predefined: false,
      createdAt: nowIso(),
    };
    const custom = readCollection<Metric>("custom-metrics", []);
    custom.push(metric);
    writeCollection("custom-metrics", custom);
    return metric;
  },
  async delete(id) {
    await delay(250);
    writeCollection(
      "custom-metrics",
      readCollection<Metric>("custom-metrics", []).filter((m) => m.id !== id),
    );
  },
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
        schoolLabel: r.schoolLabel,
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
    // student_record_id é deixado null: a escola vincula manualmente após a
    // aprovação (tarefa #20), evitando colisões de nome e exposição de PII.
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
  async listLinkableStudentAccounts() {
    await delay(300);
    const session = readValue<Session>("session");
    const me = session?.user;
    if (!me || (me.role !== "school_user" && me.role !== "super_admin")) {
      throw new Error("Apenas escolas podem vincular contas de aluno.");
    }
    return allUsers()
      .filter(
        (u) =>
          u.role === "student" &&
          u.approvalStatus === "approved" &&
          !u.studentRecordId &&
          (me.role === "super_admin" || u.schoolId === me.id),
      )
      .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async listLinkedStudentRecordIds() {
    await delay(300);
    const session = readValue<Session>("session");
    const me = session?.user;
    if (!me || (me.role !== "school_user" && me.role !== "super_admin")) {
      throw new Error("Apenas escolas podem consultar vínculos de alunos.");
    }
    return allUsers()
      .filter(
        (u) =>
          u.role === "student" &&
          u.approvalStatus === "approved" &&
          !!u.studentRecordId &&
          (me.role === "super_admin" || u.schoolId === me.id),
      )
      .map((u) => u.studentRecordId!) as string[];
  },
  async linkStudentAccount(profileId, studentRecordId) {
    await delay(400);
    const session = readValue<Session>("session");
    const me = session?.user;
    if (!me || (me.role !== "school_user" && me.role !== "super_admin")) {
      throw new Error("Apenas escolas podem vincular contas de aluno.");
    }
    const target = allUsers().find((u) => u.id === profileId);
    if (
      !target ||
      target.role !== "student" ||
      target.approvalStatus !== "approved" ||
      (me.role !== "super_admin" && target.schoolId !== me.id)
    ) {
      throw new Error("Conta de aluno não encontrada ou não pertence à sua escola.");
    }
    const student = readCollection<OwnedStudent>("students", []).find(
      (s) => s.id === studentRecordId,
    );
    if (!student) throw new Error("Registro de aluno não encontrado.");
    // Posse do registro (mesma regra da RPC do Supabase): a escola só vincula
    // registros criados por ela. Registros antigos sem ownerId são permitidos.
    if (me.role !== "super_admin" && student.ownerId && student.ownerId !== me.id) {
      throw new Error("Registro de aluno não encontrado.");
    }
    const links = readStudentLinks();
    if (Object.values(links).includes(studentRecordId)) {
      throw new Error("Este registro de aluno já tem uma conta vinculada.");
    }
    links[profileId] = studentRecordId;
    writeValue("student-links", links);
  },
  async listLinkedStudentAccounts() {
    await delay(300);
    const session = readValue<Session>("session");
    const me = session?.user;
    if (!me || (me.role !== "school_user" && me.role !== "super_admin")) {
      throw new Error("Apenas escolas podem ver contas vinculadas.");
    }
    return allUsers()
      .filter(
        (u) =>
          u.role === "student" &&
          u.approvalStatus === "approved" &&
          Boolean(u.studentRecordId) &&
          (me.role === "super_admin" || u.schoolId === me.id),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        studentRecordId: u.studentRecordId!,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async unlinkStudentAccount(studentRecordId) {
    await delay(400);
    const session = readValue<Session>("session");
    const me = session?.user;
    if (!me || (me.role !== "school_user" && me.role !== "super_admin")) {
      throw new Error("Apenas escolas podem desvincular contas de aluno.");
    }
    const student = readCollection<OwnedStudent>("students", []).find(
      (s) => s.id === studentRecordId,
    );
    if (!student) throw new Error("Registro de aluno não encontrado.");
    // Mesma regra de posse da RPC do Supabase.
    if (me.role !== "super_admin" && student.ownerId && student.ownerId !== me.id) {
      throw new Error("Registro de aluno não encontrado.");
    }
    const links = readStudentLinks();
    const profileId = Object.keys(links).find(
      (pid) => links[pid] === studentRecordId,
    );
    if (!profileId) {
      throw new Error("Este registro de aluno não tem conta vinculada.");
    }
    delete links[profileId];
    writeValue("student-links", links);
  },
  async listStudentAccounts() {
    await delay(300);
    const session = readValue<Session>("session");
    if (session?.user.role !== "super_admin") {
      throw new Error("Apenas administradores podem ver as contas de aluno.");
    }
    const users = allUsers();
    const schoolName = (id?: string) => {
      const school = id ? users.find((u) => u.id === id) : undefined;
      return school ? (school.schoolName ?? school.name) : undefined;
    };
    const records = readCollection<OwnedStudent>("students", []);
    return users
      .filter((u) => u.role === "student" && u.approvalStatus === "approved")
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        schoolLabel: schoolName(u.schoolId),
        studentRecordId: u.studentRecordId,
        studentRecordLabel: u.studentRecordId
          ? records.find((s) => s.id === u.studentRecordId)?.name
          : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};

// Escrita restrita a super_admin, espelhando as políticas RLS do Supabase.
function assertSuperAdmin(): void {
  const session = readValue<Session>("session");
  if (session?.user.role !== "super_admin") {
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

export function createMockDataLayer(): DataLayer {
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
    isMock: true,
  };
}
