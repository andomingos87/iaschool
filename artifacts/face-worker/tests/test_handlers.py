"""Os dois handlers, com fila e Storage falsos — sem rede, sem modelo.

O que estes testes protegem é a regra de conformidade, não a mecânica: D5
(vetor só de quem consentiu e foi correspondido), o descarte do embedding de
rosto não correspondido, e as falhas que não adianta retentar.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pytest

from face_worker.engine import DetectedFace
from face_worker.handlers import Deps, handle_recognize, handle_reference
from face_worker.queue import PhotoRow, RecognizeJob, ReferenceJob

SETTINGS = {
    "tau": 0.52,
    "margin": 0.10,
    "min_face_px": 60,
    "min_det_score": 0.5,
    "min_detect_px": 40,
    "det_size_event": 1600,
    "det_size_reference": 640,
    "neighbors": 5,
}


def face(px: int = 120, seed: float = 1.0) -> DetectedFace:
    emb = np.zeros(512, dtype=np.float32)
    emb[0] = seed
    return DetectedFace(bbox=(10, 10, px, px), det_score=0.93, embedding=emb)


class FakeQueue:
    def __init__(self, neighbors: list[dict[str, Any]] | None = None) -> None:
        self.neighbors = neighbors or []
        self.completed: list[dict[str, Any]] = []
        self.match_calls: list[tuple[str, int]] = []

    def settings(self) -> dict[str, Any]:
        return SETTINGS

    def match(self, school_id: str, embedding: str, limit: int) -> list[dict[str, Any]]:
        self.match_calls.append((school_id, limit))
        return self.neighbors

    def complete_recognize(self, job_id, ok, faces, error=None, permanent=False) -> str:
        self.completed.append(
            {"job_id": job_id, "ok": ok, "faces": faces, "error": error, "permanent": permanent}
        )
        return "done" if ok else "failed"

    def complete_reference(self, job_id, ok, embedding=None, quality=None, error=None, permanent=False) -> str:
        self.completed.append(
            {
                "job_id": job_id,
                "ok": ok,
                "embedding": embedding,
                "quality": quality,
                "error": error,
                "permanent": permanent,
            }
        )
        return "done" if ok else "failed"


class FakeApi:
    def __init__(self, payload: bytes = b"jpeg") -> None:
        self.payload = payload
        self.uploads: list[tuple[str, str]] = []
        self.removed: list[str] = []

    def download(self, bucket: str, path: str) -> bytes:
        return self.payload

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self.uploads.append((bucket, path))

    def remove(self, bucket: str, paths: list[str]) -> None:
        self.removed.extend(paths)


class FakeEngine:
    def __init__(self, faces: list[DetectedFace]) -> None:
        self.faces = faces
        self.det_sizes: list[int] = []

    def analyze(self, bgr, det_size, min_det_score=0.5, min_face_px=40):
        self.det_sizes.append(det_size)
        return self.faces


@dataclass
class Fixture:
    deps: Deps
    queue: FakeQueue
    api: FakeApi
    engine: FakeEngine


def build(faces: list[DetectedFace], neighbors: list[dict[str, Any]] | None = None) -> Fixture:
    queue = FakeQueue(neighbors)
    api = FakeApi()
    engine = FakeEngine(faces)
    return Fixture(Deps(queue=queue, api=api, engine=engine), queue, api, engine)


@pytest.fixture(autouse=True)
def _decodavel(monkeypatch):
    """O decode real precisa de JPEG de verdade; aqui o que importa é o fluxo."""
    monkeypatch.setattr(
        "face_worker.handlers.decode_image",
        lambda data: np.zeros((2000, 3000, 3), dtype=np.uint8),
    )
    monkeypatch.setattr("face_worker.handlers.crop_face", lambda img, bbox: b"crop")


PHOTO = PhotoRow(
    id="p1",
    school_id="s1",
    event_id="e1",
    storage_path="s1/e1/p1.jpg",
    faces_count=None,
    deleted_at=None,
)
JOB = RecognizeJob(id=7, photo_id="p1", batch_id="b1", attempts=1)


def test_rosto_correspondido_grava_vetor_e_recorte():
    fx = build([face()], [{"student_id": "ana", "sim": 0.9}, {"student_id": "bia", "sim": 0.2}])
    out = handle_recognize(JOB, PHOTO, fx.deps)

    assert out.faces == 1 and out.suggested == 1
    sent = fx.queue.completed[0]["faces"][0]
    assert sent["state"] == "suggested"
    assert sent["student_id"] == "ana"
    assert sent["embedding"] is not None
    assert sent["bbox"] == {"x": 10, "y": 10, "w": 120, "h": 120}
    # O recorte vai para o bucket da revisão, no prefixo da escola.
    assert fx.api.uploads == [("face-crops", "s1/e1/p1-0.jpg")]
    assert sent["crop_path"] == "s1/e1/p1-0.jpg"
    # A busca é sempre com a escola da foto (D7).
    assert fx.queue.match_calls == [("s1", 5)]
    # Foto de evento usa det_size 1600 (spec §7.3).
    assert fx.engine.det_sizes == [1600]


def test_rosto_sem_correspondencia_nao_guarda_vetor():
    # D5 e §9.3: o embedding existiu em memória para comparar e morre ali.
    fx = build([face()], [{"student_id": "ana", "sim": 0.30}])
    out = handle_recognize(JOB, PHOTO, fx.deps)

    assert out.suggested == 0
    sent = fx.queue.completed[0]["faces"][0]
    assert sent["state"] == "unassigned"
    assert sent["embedding"] is None
    assert sent["student_id"] is None
    # Mas bbox, det_score e recorte ficam — é o que permite desfocar depois
    # (spec §9.3.1).
    assert sent["bbox"]["w"] == 120
    assert sent["det_score"] > 0
    assert sent["crop_path"] == "s1/e1/p1-0.jpg"


def test_rosto_pequeno_nao_guarda_vetor_mesmo_batendo():
    fx = build([face(px=45)], [{"student_id": "ana", "sim": 0.95}])
    handle_recognize(JOB, PHOTO, fx.deps)
    sent = fx.queue.completed[0]["faces"][0]
    assert sent["state"] == "unassigned"
    assert sent["embedding"] is None


def test_foto_na_lixeira_fecha_o_job_sem_rosto():
    trashed = PhotoRow(**{**PHOTO.__dict__, "deleted_at": "2026-09-21T00:00:00Z"})
    fx = build([face()])
    out = handle_recognize(JOB, trashed, fx.deps)
    assert out.faces == 0
    assert fx.queue.completed[0]["ok"] is True
    assert fx.queue.completed[0]["faces"] == []
    assert fx.api.uploads == []


def test_foto_sumida_falha_de_vez():
    fx = build([face()])
    handle_recognize(JOB, None, fx.deps)
    assert fx.queue.completed[0]["permanent"] is True


def test_arquivo_ilegivel_falha_de_vez(monkeypatch):
    def boom(_data):
        raise ValueError("arquivo não é uma imagem legível")

    monkeypatch.setattr("face_worker.handlers.decode_image", boom)
    fx = build([face()])
    handle_recognize(JOB, PHOTO, fx.deps)
    assert fx.queue.completed[0]["permanent"] is True
    assert "imagem" in fx.queue.completed[0]["error"]


def test_reprocesso_apaga_recorte_que_sobrou():
    antes = PhotoRow(**{**PHOTO.__dict__, "faces_count": 3})
    fx = build([face()], [{"student_id": "ana", "sim": 0.9}])
    handle_recognize(JOB, antes, fx.deps)
    assert fx.api.removed == ["s1/e1/p1-1.jpg", "s1/e1/p1-2.jpg"]


# ---------- referência ----------

REF_JOB = ReferenceJob(
    id="j1", school_id="s1", student_id="al1", storage_path="s1/al1/j1.jpg", attempts=1
)


def test_referencia_com_um_rosto_grava_o_vetor():
    fx = build([face()])
    out = handle_reference(REF_JOB, fx.deps)
    assert out.faces == 1
    done = fx.queue.completed[0]
    assert done["ok"] is True
    assert done["embedding"].startswith("[1.000000,")
    assert done["quality"] == pytest.approx(0.93, abs=1e-4)
    # Retrato usa det_size 640 (spec §7.4).
    assert fx.engine.det_sizes == [640]


def test_referencia_sem_rosto_falha_de_vez():
    fx = build([])
    handle_reference(REF_JOB, fx.deps)
    done = fx.queue.completed[0]
    assert done["ok"] is False and done["permanent"] is True
    assert "nenhum rosto" in done["error"]


def test_referencia_com_dois_rostos_e_recusada():
    # Escolher o maior seria arriscar matricular o rosto errado, e referência
    # errada erra TODAS as fotos daquele aluno no evento.
    fx = build([face(seed=1.0), face(seed=-1.0)])
    out = handle_reference(REF_JOB, fx.deps)
    assert out.faces == 2
    done = fx.queue.completed[0]
    assert done["ok"] is False and done["permanent"] is True
    assert "2 rostos" in done["error"]
