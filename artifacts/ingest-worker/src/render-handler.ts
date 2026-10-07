// Um job de render, do começo ao fim: baixa a foto do evento, gera o
// derivado desfocado por destinatário, sobe no bucket `delivery-assets` e
// conclui no banco. Nunca rejeita: erro vira `complete({ ok: false })` e a
// RPC decide entre devolver à fila (attempts < 5) e falhar de vez.

import type { WorkerConfig } from "./config";
import { renderDeliveryAsset } from "./delivery-render";
import { errorMessage } from "./handler";
import { jobLogger } from "./logger";
import type { RenderContext, RenderJob, RenderQueueApi } from "./render-queue";
import { DELIVERY_ASSETS_BUCKET, EVENT_PHOTOS_BUCKET, type StorageApi } from "./storage";

export type RenderJobHandler = (
  job: RenderJob,
  context: RenderContext | undefined,
  signal: AbortSignal,
) => Promise<void>;

/** Caminho determinístico do derivado e da miniatura (spec §6.3, passo 5). */
export function assetPathFor(context: Pick<RenderContext, "schoolId" | "batchId" | "recipientId" | "itemId">): string {
  return `${context.schoolId}/${context.batchId}/${context.recipientId}/${context.itemId}.jpg`;
}

export function thumbPathFor(context: Pick<RenderContext, "schoolId" | "batchId" | "recipientId" | "itemId">): string {
  return `${context.schoolId}/${context.batchId}/${context.recipientId}/${context.itemId}.webp`;
}

export function makeRenderHandler(deps: {
  queue: RenderQueueApi;
  storage: StorageApi;
  cfg: Pick<
    WorkerConfig,
    "blurSigma" | "deliveryThumbSize" | "deliveryJpegQuality" | "thumbQuality"
  >;
}): RenderJobHandler {
  return async (job, context, signal) => {
    const log = jobLogger({ batch_id: job.batch_id, item_id: job.item_id, job_id: job.id, attempt: job.attempts });
    const started = performance.now();

    if (!context) {
      await safeComplete(deps.queue, log, job.id, { ok: false, error: "contexto não encontrado" }, started, "missing_context");
      return;
    }

    try {
      if (signal.aborted) throw new Error("job cancelado por timeout");
      const input = await deps.storage.download(EVENT_PHOTOS_BUCKET, context.photoPath);

      const out = await renderDeliveryAsset(input, context.sharpBoxes, {
        blurSigma: deps.cfg.blurSigma,
        jpegQuality: deps.cfg.deliveryJpegQuality,
        thumbSize: deps.cfg.deliveryThumbSize,
        thumbQuality: deps.cfg.thumbQuality,
      });
      if (signal.aborted) throw new Error("job cancelado por timeout");

      const assetPath = assetPathFor(context);
      const thumbPath = thumbPathFor(context);
      await deps.storage.upload(DELIVERY_ASSETS_BUCKET, assetPath, out.asset, "image/jpeg");
      await deps.storage.upload(DELIVERY_ASSETS_BUCKET, thumbPath, out.thumb, "image/webp");

      await safeComplete(
        deps.queue,
        log,
        job.id,
        {
          ok: true,
          assetPath,
          thumbPath,
          assetHash: out.assetHash,
          width: out.width,
          height: out.height,
        },
        started,
        "done",
      );
    } catch (err) {
      await safeComplete(deps.queue, log, job.id, { ok: false, error: errorMessage(err) }, started, "error");
    }
  };
}

async function safeComplete(
  queue: RenderQueueApi,
  log: ReturnType<typeof jobLogger>,
  jobId: number,
  input: Omit<Parameters<RenderQueueApi["complete"]>[0], "jobId">,
  started: number,
  reason: string,
): Promise<void> {
  const duration_ms = Math.round(performance.now() - started);
  try {
    const result = await queue.complete({ jobId, ...input });
    const fields = { duration_ms, result, reason, ...(input.error ? { err: input.error } : {}) };
    if (result === "failed" || reason === "error") log.warn(fields, "render concluído com erro");
    else log.info(fields, "render concluído");
  } catch (err) {
    // O lease expira e outro claim repega; nada a fazer além de logar.
    log.error({ duration_ms, reason, err: errorMessage(err) }, "falha ao concluir o render no banco");
  }
}
