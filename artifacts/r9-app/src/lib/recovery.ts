// Detecção do fluxo de recuperação de senha (link do e-mail do Supabase).
//
// O link de recuperação (type=recovery) e o de convite (type=invite)
// redirecionam para o app com o tipo no hash da URL. O supabase-js consome o
// hash ao criar a sessão, então capturamos o sinal ANTES (em main.tsx) e
// persistimos em sessionStorage até o usuário concluir a definição da senha.

const KEY = "r9:password-recovery-pending";

/** Deve ser chamada o mais cedo possível (antes de renderizar o app). */
export function detectRecoveryFromUrl(): void {
  const { hash, search } = window.location;
  const flagged = (s: string) =>
    s.includes("type=recovery") || s.includes("type=invite");
  if (flagged(hash) || flagged(search)) {
    sessionStorage.setItem(KEY, "1");
  }
}

export function isRecoveryPending(): boolean {
  return sessionStorage.getItem(KEY) === "1";
}

export function clearRecoveryPending(): void {
  sessionStorage.removeItem(KEY);
}
