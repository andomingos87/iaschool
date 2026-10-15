import { getDataLayer } from "./data";
import type { DeliveryDraft, DeliveryFields, RecipientSelection } from "./delivery-workspace";

export interface AlbumPhoto { id: string; photoId: string; width: number; height: number; thumbUrl: string }
export interface GuardianAlbum {
  eventName: string; signature: string; sessionExpiresAt: string; filesExpireAt: string; items: AlbumPhoto[];
}
export interface AlbumDownload { url: string; filename: string; expiresAt: string }
type Fetcher = typeof fetch;
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  used: "Este link já foi usado em outro navegador. Procure a escola para receber um novo acesso.",
  revoked: "O acesso a este álbum foi revogado pela escola.",
  expired: "O link ou a sessão venceu. Procure a escola para recuperar o acesso.",
  authorization_revoked: "A autorização para este álbum não está mais ativa. Procure a escola.",
  unsafe_or_expired_asset: "Esta foto não está mais disponível. Procure a escola para atualizar o álbum.",
  unavailable: "O álbum está indisponível agora. Procure a escola se o link já foi aberto.",
  sending_disabled: "O envio está desligado ou o álbum ainda não está disponível. Nenhuma mensagem foi transmitida.",
  dispatch_blocked: "Envio bloqueado. Confira a versão aprovada, a autorização, o número verificado e o limite da escola.",
  unknown: "O resultado do envio é incerto. Não repita a ação; aguarde a reconciliação pelo servidor.",
};
function publicError(status: number): string {
  if (status === 401 || status === 403) return "Este acesso está indisponível. Procure a escola para recuperar o álbum.";
  if (status === 409) return "A versão mudou. Recarregue a prévia e confira novamente antes de aprovar.";
  if (status === 410) return "O link ou os arquivos venceram. Procure a escola para recuperar o acesso.";
  if (status === 429) return "Aguarde antes de tentar novamente. A tentativa anterior pode estar em andamento.";
  return "Não foi possível concluir agora. Confira a conexão e tente novamente.";
}
export class DeliveryServiceError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new DeliveryServiceError(response.ok ? 503 : response.status, publicError(response.status)); }
  const data = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const code = typeof data?.code === "string" ? data.code : typeof data?.error === "string" ? data.error : "";
  if (!response.ok || code || !data || data.ok === false) {
    throw new DeliveryServiceError(response.ok ? 503 : response.status, SAFE_ERROR_MESSAGES[code] ?? publicError(response.status));
  }
  return body as T;
}
export function createDeliveryService(config: { url: string; anonKey: string; token: () => Promise<string | null>; fetcher?: Fetcher }) {
  const transport = config.fetcher ?? fetch;
  async function rpc<T>(name: string, body: unknown): Promise<T> {
    const token = await config.token();
    if (!token) throw new DeliveryServiceError(401, "Entre novamente com sua conta da escola.");
    return readResponse<T>(await transport(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), cache: "no-store",
    }));
  }
  return {
    draft: (batchId: string) => rpc<DeliveryDraft>("delivery_draft_detail", { p_batch_id: batchId }),
    save: (batchId: string, version: number, fields: DeliveryFields, selection: RecipientSelection[]) =>
      rpc<{ version: number }>("save_delivery_draft", { p_batch_id: batchId, p_expected_version: version, p_fields: fields, p_selection: selection }),
    async act(action: "dispatch" | "resend" | "revoke", recipientId: string) {
      const token = await config.token();
      if (!token) throw new DeliveryServiceError(401, "Entre novamente com sua conta da escola.");
      return readResponse<{ status: string }>(await transport(`${config.url}/functions/v1/school-delivery`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: config.anonKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, recipientId }), cache: "no-store",
      }));
    },
  };
}
let schoolService: ReturnType<typeof createDeliveryService> | null = null;
export function getDeliveryService() {
  schoolService ??= createDeliveryService({
    url: import.meta.env.VITE_SUPABASE_URL ?? "", anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    token: () => getDataLayer().auth.getAccessToken(),
  });
  return schoolService;
}
export function createAlbumService(transport: Fetcher = fetch) {
  async function call<T>(body: unknown): Promise<T> {
    return readResponse<T>(await transport("/api/guardian-album", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", redirect: "error",
    }));
  }
  return {
    consume: (token: string) => call<GuardianAlbum>({ action: "consume", token }),
    list: () => call<GuardianAlbum>({ action: "list" }),
    download: (itemId: string) => call<AlbumDownload>({ action: "download", itemId }),
    auditZip: (itemIds: string[]) => call<{ ok: boolean }>({ action: "audit_zip", itemIds }),
  };
}
