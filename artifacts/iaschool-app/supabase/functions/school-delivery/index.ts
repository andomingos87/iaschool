import { createClient } from "jsr:@supabase/supabase-js@2";
import { createWhatsAppProvider } from "../_shared/whatsapp/provider.ts";
import { getWhatsAppMode } from "../_shared/whatsapp/types.ts";
import { dispatchDelivery } from "../_shared/delivery/dispatch.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !key) return json({ error: "Serviço indisponível." }, 503);
  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Sessão inválida." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
  if (!body || !["dispatch", "resend", "revoke"].includes(body.action) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.recipientId)) return json({ error: "Pedido inválido." }, 400);
  if (body.action === "revoke") {
    const { data, error } = await caller.rpc("revoke_delivery_album", { p_recipient_id: body.recipientId });
    return error ? json({ error: "Não foi possível revogar o acesso." }, 403) : json(data);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  try {
    const result = await dispatchDelivery({
      userId: user.id, mode: getWhatsAppMode(name => Deno.env.get(name)),
      publicUrl: (Deno.env.get("APP_PUBLIC_URL") ?? "").replace(/\/+$/, ""),
      instanceId: Deno.env.get("ZAPI_INSTANCE_ID") ?? "",
      // Gate explícito de operação; este trabalho não configura/liga envio.
      albumReady: Deno.env.get("DELIVERY_ALBUM_READY") === "true",
      provider: createWhatsAppProvider(), rpc: async (name, args) => await admin.rpc(name, args),
    }, body.recipientId, body.action === "resend");
    return json(result, result.error ? result.code === "sending_disabled" ? 503 : 409 : 200);
  } catch { return json({ error: "Resultado incerto. Não repita o envio.", code: "unknown" }, 503); }
});
