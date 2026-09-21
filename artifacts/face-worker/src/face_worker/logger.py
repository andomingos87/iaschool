"""Log estruturado em JSON (spec §11).

Vão `job_id`, `photo_id`, `batch_id`, `attempt`, `duration_ms`, `result` e a
contagem de rostos. **Nunca** vai nome de arquivo, nome de aluno, URL assinada,
recorte ou embedding — o log de um worker que processa imagem de menor é o
lugar mais fácil de vazar dado sem perceber.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

SERVICE = "face-worker"

# Campos que o `logging` põe em todo registro e que não interessam à saída.
_RESERVED = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "module", "msecs", "message", "msg", "name",
    "pathname", "process", "processName", "relativeCreated", "stack_info",
    "thread", "threadName", "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "service": SERVICE,
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            # Só o tipo e a mensagem: stack trace de OpenCV pode carregar caminho
            # de arquivo, que é nome de foto de aluno.
            exc = record.exc_info[1]
            payload["error"] = f"{type(exc).__name__}: {exc}"
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure(level: str = "INFO") -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger(SERVICE)
    root.handlers = [handler]
    root.setLevel(level)
    root.propagate = False
    return root


logger = logging.getLogger(SERVICE)
