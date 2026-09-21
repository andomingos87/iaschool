// Contrato da camada de dados — compatível com Supabase.
// A implementação atual é mock (localStorage). Quando o projeto Supabase for
// criado, implemente estas interfaces com @supabase/supabase-js e troque a
// factory em ./index.ts. Nenhuma tela deve importar a implementação
// diretamente; sempre use `getDataLayer()` de ./index.ts.
//
// Variáveis de ambiente esperadas para a integração real (ver SUPABASE.md):
//   VITE_SUPABASE_URL       — URL do projeto Supabase
//   VITE_SUPABASE_ANON_KEY  — chave anônima (public)

import type {
  AppUser,
  Authorization,
  AuthorizationEvidence,
  AuthorizationScope,
  BatchJob,
  GeneratedPost,
  Photo,
  SchoolEvent,
  GenerationDetails,
  GenerationRequest,
  PendingRegistration,
  PromptTemplateSetting,
  PromptTemplateVersion,
  ReferencePost,
  SchoolBrand,
  SchoolClass,
  Session,
  ShareLog,
  SignUpInput,
  StoredImage,
  Student,
  StudentBiometricReadiness,
  StudentReferenceFace,
  StudentReferenceJob,
} from "./types";

export interface AuthService {
  /** Sessão atual, ou null. Equivalente a supabase.auth.getSession(). */
  getSession(): Promise<Session | null>;
  /** Equivalente a supabase.auth.signInWithPassword(). */
  signIn(email: string, password: string): Promise<Session>;
  /** Equivalente a supabase.auth.signOut(). */
  signOut(): Promise<void>;
  /**
   * Cadastro público de escola. A conta nasce com status "pending" e só
   * ganha acesso após aprovação do super_admin — que, no Supabase, cria a
   * escola e o vínculo `school_admin` por trigger.
   * Equivalente a supabase.auth.signUp() + profile pendente (via trigger).
   */
  signUp(input: SignUpInput): Promise<void>;
  /**
   * Troca a escola "atual" (só para quem é membro de mais de uma). Dispara
   * onAuthStateChange com a sessão atualizada. Escolha de interface: a RLS
   * continua filtrando por todas as escolas da pessoa.
   */
  setActiveSchool(schoolId: string): Promise<void>;
  /**
   * Dispara o e-mail de recuperação de senha.
   * Equivalente a supabase.auth.resetPasswordForEmail(email, { redirectTo }).
   */
  resetPassword(email: string): Promise<void>;
  /**
   * Define uma nova senha para o usuário logado (inclusive na sessão de
   * recuperação criada pelo link do e-mail).
   * Equivalente a supabase.auth.updateUser({ password }).
   */
  updatePassword(newPassword: string): Promise<void>;
  /** Equivalente a supabase.auth.onAuthStateChange(). Retorna unsubscribe. */
  onAuthStateChange(cb: (session: Session | null) => void): () => void;
  /**
   * Access token JWT da sessão atual (para chamadas autenticadas ao
   * api-server, ex.: logs de geração). Retorna null no mock/sem sessão.
   */
  getAccessToken(): Promise<string | null>;
}

/** Equivalente ao Supabase Storage (upload em bucket + URL pública). */
export interface StorageService {
  /**
   * Grava um arquivo (já comprimido no cliente) e devolve a imagem armazenada.
   * `bucket` mapeia para um bucket do Supabase Storage.
   */
  upload(bucket: string, file: Blob, fileName: string): Promise<StoredImage>;
  remove(bucket: string, path: string): Promise<void>;
}

/** Dados para criar um aluno; `schoolId` ausente = escola ativa da sessão. */
export type StudentInput = Omit<
  Student,
  "id" | "createdAt" | "updatedAt" | "schoolId" | "primaryGuardianId"
> & { schoolId?: string };

export interface StudentRepository {
  /** Alunos das escolas da pessoa, ativos (fora da lixeira), mais recentes primeiro. */
  list(): Promise<Student[]>;
  get(id: string): Promise<Student | null>;
  /** Cria na escola ativa (ou na informada). Responsável vira linha em `guardians`. */
  create(input: StudentInput): Promise<Student>;
  update(id: string, patch: Partial<Omit<Student, "id">>): Promise<Student>;
  /**
   * Alunos na lixeira, mais recentes primeiro. Antes de listar, faz o
   * expurgo oportunista dos itens com mais de 30 dias (registro + fotos
   * no Storage) — mesmo padrão da lixeira de posts gerados.
   */
  listTrash(): Promise<Student[]>;
  /** Exclusão normal: move para a lixeira (30 dias até o expurgo). */
  moveToTrash(ids: string[]): Promise<void>;
  /** Devolve alunos da lixeira para a lista ativa. */
  restore(ids: string[]): Promise<void>;
  /**
   * Exclusão definitiva imediata (super_admin): remove o registro e as
   * fotos no Storage (quando o caminho é conhecido). Sem volta.
   */
  deletePermanently(ids: string[]): Promise<void>;
}

