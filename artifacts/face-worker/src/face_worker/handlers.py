"""Os dois trabalhos do worker (spec §7.3 e §7.4).

`handle_recognize`: uma foto de evento → N rostos em `photo_faces`.
`handle_reference`: um retrato → um vetor em `student_reference_faces`.

Nenhum dos dois decide sozinho de quem é o rosto: o limiar está em
`matcher.decide` e a confirmação é humana (D6). Nenhum dos dois grava vetor de
quem não consentiu: o worker nem tenta, e o banco recusa se tentar (D5).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .engine import FaceEngine, crop_face, decode_image, vector_literal
from .matcher import Neighbor, Thresholds, decide
from .queue import (
    EVENT_PHOTOS_BUCKET,
    FACE_CROPS_BUCKET,
    STUDENT_REFS_BUCKET,
    PhotoRow,
    QueueApi,
    RecognizeJob,
    ReferenceJob,
)
from .supabase import SupabaseApi


@dataclass
class Deps:
    queue: QueueApi
    api: SupabaseApi
    engine: FaceEngine


@dataclass(frozen=True)
class RecognizeOutcome:
    result: str
    faces: int
    suggested: int


def _settings(deps: Deps) -> dict[str, Any]:
    return deps.queue.settings()


def _int_setting(cfg: dict[str, Any], key: str, default: int) -> int:
    value = cfg.get(key)
    return int(value) if value is not None else default


def _float_setting(cfg: dict[str, Any], key: str, default: float) -> float:
    value = cfg.get(key)
    return float(value) if value is not None else default


def handle_recognize(job: RecognizeJob, photo: PhotoRow | None, deps: Deps) -> RecognizeOutcome:
    """Detecta, compara e grava os rostos de uma foto de evento."""
    if photo is None:
        # A foto sumiu entre o claim e agora. Retentar não traz de volta.
        result = deps.queue.complete_recognize(
            job.id, False, None, "foto não encontrada", permanent=True
        )
        return RecognizeOutcome(result, 0, 0)
    if photo.deleted_at:
        # Na lixeira: não é erro, é trabalho que deixou de fazer sentido.
        result = deps.queue.complete_recognize(job.id, True, [], None)
        return RecognizeOutcome(result, 0, 0)

    cfg = _settings(deps)
    thresholds = Thresholds.from_row(cfg)
    det_size = _int_setting(cfg, "det_size_event", 1600)
    min_det_score = _float_setting(cfg, "min_det_score", 0.5)
    min_detect_px = _int_setting(cfg, "min_detect_px", 40)
    neighbors_limit = _int_setting(cfg, "neighbors", 5)

    data = deps.api.download(EVENT_PHOTOS_BUCKET, photo.storage_path)
    try:
        image = decode_image(data)
    except ValueError as exc:
        result = deps.queue.complete_recognize(job.id, False, None, str(exc), permanent=True)
        return RecognizeOutcome(result, 0, 0)

    detected = deps.engine.analyze(
        image,
        det_size=det_size,
        min_det_score=min_det_score,
        min_face_px=min_detect_px,
    )

    faces: list[dict[str, Any]] = []
    suggested = 0
    for index, face in enumerate(detected):
        literal = vector_literal(face.embedding)
        rows = deps.queue.match(photo.school_id, literal, neighbors_limit)
        decision = decide(
            [Neighbor(str(r["student_id"]), float(r["sim"])) for r in rows],
            face_px=face.size,
            thresholds=thresholds,
        )

        # Caminho determinístico: reprocessar o lote sobrescreve o mesmo objeto
        # em vez de deixar recorte órfão no bucket. O `face_id` da spec §6 não
        # existe antes do insert, e inventar um id só para nomear arquivo
        # trocaria um problema por outro.
        crop_path = f"{photo.school_id}/{photo.event_id}/{photo.id}-{index}.jpg"
        deps.api.upload(FACE_CROPS_BUCKET, crop_path, crop_face(image, face.bbox), "image/jpeg")

        x, y, w, h = face.bbox
        faces.append(
            {
                "bbox": {"x": x, "y": y, "w": w, "h": h},
                "det_score": round(face.det_score, 4),
                "quality": round(face.det_score, 4),
                "crop_path": crop_path,
                # D5: só o rosto correspondido a aluno consentido leva vetor.
                # Para os demais, o embedding existiu em memória, pelo tempo da
                # comparação, e morre aqui (spec §9.3).
                "embedding": literal if decision.persist_embedding else None,
                "student_id": decision.student_id,
                "match_score": decision.match_score,
                "runner_up_student_id": decision.runner_up_student_id,
                "runner_up_score": decision.runner_up_score,
                "state": decision.state,
            }
        )
        if decision.state == "suggested":
            suggested += 1

    result = deps.queue.complete_recognize(job.id, True, faces, None)

    # Reprocessamento que achou menos rostos que antes deixaria recorte velho
    # no bucket. O caminho é determinístico, então dá para apagar a sobra.
    previous = photo.faces_count or 0
    if result == "done" and previous > len(faces):
        stale = [
            f"{photo.school_id}/{photo.event_id}/{photo.id}-{i}.jpg"
            for i in range(len(faces), previous)
        ]
        deps.api.remove(FACE_CROPS_BUCKET, stale)

    return RecognizeOutcome(result, len(faces), suggested)


@dataclass(frozen=True)
class ReferenceOutcome:
    result: str
    faces: int


def handle_reference(job: ReferenceJob, deps: Deps) -> ReferenceOutcome:
    """Vetoriza o retrato de referência de um aluno (`det_size` 640)."""
    cfg = _settings(deps)
    det_size = _int_setting(cfg, "det_size_reference", 640)
    min_det_score = _float_setting(cfg, "min_det_score", 0.5)
    min_detect_px = _int_setting(cfg, "min_detect_px", 40)

    data = deps.api.download(STUDENT_REFS_BUCKET, job.storage_path)
    try:
        image = decode_image(data)
    except ValueError:
        return ReferenceOutcome(
            deps.queue.complete_reference(
                job.id, False, error="o arquivo enviado não é uma imagem legível",
                permanent=True,
            ),
            0,
        )

    detected = deps.engine.analyze(
        image, det_size=det_size, min_det_score=min_det_score, min_face_px=min_detect_px
    )

    if not detected:
        return ReferenceOutcome(
            deps.queue.complete_reference(
                job.id, False,
                error="nenhum rosto foi encontrado nesta foto; envie um retrato de frente",
                permanent=True,
            ),
            0,
        )
    if len(detected) > 1:
        # Não escolher o maior de propósito: referência errada não erra uma
        # foto, erra todas as fotos daquele aluno no evento inteiro.
        return ReferenceOutcome(
            deps.queue.complete_reference(
                job.id, False,
                error=(
                    f"a foto tem {len(detected)} rostos; envie um retrato "
                    "com o aluno sozinho"
                ),
                permanent=True,
            ),
            len(detected),
        )

    face = detected[0]
    result = deps.queue.complete_reference(
        job.id,
        True,
        embedding=vector_literal(face.embedding),
        quality=round(face.det_score, 4),
    )
    return ReferenceOutcome(result, 1)
