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
  Club,
  GeneratedPost,
  GenerationRequest,
  LinkableStudentAccount,
  Metric,
  PendingRegistration,
  PromptTemplateSetting,
  PromptTemplateVersion,
  ReferencePost,
  SchoolOption,
  Session,
  SignUpInput,
  StoredImage,
  Student,
  StudentAccountOverview,
} from "./types";

export interface AuthService {
  /** Sessão atual, ou null. Equivalente a supabase.auth.getSession(). */
  getSession(): Promise<Session | null>;
  /** Equivalente a supabase.auth.signInWithPassword(). */
  signIn(email: string, password: string): Promise<Session>;
  /** Equivalente a supabase.auth.signOut(). */
  signOut(): Promise<void>;
  /**
   * Cadastro público (escola ou aluno). A conta nasce com status "pending"
   * e só ganha acesso após aprovação do super_admin.
   * Equivalente a supabase.auth.signUp() + profile pendente (via trigger).
   */
  signUp(input: SignUpInput): Promise<void>;
  /**
   * Escolas aprovadas para o seletor do cadastro de aluno.
   * Acessível sem login (RPC pública no Supabase).
   */
  listApprovedSchools(): Promise<SchoolOption[]>;
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

export interface StudentRepository {
  list(): Promise<Student[]>;
  get(id: string): Promise<Student | null>;
  create(input: Omit<Student, "id" | "createdAt" | "updatedAt">): Promise<Student>;
  update(id: string, patch: Partial<Omit<Student, "id">>): Promise<Student>;
  delete(id: string): Promise<void>;
}

export interface ClubRepository {
  list(): Promise<Club[]>;
  get(id: string): Promise<Club | null>;
  create(input: Omit<Club, "id" | "createdAt" | "updatedAt">): Promise<Club>;
  update(id: string, patch: Partial<Omit<Club, "id">>): Promise<Club>;
  delete(id: string): Promise<void>;
}

export interface ReferenceRepository {
  list(): Promise<ReferencePost[]>;
  create(input: Omit<ReferencePost, "id" | "createdAt">): Promise<ReferencePost>;
  delete(id: string): Promise<void>;
}

export interface MetricRepository {
  /** Sempre inclui as 10 pré-definidas + personalizadas persistidas. */
  list(): Promise<Metric[]>;
  createCustom(name: string): Promise<Metric>;
  /** Apenas métricas personalizadas podem ser removidas. */
  delete(id: string): Promise<void>;
}

export interface GeneratedPostRepository {
  list(): Promise<GeneratedPost[]>;
  create(input: Omit<GeneratedPost, "id" | "createdAt">): Promise<GeneratedPost>;
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
  ): Promise<{ imageUrl: string }>;
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
  approve(profileId: string): Promise<void>;
  reject(profileId: string): Promise<void>;
  /**
   * Contas de aluno aprovadas e ainda sem vínculo com um registro de students.
   * Para school_user: apenas alunos da própria escola. super_admin vê todas.
   */
  listLinkableStudentAccounts(): Promise<LinkableStudentAccount[]>;
  /**
   * Vincula manualmente uma conta de aluno (profiles.student_record_id) a um
   * registro da tabela students. Falha se o registro já tiver conta vinculada.
   */
  linkStudentAccount(profileId: string, studentRecordId: string): Promise<void>;
  /**
   * Contas de aluno aprovadas com o estado do vínculo — visão do super_admin
   * na tela de Aprovações (o vínculo em si é feito pela escola).
   */
  listStudentAccounts(): Promise<StudentAccountOverview[]>;
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
  clubs: ClubRepository;
  references: ReferenceRepository;
  metrics: MetricRepository;
  generatedPosts: GeneratedPostRepository;
  promptTemplate: PromptTemplateRepository;
  generation: ImageGenerationService;
  /** true enquanto o app roda com dados mock (exibir aviso discreto na UI) */
  readonly isMock: boolean;
}

export type { AppUser };
