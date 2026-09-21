"""Configuração por variáveis de ambiente.

Só duas são obrigatórias; o resto tem os padrões da spec §7.3 e §11. Os
limiares do reconhecimento **não** estão aqui de propósito: eles vivem em
`face_recognition_settings`, no banco, para o piloto recalibrá-los sem deploy.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULTS: dict[str, int] = {
    "PORT": 8080,
    # Jobs reivindicados por chamada. Menor que o do ingest-worker: cada foto
    # aqui custa ~0,2 s de CPU, não ~5 ms, e lease vencido é retrabalho caro.
    "CLAIM_BATCH": 8,
    "LEASE_SECONDS": 300,
    "JOB_TIMEOUT_SECONDS": 120,
    "IDLE_BACKOFF_MIN_MS": 1_000,
    "IDLE_BACKOFF_MAX_MS": 5_000,
    "STALL_CHECK_INTERVAL_MS": 30_000,
    "LOOP_STALE_MS": 120_000,
    "HTTP_TIMEOUT_SECONDS": 60,
}


class ConfigError(RuntimeError):
    pass


def _int_from(env: dict[str, str] | os._Environ[str], key: str) -> int:
    raw = env.get(key)
    if raw is None or raw == "":
        return DEFAULTS[key]
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{key} inválido: {raw!r} (esperado inteiro positivo)") from exc
    if value <= 0:
        raise ConfigError(f"{key} inválido: {raw!r} (esperado inteiro positivo)")
    return value


@dataclass(frozen=True)
class WorkerConfig:
    supabase_url: str
    service_role_key: str
    port: int
    claim_batch: int
    lease_seconds: int
    job_timeout_seconds: int
    idle_backoff_min_ms: int
    idle_backoff_max_ms: int
    stall_check_interval_ms: int
    loop_stale_ms: int
    http_timeout_seconds: int
    log_level: str


def load_config(env: dict[str, str] | os._Environ[str] | None = None) -> WorkerConfig:
    env = os.environ if env is None else env
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not env.get(k)]
    if missing:
        raise ConfigError(f"Variáveis de ambiente ausentes: {', '.join(missing)}")
    return WorkerConfig(
        supabase_url=env["SUPABASE_URL"].rstrip("/"),
        service_role_key=env["SUPABASE_SERVICE_ROLE_KEY"],
        port=_int_from(env, "PORT"),
        claim_batch=_int_from(env, "CLAIM_BATCH"),
        lease_seconds=_int_from(env, "LEASE_SECONDS"),
        job_timeout_seconds=_int_from(env, "JOB_TIMEOUT_SECONDS"),
        idle_backoff_min_ms=_int_from(env, "IDLE_BACKOFF_MIN_MS"),
        idle_backoff_max_ms=_int_from(env, "IDLE_BACKOFF_MAX_MS"),
        stall_check_interval_ms=_int_from(env, "STALL_CHECK_INTERVAL_MS"),
        loop_stale_ms=_int_from(env, "LOOP_STALE_MS"),
        http_timeout_seconds=_int_from(env, "HTTP_TIMEOUT_SECONDS"),
        log_level=env.get("LOG_LEVEL", "info").upper(),
    )
