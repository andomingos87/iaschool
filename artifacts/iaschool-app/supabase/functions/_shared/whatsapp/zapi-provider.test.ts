import { createWhatsAppProvider } from "./provider.ts";
import { FakeWhatsAppProvider } from "./fake-provider.ts";
import { normalizeE164, toZApiPhone } from "./types.ts";
import { ZApiProvider } from "./zapi-provider.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("WhatsApp modo padrão e combinações inválidas ficam pausados", () => {
  assertEquals(createWhatsAppProvider(() => undefined), null);
  assertEquals(createWhatsAppProvider((name) => name === "WHATSAPP_MODE" ? "controlled_zapi" : undefined), null);
  assertEquals(normalizeE164("+5511999999999"), "+5511999999999");
  assertEquals(normalizeE164("5511999999999"), null);
  assertEquals(toZApiPhone("+5511999999999"), "5511999999999");
  assertEquals(createWhatsAppProvider((name) => ({
    WHATSAPP_MODE: "meta_test",
    WHATSAPP_PROVIDER: "meta",
  }[name])), null);
});

Deno.test("adaptador falso é determinístico e não realiza chamadas externas", async () => {
  const provider = new FakeWhatsAppProvider();
  assertEquals(await provider.sendOtp("+5511999999999", "123456"), {
    status: "accepted", providerMessageId: "fake-1",
  });
  assertEquals(provider.sent, [{
    phoneE164: "+5511999999999", purpose: "otp", text: "123456",
  }]);
});

Deno.test("Z-API envia somente texto e classifica a resposta como aceita", async () => {
  let requestBody: Record<string, unknown> | null = null;
  let requestUrl = "";
  let clientToken = "";
  const provider = new ZApiProvider({
    instanceId: "instance-test",
    instanceToken: "instance-secret",
    clientToken: "client-secret",
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String((init as RequestInit | undefined)?.body));
      clientToken = new Headers((init as RequestInit | undefined)?.headers).get("Client-Token") ?? "";
      return Response.json({ messageId: "message-1", zaapId: "request-1" });
    },
  });

  const result = await provider.sendOtp("+5511999999999", "123456");
  assertEquals(requestUrl.endsWith("/send-text"), true);
  assertEquals(clientToken, "client-secret");
  assertEquals(requestBody, {
    phone: "5511999999999",
    message: "Seu código de verificação do IAschool é 123456. Ele expira em 10 minutos.",
  });
  assertEquals(result.status, "accepted");
  assertEquals(result.providerMessageId, "message-1");
  assertEquals(result.providerRequestId, "request-1");
});

Deno.test("timeout e resposta malformada não são tratados como envio entregue", async () => {
  const timeoutProvider = new ZApiProvider({
    instanceId: "i", instanceToken: "t", clientToken: "c",
    fetchImpl: async () => { throw new Error("network failure"); },
  });
  assertEquals((await timeoutProvider.sendDeliveryReady("+5511999999999", "https://private.test/x")).status, "unknown");

  const malformedProvider = new ZApiProvider({
    instanceId: "i", instanceToken: "t", clientToken: "c",
    fetchImpl: async () => Response.json({}),
  });
  assertEquals((await malformedProvider.sendDeliveryReady("+5511999999999", "https://private.test/x")).status, "unknown");
});

Deno.test("webhook ignora grupo e status que não pertencem ao contrato", () => {
  const provider = new ZApiProvider({ instanceId: "instance-1", instanceToken: "t", clientToken: "c" });
  assertEquals(provider.normalizeWebhook({
    instanceId: "instance-1", type: "MessageStatusCallback", isGroup: true,
    status: "READ", ids: ["m1"], phone: "5511999999999", momment: 1,
  }), []);
  assertEquals(provider.normalizeWebhook({
    instanceId: "instance-1", type: "MessageStatusCallback", isGroup: false,
    status: "READ_BY_ME", ids: ["m1"], phone: "5511999999999", momment: 1,
  }), []);
  assertEquals(provider.normalizeWebhook({
    instanceId: "instance-1", type: "MessageStatusCallback", isGroup: false,
    status: "RECEIVED", ids: ["m1", {}], phone: "5511999999999", momment: 1,
  }), [{
    providerMessageId: "m1", status: "delivered", occurredAt: "1970-01-01T00:00:00.001Z",
    phone: "5511999999999", instanceId: "instance-1", isGroup: false,
  }]);
});
