import type { WorkerClient } from "./supabase";

export const EVENT_PHOTOS_BUCKET = "event-photos";
export const EVENT_THUMBS_BUCKET = "event-thumbs";

export interface StorageApi {
  download(bucket: string, path: string): Promise<Buffer>;
  upload(bucket: string, path: string, body: Buffer, contentType: string): Promise<void>;
}

export function makeStorage(client: WorkerClient): StorageApi {
  return {
    async download(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`download ${bucket}: ${error?.message ?? "sem conteúdo"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(bucket, path, body, contentType) {
      // upsert: reprocessar uma foto (retry) sobrescreve a miniatura antiga.
      const { error } = await client.storage
        .from(bucket)
        .upload(path, body, { contentType, upsert: true });
      if (error) throw new Error(`upload ${bucket}: ${error.message}`);
    },
  };
}
