// ingest-worker (spec §7.2, §11): um processo, concorrência 8, consome
// `photo_jobs(kind='ingest')` via `claim_photo_jobs`, gera miniatura WebP
// 320px e conclui por `complete_photo_job`. `/health` para a Fly.

import { loadConfig } from "./config";
import { makeHandler } from "./handler";
import { startHealthServer } from "./health";
import { logger } from "./logger";
import { startLoop } from "./loop";
import { makeQueueApi } from "./queue";
import { makeStorage } from "./storage";
import { createWorkerClient } from "./supabase";

async function main(): Promise<void> {
  const cfg = loadConfig();
  logger.level = cfg.logLevel;
  const client = createWorkerClient(cfg);
  const queue = makeQueueApi(client);
  const storage = makeStorage(client);

  // Alerta de lote parado (spec §11): consultado a cada 30 s; falha na
  // consulta mantém o último valor para o /health não oscilar.
  let stalled: number | null = null;
  async function pollStalled(): Promise<void> {
    try {
      stalled = await queue.stalledCount();
      if (stalled > 0) logger.warn({ stalled }, "lotes parados há mais de 10 min com jobs pendentes");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "falha ao consultar stalled_batch_jobs");
    }
  }
  void pollStalled();
  const stallTimer = setInterval(() => void pollStalled(), cfg.stallCheckIntervalMs);

  const loop = startLoop({
    queue,
    handle: makeHandler({ queue, storage, cfg }),
    cfg,
    onError: (err) => logger.error({ err: err instanceof Error ? err.message : String(err) }, "erro no laço da fila"),
  });

  const health = startHealthServer(
    cfg.port,
    {
      inFlight: () => loop.inFlight,
      lastClaimAt: () => loop.lastClaimAt,
      lastTickAt: () => loop.lastTickAt,
      stalledCount: () => stalled,
      stopping: () => loop.stopping,
    },
    { loopStaleMs: cfg.loopStaleMs },
  );

  logger.info(
    { port: cfg.port, concurrency: cfg.concurrency, claimBatch: cfg.claimBatch, leaseSeconds: cfg.leaseSeconds },
    "ingest-worker no ar",
  );

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, inFlight: loop.inFlight }, "encerrando: sem novos claims, aguardando o lote em voo");
    clearInterval(stallTimer);
    await loop.stop();
    await health.close();
    logger.info("ingest-worker encerrado");
    process.exit(0);
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => {
    logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "unhandledRejection");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "falha ao iniciar o ingest-worker");
  process.exit(1);
});
