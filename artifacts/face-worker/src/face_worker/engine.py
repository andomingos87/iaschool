"""Motor de reconhecimento (spec §7.3, passos 1 e 2).

Carrega apenas os dois modelos que o produto precisa — detecção (SCRFD) e
reconhecimento (ArcFace r50, 512-d). Os demais modelos do `buffalo_l`
(`genderage`, `landmark_2d_106`, `landmark_3d_68`) ficam de fora de propósito:

- `genderage` inferiria gênero e idade a partir do rosto de uma criança, o que
  é tratamento sem finalidade no produto (Lei 15.211/2025, art. 13). Ele é
  apagado da imagem no Dockerfile e também não é carregado aqui — as duas
  travas, porque uma imagem pode ser reconstruída errado;
- os de landmark custam tempo e nenhum requisito usa.

Mesmo motor do spike M0 (`scripts/spike-face/src/engine.py`), com uma
diferença: aqui o `det_size` muda por chamada. `FaceAnalysis.prepare()` só
troca campos do detector, não recarrega sessão ONNX, então a foto de evento
(1600) e o retrato de referência (640) compartilham os mesmos modelos em
memória. Ver spec §7.4 sobre por que o `det_size` é por tipo de trabalho.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis

MODEL_NAME = "buffalo_l"
ALLOWED_MODULES = ["detection", "recognition"]
EMBEDDING_DIM = 512

# No contêiner os modelos são embutidos na imagem: nada é baixado em tempo de
# execução. O worker roda com `service_role` e não deve depender de rede
# externa para funcionar.
MODEL_ROOT = os.environ.get("INSIGHTFACE_ROOT", "~/.insightface")


@dataclass(frozen=True)
class DetectedFace:
    """Um rosto detectado, já com o vetor normalizado (L2)."""

    bbox: tuple[int, int, int, int]  # x, y, w, h em px da imagem processada
    det_score: float
    embedding: np.ndarray  # float32 (512,), norma 1

    @property
    def size(self) -> int:
        """Menor lado da caixa — o critério de descarte da spec (§7.3)."""
        return min(self.bbox[2], self.bbox[3])


class FaceEngine:
    def __init__(self, providers: list[str] | None = None) -> None:
        # Sem botão de threads de propósito: a roda do onnxruntime já usa todos
        # os núcleos dentro de uma sessão. O spike mediu 1, 4 e 8 processos com
        # a MESMA vazão agregada — escala-se com mais máquinas (spec §11).
        self.app = FaceAnalysis(
            name=MODEL_NAME,
            root=MODEL_ROOT,
            allowed_modules=ALLOWED_MODULES,
            providers=providers or ["CPUExecutionProvider"],
        )
        self._det_size: int | None = None
        self._det_thresh: float | None = None

    def _prepare(self, det_size: int, det_thresh: float) -> None:
        if self._det_size == det_size and self._det_thresh == det_thresh:
            return
        self.app.prepare(ctx_id=-1, det_thresh=det_thresh, det_size=(det_size, det_size))
        self._det_size = det_size
        self._det_thresh = det_thresh

    def analyze(
        self,
        bgr: np.ndarray,
        det_size: int,
        min_det_score: float = 0.5,
        min_face_px: int = 40,
    ) -> list[DetectedFace]:
        """Detecta e vetoriza, aplicando os descartes do passo 1 da spec §7.3."""
        self._prepare(det_size, min_det_score)
        out: list[DetectedFace] = []
        for f in self.app.get(bgr):
            if float(f.det_score) < min_det_score:
                continue
            x1, y1, x2, y2 = (int(v) for v in f.bbox)
            w, h = x2 - x1, y2 - y1
            if min(w, h) < min_face_px:
                continue
            emb = np.asarray(f.embedding, dtype=np.float32)
            norm = float(np.linalg.norm(emb))
            if norm == 0.0:
                continue
            out.append(
                DetectedFace(
                    bbox=(x1, y1, w, h),
                    det_score=float(f.det_score),
                    embedding=emb / norm,
                )
            )
        return out


def decode_image(data: bytes) -> np.ndarray:
    """Bytes → BGR. Levanta ValueError quando não é imagem legível."""
    buf = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("arquivo não é uma imagem legível")
    return img


def crop_face(bgr: np.ndarray, bbox: tuple[int, int, int, int], margin: float = 0.35) -> bytes:
    """Recorte JPEG do rosto para a fila de revisão.

    A margem é generosa de propósito: quem revisa precisa de contexto para
    dizer se é o aluno, e um recorte colado no rosto não dá isso (spec §7.5).
    """
    h, w = bgr.shape[:2]
    x, y, bw, bh = bbox
    mx, my = int(bw * margin), int(bh * margin)
    x0, y0 = max(0, x - mx), max(0, y - my)
    x1, y1 = min(w, x + bw + mx), min(h, y + bh + my)
    patch = bgr[y0:y1, x0:x1]
    ok, buf = cv2.imencode(".jpg", patch, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise ValueError("falha ao codificar o recorte")
    return buf.tobytes()


def vector_literal(embedding: np.ndarray) -> str:
    """Vetor no formato que o pgvector aceita em texto.

    6 casas bastam: o erro que isso introduz na similaridade é da ordem de
    1e-6, contra limiares de 0,52 e margem de 0,10.
    """
    return "[" + ",".join(f"{float(v):.6f}" for v in embedding) + "]"
