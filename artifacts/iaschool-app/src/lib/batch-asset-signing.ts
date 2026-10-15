/** Novas artes de lote usam URLs curtas e sempre reconsultam a permissão. */
export function isGenerationBatchAsset(bucket: string, path: string): boolean {
  return bucket === "generated" && path.includes("/generation-batches/");
}

export interface SignedStoragePath {
  path?: string | null;
  signedUrl?: string | null;
}

export async function signStoragePaths(
  bucket: string,
  paths: string[],
  legacyCache: Map<string, string>,
  legacyTtl: number,
  sign: (paths: string[], ttl: number) => Promise<SignedStoragePath[]>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const legacy: string[] = [], batches: string[] = [];
  for (const path of new Set(paths)) {
    if (isGenerationBatchAsset(bucket, path)) {
      batches.push(path);
    } else {
      const cached = legacyCache.get(`${bucket}/${path}`);
      if (cached) result.set(path, cached);
      else legacy.push(path);
    }
  }
  const groups = [{ paths: legacy, ttl: legacyTtl }, { paths: batches, ttl: 300 }];
  await Promise.all(groups.map(async ({ paths: requested, ttl }) => {
    if (!requested.length) return;
    try {
      const signed = await sign(requested, ttl);
      for (const item of signed) {
        if (!item.path || !item.signedUrl || !requested.includes(item.path)) continue;
        result.set(item.path, item.signedUrl);
        if (!isGenerationBatchAsset(bucket, item.path)) {
          legacyCache.set(`${bucket}/${item.path}`, item.signedUrl);
        }
      }
    } catch {
      // Sem fallback de URL antiga para lote: revogação não usa cache legado.
    }
  }));
  return result;
}
