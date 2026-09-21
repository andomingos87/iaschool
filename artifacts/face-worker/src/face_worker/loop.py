"""Laço principal (spec §7.3, §11).

**Um processo, um job de cada vez.** Não é simplificação: o spike mediu 1, 4 e
8 processos com a MESMA vazão agregada, porque o `onnxruntime` já satura os
núcleos dentro de uma sessão. Concorrência aqui só criaria disputa por CPU e
lease vencido. Escala-se com mais máquinas.

A fila de referência vem primeiro: ela destrava o cadastro da escola, é curta,
e sem referência o reconhecimento não tem contra o que comparar.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable

from .handlers import Deps, handle_recognize, handle_reference
from .logger import logger
from .supabase import SupabaseError


@dataclass
class LoopConfig:
    claim_batch: int
    lease_seconds: int
    idle_backoff_min_ms: int
    idle_backoff_max_ms: int
    stall_check_interval_ms: int


@dataclass
class LoopState:
    """O que o /health lê. Só contadores — nada identificável."""

    last_tick_at: float = field(default_factory=time.time)
    last_claim_at: float | None = None
    in_flight: int = 0
    stalled: int | None = None
    stopping: bool = False


class Worker:
    def __init__(
        self,
        deps: Deps,
        cfg: LoopConfig,
        sleep: Callable[[float, threading.Event], None] | None = None,
    ) -> None:
        self.deps = deps
        self.cfg = cfg
        self.state = LoopState()
        self._stop = threading.Event()
        self._sleep = sleep or _default_sleep
        self._last_stall_check = 0.0

    def stop(self) -> None:
        self.state.stopping = True
        self._stop.set()

    def run(self) -> None:
        backoff = self.cfg.idle_backoff_min_ms
        while not self._stop.is_set():
            self.state.last_tick_at = time.time()
            self._refresh_stalled()
            try:
                did_work = self._drain_reference() or self._drain_recognize()
            except SupabaseError as exc:
                # Erro de infraestrutura: espera e tenta de novo. O job volta
                # sozinho quando o lease vence.
                logger.warning("falha ao falar com o supabase", extra={"result": "retry"})
                logger.debug(str(exc))
                did_work = False
            except Exception:  # noqa: BLE001 — o laço não pode morrer por um job
                logger.exception("erro inesperado no laço", extra={"result": "error"})
                did_work = False

            if did_work:
                backoff = self.cfg.idle_backoff_min_ms
                continue
            self._sleep(backoff / 1000, self._stop)
            backoff = min(backoff * 2, self.cfg.idle_backoff_max_ms)

    # ---------- filas ----------

    def _drain_reference(self) -> bool:
        jobs = self.deps.queue.claim_reference(self.cfg.claim_batch, self.cfg.lease_seconds)
        if not jobs:
            return False
        self.state.last_claim_at = time.time()
        for job in jobs:
            if self._stop.is_set():
                break
            started = time.monotonic()
            self.state.in_flight += 1
            try:
                outcome = handle_reference(job, self.deps)
                logger.info(
                    "referência processada",
                    extra={
                        "queue": "reference",
                        "job_id": job.id,
                        "student_id": job.student_id,
                        "attempt": job.attempts,
                        "faces": outcome.faces,
                        "result": outcome.result,
                        "duration_ms": _elapsed_ms(started),
                    },
                )
            except SupabaseError as exc:
                self._fail_reference(job, exc, started)
            except Exception as exc:  # noqa: BLE001
                self._fail_reference(job, exc, started)
            finally:
                self.state.in_flight -= 1
        return True

    def _fail_reference(self, job, exc: Exception, started: float) -> None:
        try:
            self.deps.queue.complete_reference(
                job.id, False, error="falha ao processar a foto; tentando de novo"
            )
        except Exception:  # noqa: BLE001 — lease vencido devolve o job sozinho
            pass
        logger.warning(
            "referência falhou",
            extra={
                "queue": "reference",
                "job_id": job.id,
                "student_id": job.student_id,
                "attempt": job.attempts,
                "result": "error",
                "error_type": type(exc).__name__,
                "duration_ms": _elapsed_ms(started),
            },
        )

    def _drain_recognize(self) -> bool:
        jobs = self.deps.queue.claim_recognize(self.cfg.claim_batch, self.cfg.lease_seconds)
        if not jobs:
            return False
        self.state.last_claim_at = time.time()
        photos = self.deps.queue.fetch_photos(sorted({j.photo_id for j in jobs}))
        for job in jobs:
            if self._stop.is_set():
                break
            started = time.monotonic()
            self.state.in_flight += 1
            try:
                outcome = handle_recognize(job, photos.get(job.photo_id), self.deps)
                logger.info(
                    "foto reconhecida",
                    extra={
                        "queue": "recognize",
                        "job_id": job.id,
                        "photo_id": job.photo_id,
                        "batch_id": job.batch_id,
                        "attempt": job.attempts,
                        "faces": outcome.faces,
                        "suggested": outcome.suggested,
                        "result": outcome.result,
                        "duration_ms": _elapsed_ms(started),
                    },
                )
            except Exception as exc:  # noqa: BLE001
                try:
                    self.deps.queue.complete_recognize(
                        job.id, False, None, "falha ao processar a foto"
                    )
                except Exception:  # noqa: BLE001
                    pass
                logger.warning(
                    "foto falhou",
                    extra={
                        "queue": "recognize",
                        "job_id": job.id,
                        "photo_id": job.photo_id,
                        "batch_id": job.batch_id,
                        "attempt": job.attempts,
                        "result": "error",
                        "error_type": type(exc).__name__,
                        "duration_ms": _elapsed_ms(started),
                    },
                )
            finally:
                self.state.in_flight -= 1
        return True

    def _refresh_stalled(self) -> None:
        now = time.monotonic()
        if now - self._last_stall_check < self.cfg.stall_check_interval_ms / 1000:
            return
        self._last_stall_check = now
        try:
            self.state.stalled = self.deps.queue.stalled_count()
        except Exception:  # noqa: BLE001 — health degrada, laço continua
            self.state.stalled = None


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _default_sleep(seconds: float, stop: threading.Event) -> None:
    stop.wait(seconds)
