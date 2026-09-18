"""Motor de reconhecimento do spike.

Carrega apenas os dois modelos que o produto precisa — detecção (SCRFD) e
reconhecimento (ArcFace r50, 512-d). Os demais modelos do pacote buffalo_l
(`genderage`, `landmark_2d_106`, `landmark_3d_68`) ficam de fora de propósito:

- `genderage` inferiria gênero e idade a partir do rosto de uma criança, o que
  é tratamento sem finalidade no produto (Lei 15.211/2025, art. 13);
- os de landmark custam tempo e não são usados por nenhum requisito.

Ver spec §7.3 e §9.1.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
from insightface.app import FaceAnalysis

MODEL_NAME = "buffalo_l"
ALLOWED_MODULES = ["detection", "recognition"]
EMBEDDING_DIM = 512

# Raiz dos modelos. No contêiner eles são embutidos na imagem e esta variável
# aponta para lá, de modo que nada é baixado em tempo de execução.
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
    def __init__(
        self,
        det_size: int = 640,
        providers: list[str] | None = None,
    ) -> None:
        # Não há botão de threads aqui de propósito: a roda do onnxruntime usada
        # (1.29, macOS arm64) ignora OMP_NUM_THREADS e já usa todos os núcleos
        # dentro de uma sessão. Medido: 1, 4 e 8 processos em paralelo dão a
        # MESMA vazão agregada. Escala-se com mais máquinas, não com mais
        # processos por máquina.
        self.det_size = det_size
        self.app = FaceAnalysis(
            name=MODEL_NAME,
            root=MODEL_ROOT,
            allowed_modules=ALLOWED_MODULES,
            providers=providers or ["CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=-1, det_size=(det_size, det_size))

    def analyze(
        self, bgr: np.ndarray, min_det_score: float = 0.5, min_face_px: int = 40
    ) -> list[DetectedFace]:
        """Detecta e vetoriza. Aplica os descartes do passo 1 da spec §7.3."""
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


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Similaridade de cosseno entre vetores já normalizados.

    É o mesmo que `1 - (a <=> b)` do pgvector com `vector_cosine_ops`.
    """
    return a @ b.T
