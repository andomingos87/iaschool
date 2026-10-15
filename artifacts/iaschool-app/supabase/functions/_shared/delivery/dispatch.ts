import { createOpaqueToken, sha256Hex } from "../whatsapp/tokens.ts";
import type { WhatsAppProvider } from "../whatsapp/types.ts";
import { validateDeliveryFields } from "./message.ts";
type Row = Record<string, unknown>;
export interface DispatchDeps {
  userId: string;
  mode: string;
  publicUrl: string;
  instanceId: string;
  albumReady: boolean;
  provider: WhatsAppProvider | null;
  rpc(name: string, args: Row): Promise<{ data: unknown; error: unknown }>;
}
export type DeliverySendBlock =
  | "paused"
  | "provider_missing"
  | "album_not_ready"
  | "public_url_invalid"
  | "instance_missing";
/** Primeira trava fechada, sem devolver segredo, URL ou identificador. */
export function deliverySendBlock(deps: Pick<DispatchDeps, "mode" | "provider" | "albumReady" | "publicUrl" | "instanceId">): DeliverySendBlock | null {
  if (deps.mode !== "controlled_zapi") return "paused";
  if (!deps.provider) return "provider_missing";
  if (!deps.albumReady) return "album_not_ready";
  if (!/^https:\/\/[^\s?#]+$/.test(deps.publicUrl)) return "public_url_invalid";
  if (!deps.instanceId) return "instance_missing";
  return null;
}
export async function dispatchDelivery(deps: DispatchDeps, recipientId: string, resend: boolean): Promise<Row> {
  const blocked = deliverySendBlock(deps);
  if (blocked || !deps.provider) return { error: "Envio desligado ou álbum indisponível.", code: "sending_disabled", reason: blocked ?? "provider_missing" };
  const token = createOpaqueToken();
  const reserved = await deps.rpc("reserve_delivery_dispatch", {
    p_recipient_id: recipientId, p_token_hash: await sha256Hex(token), p_instance_id: deps.instanceId,
    p_user_id: deps.userId, p_resend: resend, p_mode: deps.mode,
  });
  if (reserved.error || !reserved.data) return { error: "Envio bloqueado. Confira aprovação, acesso, autorização e limite da escola.", code: "dispatch_blocked" };
  const r = reserved.data as Row;
  const complete = async (status: string, errorCode: string | null, providerMessageId?: string, providerRequestId?: string) => await deps.rpc("complete_whatsapp_send", {
    p_message_id: r.messageId, p_status: status, p_error_code: errorCode,
    p_provider_message_id: providerMessageId ?? null, p_provider_zaap_id: providerRequestId ?? null,
  });
  const gate = await deps.rpc("delivery_dispatch_gate", { p_message_id: r.messageId });
  if (gate.error || gate.data !== true || !validateDeliveryFields(r.fields)) {
    await complete("failed", "delivery_gate_closed");
    return { error: "A aprovação ou o acesso mudou. Revise o lote antes de enviar.", code: "dispatch_blocked" };
  }
  let result;
  try { result = await deps.provider.sendDeliveryReady(r.phone as string, `${deps.publicUrl}/album#${token}`, r.fields); }
  catch { result = { status: "unknown" as const, errorCode: "provider_result_unknown" }; }
  const completion = await complete(result.status, result.errorCode ?? null, result.providerMessageId, result.providerRequestId);
  if (completion.error) return { error: "Resultado incerto. Não repita o envio.", code: "unknown" };
  return { ok: true, status: result.status };
}
