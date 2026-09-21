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

/**
 * Ciclo de vida do evento (`events.status`). `draft` até a primeira foto;
 * `uploading` enquanto há lote em andamento; os demais são preenchidos pelo
 * pipeline das Fases 2 e 3 (worker, revisão, entrega).
 */
export type EventStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "review"
  | "ready"
  | "archived";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Rascunho",
  uploading: "Recebendo fotos",
  processing: "Processando",
  review: "Em revisão",
  ready: "Pronto",
  archived: "Arquivado",
};

/** Retenção padrão das fotos do evento, em anos (spec §9.4, decidido em 18/09/2026). */
export const EVENT_RETENTION_YEARS = 2;

/**
 * Evento escolar (`events`): a unidade de upload em massa. As fotos ficam
 * até `photoRetentionUntil`; sem `imageRightsDeclaredAt` o upload não abre
 * (spec §9.2) — é o registro de que a escola declara possuir autorização de
 * uso de imagem dos alunos presentes.
 */
export interface SchoolEvent {
  id: string;
  schoolId: string;
  /** Turma do evento, quando é de uma sala só. */
  classId?: string;
  name: string;
  /** Data do evento, ISO "aaaa-mm-dd". */
  eventDate: string;
  status: EventStatus;
  /** Guardar o original além da versão 2560px (custo maior — D3). */
  keepOriginals: boolean;
  /** ISO "aaaa-mm-dd"; padrão de 2 anos, editável por evento. */
  photoRetentionUntil: string;
  imageRightsDeclaredAt?: string;
  imageRightsDeclaredBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Estado de processamento da foto pelo pipeline (worker, a partir do M3). */
export type PhotoStatus = "pending" | "processing" | "processed" | "failed";

/**
 * Foto de evento (`photos`). `contentHash` é o SHA-256 do arquivo ORIGINAL,
 * calculado antes do redimensionamento; `unique (event_id, content_hash)`
 * no banco é o que torna o upload idempotente (R2).
 */
export interface Photo {
  id: string;
  schoolId: string;
  eventId: string;
  /** Caminho no bucket `event-photos`: `{school_id}/{event_id}/{photo_id}.jpg`. */
  storagePath: string;
  /** Caminho no bucket `event-thumbs`, preenchido pelo ingest-worker. */
  thumbPath?: string;
  /** Lote de upload que originou a foto; o job de ingest nasce dele. */
  batchId?: string;
  contentHash: string;
  originalFilename: string;
  bytes: number;
  width?: number;
  height?: number;
  takenAt?: string;
  status: PhotoStatus;
  facesCount?: number;
  error?: string;
  uploadedBy: string;
  createdAt: string;
  deletedAt?: string;
}

export type BatchJobKind = "ingest" | "recognize" | "reference";
export type BatchJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/**
 * Lote de processamento (`batch_jobs`): um por sessão de upload. `total` é
 * contado no servidor quando o envio acaba; `processed`/`failed` são os jobs
 * de ingest concluídos pelo worker. O lote só fecha quando `uploadFinishedAt`
 * está preenchido e `processed + failed >= total`.
 */
export interface BatchJob {
  id: string;
  schoolId: string;
  eventId?: string;
  kind: BatchJobKind;
  status: BatchJobStatus;
  total: number;
  processed: number;
  failed: number;
  createdBy: string;
  createdAt: string;
  /** Momento em que o cliente avisou que terminou de enviar. */
  uploadFinishedAt?: string;
  /** Última mudança (contadores inclusive); base do alerta de lote parado. */
  updatedAt?: string;
  finishedAt?: string;
}

/**
 * Escopos de autorização (`authorizations.scope`, spec §5.4). São quatro e
 * fixos: separar escopos depois exige recolher o consentimento outra vez.
 */
export type AuthorizationScope =
  | "biometric_sorting"
  | "delivery_whatsapp"
  | "internal_use"
  | "social_media";

export const AUTHORIZATION_SCOPES: readonly AuthorizationScope[] = [
  "biometric_sorting",
  "delivery_whatsapp",
  "internal_use",
  "social_media",
] as const;

export const AUTHORIZATION_SCOPE_LABEL: Record<AuthorizationScope, string> = {
  biometric_sorting: "Foto para reconhecimento",
  delivery_whatsapp: "Envio por WhatsApp",
  internal_use: "Uso interno da escola",
  social_media: "Publicação em redes sociais",
};

export const AUTHORIZATION_SCOPE_DESCRIPTION: Record<AuthorizationScope, string> = {
  biometric_sorting:
    "Separar as fotos do evento por rosto para montar a pasta deste aluno.",
  delivery_whatsapp:
    "Enviar as fotos e as artes do aluno ao WhatsApp verificado do responsável.",
  internal_use:
    "Usar a imagem dentro da escola: mural, portfólio pedagógico, comunicação interna.",
  social_media:
    "Publicar a imagem fora da escola, em perfil ou site da instituição.",
};

/**
 * Prova do aceite (`authorizations.evidence`). Congelada no banco: pela API,
 * uma autorização gravada só muda em `revoked_at`.
 */
export interface AuthorizationEvidence {
  /**
   * De onde veio o aceite:
   * - `school_declaration`: a escola declara que colheu a autorização
   *   (o toggle da ficha do aluno). Não é o responsável aceitando no produto.
   * - `students.guardian.consentAt`: herança do booleano da Fase 0, trazida
   *   pela migração do M4.
   * - `guardian_portal`: aceite do próprio responsável (Fase 4, ainda não existe).
   */
  source?: "school_declaration" | "students.guardian.consentAt" | "guardian_portal";
  /** Quem registrou, como aparece na UI. */
  registeredBy?: string;
  registeredByUserId?: string;
  /**
   * Versão do termo aceito. Nulo enquanto o texto jurídico não existir — é
   * essa pendência que impede colher consentimento de responsável de verdade
   * (`BACKLOG.md`, seção Transversal).
   */
  termsVersion?: string | null;
  [key: string]: unknown;
}

/**
 * Consentimento por escopo (`authorizations`). Indelével: revogar é preencher
 * `revokedAt`, e reconceder é uma linha nova — o histórico inteiro fica.
 */
export interface Authorization {
  id: string;
  schoolId: string;
  studentId: string;
  scope: AuthorizationScope;
  /** Momento do aceite. Ausente = linha registrada sem aceite: não vale nada. */
  grantedAt?: string;
  guardianId?: string;
  /** Nome do responsável como estava no aceite (prova congelada). */
  grantedByGuardianName?: string;
  /** Canal verificado como estava no aceite. */
  guardianChannel?: string;
  revokedAt?: string;
  evidence?: AuthorizationEvidence;
  createdBy: string;
  createdAt: string;
}

/** Autorização válida agora: aceite registrado e não revogada. */
export function isAuthorizationActive(a: Authorization): boolean {
  return Boolean(a.grantedAt) && !a.revokedAt;
}

/**
 * Rosto de referência do aluno (`student_reference_faces`), como a tela o vê.
 * O vetor biométrico **nunca** sai do banco: a RPC de leitura não o devolve.
 */
export interface StudentReferenceFace {
  id: string;
  quality?: number;
  /** Caminho no bucket `student-refs`, para assinar a miniatura. */
  sourcePhotoPath?: string;
  /** Fim do ano letivo em que foi cadastrada, sem renovação automática. */
  retentionUntil: string;
  /** Prazo vencido. Vencer não apaga nada — o expurgo é do M6. */
  expired: boolean;
  createdBy: string;
  createdAt: string;
}

export type ReferenceJobStatus = "queued" | "leased" | "done" | "failed";

/**
 * Foto de referência à espera do embedding (`student_reference_jobs`). O
 * vetor é calculado pelo motor facial (`det_size` 640, spec §7.4), fora do
 * navegador; até lá a foto está no bucket e o job, na fila.
 */
export interface StudentReferenceJob {
  id: string;
  schoolId: string;
  studentId: string;
  authorizationId: string;
  storagePath: string;
  status: ReferenceJobStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

/**
 * Cobertura biométrica de um aluno, para o indicador da lista
 * ("182 de 240 com referência · 58 sem consentimento").
 */
export interface StudentBiometricReadiness {
  studentId: string;
  hasConsent: boolean;
  /** Referências já processadas (com vetor). */
  referenceCount: number;
  /** Menos de duas referências: aviso, nunca bloqueio (decisão #8). */
  lowCoverage: boolean;
  /** Fotos enviadas que ainda não viraram vetor. */
  pendingCount: number;
}

/**
 * Uma referência matricula; duas é o que o spike mediu (decisão #8,
 * 16/09/2026). Entre uma e duas, a tela avisa "cobertura baixa".
 */
export const REFERENCE_FACES_RECOMMENDED = 2;

/**
 * Uma foto de evento na **pasta do aluno** (spec §7.6). Consulta, não cópia:
 * uma foto com cinco crianças confirmadas aparece nas cinco pastas, com um
 * único arquivo no Storage.
 *
 * Só entra aqui rosto `confirmed` — sugestão do reconhecimento não chega a
 * download nem a envio (D6).
 */
export interface StudentPhoto {
  /** `photos.id`; o mesmo campo que a galeria do evento usa para assinar. */
  id: string;
  eventId: string;
  storagePath: string;
  thumbPath?: string;
  takenAt?: string;
  createdAt: string;
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
