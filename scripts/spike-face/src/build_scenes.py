"""Compõe fotos sintéticas de evento a partir de recortes do LFW.

Motivo: o LFW é recorte 250x250 de rosto centrado — serve para medir acurácia,
mas não para medir o detector numa foto de 2560px com vários rostos pequenos,
que é o caso real do produto. Aqui as faces são coladas sobre um fundo neutro
em escala e posição controladas, o que permite medir tempo por foto e o efeito
do tamanho do rosto sem usar imagem de criança.
"""

from __future__ import annotations

import random
from pathlib import Path

import cv2
import numpy as np

LONG_EDGE = 2560  # a resolução decidida na spec (D3)
ASPECT = 2 / 3


def _background(w: int, h: int, rng: random.Random) -> np.ndarray:
    """Fundo suave: gradiente + ruído bem borrado.

    O ruído é forte o bastante para não ser um fundo chapado irreal, mas com
    sigma alto de borramento: textura de alta frequência faz o SCRFD alucinar
    rosto quando `det_size` é grande, e isso mediria o fundo, não o detector.
    Ainda assim há falso positivo ocasional — por isso `compose` devolve onde
    cada rosto foi colado, e quem mede casa a detecção pela posição.
    """
    base = np.zeros((h, w, 3), dtype=np.float32)
    c1 = np.array([rng.uniform(120, 200) for _ in range(3)], dtype=np.float32)
    c2 = np.array([rng.uniform(60, 140) for _ in range(3)], dtype=np.float32)
    ramp = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    base += c1 * (1 - ramp) + c2 * ramp
    noise = rng.random()
    base += cv2.GaussianBlur(
        np.random.default_rng(int(noise * 1e6)).normal(0, 14, (h, w, 3)).astype(np.float32),
        (0, 0),
        45,
    )
    return np.clip(base, 0, 255).astype(np.uint8)


def paste_face(canvas: np.ndarray, crop: np.ndarray, x: int, y: int, size: int) -> None:
    """Cola o recorte com borda suavizada, para não criar aresta artificial."""
    face = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    h, w = canvas.shape[:2]
    if x < 0 or y < 0 or x + size > w or y + size > h:
        return
    mask = np.zeros((size, size), dtype=np.float32)
    cv2.circle(mask, (size // 2, size // 2), int(size * 0.48), 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), size * 0.05)[..., None]
    roi = canvas[y : y + size, x : x + size].astype(np.float32)
    canvas[y : y + size, x : x + size] = (
        face.astype(np.float32) * mask + roi * (1 - mask)
    ).astype(np.uint8)


def compose(
    crops: list[np.ndarray], face_px: int, rng: random.Random
) -> tuple[np.ndarray, list[tuple[int, int, int]]]:
    """Distribui os rostos numa grade com jitter, sem sobreposição.

    Devolve a imagem e a lista de `(x, y, lado)` de cada rosto colado, para que
    o benchmark saiba qual detecção é a verdadeira e qual é falso positivo do
    fundo.
    """
    w, h = LONG_EDGE, int(LONG_EDGE * ASPECT)
    canvas = _background(w, h, rng)
    n = len(crops)
    cols = max(1, int(np.ceil(np.sqrt(n * w / h))))
    rows = max(1, int(np.ceil(n / cols)))
    cell_w, cell_h = w // cols, h // rows
    step = min(face_px, cell_w - 8, cell_h - 8)
    placed: list[tuple[int, int, int]] = []
    for i, crop in enumerate(crops):
        cx = (i % cols) * cell_w + cell_w // 2
        cy = (i // cols) * cell_h + cell_h // 2
        jx = rng.randint(-cell_w // 8, cell_w // 8)
        jy = rng.randint(-cell_h // 8, cell_h // 8)
        x, y = cx + jx - step // 2, cy + jy - step // 2
        paste_face(canvas, crop, x, y, step)
        placed.append((x, y, step))
    return canvas, placed


def match_placed(
    faces, placed: tuple[int, int, int], tolerance: float = 0.6
):
    """Acha, entre as detecções, a que corresponde ao rosto colado em `placed`.

    Critério: centro da caixa detectada dentro de `tolerance * lado` do centro
    onde o rosto foi colado. Sem isso, um falso positivo do fundo maior que o
    rosto real seria escolhido por tamanho e a medição viraria ruído.
    """
    px, py, size = placed
    cx, cy = px + size / 2, py + size / 2
    limit = tolerance * size
    best, best_d = None, float("inf")
    for f in faces:
        fx, fy, fw, fh = f.bbox
        d = np.hypot(fx + fw / 2 - cx, fy + fh / 2 - cy)
        if d <= limit and d < best_d:
            best, best_d = f, d
    return best


def load_crops(lfw: Path, n: int, seed: int = 20260831) -> list[np.ndarray]:
    rng = random.Random(seed)
    dirs = [d for d in sorted(lfw.iterdir()) if d.is_dir()]
    rng.shuffle(dirs)
    out: list[np.ndarray] = []
    for d in dirs:
        imgs = sorted(d.glob("*.jpg"))
        if not imgs:
            continue
        img = cv2.imread(str(imgs[0]))
        if img is None:
            continue
        # O rosto ocupa a região central do recorte 250x250 do LFW.
        out.append(img[40:210, 40:210])
        if len(out) >= n:
            break
    return out
