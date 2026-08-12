// Entidades de domínio do app R9 Escolinhas.
// Estes tipos espelham as futuras tabelas do Supabase (snake_case nas colunas
// será mapeado nos repositórios reais; aqui usamos camelCase no domínio).

export type UserRole = "super_admin" | "school_user" | "student";

/** Status de aprovação do cadastro (novos cadastros nascem "pending"). */
export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolName?: string;
  /** Contas antigas (criadas pelo admin) são tratadas como aprovadas. */
  approvalStatus: ApprovalStatus;
  /** Para alunos: id do usuário da escola à qual pertence. */
  schoolId?: string;
  /** Para alunos: id do registro na tabela students vinculado (se houver). */
  studentRecordId?: string;
}

/** Escola aprovada, exibida no seletor do cadastro de aluno. */
export interface SchoolOption {
  id: string;
  name: string;
}
export interface Session {
  user: AppUser;
  /** ISO timestamp de expiração (mock: sem expiração real) */
  expiresAt: string;
}

/** Foto armazenada. No Supabase real, `url` virá do Storage; no mock é data URL. */
export interface StoredImage {
  id: string;
  /** data URL (mock) ou URL pública do Supabase Storage (real) */
  url: string;
  /** caminho no bucket (preparado para o Supabase Storage) */
  path: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  /** WhatsApp em dígitos, ex: "5511999998888" (DDI+DDD+número) */
  whatsapp: string;
  position?: string;
  /** altura em cm */
  heightCm?: number;
  /** peso em kg */
  weightKg?: number;
  birthDate?: string;
  notes?: string;
  photos: StoredImage[];
  clubId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Club {
  id: string;
  name: string;
  logo?: StoredImage;
  uniforms: StoredImage[];
  /** exatamente até 3 cores hex, ex: ["#39ff14", "#2e2e2e", "#7e8a97"] */
  colors: string[];
  createdAt: string;
  updatedAt: string;
}

/** Post estático de Instagram usado como referência de estilo. */
export interface ReferencePost {
  id: string;
  image: StoredImage;
  title?: string;
  /** id do usuário que subiu (super admin ou usuário de escola) */
  uploadedBy: string;
  createdAt: string;
}

export interface Metric {
  id: string;
  name: string;
  /** métricas pré-definidas não podem ser removidas */
  predefined: boolean;
  createdAt: string;
}

export interface MetricValue {
  metricId: string;
  name: string;
  value: string;
}

export interface GenerationRequest {
  student: Student;
  studentPhoto: StoredImage;
  club?: Club;
  showClubLogo: boolean;
  includeR9Logo: boolean;
  uniform?: StoredImage;
  reference: ReferencePost;
  metrics: MetricValue[];
  /** instruções extras digitadas na tela de geração (opcional) */
  auxiliaryPrompt?: string;
}

/** Configuração global do template do prompt de geração (editada pelo admin). */
export interface PromptTemplateSetting {
  /** texto do template com placeholders/blocos; null = usar o padrão embutido */
  template: string;
  updatedAt: string;
}

export interface GeneratedPost {
  id: string;
  studentId: string;
  /** data URL da imagem gerada */
  imageUrl: string;
  metrics: MetricValue[];
  createdAt: string;
}

/** Cadastro aguardando aprovação, listado na tela do admin. */
export interface PendingRegistration {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolName?: string;
  /** Nome da escola escolhida (para alunos). */
  schoolLabel?: string;
  /** Para alunos: id do registro students já vinculado (se houver). */
  studentRecordId?: string;
  /** Para alunos: nome do registro students vinculado (se houver). */
  studentRecordLabel?: string;
  createdAt: string;
}

/** Conta de aluno aprovada e ainda sem vínculo com um registro de students. */
export interface LinkableStudentAccount {
  id: string;
  name: string;
  email: string;
}

/** Conta de aluno aprovada com o estado do vínculo (visão do super_admin). */
export interface StudentAccountOverview {
  id: string;
  name: string;
  email: string;
  /** Nome da escola do aluno (se houver). */
  schoolLabel?: string;
  studentRecordId?: string;
  /** Nome do registro students vinculado (se houver). */
  studentRecordLabel?: string;
}

/** Dados do cadastro público (escola ou aluno). */
export type SignUpInput =
  | { kind: "school"; schoolName: string; email: string; password: string }
  | {
      kind: "student";
      name: string;
      email: string;
      password: string;
      schoolId: string;
    };
