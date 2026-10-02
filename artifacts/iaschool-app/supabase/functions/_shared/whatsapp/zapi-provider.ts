import {
  toZApiPhone,
  type NormalizedStatusEvent,
  type ProviderMessageResult,
  type WhatsAppProvider,
} from "./types.ts";
import { WHATSAPP_MESSAGE_TEMPLATES } from "./templates.ts";

interface ZApiConfig {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  fetchImpl?: typeof fetch;
}

export class ZApiProvider implements WhatsAppProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ZApiConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    if (!config.instanceId || !config.instanceToken || !config.clientToken) {
      throw new Error("whatsapp_provider_not_configured");
    }
  }

  sendOtp(phoneE164: string, code: string): Promise<ProviderMessageResult> {
    return this.sendText(phoneE164, WHATSAPP_MESSAGE_TEMPLATES.guardian_otp.render(code));
  }

  sendConsentRequest(phoneE164: string, link: string): Promise<ProviderMessageResult> {
    return this.sendText(phoneE164, WHATSAPP_MESSAGE_TEMPLATES.guardian_consent.render(link));
  }

  sendDeliveryReady(phoneE164: string, link: string): Promise<ProviderMessageResult> {
    return this.sendText(phoneE164, WHATSAPP_MESSAGE_TEMPLATES.delivery_ready.render(link));
  }

  normalizeWebhook(payload: unknown): NormalizedStatusEvent[] {
    if (!payload || typeof payload !== "object") return [];
    const body = payload as Record<string, unknown>;
    if (body.type !== "MessageStatusCallback" || body.instanceId !== this.config.instanceId) return [];
    if (body.isGroup !== false || typeof body.phone !== "string" || !/^\d{8,15}$/.test(body.phone)) return [];
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    const mapped = status === "SENT" ? "sent" : status === "RECEIVED" ? "delivered" : status === "READ" ? "read" : status === "FAILED" ? "failed" : null;
    if (!mapped) return [];
    const timestamp = typeof body.momment === "number" ? body.momment : typeof body.timestamp === "number" ? body.timestamp : null;
    if (timestamp === null || !Number.isFinite(timestamp) || timestamp < 0) return [];
    const occurredAt = timestamp === null ? null : new Date(timestamp).toISOString();
    return ids
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200)
      .map((providerMessageId) => ({
        providerMessageId,
        status: mapped,
        occurredAt,
        phone: body.phone as string,
        instanceId: body.instanceId as string,
        isGroup: false,
      }));
  }

  private async sendText(phoneE164: string, message: string): Promise<ProviderMessageResult> {
    const phone = toZApiPhone(phoneE164);
    const endpoint = `https://api.z-api.io/instances/${encodeURIComponent(this.config.instanceId)}/token/${encodeURIComponent(this.config.instanceToken)}/send-text`;
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": this.config.clientToken },
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Não há certeza se o provedor recebeu a mensagem: nunca repetir automaticamente.
      return { status: "unknown", errorCode: "provider_timeout_or_network_error" };
    }
    if (!response.ok) {
      return { status: "failed", errorCode: `provider_http_${response.status}` };
    }
    try {
      const result = await response.json() as Record<string, unknown>;
      const providerMessageId = typeof result.messageId === "string" ? result.messageId : null;
      const providerRequestId = typeof result.zaapId === "string" ? result.zaapId : null;
      if (!providerMessageId || !providerRequestId) return { status: "unknown", errorCode: "provider_response_missing_id" };
      return {
        status: "accepted",
        providerMessageId,
        providerRequestId,
      };
    } catch {
      return { status: "unknown", errorCode: "provider_response_invalid" };
    }
  }
}

export function readZApiConfig(env: (name: string) => string | undefined): ZApiConfig | null {
  const instanceId = env("ZAPI_INSTANCE_ID");
  const instanceToken = env("ZAPI_INSTANCE_TOKEN");
  const clientToken = env("ZAPI_CLIENT_TOKEN");
  return instanceId && instanceToken && clientToken ? { instanceId, instanceToken, clientToken } : null;
}
