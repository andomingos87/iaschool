import time

from face_worker.health import health_report
from face_worker.loop import LoopState


def test_ok_quando_o_laco_esta_vivo():
    state = LoopState(last_tick_at=time.time(), stalled=0)
    status, body = health_report(state, loop_stale_ms=60_000)
    assert status == 200
    assert body["ok"] is True


def test_503_quando_o_laco_trava():
    state = LoopState(last_tick_at=time.time() - 300, stalled=0)
    status, body = health_report(state, loop_stale_ms=60_000)
    assert status == 503
    assert body["reason"] == "loop_stale"


def test_503_com_lote_parado():
    state = LoopState(last_tick_at=time.time(), stalled=2)
    status, body = health_report(state, loop_stale_ms=60_000)
    assert status == 503
    assert body["reason"] == "stalled_batches"


def test_503_durante_o_encerramento():
    state = LoopState(last_tick_at=time.time(), stalled=0, stopping=True)
    status, body = health_report(state, loop_stale_ms=60_000)
    assert status == 503
    assert body["reason"] == "stopping"
