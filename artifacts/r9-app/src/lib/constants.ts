// Constantes de domínio do IAsport.

/** Posições de futebol (pt-BR). */
export const POSITIONS = [
  "Goleiro",
  "Zagueiro",
  "Lateral-direito",
  "Lateral-esquerdo",
  "Volante",
  "Meia",
  "Meia-atacante",
  "Ponta-direita",
  "Ponta-esquerda",
  "Centroavante",
  "Atacante",
] as const;

/** Buckets do storage (mapeiam para buckets do Supabase Storage no futuro). */
export const BUCKETS = {
  students: "students",
  clubs: "clubs",
  references: "references",
} as const;

/**
 * Chave de sessionStorage usada para pré-preencher as "Instruções adicionais"
 * da tela de geração com o prompt de uma geração antiga.
 */
export const AUX_PROMPT_PREFILL_KEY = "r9:aux-prompt-prefill";

/** Evento disparado quando um prompt é enviado para a tela de geração. */
export const AUX_PROMPT_PREFILL_EVENT = "r9-aux-prompt-prefill";

/**
 * Único usuário autorizado a ver a tela de logs de geração (/admin/logs).
 * Além do e-mail, a rota e a API exigem papel super_admin.
 */
export const LOGS_ADMIN_EMAIL = "iasport@andersondomingos.com.br";

/**
 * Gera valores plausíveis para uma métrica (apresentado como "IA").
 * Baseia-se no nome para dar números coerentes.
 */
export function plausibleMetricValue(name: string): string {
  const n = name.toLowerCase();
  const rand = (min: number, max: number) =>
    String(Math.floor(Math.random() * (max - min + 1)) + min);
  if (n.includes("gol")) return rand(1, 4);
  if (n.includes("assist")) return rand(0, 3);
  if (n.includes("defesa")) return rand(2, 8);
  if (n.includes("passe")) return rand(18, 62);
  if (n.includes("drible")) return rand(2, 9);
  if (n.includes("desarme")) return rand(1, 7);
  if (n.includes("chute") || n.includes("finaliza")) return rand(3, 11);
  if (n.includes("cruzamento")) return rand(1, 6);
  if (n.includes("roubo")) return rand(2, 8);
  return rand(1, 10);
}
