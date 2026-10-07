import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-messages";

describe("authErrorMessage", () => {
  it("traduz credencial inválida", () => {
    expect(authErrorMessage("Invalid login credentials", "x")).toBe(
      "E-mail ou senha inválidos",
    );
    expect(authErrorMessage("Invalid email or password", "x")).toBe(
      "E-mail ou senha inválidos",
    );
  });

  it("traduz e-mail não confirmado", () => {
    expect(authErrorMessage("Email not confirmed", "x")).toMatch(/confirmar o e-mail/i);
  });

  it("traduz e-mail já cadastrado", () => {
    expect(authErrorMessage("User already registered", "x")).toBe(
      "Este e-mail já está cadastrado.",
    );
  });

  it("cai no fallback quando a mensagem é desconhecida", () => {
    expect(authErrorMessage("something else", "Não foi possível entrar")).toBe(
      "Não foi possível entrar",
    );
  });
});
