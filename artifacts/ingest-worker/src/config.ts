// Configuração do worker por variáveis de ambiente. Só duas são obrigatórias;
// o resto tem os padrões da spec §7.2/§11 (concorrência 8, miniatura 320px).

export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Porta do /health (Fly: internal_port 8080). */
  port: number;
  /** Jobs processados ao mesmo tempo (spec §7.2: 8). */
  concurrency: number;
  /** Jobs reivindicados por chamada de `claim_photo_jobs`. */
  claimBatch: number;
  /** Lease do job; expirou sem `complete` → outro worker pode repegar. */
  leaseSeconds: number;
  /** Teto por job (download + sharp + upload); acima disso conta como falha. */
  jobTimeoutMs: number;
  /** Espera quando a fila está vazia: começa em min e dobra até max. */
  idleBackoffMinMs: number;
  idleBackoffMaxMs: number;
  /** De quanto em quanto tempo consulta `stalled_batch_jobs`. */
  stallCheckIntervalMs: number;
  /** Sem tick do laço por mais que isto, /health responde 503. */
  loopStaleMs: number;
  thumbSize: number;
  thumbQuality: number;
  logLevel: string;
}

const DEFAULTS = {
  PORT: 8080,
  WORKER_CONCURRENCY: 8,
  CLAIM_BATCH: 16,
  LEASE_SECONDS: 120,
  JOB_TIMEOUT_MS: 60_000,
  IDLE_BACKOFF_MIN_MS: 1_000,
  IDLE_BACKOFF_MAX_MS: 5_000,
  STALL_CHECK_INTERVAL_MS: 30_000,
  LOOP_STALE_MS: 60_000,
  THUMB_SIZE: 320,
  THUMB_QUALITY: 80,
} as const;

function intFrom(env: NodeJS.ProcessEnv, key: keyof typeof DEFAULTS): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return DEFAULTS[key];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} inválido: "${raw}" (esperado inteiro positivo)`);
  }
  return Math.floor(n);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
  return {
    supabaseUrl: env.SUPABASE_URL!,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    port: intFrom(env, "PORT"),
    concurrency: intFrom(env, "WORKER_CONCURRENCY"),
    claimBatch: intFrom(env, "CLAIM_BATCH"),
    leaseSeconds: intFrom(env, "LEASE_SECONDS"),
    jobTimeoutMs: intFrom(env, "JOB_TIMEOUT_MS"),
    idleBackoffMinMs: intFrom(env, "IDLE_BACKOFF_MIN_MS"),
    idleBackoffMaxMs: intFrom(env, "IDLE_BACKOFF_MAX_MS"),
    stallCheckIntervalMs: intFrom(env, "STALL_CHECK_INTERVAL_MS"),
    loopStaleMs: intFrom(env, "LOOP_STALE_MS"),
    thumbSize: intFrom(env, "THUMB_SIZE"),
    thumbQuality: intFrom(env, "THUMB_QUALITY"),
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
