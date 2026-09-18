"""Sensibilidade ao tamanho do rosto (spec §14, item 4).

Responde duas perguntas que decidem parâmetro de produto:

1. A partir de que tamanho em px o detector deixa de achar o rosto? (define o
   `min_face_px` da spec §7.3, hoje chutado em 40)
2. A similaridade contra a referência cai com o tamanho? (define se rosto
   pequeno deve ir direto para revisão, mesmo quando detectado)

Dois motores, de propósito. O SCRFD reescala a imagem inteira para `det_size`,
então um `det_size` alto **quebra a detecção de rosto grande**: um retrato de
250px ampliado para 1024 põe o rosto acima da maior âncora do detector e ele
não acha nada (medido: 14 de 15 retratos perdidos a 1024). A referência do
aluno é um retrato e usa `det_size` 640 fixo; só a foto do evento varia.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_scenes import LONG_EDGE, compose, match_placed  # noqa: E402
from engine import FaceEngine  # noqa: E402

SIZES = [240, 180, 140, 110, 90, 70, 60, 50, 40, 30]
REF_DET_SIZE = 640


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lfw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--identities", type=int, default=40)
    ap.add_argument("--det-size", type=int, default=640)
    args = ap.parse_args()

    # Referência = retrato do aluno: det_size fixo em 640.
    ref_engine = FaceEngine(det_size=REF_DET_SIZE)
    # Foto do evento: é o que a varredura mede.
    engine = FaceEngine(det_size=args.det_size)
    rng = random.Random(20260831)

    # Identidades com >= 3 fotos: 2 viram referência, 1 vira o rosto colado.
    dirs = [d for d in sorted(args.lfw.iterdir()) if d.is_dir()]
    usable = [d for d in dirs if len(list(d.glob("*.jpg"))) >= 3]
    rng.shuffle(usable)

    refs: list[np.ndarray] = []
    probes: list[np.ndarray] = []
    for d in usable:
        if len(refs) >= args.identities:
            break
        imgs = sorted(d.glob("*.jpg"))[:3]
        vecs = []
        for p in imgs[:2]:
            img = cv2.imread(str(p))
            faces = ref_engine.analyze(img, min_face_px=20) if img is not None else []
            if faces:
                vecs.append(max(faces, key=lambda f: f.size).embedding)
        probe_img = cv2.imread(str(imgs[2]))
        if len(vecs) == 2 and probe_img is not None:
            refs.append(np.mean(vecs, axis=0) / np.linalg.norm(np.mean(vecs, axis=0)))
            probes.append(probe_img[40:210, 40:210])

    rows = []
    for size in SIZES:
        detected = 0
        spurious = 0
        sims = []
        for ref, crop in tqdm(
            list(zip(refs, probes)), desc=f"{size}px", unit="id", leave=False
        ):
            scene, placed = compose([crop], face_px=size, rng=rng)
            faces = engine.analyze(scene, min_det_score=0.5, min_face_px=1)
            best = match_placed(faces, placed[0])
            spurious += len(faces) - (1 if best is not None else 0)
            if best is None:
                continue
            detected += 1
            sims.append(float(best.embedding @ ref))
        rows.append(
            {
                "face_px": size,
                "identities": len(refs),
                "detection_rate": round(detected / len(refs), 3),
                "spurious_per_photo": round(spurious / len(refs), 3),
                "sim_mean": round(float(np.mean(sims)), 3) if sims else None,
                "sim_p10": round(float(np.percentile(sims, 10)), 3) if sims else None,
            }
        )
        print(
            f"{size:>4}px -> detecta {rows[-1]['detection_rate']:.0%}"
            f"  sim {rows[-1]['sim_mean']}"
            f"  falsos/foto {rows[-1]['spurious_per_photo']}"
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "canvas_long_edge": LONG_EDGE,
                "det_size": args.det_size,
                "ref_det_size": REF_DET_SIZE,
                "rows": rows,
            },
            indent=2,
        )
    )
    print(f"gravado em {args.out}")


if __name__ == "__main__":
    main()
