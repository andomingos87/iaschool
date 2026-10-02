/** Recebe somente callbacks de status Z-API; nunca libera ou concede acesso. */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ZApiProvider } from "../_shared/whatsapp/zapi-provider.ts";

function json(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405);
  const secret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!secret || !instanceId || !serviceRoleKey || !supabaseUrl) return json(503);

  const pathSecret = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!constantTimeEqual(pathSecret, secret)) return json(404);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400);
  }
  const parser = new ZApiProvider({
    instanceId,
    instanceToken: "webhook-parser-only",
    clientToken: "webhook-parser-only",
  });
  const events = parser.normalizeWebhook(payload);
  if (events.length === 0) return json(400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  for (const event of events) {
    const { data, error } = await admin.rpc("record_whatsapp_provider_status", {
      p_provider_message_id: event.providerMessageId,
      p_status: event.status,
      p_phone: event.phone,
      p_instance_id: event.instanceId,
      p_occurred_at: event.occurredAt,
    });
    if (error) return json(503);
    if (data !== true) return json(404);
  }
  return json(204);
});