/**
 * Verificação do canal do responsável legal.
 * O envio da imagem de um menor só é liberado para um número confirmado
 * (Decreto nº 12.880/2026, art. 35).
 */
export interface GuardianVerificationService {
  /**
   * Dispara o código de confirmação para o WhatsApp do responsável do aluno.
   * No modo demo o código é devolvido em `demoCode` para exibição na tela;
   * na implementação real ele nunca volta ao cliente.
   */
  requestCode(studentId: string): Promise<{ demoCode?: string }>;
  /**
   * Confere o código e, se correto, marca `guardian.whatsappVerifiedAt`.
   * Lança erro com mensagem em pt-BR quando o código não confere ou expirou.
   */
  confirmCode(studentId: string, code: string): Promise<Student>;
}

/**
 * Trilha de auditoria dos envios de imagem de aluno.
 * Base: Lei nº 15.211/2025, arts. 6º, V e 7º, § 2º; Decreto, art. 35.
 * Somente escrita e leitura — um registro de envio nunca é apagado pela UI.
 */
export interface ShareLogRepository {
  /** Envios registrados, mais recentes primeiro. `studentId` filtra por aluno. */
  list(studentId?: string): Promise<ShareLog[]>;
  record(input: Omit<ShareLog, "id" | "createdAt">): Promise<ShareLog>;
}

/**
 * Identidade visual das escolas: desde o M1 lê e escreve na tabela `schools`
 * (só as escolas de que a pessoa é membro). Escola nasce na aprovação do
 * cadastro e só o super_admin a remove, por isso não há create/delete aqui.
 */
export interface SchoolBrandRepository {
  list(): Promise<SchoolBrand[]>;
  get(id: string): Promise<SchoolBrand | null>;
  update(
    id: string,
    patch: Partial<Omit<SchoolBrand, "id">>,
  ): Promise<SchoolBrand>;
}

/** Dados para criar uma sala; `schoolId` ausente = escola ativa da sessão. */
export type SchoolClassInput = Omit<
  SchoolClass,
  "id" | "createdAt" | "updatedAt" | "schoolId"
> & { schoolId?: string };

/**
 * Salas da escola (`classes`). A sala é a linha e a série é coluna; a chave
 * `unique (school_id, school_year, grade, name)` é validada no banco e
 * reportada em pt-BR aqui.
 */
export interface ClassRepository {
  /**
   * Salas das escolas da pessoa, da mais recente para a mais antiga em ano
   * letivo. `schoolId` restringe a uma escola; sem ele vêm todas as visíveis.
   */
  list(schoolId?: string): Promise<SchoolClass[]>;
  get(id: string): Promise<SchoolClass | null>;
  /** Cria na escola ativa (ou na informada). */
  create(input: SchoolClassInput): Promise<SchoolClass>;
  update(
    id: string,
    patch: Partial<Omit<SchoolClass, "id" | "schoolId">>,
  ): Promise<SchoolClass>;
  /**
   * Remove a sala. Alunos vinculados não são apagados: `students.class_id`
   * vira nulo (`on delete set null`), e eles voltam para "sem turma".
   */
  delete(id: string): Promise<void>;
}

/** Dados para criar um evento; `schoolId` ausente = escola ativa da sessão. */
export interface SchoolEventInput {
  schoolId?: string;
  name: string;
  /** ISO "aaaa-mm-dd". */
  eventDate: string;
  classId?: string;
  keepOriginals?: boolean;
  /** ISO "aaaa-mm-dd"; ausente = padrão de 2 anos a partir de hoje. */
  photoRetentionUntil?: string;
  /**
   * true grava `image_rights_declared_at/by` com o usuário atual: a escola
   * declara possuir autorização de uso de imagem dos alunos presentes
   * (spec §9.2). Sem isso o evento nasce, mas o upload não abre.
   */
  declareImageRights?: boolean;
}

/** Campos do evento editáveis depois de criado. */
export type SchoolEventPatch = Partial<
  Pick<
    SchoolEvent,
    "name" | "eventDate" | "classId" | "keepOriginals" | "photoRetentionUntil" | "status"
  >
