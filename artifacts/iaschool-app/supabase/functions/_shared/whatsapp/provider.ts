import { getWhatsAppMode, type WhatsAppProvider } from "./types.ts";
import { readZApiConfig, ZApiProvider } from "./zapi-provider.ts";

export function createWhatsAppProvider(
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
  fetchImpl?: typeof fetch,
): WhatsAppProvider | null {
  const mode = getWhatsAppMode(env);
  if (mode !== "controlled_zapi" || env("WHATSAPP_PROVIDER") !== "zapi") return null;
  const config = readZApiConfig(env);
  if (!config) return null;
  return new ZApiProvider({ ...config, fetchImpl });
}
