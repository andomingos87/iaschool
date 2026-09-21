"""Ponto de entrada do face-worker."""

from __future__ import annotations

import signal
import sys
import time
from types import FrameType

from .config import ConfigError, load_config
from .engine import FaceEngine
from .handlers import Deps
from .health import start_health_server
from .logger import configure, logger
from .loop import LoopConfig, Worker
from .queue import SupabaseQueue
from .supabase import SupabaseClient


def main() -> int:
    try:
        cfg = load_config()
    except ConfigError as exc:
        print(f"configuração inválida: {exc}", file=sys.stderr)
        return 2

    configure(cfg.log_level)
    started = time.monotonic()
    # Carregar os modelos antes de abrir o /health: uma máquina que responde
    # 200 sem motor só descobre o problema no primeiro job.
    engine = FaceEngine()
    logger.info(
        "motor carregado",
        extra={"duration_ms": int((time.monotonic() - started) * 1000)},
    )

    api = SupabaseClient(cfg.supabase_url, cfg.service_role_key, cfg.http_timeout_seconds)
    queue = SupabaseQueue(api)
    worker = Worker(
        Deps(queue=queue, api=api, engine=engine),
        LoopConfig(
            claim_batch=cfg.claim_batch,
            lease_seconds=cfg.lease_seconds,
            idle_backoff_min_ms=cfg.idle_backoff_min_ms,
            idle_backoff_max_ms=cfg.idle_backoff_max_ms,
            stall_check_interval_ms=cfg.stall_check_interval_ms,
        ),
    )
    server = start_health_server(cfg.port, worker.state, cfg.loop_stale_ms)
    logger.info("worker no ar", extra={"port": cfg.port})

    def shutdown(_signum: int, _frame: FrameType | None) -> None:
        logger.info("encerrando", extra={"inFlight": worker.state.in_flight})
        worker.stop()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    try:
        worker.run()
    finally:
        server.shutdown()
        api.close()
    logger.info("encerrado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
