// Cache de URLs assinadas das miniaturas, por evento. A galeria só pede a
// assinatura do que está visível; aqui os pedidos são agrupados em lotes de
// 100 (spec §10), deduplicados enquanto estão em voo e esquecidos perto de
// vencer (URL vale 1 h; guardamos por 50 min). Sem React: `subscribe` serve
// ao `useSyncExternalStore`.

export interface SignablePhoto {
  id: string;
  thumbPath?: string;
}

export interface SignedUrlCacheDeps {
  sign: (photos: SignablePhoto[]) => Promise<Map<string, string>>;
  /** Padrão 50 min: a URL assinada vale 60. */
  ttlMs?: number;
  /** Tamanho do lote enviado ao `sign` (limite do Storage: 100). */
  batchSize?: number;
  now?: () => number;
}

export interface SignedUrlCache {
  get(photoId: string): string | undefined;
  /** Agenda a assinatura do que falta entre as fotos dadas (coalescido por microtask). */
  ensure(photos: ReadonlyArray<SignablePhoto>): void;
  subscribe(cb: () => void): () => void;
  /** Esquece as URLs dadas (ex.: miniatura regerada). */
  invalidate(ids: string[]): void;
  /** Versão que muda a cada lote resolvido; útil como snapshot barato. */
  version(): number;
}

const DEFAULT_TTL_MS = 50 * 60_000;
const DEFAULT_BATCH = 100;

export function createSignedUrlCache(deps: SignedUrlCacheDeps): SignedUrlCache {
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH;
  const now = deps.now ?? (() => Date.now());

  const urls = new Map<string, { url: string; expiresAt: number }>();
  const inFlight = new Set<string>();
  const wanted = new Map<string, SignablePhoto>();
  const listeners = new Set<() => void>();
  let scheduled = false;
  let version = 0;

  function notify(): void {
    version++;
    for (const l of listeners) l();
  }

  function isFresh(id: string): boolean {
    const hit = urls.get(id);
    return Boolean(hit && hit.expiresAt > now());
  }

  async function flush(): Promise<void> {
    scheduled = false;
    const batch: SignablePhoto[] = [];
    for (const [id, p] of wanted) {
      if (isFresh(id) || inFlight.has(id)) continue;
      batch.push(p);
    }
    wanted.clear();
    if (batch.length === 0) return;

    const chunks: SignablePhoto[][] = [];
    for (let i = 0; i < batch.length; i += batchSize) chunks.push(batch.slice(i, i + batchSize));
    for (const c of chunks) for (const p of c) inFlight.add(p.id);

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const signed = await deps.sign(chunk);
          const expiresAt = now() + ttl;
          for (const [id, url] of signed) urls.set(id, { url, expiresAt });
        } catch {
          // Sem URL a célula fica no skeleton; a próxima rolagem tenta de novo.
        } finally {
          for (const p of chunk) inFlight.delete(p.id);
        }
        notify();
      }),
    );
  }

  return {
    get(id) {
      const hit = urls.get(id);
      return hit && hit.expiresAt > now() ? hit.url : undefined;
    },
    ensure(photos) {
      let added = false;
      for (const p of photos) {
        if (!p.thumbPath) continue;
        if (isFresh(p.id) || inFlight.has(p.id) || wanted.has(p.id)) continue;
        wanted.set(p.id, p);
        added = true;
      }
      if (added && !scheduled) {
        scheduled = true;
        queueMicrotask(() => void flush());
      }
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    invalidate(ids) {
      let changed = false;
      for (const id of ids) changed = urls.delete(id) || changed;
      if (changed) notify();
    },
    version: () => version,
  };
}

/** Um cache por evento, vivo enquanto a aba viver (2.000 strings é irrelevante). */
const caches = new Map<string, SignedUrlCache>();

export function signedUrlCacheFor(
  eventId: string,
  sign: SignedUrlCacheDeps["sign"],
): SignedUrlCache {
  let cache = caches.get(eventId);
  if (!cache) {
    cache = createSignedUrlCache({ sign });
    caches.set(eventId, cache);
  }
  return cache;
}
