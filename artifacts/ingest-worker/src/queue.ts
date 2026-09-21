// Camada fina sobre o supabase-js para a fila. Tudo aqui é injetável nos
// testes (ver loop.test.ts), por isso a interface é separada da implementação.

import type { WorkerClient } from "./supabase";
import type { CompleteInput, CompleteResult, PhotoJob, PhotoRow } from "./types";

export interface QueueApi {
  /** `claim_photo_jobs`: reserva até `limit` jobs por `leaseSeconds` (spec §5.2). */
  claim(kind: PhotoJob["kind"], limit: number, leaseSeconds: number): Promise<PhotoJob[]>;
  /** As fotos dos jobs reivindicados, de uma vez. */
  fetchPhotos(ids: string[]): Promise<Map<string, PhotoRow>>;
  /** `complete_photo_job`: conclui, falha ou devolve à fila, e mexe nos contadores do lote. */
  complete(input: CompleteInput): Promise<CompleteResult>;
  /** Lotes `running` parados há > 10 min com job pendente (view `stalled_batch_jobs`). */
  stalledCount(): Promise<number>;
}

function messageOf(error: { message: string } | null): string {
  return error?.message ?? "erro desconhecido";
}

export function makeQueueApi(client: WorkerClient): QueueApi {
  return {
    async claim(kind, limit, leaseSeconds) {
      const { data, error } = await client.rpc("claim_photo_jobs", {
        p_kind: kind,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(`claim_photo_jobs: ${messageOf(error)}`);
      return (data ?? []) as PhotoJob[];
    },
    async fetchPhotos(ids) {
      const map = new Map<string, PhotoRow>();
      if (ids.length === 0) return map;
      const { data, error } = await client
        .from("photos")
        .select("id, school_id, event_id, storage_path, taken_at, deleted_at")
        .in("id", ids);
      if (error) throw new Error(`photos: ${messageOf(error)}`);
      for (const row of (data ?? []) as PhotoRow[]) map.set(row.id, row);
      return map;
    },
    async complete(input) {
      const { data, error } = await client.rpc("complete_photo_job", {
        p_job_id: input.jobId,
        p_ok: input.ok,
        p_error: input.error ?? null,
        p_width: input.width ?? null,
        p_height: input.height ?? null,
        p_thumb_path: input.thumbPath ?? null,
        p_taken_at: input.takenAt ?? null,
      });
      if (error) throw new Error(`complete_photo_job: ${messageOf(error)}`);
      return (data ?? "missing") as CompleteResult;
    },
    async stalledCount() {
      const { count, error } = await client
        .from("stalled_batch_jobs")
        .select("id", { count: "exact", head: true })
        .gt("pending_jobs", 0);
      if (error) throw new Error(`stalled_batch_jobs: ${messageOf(error)}`);
      return count ?? 0;
    },
  };
}
