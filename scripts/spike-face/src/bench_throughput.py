"""Vazão agregada da máquina, variando o número de processos.

A pergunta que isso responde é de dimensionamento: o `face-worker` deve rodar
N processos por máquina, ou 1?

O `onnxruntime` paraleliza dentro de uma sessão. Se ele já satura os núcleos,
subir mais processos só adiciona disputa — e a spec dizia "2 por vCPU", o que
seria pior que 1. Medir é a única forma de saber, porque depende da roda do
onnxruntime e do hardware.

Roda os processos filhos com `multiprocessing` em modo spawn, para que cada um
tenha a sua própria sessão do onnxruntime, como aconteceria com réplicas reais.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import random
import sys
import time
from pathlib import Path

SRC = str(Path(__file__).resolve().parent)


def _worker(lfw: str, n_photos: int, det_size: int, seed: int, out) -> None:
    sys.path.insert(0, SRC)
    from build_scenes import compose, load_crops
    from engine import FaceEngine

    rng = random.Random(seed)
    crops = load_crops(Path(lfw), 40, seed=seed)
    scenes = [
        compose(rng.sample(crops, 3), face_px=260, rng=rng)[0] for _ in range(n_photos)
    ]
    engine = FaceEngine(det_size=det_size)
    engine.analyze(scenes[0])  # aquecimento: exclui a primeira inferência
    t = time.perf_counter()
    for s in scenes:
        engine.analyze(s)
    out.put(time.perf_counter() - t)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lfw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--photos", type=int, default=15)
    ap.add_argument("--det-size", type=int, default=1600)
    ap.add_argument("--levels", type=int, nargs="+", default=[1, 4, 8])
    args = ap.parse_args()

    ctx = mp.get_context("spawn")
    rows = []
    for par in args.levels:
        q = ctx.Queue()
        procs = [
            ctx.Process(
                target=_worker,
                args=(str(args.lfw), args.photos, args.det_size, i + 1, q),
            )
            for i in range(par)
        ]
        for p in procs:
            p.start()
        # Só o tempo de inferência de cada filho conta: carregar modelo e compor
        # cena é custo do benchmark, não do worker em regime.
        spans = [q.get() for _ in procs]
        for p in procs:
            p.join()
        total = args.photos * par
        rate = total / max(spans) * 60
        rows.append(
            {
                "processes": par,
                "photos": total,
                "slowest_span_s": round(max(spans), 2),
                "photos_per_min": round(rate),
            }
        )
        print(f"{par} processo(s): {total} fotos -> {rate:.0f} fotos/min")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"det_size": args.det_size, "rows": rows}, indent=2))
    print(f"gravado em {args.out}")


if __name__ == "__main__":
    main()
