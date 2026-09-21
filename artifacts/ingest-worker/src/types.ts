/** Linha de `public.photo_jobs` como o PostgREST devolve. */
export interface PhotoJob {
  id: number;
  batch_id: string;
  photo_id: string;
  kind: "ingest" | "recognize";
  status: "queued" | "leased" | "done" | "failed";
  attempts: number;
  leased_until: string | null;
  last_error: string | null;
  created_at: string;
}

/** Só as colunas de `public.photos` que o worker precisa. */
export interface PhotoRow {
  id: string;
  school_id: string;
  event_id: string;
  storage_path: string;
  taken_at: string | null;
  deleted_at: string | null;
}

/** Retorno de `complete_photo_job`. */
export type CompleteResult = "done" | "failed" | "requeued" | "noop" | "missing";

export interface CompleteInput {
  jobId: number;
  ok: boolean;
  error?: string;
  width?: number;
  height?: number;
  thumbPath?: string;
  takenAt?: string;
}