>;

/**
 * Eventos (`events`): a unidade do upload em massa. RLS por escola no
 * Supabase; o filtro por escola aqui é da interface (escola ativa).
 */
export interface EventRepository {
  /** Eventos ativos (fora da lixeira), do mais recente para o mais antigo. */
  list(schoolId?: string): Promise<SchoolEvent[]>;
  get(id: string): Promise<SchoolEvent | null>;
  /** Cria na escola ativa (ou na informada), com `created_by` = usuário atual. */
  create(input: SchoolEventInput): Promise<SchoolEvent>;
  update(id: string, patch: SchoolEventPatch): Promise<SchoolEvent>;
  /** Registra a declaração de direito de imagem pelo usuário atual (spec §9.2). */
  declareImageRights(id: string): Promise<SchoolEvent>;
  /** Exclusão normal: lixeira de 30 dias (`deleted_at`), fotos ficam com o evento. */
  moveToTrash(id: string): Promise<void>;
  /** Quantidade de fotos ativas por evento da escola (`event_id` → total). */
  photoCounts(schoolId: string): Promise<Map<string, number>>;
}

/** Uma foto pronta para subir: já redimensionada (D3), com o hash do original. */
export interface PhotoUploadInput {
  eventId: string;
  schoolId: string;
  /** Lote aberto por `startBatch`; o banco enfileira o job de ingest a partir dele. */
  batchId: string;
  /** SHA-256 (hex) do arquivo ORIGINAL, antes do redimensionamento. */
  contentHash: string;
  originalFilename: string;
  /** JPEG redimensionado (2560px lado maior, q85), sem EXIF. */
  blob: Blob;
  width?: number;
  height?: number;
  /**
   * `DateTimeOriginal` do EXIF do arquivo original, em ISO com instante.
   * Lido no cliente antes do redimensionamento (o JPEG sobe sem EXIF: nada de
   * GPS nem modelo de câmera no Storage). Sem `OffsetTimeOriginal` a hora da
   * câmera é interpretada no fuso do navegador de quem envia.
   */
  takenAt?: string;
  /**
   * Arquivo original (JPEG/PNG/HEIC como veio da câmera), só quando
   * `events.keep_originals` está ligado. Vai para `event-originals`.
   */
  original?: Blob;
}

export type PhotoUploadResult =
  | { outcome: "uploaded"; photo: Photo }
  /** Já existia foto com o mesmo hash neste evento (R2): nada foi gravado. */
  | { outcome: "duplicate" };

/**
 * Fotos de evento (`photos`) e lotes (`batch_jobs`). A chave
 * `unique (event_id, content_hash)` é validada no banco; aqui ela vira
 * `outcome: "duplicate"` para o contador "já enviada" da tela.
 */
export interface PhotoRepository {
  /**
   * Fotos ativas do evento, na ordem de envio, sem URL: a galeria assina só
   * o que está visível com `signThumbUrls`. Pagina internamente em blocos de
   * 1.000 (limite do PostgREST), então 2.000 fotos voltam inteiras.
   */
  list(eventId: string): Promise<Photo[]>;
  /**
   * URLs assinadas (TTL 1 h) das miniaturas em `event-thumbs`, em lotes de
   * 100 (spec §10). Fotos sem `thumbPath` ficam de fora (placeholder na tela).
   * Devolve `photo.id` → URL.
   */
  signThumbUrls(
    photos: ReadonlyArray<Pick<Photo, "id" | "thumbPath">>,
  ): Promise<Map<string, string>>;
  /** URL assinada da foto 2560px em `event-photos`, para o lightbox. */
  signPhotoUrl(photo: Pick<Photo, "storagePath">): Promise<string>;
  /** Dos hashes dados, quais já existem no evento (evita subir bytes à toa). */
  findExistingHashes(eventId: string, hashes: string[]): Promise<Set<string>>;
  /**
   * Sobe o arquivo para `event-photos` (e o original para `event-originals`
   * quando vier) e grava a linha em `photos`. Uma chamada = uma foto; a
   * concorrência e as retentativas são do chamador.
   */
  upload(input: PhotoUploadInput): Promise<PhotoUploadResult>;
  /** Exclusão normal: lixeira (`deleted_at`). */
  moveToTrash(ids: string[]): Promise<void>;
  /** Abre um lote `ingest` para o evento com o total previsto de arquivos. */
  startBatch(eventId: string, total: number): Promise<BatchJob>;
  /**
   * Avisa que o envio acabou (RPC `finish_batch_upload`). O `total` real é
   * contado no servidor; o lote em si só fecha quando o worker terminar.
   */
  finishBatch(id: string, result: { total: number; cancelled?: boolean }): Promise<void>;
  /** Último lote `ingest` do evento, para mostrar o progresso do servidor. */
  latestBatch(eventId: string): Promise<BatchJob | null>;
  /**
   * Notifica cada mudança nos lotes do evento (Realtime em `batch_jobs`;
   * eventos locais no mock). Retorna a função de unsubscribe.
   */
  onBatchChange(eventId: string, cb: (batch: BatchJob) => void): () => void;
  /**
   * "N fotos não processadas — tentar de novo" (spec §5.2): volta para a fila
   * os jobs que estouraram as 5 tentativas. Devolve quantas fotos voltaram.
   */
  retryFailedJobs(eventId: string): Promise<number>;
}

