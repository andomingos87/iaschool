import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "./config";

export type WorkerClient = SupabaseClient;

/**
 * Cliente com a service role: ignora RLS, é o único caminho para
 * `photo_jobs`, `claim_photo_jobs` e `complete_photo_job` (spec §8). A chave
 * só existe aqui e no api-server; nunca no navegador.
 */
export function createWorkerClient(cfg: Pick<WorkerConfig, "supabaseUrl" | "serviceRoleKey">): WorkerClient {
  return createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "iaschool-ingest-worker" } },
  });
}
