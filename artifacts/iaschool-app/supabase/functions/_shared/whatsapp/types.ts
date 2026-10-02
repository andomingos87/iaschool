export type WhatsAppMessagePurpose =
  | "guardian_otp"
  | "guardian_consent"
  | "delivery_ready";

export type WhatsAppMessageStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

export interface ProviderMessageResult {
  status: "accepted" | "failed" | "unknown";
  providerMessageId?: string;
  providerRequestId?: string;
  errorCode?: string;
}

export interface WhatsAppProvider {
  sendOtp(phoneE164: string, code: string): Promise<ProviderMessageResult>;
  sendConsentRequest(phoneE164: string, link: string): Promise<ProviderMessageResult>;
  sendDeliveryReady(phoneE164: string, link: string): Promise<ProviderMessageResult>;
  normalizeWebhook(payload: unknown): NormalizedStatusEvent[];
}

export interface NormalizedStatusEvent {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: string | null;
  phone: string;
  instanceId: string;
  isGroup: boolean;
}

export type WhatsAppMode = "paused" | "controlled_zapi" | "meta_test";

export function getWhatsAppMode(env: (name: string) => string | undefined): WhatsAppMode {
  const mode = env("WHATSAPP_MODE") ?? "paused";
  if (mode === "paused" || mode === "controlled_zapi" || mode === "meta_test") {
    return mode;
  }
  return "paused";
}

export function normalizeE164(phone: string): string | null {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function toZApiPhone(phoneE164: string): string {
  const normalized = normalizeE164(phoneE164);
  if (!normalized) throw new Error("invalid_phone");
  return normalized.slice(1);
}
