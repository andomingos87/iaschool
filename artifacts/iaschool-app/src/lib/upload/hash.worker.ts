// Web Worker: SHA-256 do arquivo original, fora da thread da interface
// (spec §7.1). Recebe o ArrayBuffer transferido e devolve o hex.

export interface HashRequest {
  id: number;
  buffer: ArrayBuffer;
}

export interface HashResponse {
  id: number;
  hex?: string;
  error?: string;
}

function toHex(digest: ArrayBuffer): string {
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

self.onmessage = async (event: MessageEvent<HashRequest>) => {
  const { id, buffer } = event.data;
  try {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const response: HashResponse = { id, hex: toHex(digest) };
    self.postMessage(response);
  } catch (err) {
    const response: HashResponse = {
      id,
      error: err instanceof Error ? err.message : "falha ao calcular o hash",
    };
    self.postMessage(response);
  }
};
