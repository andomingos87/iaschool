"""Camada fina sobre o Supabase para as duas filas do reconhecimento.

Interface separada da implementação para os testes injetarem um duplo sem
rede — mesmo padrão do `ingest-worker`.

São duas filas, de propósito:
- `photo_jobs` com `kind = 'recognize'`: uma foto de evento por job;
- `student_reference_jobs`: um retrato de referência por job.

A segunda tem prioridade no laço. É ela que destrava o cadastro da escola, e
sem referência o reconhecimento não tem contra o que comparar.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol

from .supabase import SupabaseApi

EVENT_PHOTOS_BUCKET = "event-photos"
STUDENT_REFS_BUCKET = "student-refs"
FACE_CROPS_BUCKET = "face-crops"

# A configuração muda sem deploy (é esse o ponto da tabela), mas reler a cada
# foto seria uma ida ao banco por job. Um minuto é o atraso aceito.
SETTINGS_TTL_SECONDS = 60


@dataclass(frozen=True)
class RecognizeJob:
    id: int
    photo_id: str
    batch_id: str | None
    attempts: int


@dataclass(frozen=True)
class ReferenceJob:
    id: str
    school_id: str
    student_id: str
    storage_path: str
    attempts: int


@dataclass(frozen=True)
class PhotoRow:
    id: str
    school_id: str
    event_id: str
    storage_path: str
    faces_count: int | None
    deleted_at: str | None


class QueueApi(Protocol):
    def claim_recognize(self, limit: int, lease_seconds: int) -> list[RecognizeJob]: ...
    def claim_reference(self, limit: int, lease_seconds: int) -> list[ReferenceJob]: ...
    def fetch_photos(self, ids: list[str]) -> dict[str, PhotoRow]: ...
    def complete_recognize(
        self, job_id: int, ok: bool, faces: list[dict[str, Any]] | None,
        error: str | None = None, permanent: bool = False,
    ) -> str: ...
    def complete_reference(
        self, job_id: str, ok: bool, embedding: str | None = None,
        quality: float | None = None, error: str | None = None, permanent: bool = False,
    ) -> str: ...
    def match(self, school_id: str, embedding: str, limit: int) -> list[dict[str, Any]]: ...
    def settings(self) -> dict[str, Any]: ...
    def stalled_count(self) -> int: ...


class SupabaseQueue:
    def __init__(self, api: SupabaseApi, now: Any = time.monotonic) -> None:
        self._api = api
        self._now = now
        self._settings_cache: tuple[float, dict[str, Any]] | None = None

    def claim_recognize(self, limit: int, lease_seconds: int) -> list[RecognizeJob]:
        rows = self._api.rpc(
            "claim_photo_jobs",
            {"p_kind": "recognize", "p_limit": limit, "p_lease_seconds": lease_seconds},
        ) or []
        return [
            RecognizeJob(
                id=int(r["id"]),
                photo_id=str(r["photo_id"]),
                batch_id=r.get("batch_id"),
                attempts=int(r.get("attempts", 0)),
            )
            for r in rows
        ]

    def claim_reference(self, limit: int, lease_seconds: int) -> list[ReferenceJob]:
        rows = self._api.rpc(
            "claim_student_reference_jobs",
            {"p_limit": limit, "p_lease_seconds": lease_seconds},
        ) or []
        return [
            ReferenceJob(
                id=str(r["id"]),
                school_id=str(r["school_id"]),
                student_id=str(r["student_id"]),
                storage_path=str(r["storage_path"]),
                attempts=int(r.get("attempts", 0)),
            )
            for r in rows
        ]

    def fetch_photos(self, ids: list[str]) -> dict[str, PhotoRow]:
        if not ids:
            return {}
        rows = self._api.select(
            "photos",
            {
                "id": f"in.({','.join(ids)})",
                "select": "id,school_id,event_id,storage_path,faces_count,deleted_at",
            },
        )
        return {
            str(r["id"]): PhotoRow(
                id=str(r["id"]),
                school_id=str(r["school_id"]),
                event_id=str(r["event_id"]),
                storage_path=str(r["storage_path"]),
                faces_count=r.get("faces_count"),
                deleted_at=r.get("deleted_at"),
            )
            for r in rows
        }

    def complete_recognize(
        self,
        job_id: int,
        ok: bool,
        faces: list[dict[str, Any]] | None,
        error: str | None = None,
        permanent: bool = False,
    ) -> str:
        return str(
            self._api.rpc(
                "complete_recognize_job",
                {
                    "p_job_id": job_id,
                    "p_ok": ok,
                    "p_faces": faces,
                    "p_error": error,
                    "p_permanent": permanent,
                },
            )
            or "missing"
        )

    def complete_reference(
        self,
        job_id: str,
        ok: bool,
        embedding: str | None = None,
        quality: float | None = None,
        error: str | None = None,
        permanent: bool = False,
    ) -> str:
        return str(
            self._api.rpc(
                "complete_student_reference_job",
                {
                    "p_job_id": job_id,
                    "p_ok": ok,
                    "p_embedding": embedding,
                    "p_quality": quality,
                    "p_error": error,
                    "p_permanent": permanent,
                },
            )
            or "missing"
        )

    def match(self, school_id: str, embedding: str, limit: int) -> list[dict[str, Any]]:
        # O `where school_id` vive DENTRO da função (D7): não há como o worker
        # montar uma busca que atravesse escolas.
        return self._api.rpc(
            "match_reference_faces",
            {"p_school": school_id, "p_embedding": embedding, "p_limit": limit},
        ) or []

    def settings(self) -> dict[str, Any]:
        now = self._now()
        if self._settings_cache and now - self._settings_cache[0] < SETTINGS_TTL_SECONDS:
            return self._settings_cache[1]
        rows = self._api.select(
            "face_recognition_settings", {"id": "eq.1", "select": "*", "limit": "1"}
        )
        row = rows[0] if rows else {}
        self._settings_cache = (now, row)
        return row

    def stalled_count(self) -> int:
        return self._api.count("stalled_batch_jobs", {"pending_jobs": "gt.0"})
