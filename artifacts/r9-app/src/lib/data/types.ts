// Entidades de domínio do app R9 Escolinhas.
// Estes tipos espelham as futuras tabelas do Supabase (snake_case nas colunas
// será mapeado nos repositórios reais; aqui usamos camelCase no domínio).

export type UserRole = "super_admin" | "school_user";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolName?: string;
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
