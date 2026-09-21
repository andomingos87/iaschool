"""O laço: prioridade da fila de referência, backoff e parada limpa."""

from __future__ import annotations

import threading
from typing import Any

from face_worker.handlers import Deps
from face_worker.loop import LoopConfig, Worker
from face_worker.queue import PhotoRow, RecognizeJob, ReferenceJob

CFG = LoopConfig(
    claim_batch=4,
    lease_seconds=300,
    idle_backoff_min_ms=1,
    idle_backoff_max_ms=4,
    stall_check_interval_ms=0,
)


class ScriptedQueue:
    """Devolve lotes pré-programados e depois fila vazia."""

    def __init__(self, reference: list[list[ReferenceJob]], recognize: list[list[RecognizeJob]]):
        self.reference = list(reference)
        self.recognize = list(recognize)
        self.order: list[str] = []
        self.stalled = 0

    def claim_reference(self, limit: int, lease: int) -> list[ReferenceJob]:
        self.order.append("reference")
        return self.reference.pop(0) if self.reference else []

    def claim_recognize(self, limit: int, lease: int) -> list[RecognizeJob]:
        self.order.append("recognize")
        return self.recognize.pop(0) if self.recognize else []

    def fetch_photos(self, ids: list[str]) -> dict[str, PhotoRow]:
        return {
            i: PhotoRow(id=i, school_id="s1", event_id="e1", storage_path=f"s1/e1/{i}.jpg",
                        faces_count=None, deleted_at=None)
            for i in ids
        }

    def stalled_count(self) -> int:
        return self.stalled

    def settings(self) -> dict[str, Any]:
        return {}


def run_until_idle(worker: Worker, ticks: int = 6) -> None:
    """Roda o laço e para depois de `ticks` esperas de fila vazia."""
    count = {"n": 0}

    def fake_sleep(_seconds: float, _stop: threading.Event) -> None:
        count["n"] += 1
        if count["n"] >= ticks:
            worker.stop()

    worker._sleep = fake_sleep  # noqa: SLF001 — injeção de teste
    worker.run()


def test_referencia_tem_prioridade_sobre_reconhecimento(monkeypatch):
    processed: list[str] = []
    monkeypatch.setattr(
        "face_worker.loop.handle_reference",
        lambda job, deps: processed.append(f"ref:{job.id}") or _ref_outcome(),
    )
    monkeypatch.setattr(
        "face_worker.loop.handle_recognize",
        lambda job, photo, deps: processed.append(f"rec:{job.id}") or _rec_outcome(),
    )
    ref = ReferenceJob(id="j1", school_id="s1", student_id="al1", storage_path="p", attempts=1)
    rec = RecognizeJob(id=1, photo_id="p1", batch_id="b1", attempts=1)
    queue = ScriptedQueue([[ref]], [[rec]])
    worker = Worker(Deps(queue=queue, api=None, engine=None), CFG)

    run_until_idle(worker, ticks=2)

    # A fila de referência é consultada primeiro e, enquanto tiver trabalho,
    # o reconhecimento nem é chamado naquele giro.
    assert processed[0] == "ref:j1"
    assert "rec:1" in processed
    assert queue.order[0] == "reference"


def test_erro_em_um_job_nao_derruba_o_laco(monkeypatch):
    def explode(job, deps):
        raise RuntimeError("boom")

    completed: list[Any] = []
    monkeypatch.setattr("face_worker.loop.handle_reference", explode)
    monkeypatch.setattr("face_worker.loop.handle_recognize", lambda *a: _rec_outcome())

    ref = ReferenceJob(id="j1", school_id="s1", student_id="al1", storage_path="p", attempts=1)
    queue = ScriptedQueue([[ref]], [])
    queue.complete_reference = lambda *a, **k: completed.append(a) or "requeued"
    worker = Worker(Deps(queue=queue, api=None, engine=None), CFG)

    run_until_idle(worker, ticks=2)

    # O job volta para a fila e o laço segue vivo.
    assert completed
    assert worker.state.in_flight == 0


def test_stop_encerra_o_laco():
    queue = ScriptedQueue([], [])
    worker = Worker(Deps(queue=queue, api=None, engine=None), CFG)
    run_until_idle(worker, ticks=1)
    assert worker.state.stopping is True


def test_lote_parado_chega_ao_health():
    queue = ScriptedQueue([], [])
    queue.stalled = 3
    worker = Worker(Deps(queue=queue, api=None, engine=None), CFG)
    run_until_idle(worker, ticks=1)
    assert worker.state.stalled == 3


class _Outcome:
    def __init__(self, **kw: Any) -> None:
        self.__dict__.update(kw)


def _ref_outcome() -> _Outcome:
    return _Outcome(result="done", faces=1)


def _rec_outcome() -> _Outcome:
    return _Outcome(result="done", faces=2, suggested=1)
