// SHA-256 do arquivo ORIGINAL (antes do redimensionamento), que vira
// `photos.content_hash` e alimenta o `unique (event_id, content_hash)`.
// No navegador roda em Web Workers; sem Worker (testes) cai na thread atual.

import { HASH_WORKERS } from "./constants";
import type { HashRequest, HashResponse } from "./hash.worker";

export type HashFile = (file: Blob) => Promise<string>;

/** SHA-256 em hex de um ArrayBuffer, na thread atual. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  let out = "";
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Hash na thread atual (fallback e testes). */
export const hashFileInline: HashFile = async (file) => sha256Hex(await file.arrayBuffer());

interface Pending {
  resolve: (hex: string) => void;
  reject: (err: Error) => void;
}

/**
 * Pool pequeno de workers de hash. Cada pedido vai para o worker com menos
 * fila; o ArrayBuffer é transferido (não copiado).
 */
export function createHashPool(size = HASH_WORKERS): HashFile & { dispose(): void } {
  if (typeof Worker === "undefined") {
    const inline = hashFileInline as HashFile & { dispose(): void };
    inline.dispose = () => {};
    return inline;
  }

  const workers: Array<{ worker: Worker; busy: number }> = [];
  const pending = new Map<number, Pending>();
  let seq = 0;

  for (let i = 0; i < size; i++) {
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), {
      type: "module",
    });
    const slot = { worker, busy: 0 };
    worker.onmessage = (event: MessageEvent<HashResponse>) => {
      slot.busy--;
      const p = pending.get(event.data.id);
      if (!p) return;
      pending.delete(event.data.id);
      if (event.data.hex) p.resolve(event.data.hex);
      else p.reject(new Error(event.data.error ?? "falha ao calcular o hash"));
    };
    worker.onerror = (event) => {
      // Um erro fatal no worker derruba todos os pedidos dele.
      slot.busy = 0;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(new Error(event.message || "worker de hash falhou"));
      }
    };
    workers.push(slot);
  }

  const hash: HashFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const slot = workers.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = ++seq;
    slot.busy++;
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const request: HashRequest = { id, buffer };
      slot.worker.postMessage(request, [buffer]);
    });
  };

  return Object.assign(hash, {
    dispose() {
      for (const { worker } of workers) worker.terminate();
      for (const [, p] of pending) p.reject(new Error("upload cancelado"));
      pending.clear();
    },
  });
}
