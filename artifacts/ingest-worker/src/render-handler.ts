// Um job de render, do começo ao fim: baixa a foto do evento, gera o
// arquivo da política registrada no item, sobe no bucket `delivery-assets` e
// conclui no banco. Nunca rejeita: erro vira `complete({ ok: false })` e a
// RPC decide entre devolver à fila (attempts < 5) e falhar de vez.

import type { WorkerConfig } from "./config";
import { assertDeliveryReviewReady, DeliveryImageInvalidError, DeliveryReviewPendingError, renderLocalizedDeliveryAsset } from "./localized-delivery-render";
import { jobLogger } from "./logger";
import { renderOriginalDeliveryAsset } from "./original-delivery-render";
import type { RenderContext, RenderJob, RenderQueueApi } from "./render-queue";
import { DELIVERY_ASSETS_BUCKET, EVENT_PHOTOS_BUCKET, type StorageApi } from "./storage";

export type RenderJobHandler = (
  job: RenderJob,
  context: RenderContext | undefined,
  signal: AbortSignal,
) => Promise<void>;

/** Caminho determinístico do derivado e da miniatura (spec §6.3, passo 5). */
export function assetPathFor(context: RenderContext, attempt = 1): string {
  const policy = context.renderPolicy === "original_v1" ? "original_v1" : `r${context.review.regionsVersion}`;
  return `${context.schoolId}/${context.batchId}/${context.recipientId}/${context.itemId}/v${context.draftVersion}-${policy}-a${attempt}.jpg`;
}

export function thumbPathFor(context: RenderContext, attempt = 1): string {
  return assetPathFor(context, attempt).replace(/\.jpg$/, ".webp");
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
      await safeComplete(deps.queue, log, job.id, { ok: false, error: "render_contexto_indisponivel", leaseVersion: job.lease_version }, started, "missing_context");
      return;
    }

    let attemptedAssetPath: string | undefined;
    let attemptedThumbPath: string | undefined;
    let stage: "download" | "render" | "upload" = "download";
    try {
      if (signal.aborted) throw new Error("job cancelado por timeout");
      if (context.renderPolicy !== "original_v1") assertDeliveryReviewReady(context.review);
      const input = await deps.storage.download(EVENT_PHOTOS_BUCKET, context.photoPath);
      if (signal.aborted) throw new Error("timeout");

      stage = "render";
      const options = {
        blurSigma: deps.cfg.blurSigma,
        jpegQuality: deps.cfg.deliveryJpegQuality,
        thumbSize: deps.cfg.deliveryThumbSize,
        thumbQuality: deps.cfg.thumbQuality,
      };
      const out = context.renderPolicy === "original_v1"
        ? await renderOriginalDeliveryAsset(input, options)
        : await renderLocalizedDeliveryAsset(input, context.review, options);
      if (signal.aborted) throw new Error("job cancelado por timeout");

      const assetPath = assetPathFor(context, job.lease_version);
      const thumbPath = thumbPathFor(context, job.lease_version);
      attemptedAssetPath = assetPath;
      attemptedThumbPath = thumbPath;
      stage = "upload";
      await deps.storage.upload(DELIVERY_ASSETS_BUCKET, assetPath, out.asset, "image/jpeg");
      if (signal.aborted) throw new Error("timeout");
      await deps.storage.upload(DELIVERY_ASSETS_BUCKET, thumbPath, out.thumb, "image/webp");
      if (signal.aborted) throw new Error("timeout");

      await safeComplete(
        deps.queue,
        log,
        job.id,
        {
          ok: true,
          assetPath,
          thumbPath,
          assetHash: out.assetHash,
          leaseVersion: job.lease_version,
          regionsVersion: context.renderPolicy === "original_v1" ? undefined : context.review.regionsVersion,
          renderPolicy: context.renderPolicy,
          draftVersion: context.draftVersion,
          width: out.width,
          height: out.height,
        },
        started,
        "done",
      );
    } catch (err) {
      const code = signal.aborted ? "render_timeout"
        : err instanceof DeliveryReviewPendingError ? "render_revisao_pendente"
        : err instanceof DeliveryImageInvalidError ? "render_imagem_invalida"
        : stage === "download" ? "render_download_falhou"
        : stage === "upload" ? "render_upload_falhou"
        : "render_processamento_falhou";
      await safeComplete(deps.queue, log, job.id, { ok: false, error: code, assetPath: attemptedAssetPath, thumbPath: attemptedThumbPath, regionsVersion: context.renderPolicy === "original_v1" ? undefined : context.review.regionsVersion, draftVersion: context.draftVersion, leaseVersion: job.lease_version, renderPolicy: context.renderPolicy }, started, "error");
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
    log.error({ duration_ms, reason, err: "render_completion_failed" }, "falha ao concluir o render no banco");
  }
}
