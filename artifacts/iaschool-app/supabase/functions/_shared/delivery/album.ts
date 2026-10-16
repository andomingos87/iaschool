import { createOpaqueToken, sha256Hex } from "../whatsapp/tokens.ts";

export const ALBUM_COOKIE = "__Host-iaschool-album";
const SECRET = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
export interface AlbumDeps {
  rpc(name: string, args: Row): Promise<{ data: unknown; error: unknown }>;
  sign(path: string, ttl: number, download?: string): Promise<string | null>;
  now?: () => number;
}
function json(body: unknown, status = 200, cookie?: string): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "private, no-store", "Pragma": "no-cache",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  } });
}
export function remainingTtl(sessionExpiresAt: string, retentionUntil: string, now: number): number {
  return Math.max(0, Math.min(300, Math.floor((Date.parse(sessionExpiresAt) - now) / 1000),
    Math.floor((Date.parse(retentionUntil) - now) / 1000)));
}
export function makeAlbumHandler(deps: AlbumDeps) {
  const now = deps.now ?? Date.now;
  async function session(hash: string, itemId?: string, download = false): Promise<Row | null> {
    const out = await deps.rpc("delivery_album_session", { p_session_hash: hash, p_item_id: itemId ?? null, p_download: download });
    return out.error || !out.data ? null : out.data as Row;
  }
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "unavailable" }, 405);
    let body: Row;
    try { body = await req.json(); } catch { return json({ error: "unavailable" }, 400); }
    const cookie = req.headers.get("Cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${ALBUM_COOKIE}=`))?.slice(ALBUM_COOKIE.length + 1);
    let hash: string | null = cookie && SECRET.test(cookie) ? await sha256Hex(cookie) : null;
    let cookieHeader: string | undefined;
    if (body.action === "consume") {
      // Retorno pelo mesmo navegador usa a sessão sem consumir/renovar outro link.
      if (typeof body.token !== "string" || !SECRET.test(body.token)) return json({ error: "unavailable" }, 400);
      const tokenHash = await sha256Hex(body.token);
      const match = hash ? await deps.rpc("delivery_album_token_session", { p_token_hash: tokenHash, p_session_hash: hash }) : null;
      const current = hash && !match?.error && match?.data === true ? await session(hash) : null;
      if (!current || current.error) {
        const secret = createOpaqueToken();
        hash = await sha256Hex(secret);
        const consumed = await deps.rpc("consume_delivery_album_token", { p_token_hash: tokenHash, p_session_hash: hash });
        if (consumed.error || !consumed.data) return json({ error: "unavailable" }, 503);
        const result = consumed.data as Row;
        if (result.error) return json({ error: result.error }, 410);
        const maxAge = Math.min(86400, Math.max(0, Math.floor((Date.parse(result.expiresAt as string) - now()) / 1000)));
        if (!Number.isFinite(maxAge) || maxAge < 1) return json({ error: "expired" }, 410);
        cookieHeader = `${ALBUM_COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
      }
    } else if (!["list", "download", "audit_zip"].includes(String(body.action))) return json({ error: "unavailable" }, 400);
    if (!hash) return json({ error: "unavailable" }, 401);
    if (body.action === "audit_zip") {
      if (!Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.length > 1000 || !body.itemIds.every(id => typeof id === "string" && UUID.test(id))) return json({ error: "unavailable" }, 400);
      const result = await deps.rpc("audit_delivery_zip", { p_session_hash: hash, p_item_ids: body.itemIds });
      return result.error || result.data !== true ? json({ error: "unavailable" }, 410) : json({ ok: true });
    }
    const download = body.action === "download";
    if (download && (typeof body.itemId !== "string" || !UUID.test(body.itemId))) return json({ error: "unavailable" }, 400);
    const snapshot = await session(hash, download ? body.itemId as string : undefined, download);
    if (!snapshot) return json({ error: "unavailable" }, 503, cookieHeader);
    if (snapshot.error) return json({ error: snapshot.error }, 410, cookieHeader);
    const expires = snapshot.sessionExpiresAt as string;
    const items = snapshot.items as Row[];
    const signed: Row[] = [];
    for (const item of items) {
      const ttl = remainingTtl(expires, item.retentionUntil as string, now());
      if (!Number.isFinite(ttl) || ttl < 1) return json({ error: "expired" }, 410);
      const filename = `foto-${String(Number(item.order) + 1).padStart(3, "0")}.jpg`;
      const url = await deps.sign(item[download ? "assetPath" : "thumbPath"] as string, ttl, download ? filename : undefined);
      if (!url) return json({ error: "unavailable" }, 503, cookieHeader);
      const listed: Row = { id: item.id, photoId: item.photoId, width: item.width, height: item.height, thumbUrl: url };
      if (typeof item.eventId === "string" && UUID.test(item.eventId)) listed.eventId = item.eventId;
      if (typeof item.eventName === "string") {
        const eventName = item.eventName.trim();
        if (eventName.length >= 1 && eventName.length <= 120) listed.eventName = eventName;
      }
      signed.push(download ? { url, filename, expiresAt: new Date(now() + ttl * 1000).toISOString() } : listed);
    }
    // Revalida depois da assinatura: revogação concorrente não devolve URL nova.
    const fresh = await session(hash, download ? body.itemId as string : undefined);
    if (!fresh || fresh.error) return json({ error: fresh?.error ?? "unavailable" }, 410, cookieHeader);
    if (download) return json(signed[0], 200, cookieHeader);
    const fields = snapshot.fields as Row;
    return json({ eventName: fields.eventName, signature: fields.signature, sessionExpiresAt: expires,
      filesExpireAt: items.reduce((first, item) => String(item.retentionUntil) < first ? String(item.retentionUntil) : first, String(items[0]?.retentionUntil ?? "")),
      items: signed }, 200, cookieHeader);
  };
}
