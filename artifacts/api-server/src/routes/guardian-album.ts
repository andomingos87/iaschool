import { Router, type Request, type Response } from "express";

/** Mesmo domínio da UI: o cookie de álbum nunca fica no JavaScript. */
export function createGuardianAlbumHandler(config: { url: () => string | undefined; anonKey: () => string | undefined;
  appUrl: () => string | undefined; transport?: typeof fetch }) {
  const transport = config.transport ?? fetch;
  return async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.removeHeader("Access-Control-Allow-Origin");
    res.removeHeader("Access-Control-Allow-Credentials");
    const denied = () => res.status(403).json({ error: "Acesso indisponível." });
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return denied();
    try {
      const expected = config.appUrl();
      const host = expected ? new URL(expected).host : (req.get("x-forwarded-host") ?? req.get("host"))?.split(",")[0]?.trim();
      if (!origin || new URL(origin).host !== host || !["http:", "https:"].includes(new URL(origin).protocol) || (expected && new URL(origin).origin !== new URL(expected).origin)) return denied();
    } catch { return denied(); }
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || !["consume", "list", "download", "audit_zip"].includes(String(body["action"])))
      return res.status(400).json({ error: "Pedido inválido." });
    if (JSON.stringify(body).length > 20_000) return res.status(413).json({ error: "Pedido muito grande." });
    const supabaseUrl = config.url();
    const anonKey = config.anonKey();
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "Álbum indisponível." });
    let safeBody: Record<string, unknown> = { action: body["action"] };
    if (body["action"] === "consume") {
      if (typeof body["token"] !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(body["token"])) return res.status(400).json({ error: "Link inválido." });
      safeBody = { ...safeBody, token: body["token"] };
    } else if (body["action"] === "download") {
      if (typeof body["itemId"] !== "string" || !/^[0-9a-f-]{36}$/i.test(body["itemId"])) return res.status(400).json({ error: "Foto inválida." });
      safeBody = { ...safeBody, itemId: body["itemId"] };
    } else if (body["action"] === "audit_zip") {
      const ids = body["itemIds"];
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 || ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)))
        return res.status(400).json({ error: "Seleção inválida." });
      safeBody = { ...safeBody, itemIds: ids };
    }
    const cookie = req.get("cookie")?.split(";").map(part => part.trim()).find(part => /^__Host-iaschool-album=[A-Za-z0-9_-]{32,256}$/.test(part));
    const headers: Record<string, string> = { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` };
    if (cookie) headers["Cookie"] = cookie;
    try {
      const response = await transport(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/guardian-album`, {
        method: "POST", headers, body: JSON.stringify(safeBody), redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      // O gateway também pode emitir cookies próprios. Ler cada cabeçalho
      // separadamente evita misturar esses cookies com a sessão do álbum.
      const albumCookies = response.headers.getSetCookie().filter(value => /^__Host-iaschool-album=/i.test(value));
      const setCookie = albumCookies.length === 1 ? albumCookies[0] : undefined;
      if (setCookie && /^__Host-iaschool-album=[A-Za-z0-9_-]{32,256};/i.test(setCookie) && /;\s*HttpOnly(?:;|$)/i.test(setCookie) && /;\s*Secure(?:;|$)/i.test(setCookie) && /;\s*Path=\/(?:;|$)/i.test(setCookie) && /;\s*SameSite=Lax(?:;|$)/i.test(setCookie) && /;\s*Max-Age=\d+(?:;|$)/i.test(setCookie) && Number(setCookie.match(/;\s*Max-Age=(\d+)/i)?.[1]) <= 86400 && !/[,\r\n]|;\s*Domain=/i.test(setCookie))
        res.setHeader("Set-Cookie", setCookie);
      if (!response.ok) {
        let code = "unavailable";
        try { const error: unknown = await response.json(); const obj = error && typeof error === "object" ? error as Record<string, unknown> : {}; const value = obj["code"] ?? obj["error"];
          if (["used", "revoked", "expired", "authorization_revoked", "unsafe_or_expired_asset", "unavailable"].includes(String(value))) code = String(value);
        } catch { /* resposta privada nunca é repassada */ }
        return res.status([400, 401, 403, 404, 409, 410, 429, 503].includes(response.status) ? response.status : 503).json({ error: code });
      }
      const data: unknown = await response.json();
      return res.status(200).json(data);
    } catch { return res.status(503).json({ error: "Álbum indisponível. Procure a escola se o link já foi aberto." }); }
  };
}
const router = Router();
router.post("/guardian-album", createGuardianAlbumHandler({ url: () => process.env["SUPABASE_URL"],
  anonKey: () => process.env["SUPABASE_ANON_KEY"], appUrl: () => process.env["APP_PUBLIC_URL"] }));
export default router;