/**
 * Consentimento por escopo (`authorizations`, spec §5.4).
 *
 * Não há `update` nem `delete`: a prova é congelada no banco. Conceder é
 * linha nova, revogar é carimbar `revokedAt`, e reconceder depois de revogar
 * é outra linha — o histórico inteiro fica.
 */
export interface AuthorizationRepository {
  /** Histórico completo do aluno, mais recente primeiro (inclui revogadas). */
  listForStudent(studentId: string): Promise<Authorization[]>;
  /**
   * Registra um aceite com `grantedAt` = agora.
   *
   * Marcado pela escola, o toggle é **declaração de que a autorização foi
   * colhida**, não o consentimento do responsável: por isso a evidência
   * nasce com `source: "school_declaration"` e `termsVersion` nulo — o termo
   * versionado depende do texto jurídico (`BACKLOG.md`, Transversal).
   */
  grant(input: {
    studentId: string;
    scope: AuthorizationScope;
    /** Responsável a quem o aceite é atribuído; ausente usa o do aluno. */
    guardianId?: string;
    evidence?: AuthorizationEvidence;
  }): Promise<Authorization>;
  /** Carimba `revokedAt`. Desrevogar é recusado pelo banco. */
  revoke(id: string): Promise<Authorization>;
}

/** Foto de referência escolhida na tela, já preparada para o bucket. */
export interface ReferenceFaceInput {
  studentId: string;
  schoolId: string;
  /** Autorização `biometric_sorting` ativa sob a qual a foto é colhida. */
  authorizationId: string;
  /** JPEG preparado no cliente (`prepareReferencePhoto`). */
  blob: Blob;
}

/**
 * Rosto de referência do aluno (`student_reference_faces` + a fila
 * `student_reference_jobs`).
 *
 * A tabela de rostos não tem policy: o vetor biométrico não sai por consulta
 * de cliente. Tudo aqui passa por RPC `security definer` ou pela fila, que
 * guarda só o caminho do arquivo.
 */
export interface ReferenceFaceRepository {
  /** Referências já processadas do aluno (sem o vetor, nunca). */
  list(studentId: string): Promise<StudentReferenceFace[]>;
  /** Fotos enviadas que ainda não viraram vetor, e as que falharam. */
  listJobs(studentId: string): Promise<StudentReferenceJob[]>;
  /**
   * Sobe o JPEG para `student-refs` e enfileira o job que gera o embedding
   * (`det_size` 640, spec §7.4). Sem `biometric_sorting` ativa, o Storage e o
   * banco recusam — a trava não é da tela.
   */
  enqueue(input: ReferenceFaceInput): Promise<StudentReferenceJob>;
  /** Desiste de uma foto ainda na fila: apaga o job e o objeto no bucket. */
  cancelJob(jobId: string): Promise<void>;
  /** Reenfileira um job que falhou, zerando as tentativas. */
  retryJob(jobId: string): Promise<void>;
  /** Remove uma referência processada (RPC) e o arquivo no bucket. */
  remove(faceId: string): Promise<void>;
  /** URL assinada da foto de referência, para a miniatura da tela. */
  signUrl(storagePath: string): Promise<string>;
  /**
   * Cobertura biométrica da escola, por aluno ativo. Junta a RPC
   * `student_biometric_readiness` com a contagem da fila.
   */
  readiness(schoolId: string): Promise<Map<string, StudentBiometricReadiness>>;
}

export interface ReferenceRepository {
  list(): Promise<ReferencePost[]>;
  create(input: Omit<ReferencePost, "id" | "createdAt">): Promise<ReferencePost>;
  delete(id: string): Promise<void>;
}

