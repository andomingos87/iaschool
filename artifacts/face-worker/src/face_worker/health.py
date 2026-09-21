"""GET /health (spec §11).

200 quando o laço está vivo e nenhum lote está parado; 503 com o motivo caso
contrário. A Fly usa isto para reiniciar a máquina — por isso lote abandonado
pelo cliente (sem job pendente) NÃO derruba o health: a view
`stalled_batch_jobs` já filtra por `pending_jobs`.
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .loop import LoopState


def health_report(state: LoopState, loop_stale_ms: int, now: float | None = None) -> tuple[int, dict[str, Any]]:
    now = time.time() if now is None else now
    loop_age_ms = int((now - state.last_tick_at) * 1000)
    base: dict[str, Any] = {
        "inFlight": state.in_flight,
        "lastClaimAt": state.last_claim_at,
        "loopAgeMs": loop_age_ms,
        "stalled": state.stalled or 0,
    }
    if state.stopping:
        return 503, {"ok": False, "reason": "stopping", **base}
    if loop_age_ms > loop_stale_ms:
        return 503, {"ok": False, "reason": "loop_stale", **base}
    if (state.stalled or 0) > 0:
        return 503, {"ok": False, "reason": "stalled_batches", **base}
    return 200, {"ok": True, **base}


def start_health_server(
    port: int, state: LoopState, loop_stale_ms: int, host: str = "0.0.0.0"
) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 — assinatura da stdlib
            if self.path not in ("/health", "/health/"):
                self._send(404, {"ok": False, "reason": "not_found"})
                return
            status, body = health_report(state, loop_stale_ms)
            self._send(status, body)

        def _send(self, status: int, body: dict[str, Any]) -> None:
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_: Any) -> None:
            """O log do servidor HTTP sai pelo logger estruturado, não por stderr."""

    server = ThreadingHTTPServer((host, port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True, name="health").start()
    return server
