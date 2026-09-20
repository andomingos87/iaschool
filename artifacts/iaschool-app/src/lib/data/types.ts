// Entidades de domínio do app IAschool.
// Estes tipos espelham as futuras tabelas do Supabase (snake_case nas colunas
// será mapeado nos repositórios reais; aqui usamos camelCase no domínio).

/**
 * Papel GLOBAL da plataforma (M1). O vínculo com escola não é papel: mora em
 * `AppUser.schools`, um por escola de que a pessoa é membro.
 * - `dev`: manutenção da plataforma (tudo do super_admin + telas técnicas).
 * - `super_admin`: operação do produto (todas as escolas, aprovações).
 * - `user`: qualquer pessoa da escola; só vê as escolas em que é membro.
 */
export type UserRole = "dev" | "super_admin" | "user";

/** Papel da pessoa DENTRO de uma escola (tabela `school_members`). */
export type SchoolMemberRole = "school_admin" | "school_staff" | "teacher";

export interface SchoolMembership {
  schoolId: string;
  schoolName: string;
  role: SchoolMemberRole;
}

/** true para quem tem privilégio de plataforma (super_admin ou dev). */
export function isPlatformAdmin(role: UserRole | undefined): boolean {
  return role === "super_admin" || role === "dev";
}

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
  /** Escolas de que a pessoa é membro (vazio para super_admin sem escola). */
  schools: SchoolMembership[];
}

export interface Session {
  user: AppUser;
  /** ISO timestamp de expiração (mock: sem expiração real) */
  expiresAt: string;
  /**
   * Escola "atual" para quem é membro de mais de uma. Escolha de interface,
   * nunca de RLS: o banco filtra sempre por `is_member_of(school_id)`.
   * Ausente quando a pessoa não é membro de escola nenhuma.
   */
  activeSchoolId?: string;
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
  /** Escola (tenant) a que o aluno pertence. Preenchida pela camada de dados. */
  schoolId: string;
  /** Sala (`classes`), quando cadastrada. */
  classId?: string;
  /** Matrícula na escola; chave da importação CSV (Fase 1 completa). */
  enrollmentNumber?: string;
  /** Linha em `guardians` de onde vêm nome, WhatsApp e verificação do responsável. */
  primaryGuardianId?: string;
  createdAt: string;
  updatedAt: string;
  /** Data em que foi movido para a lixeira (null/ausente = ativo). */
  deletedAt?: string;
}

/** Endereço da escola (`schools.address`, jsonb). Todos os campos opcionais. */
export interface SchoolAddress {
  /** CEP em dígitos, ex.: "01310100" */
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  /** UF em duas letras, ex.: "SP" */
  state?: string;
}

/** Contato institucional da escola (`schools.contact`, jsonb). */
export interface SchoolContact {
  /** Telefone em dígitos (DDI+DDD+número), mesmo formato do WhatsApp do aluno. */
  phone?: string;
  email?: string;
  /** Pessoa responsável pela conta na escola (diretoria, coordenação). */
  responsible?: string;
}

/**
 * Cadastro da escola: identidade visual (logo + cores, aplicadas nas artes) e
 * dados administrativos (CNPJ, endereço, contato). Desde o M1 é a própria
 * linha de `schools`: `id` é o id do tenant, e só aparecem as escolas de que
 * a pessoa é membro.
 */
export interface SchoolBrand {
  id: string;
  name: string;
  logo?: StoredImage;
  /** exatamente até 3 cores hex, ex: ["#2563eb", "#2e2e2e", "#7e8a97"] */
  colors: string[];
  /** CNPJ em dígitos (14). Único por escola no banco. */
  cnpj?: string;
  address?: SchoolAddress;
  contact?: SchoolContact;
  createdAt: string;
  updatedAt: string;
}

/**
 * Séries atendidas. Lista fixa no app (decisão #6 do M1): no banco, `grade` é
 * só uma coluna de texto em `classes`, sem enum nem tabela de domínio.
 */
export const GRADES = [
  "EI",
  "1EF",
  "2EF",
  "3EF",
  "4EF",
  "5EF",
  "6EF",
  "7EF",
  "8EF",
  "9EF",
  "1EM",
  "2EM",
  "3EM",
] as const;

export type Grade = (typeof GRADES)[number];

/** Rótulo em pt-BR de cada série, para telas e listas. */
export const GRADE_LABEL: Record<Grade, string> = {
  EI: "Educação Infantil",
  "1EF": "1º ano — Fundamental",
  "2EF": "2º ano — Fundamental",
  "3EF": "3º ano — Fundamental",
  "4EF": "4º ano — Fundamental",
  "5EF": "5º ano — Fundamental",
  "6EF": "6º ano — Fundamental",
  "7EF": "7º ano — Fundamental",
  "8EF": "8º ano — Fundamental",
  "9EF": "9º ano — Fundamental",
  "1EM": "1º ano — Médio",
  "2EM": "2º ano — Médio",
  "3EM": "3º ano — Médio",
};

export function isGrade(value: string): value is Grade {
  return (GRADES as readonly string[]).includes(value);
}

/**
 * Sala de aula (`classes`). A sala é a linha; a série é coluna (`grade`), e o
 * ano letivo entra na chave: `unique (school_id, school_year, grade, name)`.
 */
export interface SchoolClass {
  id: string;
  schoolId: string;
  /** Ano letivo, ex.: 2026. */
  schoolYear: number;
  grade: Grade;
  /** Identificação da sala dentro da série: "A", "B", "Manhã". */
  name: string;
  /** Professor responsável (`auth.users`), quando definido. */
  teacherId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Rótulo curto da sala, como aparece em listas: "3º ano — Fundamental · A". */
export function classLabel(c: SchoolClass): string {
  return `${GRADE_LABEL[c.grade] ?? c.grade} · ${c.name}`;
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
  createdAt: string;
}

/**
 * Dados do cadastro público. Desde o M1 só existe cadastro de escola: menor
 * de 16 não tem conta própria (Lei 15.211/2025, art. 24), e o aluno é apenas
 * um registro em `students`.
 */
export interface SignUpInput {
  kind: "school";
  schoolName: string;
  email: string;
  password: string;
}
