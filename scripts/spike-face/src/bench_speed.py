"""Tempo de detecção + vetorização por foto (spec §14, item 2 e §11.1).

Mede em foto de 2560px — a resolução decidida na spec (D3) — variando o número
de rostos e o `det_size` do detector. Também mede o custo de manter os modelos
extras do buffalo_l ligados, para justificar o `allowed_modules` do engine.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import cv2
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_scenes import compose, load_crops  # noqa: E402
from engine import FaceEngine  # noqa: E402

import random  # noqa: E402


def timed(engine: FaceEngine, images: list, warmup: int = 2) -> dict:
    for img in images[:warmup]:
        engine.analyze(img)
    per_photo, faces = [], []
    for img in tqdm(images, desc="fotos", unit="foto", leave=False):
        t = time.perf_counter()
        found = engine.analyze(img)
        per_photo.append((time.perf_counter() - t) * 1000)
        faces.append(len(found))
    return {
        "photos": len(images),
        "faces_found_mean": round(statistics.mean(faces), 2),
        "ms_mean": round(statistics.mean(per_photo), 1),
        "ms_p50": round(statistics.median(per_photo), 1),
        "ms_p95": round(sorted(per_photo)[int(len(per_photo) * 0.95) - 1], 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lfw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--photos", type=int, default=30)
    args = ap.parse_args()

    rng = random.Random(20260831)
    crops = load_crops(args.lfw, 60)
    scenes: dict[int, list] = {}
    for n_faces in (1, 3, 8, 20):
        scenes[n_faces] = [
            compose(rng.sample(crops, n_faces), face_px=260, rng=rng)[0]
            for _ in range(args.photos)
        ]
    cv2.imwrite(str(args.out.parent / "sample_scene_20_faces.jpg"), scenes[20][0])

    results = {"resolution": "2560x1706", "runs": []}

    for det_size in (640, 800, 1024, 1600):
        engine = FaceEngine(det_size=det_size)
        for n_faces, imgs in scenes.items():
            r = timed(engine, imgs)
            r |= {"det_size": det_size, "faces_in_scene": n_faces, "modules": "det+rec"}
            results["runs"].append(r)
            print(
                f"det_size={det_size} faces={n_faces:>2} "
                f"-> {r['ms_mean']:>7.1f} ms  (achou {r['faces_found_mean']})"
            )

    # Custo dos modelos que o engine desliga de propósito (§9.1).
    from insightface.app import FaceAnalysis

    full = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    full.prepare(ctx_id=-1, det_size=(640, 640))
    imgs = scenes[3]
    for img in imgs[:2]:
        full.get(img)
    t = time.perf_counter()
    for img in imgs:
        full.get(img)
    ms_full = (time.perf_counter() - t) / len(imgs) * 1000
    results["all_modules_ms_mean_3_faces"] = round(ms_full, 1)
    print(f"buffalo_l completo (5 modelos), 3 rostos -> {ms_full:.1f} ms")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2))
    print(f"gravado em {args.out}")


if __name__ == "__main__":
    main()
