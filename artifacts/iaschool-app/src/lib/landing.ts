/**
 * Destino do botão "Agendar demonstração" da landing.
 *
 * Vem de `VITE_DEMO_CONTACT_URL` (WhatsApp, agenda ou e-mail). Sem valor
 * válido, a landing não inventa contato e leva o visitante ao login.
 */
export type LandingCta =
  | { kind: "demo"; href: string; external: boolean }
  | { kind: "login"; href: "/entrar" };

const ALLOWED_PROTOCOLS = new Set(["https:", "mailto:"]);

export function resolveLandingCta(raw: string | undefined): LandingCta {
  const value = raw?.trim();
  if (!value) return { kind: "login", href: "/entrar" };
  try {
    const url = new URL(value);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      return { kind: "login", href: "/entrar" };
    }
    return { kind: "demo", href: url.toString(), external: url.protocol === "https:" };
  } catch {
    return { kind: "login", href: "/entrar" };
  }
}
