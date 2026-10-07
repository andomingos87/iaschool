/** Falha ao ler perfil ou escolas depois que a senha já estava certa. */
export class SessionReadError extends Error {
  readonly code = "session-read" as const;

  constructor(message: string) {
    super(message);
    this.name = "SessionReadError";
  }
}

/** Mensagens do Auth que o produto conhece, em português. */
export function authErrorMessage(raw: string | undefined, fallback: string): string {
  const msg = (raw ?? "").toLowerCase();
  if (msg.includes("invalid login") || msg.includes("invalid email or password")) {
    return "E-mail ou senha inválidos";
  }
  if (msg.includes("email not confirmed")) {
    return "Falta confirmar o e-mail. Abra a mensagem que enviamos e clique no link.";
  }
  if (msg.includes("already registered") || msg.includes("already been registered")) {
    return "Este e-mail já está cadastrado.";
  }
  return fallback;
}
