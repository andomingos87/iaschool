/**
 * Tokens opacos de uso único (consentimento e, no W4, acesso ao álbum).
 *
 * 256 bits em hexadecimal; o banco guarda só o SHA-256 (`token_hash`). Hash
 * rápido é suficiente porque o valor é aleatório e impossível de adivinhar —
 * diferente do OTP de 6 dígitos, que é humano e exige bcrypt.
 */

export function createOpaqueToken(): string {
  const value = new Uint8Array(32);
  crypto.getRandomValues(value);
  let out = "";
  for (const byte of value) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
