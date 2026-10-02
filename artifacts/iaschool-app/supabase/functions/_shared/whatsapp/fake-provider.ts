import type {
  NormalizedStatusEvent,
  ProviderMessageResult,
  WhatsAppProvider,
} from "./types.ts";

/** Adaptador determinístico para testes; nunca é selecionado pelo runtime. */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly sent: Array<{ phoneE164: string; purpose: "otp" | "consent" | "delivery"; text: string }> = [];

  async sendOtp(phoneE164: string, code: string): Promise<ProviderMessageResult> {
    this.sent.push({ phoneE164, purpose: "otp", text: code });
    return { status: "accepted", providerMessageId: `fake-${this.sent.length}` };
  }

  async sendConsentRequest(phoneE164: string, link: string): Promise<ProviderMessageResult> {
    this.sent.push({ phoneE164, purpose: "consent", text: link });
    return { status: "accepted", providerMessageId: `fake-${this.sent.length}` };
  }

  async sendDeliveryReady(phoneE164: string, link: string): Promise<ProviderMessageResult> {
    this.sent.push({ phoneE164, purpose: "delivery", text: link });
    return { status: "accepted", providerMessageId: `fake-${this.sent.length}` };
  }

  normalizeWebhook(_payload: unknown): NormalizedStatusEvent[] {
    return [];
  }
}
