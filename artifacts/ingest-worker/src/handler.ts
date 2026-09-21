// Um job de ingest, do começo ao fim: processa a foto e conclui no banco.
// Nunca rejeita: erro vira `complete({ ok: false })` e a RPC decide entre
// devolver à fila (attempts < 5) e marcar como falha definitiva.

import type { WorkerConfig } from "./config";
import { jobLogger } from "./logger";
import { processPhoto } from "./process-photo";
import type { QueueApi } from "./queue";
import type { StorageApi } from "./storage";
import type { JobHandler } from "./loop";

/** Mensagem curta e sem dado pessoal para `photo_jobs.last_error`. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\s+/g, " ").trim().slice(0, 500) || "erro desconhecido";
}

export function makeHandler(deps: {
  queue: QueueApi;
  storage: StorageApi;
  cfg: Pick<WorkerConfig, "thumbSize" | "thumbQuality">;
}): JobHandler {
  return async (job, photo, signal) => {
    const log = jobLogger({ batch_id: job.batch_id, photo_id: job.photo_id, job_id: job.id, attempt: job.attempts });
    const started = performance.now();

    if (!photo) {
      // Sem a linha de photos (falha na busca em lote ou foto apagada de vez):
      // devolve à fila para a próxima tentativa decidir.
      await safeComplete(deps.queue, log, { jobId: job.id, ok: false, error: "foto não encontrada" }, started, "missing_photo");
      return;
    }
    if (photo.deleted_at) {
      // Foto na lixeira: nada a gerar, o job fecha como feito.
      await safeComplete(deps.queue, log, { jobId: job.id, ok: true }, started, "skipped_deleted");
      return;
    }

    try {
      const out = await processPhoto(deps.storage, photo, {
        thumbSize: deps.cfg.thumbSize,
        thumbQuality: deps.cfg.thumbQuality,
        signal,
      });
      await safeComplete(
        deps.queue,
        log,
        {
          jobId: job.id,
          ok: true,
          width: out.width,
          height: out.height,
          thumbPath: out.thumbPath,
          takenAt: out.takenAt,
        },
        started,
        "done",
      );
    } catch (err) {
      await safeComplete(deps.queue, log, { jobId: job.id, ok: false, error: errorMessage(err) }, started, "error");
    }
  };
}

async function safeComplete(
  queue: QueueApi,
  log: ReturnType<typeof jobLogger>,
  input: Parameters<QueueApi["complete"]>[0],
  started: number,
  reason: string,
): Promise<void> {
  const duration_ms = Math.round(performance.now() - started);
  try {
    const result = await queue.complete(input);
    const fields = { duration_ms, result, reason, ...(input.error ? { err: input.error } : {}) };
    if (result === "failed" || reason === "error") log.warn(fields, "job concluído com erro");
    else log.info(fields, "job concluído");
  } catch (err) {
    // O lease expira e outro claim repega o job; nada a fazer aqui além de logar.
    log.error({ duration_ms, reason, err: errorMessage(err) }, "falha ao concluir o job no banco");
  }
}
