// Camada da fila `delivery_render_jobs` para o worker (padrão do M3).
// Injetável nos testes; os selects de contexto usam `service_role`.

import type { WorkerClient } from "./supabase";
import type { CompleteResult } from "./types";
import { parseBoxes, type RenderBox } from "./delivery-render";

export interface RenderJob {
  id: number;
  item_id: string;
  batch_id: string;
  status: "queued" | "leased" | "done" | "failed";
  attempts: number;
  leased_until: string | null;
  last_error: string | null;
  created_at: string;
}

/** Tudo o que o handler precisa para renderizar um item. */
export interface RenderContext {
  itemId: string;
  batchId: string;
  schoolId: string;
  eventId: string;
  recipientId: string;
  photoPath: string;
  /** Rostos que ficam nítidos para este destinatário. */
  sharpBoxes: RenderBox[];
}

export interface RenderCompleteInput {
  jobId: number;
  ok: boolean;
  error?: string;
  assetPath?: string;
  thumbPath?: string;
  assetHash?: string;
  width?: number;
  height?: number;
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

type Row = Record<string, unknown>;

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

      const itemIds = [...new Set(jobs.map((j) => j.item_id))];
      const { data: items, error: itemsError } = await client
        .from("delivery_items")
        .select("id, photo_id, recipient_id")
        .in("id", itemIds);
      if (itemsError) throw new Error(`delivery_items: ${messageOf(itemsError)}`);

      const photoIds = [...new Set((items ?? []).map((i: Row) => i["photo_id"] as string))];
      const recipientIds = [...new Set((items ?? []).map((i: Row) => i["recipient_id"] as string))];
      if (photoIds.length === 0 || recipientIds.length === 0) return out;

      const [photos, links, faces] = await Promise.all([
        client
          .from("photos")
          .select("id, school_id, event_id, storage_path")
          .in("id", photoIds),
        client
          .from("delivery_recipient_students")
          .select("recipient_id, student_id")
          .in("recipient_id", recipientIds),
        client
          .from("photo_faces")
          .select("photo_id, bbox, state, student_id")
          .in("photo_id", photoIds),
      ]);
      if (photos.error) throw new Error(`photos: ${messageOf(photos.error)}`);
      if (links.error) throw new Error(`delivery_recipient_students: ${messageOf(links.error)}`);
      if (faces.error) throw new Error(`photo_faces: ${messageOf(faces.error)}`);

      const childrenByRecipient = new Map<string, Set<string>>();
      for (const link of links.data ?? []) {
        const recipientId = link["recipient_id"] as string;
        const set = childrenByRecipient.get(recipientId) ?? new Set<string>();
        set.add(link["student_id"] as string);
        childrenByRecipient.set(recipientId, set);
      }

      const photoById = new Map<string, Row>();
      for (const photo of photos.data ?? []) photoById.set(photo["id"] as string, photo);

      const facesByPhoto = new Map<string, Row[]>();
      for (const face of faces.data ?? []) {
        const photoId = face["photo_id"] as string;
        const list = facesByPhoto.get(photoId) ?? [];
        list.push(face);
        facesByPhoto.set(photoId, list);
      }

      for (const job of jobs) {
        const item = (items ?? []).find((i: Row) => i["id"] === job.item_id);
        if (!item) continue;
        const photo = photoById.get(item["photo_id"] as string);
        if (!photo) continue;
        const children = childrenByRecipient.get(item["recipient_id"] as string) ?? new Set<string>();

        const sharpBoxes: RenderBox[] = [];
        for (const face of facesByPhoto.get(item["photo_id"] as string) ?? []) {
          const state = face["state"] as string;
          const studentId = face["student_id"] as string | null;
          const keep =
            (state === "confirmed" && studentId !== null && children.has(studentId)) ||
            state === "adult_or_staff";
          if (!keep) continue;
          sharpBoxes.push(...parseBoxes([face["bbox"]]));
        }

        out.set(job.id, {
          itemId: job.item_id,
          batchId: job.batch_id,
          schoolId: photo["school_id"] as string,
          eventId: photo["event_id"] as string,
          recipientId: item["recipient_id"] as string,
          photoPath: photo["storage_path"] as string,
          sharpBoxes,
        });
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
      });
      if (error) throw new Error(`complete_delivery_render_job: ${messageOf(error)}`);
      return (data ?? "missing") as CompleteResult;
    },
  };
}
