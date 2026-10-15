// Camada da fila `delivery_render_jobs` para o worker (padrão do M3).
// Injetável nos testes; os selects de contexto usam `service_role`.

import type { WorkerClient } from "./supabase";
import type { CompleteResult } from "./types";
import type { LocalizedReview } from "./localized-delivery-render";

export interface RenderJob {
  id: number;
  item_id: string;
  batch_id: string;
  status: "queued" | "leased" | "done" | "failed";
  attempts: number;
  lease_version: number;
  leased_until: string | null;
  last_error: string | null;
  created_at: string;
}

/** Tudo o que o handler precisa para renderizar um item. */
interface RenderContextBase {
  itemId: string;
  batchId: string;
  schoolId: string;
  eventId: string;
  recipientId: string;
  photoPath: string;
  draftVersion: number;
}

export type RenderContext = RenderContextBase & (
  | { renderPolicy: "original_v1"; review?: never }
  | { renderPolicy?: "protected_regions_v1"; review: LocalizedReview }
);

export interface RenderCompleteInput {
  jobId: number;
  ok: boolean;
  error?: string;
  assetPath?: string;
  thumbPath?: string;
  assetHash?: string;
  width?: number;
  height?: number;
  leaseVersion?: number;
  regionsVersion?: number;
  draftVersion?: number;
  renderPolicy?: "original_v1" | "protected_regions_v1";
}

export interface RenderQueueApi {
  /** `claim_delivery_render_jobs`: reserva jobs de lotes `preparing`. */
  claim(limit: number, leaseSeconds: number): Promise<RenderJob[]>;
  /** Contexto por job: item, foto, filhos do responsável e rostos da foto. */
  fetchContext(jobs: RenderJob[]): Promise<Map<number, RenderContext>>;
  complete(input: RenderCompleteInput): Promise<CompleteResult>;
}

function messageOf(error: { message: string } | null): string {
  return error?.message ?? "erro desconhecido";
}


export function makeRenderQueueApi(client: WorkerClient): RenderQueueApi {
  return {
    async claim(limit, leaseSeconds) {
      const { data, error } = await client.rpc("claim_delivery_render_jobs", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(`claim_delivery_render_jobs: ${messageOf(error)}`);
      return (data ?? []) as RenderJob[];
    },

    async fetchContext(jobs) {
      const out = new Map<number, RenderContext>();
      if (jobs.length === 0) return out;

      const { data, error } = await client.rpc("delivery_render_contexts", { p_job_ids: jobs.map(job => job.id) });
      if (error) throw new Error("contexto de render indisponível");
      for (const job of jobs) {
        const context = (data as Record<string, RenderContext> | null)?.[String(job.id)];
        if (context) out.set(job.id, context);
      }
      return out;
    },

    async complete(input) {
      const { data, error } = await client.rpc("complete_delivery_render_job", {
        p_job_id: input.jobId,
        p_ok: input.ok,
        p_error: input.error ?? null,
        p_asset_path: input.assetPath ?? null,
        p_thumb_path: input.thumbPath ?? null,
        p_asset_hash: input.assetHash ?? null,
        p_width: input.width ?? null,
        p_height: input.height ?? null,
        p_regions_version: input.regionsVersion ?? null,
        p_draft_version: input.draftVersion ?? null,
        p_lease_version: input.leaseVersion ?? null,
        p_render_policy: input.renderPolicy ?? null,
      });
      if (error) throw new Error(`complete_delivery_render_job: ${messageOf(error)}`);
      return (data ?? "missing") as CompleteResult;
    },
  };
}
