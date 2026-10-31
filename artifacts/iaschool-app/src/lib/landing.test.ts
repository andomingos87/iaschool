import { describe, expect, it } from "vitest";
import { resolveLandingCta } from "./landing";

describe("resolveLandingCta", () => {
  it("leva ao login quando o contato não foi configurado", () => {
    expect(resolveLandingCta(undefined)).toEqual({ kind: "login", href: "/entrar" });
    expect(resolveLandingCta("   ")).toEqual({ kind: "login", href: "/entrar" });
  });

  it("aceita link https como demonstração externa", () => {
    expect(resolveLandingCta("https://wa.me/5511000000000")).toEqual({
      kind: "demo",
      href: "https://wa.me/5511000000000",
      external: true,
    });
  });

  it("aceita mailto sem abrir nova aba", () => {
    expect(resolveLandingCta("mailto:contato@example.com")).toMatchObject({
      kind: "demo",
      external: false,
    });
  });

  it("recusa protocolo inseguro ou valor inválido", () => {
    expect(resolveLandingCta("javascript:alert(1)").kind).toBe("login");
    expect(resolveLandingCta("http://example.com").kind).toBe("login");
    expect(resolveLandingCta("não é url").kind).toBe("login");
  });
});
