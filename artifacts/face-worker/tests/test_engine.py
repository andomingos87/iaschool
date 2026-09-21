"""Utilitários do motor. O modelo em si só é carregado quando está na máquina."""

from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from face_worker.engine import MODEL_NAME, crop_face, decode_image, vector_literal


def jpeg(width: int = 200, height: int = 120) -> bytes:
    img = np.full((height, width, 3), 200, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_decode_aceita_jpeg_e_recusa_lixo():
    img = decode_image(jpeg())
    assert img.shape == (120, 200, 3)
    with pytest.raises(ValueError):
        decode_image(b"nao sou imagem")


def test_recorte_respeita_a_borda_da_foto():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    # Caixa colada no canto: a margem não pode estourar o array.
    data = crop_face(img, (0, 0, 20, 20))
    assert decode_image(data).shape[0] > 0


def test_recorte_tem_margem_para_a_revisao():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    recorte = decode_image(crop_face(img, (100, 100, 100, 100), margin=0.5))
    # 100px de rosto + 50% de cada lado = 200px.
    assert recorte.shape[0] == 200 and recorte.shape[1] == 200


def test_vetor_no_formato_do_pgvector():
    v = np.array([1.0, -0.5, 0.0] + [0.0] * 509, dtype=np.float32)
    literal = vector_literal(v)
    assert literal.startswith("[1.000000,-0.500000,0.000000,")
    assert literal.endswith("]")
    assert literal.count(",") == 511


def _models_available() -> bool:
    root = os.environ.get("INSIGHTFACE_ROOT", "~/.insightface")
    return (Path(root).expanduser() / "models" / MODEL_NAME).is_dir()


@pytest.mark.skipif(not _models_available(), reason="buffalo_l não está nesta máquina")
def test_motor_carrega_so_deteccao_e_reconhecimento():
    from face_worker.engine import FaceEngine

    engine = FaceEngine()
    # `genderage` e os de landmark ficam de fora: inferir idade e gênero do
    # rosto de uma criança é tratamento sem finalidade (Lei 15.211, art. 13).
    assert set(engine.app.models) == {"detection", "recognition"}
    # Imagem lisa não tem rosto: a resposta é lista vazia, não exceção.
    assert engine.analyze(np.zeros((640, 640, 3), dtype=np.uint8), det_size=640) == []
