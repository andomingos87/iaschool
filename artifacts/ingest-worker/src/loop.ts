// Laço principal: reivindica um lote de jobs, processa com concorrência
// limitada, repete. Fila vazia → espera crescente (1 s → 5 s). SIGTERM →
// para de reivindicar, termina o que está em voo e devolve.

import type { WorkerConfig } from "./config";
import type { QueueApi } from "./queue";
import { runLimited } from "./semaphore";
import type { PhotoJob, PhotoRow } from "./types";

export type JobHandler = (job: PhotoJob, photo: PhotoRow | undefined, signal: AbortSignal) => Promise<void>;

export interface LoopDeps {
  queue: QueueApi;
  /** Processa E conclui o job (ok ou erro). Nunca deve rejeitar. */
  handle: JobHandler;
  cfg: Pick<
    WorkerConfig,
    "concurrency" | "claimBatch" | "leaseSeconds" | "idleBackoffMinMs" | "idleBackoffMaxMs" | "jobTimeoutMs"
  >;
  /** Injetável nos testes. Deve resolver cedo quando `signal` abortar. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  onError?: (err: unknown) => void;
}

export interface LoopHandle {
  /** Para de reivindicar e espera o lote em voo terminar. */
  stop(): Promise<void>;
  readonly inFlight: number;
  readonly lastClaimAt: number | null;
  readonly lastTickAt: number;
  readonly stopping: boolean;
}

export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export function startLoop(deps: LoopDeps): LoopHandle {
  const sleep = deps.sleep ?? defaultSleep;
  const stopController = new AbortController();
  let inFlight = 0;
  let lastClaimAt: number | null = null;
  let lastTickAt = Date.now();
  let stopping = false;

  const finished = (async () => {
    let backoff = deps.cfg.idleBackoffMinMs;
    while (!stopping) {
      lastTickAt = Date.now();
      let jobs: PhotoJob[] = [];
      try {
        jobs = await deps.queue.claim("ingest", deps.cfg.claimBatch, deps.cfg.leaseSeconds);
        lastClaimAt = Date.now();
      } catch (err) {
        deps.onError?.(err);
        await sleep(backoff, stopController.signal);
        backoff = Math.min(backoff * 2, deps.cfg.idleBackoffMaxMs);
        continue;
      }
      if (stopping) break;
      if (jobs.length === 0) {
        await sleep(backoff, stopController.signal);
        backoff = Math.min(backoff * 2, deps.cfg.idleBackoffMaxMs);
        continue;
      }
      backoff = deps.cfg.idleBackoffMinMs;

      let photos = new Map<string, PhotoRow>();
      try {
        photos = await deps.queue.fetchPhotos([...new Set(jobs.map((j) => j.photo_id))]);
      } catch (err) {
        // Sem as fotos o handler devolve cada job à fila (foto undefined + erro).
        deps.onError?.(err);
      }

      await runLimited(jobs, deps.cfg.concurrency, async (job) => {
        inFlight++;
        const timeout = AbortSignal.timeout(deps.cfg.jobTimeoutMs);
        try {
          await deps.handle(job, photos.get(job.photo_id), timeout);
        } finally {
          inFlight--;
        }
      });
    }
  })();

  return {
    async stop() {
      stopping = true;
      stopController.abort();
      await finished;
    },
    get inFlight() {
      return inFlight;
    },
    get lastClaimAt() {
      return lastClaimAt;
    },
    get lastTickAt() {
      return lastTickAt;
    },
    get stopping() {
      return stopping;
    },
  };
}