export interface GeneratedPostRepository {
  /** Posts ativos (fora da lixeira), mais recentes primeiro. */
  list(): Promise<GeneratedPost[]>;
  /**
   * Posts na lixeira, mais recentes primeiro. Antes de listar, faz o expurgo
   * oportunista dos itens com mais de 30 dias na lixeira (registro + arquivo
   * no Storage quando o caminho é conhecido).
   */
  listTrash(): Promise<GeneratedPost[]>;
  create(input: Omit<GeneratedPost, "id" | "createdAt">): Promise<GeneratedPost>;
  /** Exclusão normal: move para a lixeira (30 dias até o expurgo). */
  moveToTrash(ids: string[]): Promise<void>;
  /** Devolve itens da lixeira para a galeria. */
  restore(ids: string[]): Promise<void>;
  /**
   * Exclusão definitiva imediata: remove o registro e o arquivo no Storage
   * (quando o caminho é conhecido). Sem volta.
   */
  deletePermanently(ids: string[]): Promise<void>;
}

/**
 * Serviço de geração de imagem. Ponto de troca isolado:
 * hoje é mock (composição via canvas apresentada como IA); depois será uma
 * chamada de backend para a OpenAI (GPT Image) usando a mesma assinatura.
 */
export interface ImageGenerationService {
  /**
   * `onUploadProgress` (opcional) recebe 0–100 enquanto as fotos sobem ao
   * servidor; após 100%, a fase passa a ser "gerando" (sem progresso real).
   */
  generate(
    request: GenerationRequest,
    onUploadProgress?: (percent: number) => void,
  ): Promise<{ imageUrl: string; details: GenerationDetails; logId?: string }>;

  /**
   * Saldo da cota diária de gerações do usuário. Retorna `null` quando o
   * saldo não está disponível (banco de cota fora do ar, modo dev sem
   * autenticação) — a UI deve simplesmente omitir o indicador nesse caso.
   */
  getQuota(): Promise<GenerationQuota | null>;
}

/** Saldo da cota diária de gerações (por usuário, reinicia à meia-noite UTC). */
export interface GenerationQuota {
  limit: number;
  used: number;
  remaining: number;
}
/** Aprovação de cadastros pendentes — apenas super_admin. */
export interface ApprovalRepository {
  listPending(): Promise<PendingRegistration[]>;
  /** Quantidade de cadastros aguardando aprovação (para o badge do menu). */

  countPending(): Promise<number>;
  /**
   * Notifica quando a quantidade de pendências pode ter mudado
   * (novo cadastro, aprovação ou recusa). No Supabase usa Realtime
   * (postgres_changes em `profiles`); no mock, eventos locais.
   * Retorna a função de unsubscribe.
   */

  onPendingCountChange(cb: () => void): () => void;

  /** Aprova o cadastro; no Supabase o trigger cria a escola e o vínculo. */
  approve(profileId: string): Promise<void>;

  reject(profileId: string): Promise<void>;
}

/**
 * Configuração global do template do prompt de geração.
 * Leitura: qualquer usuário autenticado. Escrita: apenas super_admin
 * (garantido por RLS no Supabase e pelo papel da sessão no mock).
 */
export interface PromptTemplateRepository {
  /** Template salvo, ou null (usar o padrão embutido). */
  get(): Promise<PromptTemplateSetting | null>;
  /** Salva (upsert) o template global. */
  save(template: string): Promise<PromptTemplateSetting>;
  /** Remove o template salvo (voltar ao padrão embutido). */
  reset(): Promise<void>;
  /**
   * Histórico de versões salvas (mais recente primeiro). Cada save() grava
   * uma versão; restaurar = save(versao.template).
   */
  listVersions(): Promise<PromptTemplateVersion[]>;
}

export interface DataLayer {
  auth: AuthService;
  approvals: ApprovalRepository;
  storage: StorageService;
  students: StudentRepository;
  schoolBrands: SchoolBrandRepository;
  classes: ClassRepository;
  authorizations: AuthorizationRepository;
  referenceFaces: ReferenceFaceRepository;
  events: EventRepository;
  photos: PhotoRepository;
  references: ReferenceRepository;
  generatedPosts: GeneratedPostRepository;
  promptTemplate: PromptTemplateRepository;
  generation: ImageGenerationService;
  guardianVerification: GuardianVerificationService;
  shareLogs: ShareLogRepository;
  /** true enquanto o app roda com dados mock (exibir aviso discreto na UI) */
  readonly isMock: boolean;
}

export type { AppUser };
