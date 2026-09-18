// Constantes de domínio do IAschool.

/** Buckets do storage (mapeiam para buckets do Supabase Storage no futuro). */
export const BUCKETS = {
  students: "students",
  /** Identidade visual das escolas (bucket `clubs` por herança do schema). */
  schoolBrands: "clubs",
  references: "references",
} as const;

/**
 * Chave de sessionStorage usada para pré-preencher as "Instruções adicionais"
 * da tela de geração com o prompt de uma geração antiga.
 */
export const AUX_PROMPT_PREFILL_KEY = "iaschool:aux-prompt-prefill";

/** Evento disparado quando um prompt é enviado para a tela de geração. */
export const AUX_PROMPT_PREFILL_EVENT = "iaschool-aux-prompt-prefill";

/**
 * Único usuário autorizado a ver a tela de logs de geração (/admin/logs).
 * Além do e-mail, a rota e a API exigem papel super_admin.
 */
export const LOGS_ADMIN_EMAIL = "iasport@andersondomingos.com.br";
