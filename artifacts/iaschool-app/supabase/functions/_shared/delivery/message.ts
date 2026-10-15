export interface DeliveryMessageFields { eventName: string; callToAction: string; signature: string }
export function validateDeliveryFields(value: unknown): value is DeliveryMessageFields {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 3 && ["eventName", "callToAction", "signature"].every(k => typeof v[k] === "string" && !/(https?:|www\.|javascript:|data:|[\u0000-\u001f\u007f])/i.test(v[k] as string)) &&
    (v.eventName as string).trim().length >= 1 && (v.eventName as string).length <= 120 &&
    (v.callToAction as string).length <= 160 && (v.signature as string).trim().length >= 1 && (v.signature as string).length <= 80;
}
export function renderDeliveryMessage(fields: DeliveryMessageFields, link: string): string {
  if (!validateDeliveryFields(fields) || !/^https:\/\/[^\s?#]+\/album#[0-9a-f]{64}$/.test(link)) throw new Error("invalid_delivery_message");
  return [fields.eventName.trim(), fields.callToAction.trim(), fields.signature.trim(),
    `Acesse seu álbum pelo link exclusivo: ${link}`,
    "O primeiro acesso abre uma sessão de 24 horas. Os arquivos ficam disponíveis por até 7 dias. Para recuperar o acesso, procure a escola."].filter(Boolean).join("\n\n");
}
