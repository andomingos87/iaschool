// Entidades de domínio do app IAschool.
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

/**
 * Responsável legal do aluno menor de idade.
 * Base: Lei nº 15.211/2025, arts. 7º, § 2º e 24; LGPD, art. 14, § 1º.
 *
 * Os dados aqui existem para uma finalidade única — autorizar e receber o
 * material do menor. Não alimentam prompt, métrica nem qualquer perfilamento
 * (Lei, arts. 13 e 26).
 */
export interface Guardian {
  name: string;
  /** WhatsApp em dígitos, ex: "5511999998888" (DDI+DDD+número) */
  whatsapp: string;
  email?: string;
  /** Vínculo declarado: mãe, pai, avó, tutor... */
  relationship?: string;
  /**
   * ISO do momento em que o número foi confirmado por código.
   * Ausente = canal não verificado: o envio da imagem fica bloqueado.
   */
  whatsappVerifiedAt?: string;
  /**
   * ISO do momento em que o responsável autorizou o uso da imagem e dos
   * dados do menor. Ausente = sem consentimento: a geração fica bloqueada.
   */
  consentAt?: string;
  /** Nome de quem registrou a autorização (professor/escola). */
  consentRegisteredBy?: string;
}

export interface Student {
  id: string;
  name: string;
  /** WhatsApp em dígitos, ex: "5511999998888" (DDI+DDD+número) */
  whatsapp: string;
  /**
   * Data de nascimento (ISO "aaaa-mm-dd"). Obrigatória na prática: sem ela o
   * produto não sabe qual proteção etária aplicar (Lei 15.211/2025, art. 10).
   * Permanece opcional no tipo por causa dos registros criados antes desta
   * regra — a UI exige e as travas de `lib/eca.ts` bloqueiam quem não tem.
   */
  birthDate?: string;
  notes?: string;
  photos: StoredImage[];
  /** Responsável legal — exigido para alunos menores de 18 anos. */
  guardian?: Guardian;
  /** Identidade visual da escola aplicada nas artes deste aluno. */
  schoolBrandId?: string;
  createdAt: string;
  updatedAt: string;
  /** Data em que foi movido para a lixeira (null/ausente = ativo). */
  deletedAt?: string;
}

/**
 * Identidade visual de uma escola (logo + cores), aplicada nas artes geradas.
 * Persistida na tabela `clubs` por herança do produto anterior; a consolidação
 * numa entidade `schools` real está prevista para a fase seguinte.
 */
export interface SchoolBrand {
  id: string;
  name: string;
  logo?: StoredImage;
  /** exatamente até 3 cores hex, ex: ["#2563eb", "#2e2e2e", "#7e8a97"] */
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

export interface GenerationRequest {
  student: Student;
  studentPhoto: StoredImage;
  schoolBrand?: SchoolBrand;
  showSchoolLogo: boolean;
  reference: ReferencePost;
  /** instruções extras digitadas na tela de geração (opcional) */
  auxiliaryPrompt?: string;
}

/** Configuração global do template do prompt de geração (editada pelo admin). */
export interface PromptTemplateSetting {
  /** texto do template com placeholders/blocos; null = usar o padrão embutido */
  template: string;
  updatedAt: string;
}

/** Versão salva do template do prompt (histórico para desfazer edições). */
export interface PromptTemplateVersion {
  id: string;
  template: string;
  /** nome de quem salvou a versão */
  savedBy: string;
  savedAt: string;
}
/** Imagem enviada no payload da geração (sem bytes — só metadados). */
export interface GenerationPayloadImage {
  /** papel da imagem no payload, em pt-BR (ex.: "Referência", "Foto do aluno") */
  role: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Metadados do que foi enviado à OpenAI em uma geração (para depuração do
 * template pelo admin). Nunca inclui tokens/segredos nem bytes das imagens.
 */
export interface GenerationDetails {
  /** prompt final renderizado a partir do template */
  prompt: string;
  model: string;
  size: string;
  /** lista ordenada das imagens enviadas no multipart */
  images: GenerationPayloadImage[];
}

export interface GeneratedPost {
  id: string;
  studentId: string;
  /** data URL da imagem gerada */
  imageUrl: string;
  /** detalhes da geração (prompt/payload); null em gerações antigas */
  details?: GenerationDetails | null;
  createdAt: string;
  /** Data em que foi movido para a lixeira (null/ausente = ativo). */
  deletedAt?: string;
}

/** Dias que um post fica na lixeira antes do expurgo definitivo. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Registro auditável de cada envio de imagem de aluno para fora do produto.
 * Base: Lei nº 15.211/2025, arts. 6º, V e 7º, § 2º; Decreto nº 12.880/2026,
 * art. 35. Sem essa trilha não há como provar que o material de um menor foi
 * enviado a quem tinha autorização para recebê-lo.
 */
export interface ShareLog {
  id: string;
  postId: string;
  studentId: string;
  studentName: string;
  /** Canal usado. Hoje só WhatsApp; o tipo já prevê outros. */
  channel: "whatsapp";
  /** Número de destino em dígitos (DDI+DDD+número). */
  targetWhatsapp: string;
  /** Quem recebeu, como exibido na UI: "Maria Silva (responsável)". */
  targetLabel: string;
  /** Faixa etária do aluno no momento do envio — não a data de nascimento. */
  studentAgeBracket: "crianca" | "adolescente" | "adulto";
  /** ISO em que o consentimento do responsável estava registrado (se havia). */
  guardianConsentAt?: string;
  /** id e nome de quem disparou o envio. */
  sentByUserId: string;
  sentByName: string;
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
  /**
   * Faixa etária declarada no cadastro (nunca a data de nascimento) — o admin
   * precisa dela para decidir a aprovação (Decreto 12.880/2026, art. 24, § 3º).
   */
  ageBracket?: "crianca" | "adolescente" | "adulto";
  /** Nome do responsável legal informado, quando exigido. */
  guardianName?: string;
  /** true = o responsável registrou a autorização no cadastro. */
  guardianConsent?: boolean;
  createdAt: string;
}

/** Conta de aluno aprovada e ainda sem vínculo com um registro de students. */
export interface LinkableStudentAccount {
  id: string;
  name: string;
  email: string;
}

/** Conta de aluno já vinculada a um registro de students (visão da escola). */
export interface LinkedStudentAccount {
  id: string;
  name: string;
  email: string;
  studentRecordId: string;
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
      /**
       * Data de nascimento (ISO). Obrigatória: define se a conta precisa ser
       * vinculada a um responsável legal (Lei 15.211/2025, arts. 10 e 24).
       */
      birthDate: string;
      /**
       * Responsável legal — obrigatório para menores de 16 anos.
       * A aprovação da escola não substitui esta autorização.
       */
      guardian?: SignUpGuardian;
    };

/** Dados do responsável informados no cadastro público. */
export interface SignUpGuardian {
  name: string;
  /** WhatsApp em dígitos (DDI+DDD+número). */
  whatsapp: string;
  email: string;
  relationship?: string;
  /** true = o responsável autorizou o uso da imagem e dos dados do menor. */
  consent: boolean;
}
