// Laço da fila de render: reivindica `delivery_render_jobs`, monta o contexto
// por job (foto, filhos do responsável e rostos) e processa com concorrência
// limitada. Mesma semântica do laço principal: fila vazia → espera crescente;
// SIGTERM → termina o que está em voo.

import type { WorkerConfig } from "./config";
import { defaultSleep } from "./loop";
import type { RenderContext, RenderJob, RenderQueueApi } from "./render-queue";
import type { RenderJobHandler } from "./render-handler";
import { runLimited } from "./semaphore";

export interface RenderLoopDeps {
  queue: RenderQueueApi;
  /** Processa E conclui o job (ok ou erro). Nunca deve rejeitar. */
  handle: RenderJobHandler;
  cfg: Pick<
    WorkerConfig,
    "concurrency" | "claimBatch" | "leaseSeconds" | "idleBackoffMinMs" | "idleBackoffMaxMs" | "jobTimeoutMs"
  >;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  onError?: (err: unknown) => void;
}

export interface RenderLoopHandle {
  stop(): Promise<void>;
  readonly inFlight: number;
  readonly lastTickAt: number;
  readonly stopping: boolean;
}

export function startRenderLoop(deps: RenderLoopDeps): RenderLoopHandle {
  const sleep = deps.sleep ?? defaultSleep;
  const stopController = new AbortController();
  let inFlight = 0;
  let lastTickAt = Date.now();
  let stopping = false;

  const finished = (async () => {
    let backoff = deps.cfg.idleBackoffMinMs;
    while (!stopping) {
      lastTickAt = Date.now();
      let jobs: RenderJob[] = [];
      try {
        jobs = await deps.queue.claim(deps.cfg.claimBatch, deps.cfg.leaseSeconds);
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

      let contexts = new Map<number, RenderContext>();
      try {
        contexts = await deps.queue.fetchContext(jobs);
      } catch (err) {
        // Sem contexto o handler conclui cada job como falha transitória.
        deps.onError?.(err);
      }

      await runLimited(jobs, deps.cfg.concurrency, async (job) => {
        inFlight++;
        const timeout = AbortSignal.timeout(deps.cfg.jobTimeoutMs);
        try {
          await deps.handle(job, contexts.get(job.id), timeout);
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
    get lastTickAt() {
      return lastTickAt;
    },
    get stopping() {
      return stopping;
    },
  };
}
