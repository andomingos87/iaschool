"""Consolida os três benchmarks numa tabela legível."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True, type=Path)
    args = ap.parse_args()

    speed = json.loads((args.results / "speed.json").read_text())
    # Ordem numérica, não alfabética: scale_1024 antes de scale_640 tornaria a
    # tabela ilegível e faria "maior ds" apontar para o menor.
    scales = sorted(
        (json.loads(p.read_text()) for p in args.results.glob("scale_*.json")),
        key=lambda d: d["det_size"],
    )
    acc = json.loads((args.results / "accuracy.json").read_text())

    print("\n## Tempo por foto (2560px, CPU)\n")
    print("| det_size | rostos | achados | média ms | p95 ms |")
    print("| --- | --- | --- | --- | --- |")
    for r in speed["runs"]:
        print(
            f"| {r['det_size']} | {r['faces_in_scene']} | {r['faces_found_mean']} "
            f"| {r['ms_mean']} | {r['ms_p95']} |"
        )
    print(f"\nbuffalo_l completo (5 modelos), 3 rostos: "
          f"{speed['all_modules_ms_mean_3_faces']} ms")

    print("\n## Tamanho do rosto (detecção, por det_size)\n")
    header = " | ".join(f"ds {s['det_size']}" for s in scales)
    print(f"| px | {header} | sim média (maior ds) |")
    print("| --- |" + " --- |" * (len(scales) + 1))
    for i, r in enumerate(scales[0]["rows"]):
        cells = " | ".join(f"{s['rows'][i]['detection_rate']:.0%}" for s in scales)
        print(f"| {r['face_px']} | {cells} | {scales[-1]['rows'][i]['sim_mean']} |")

    print("\n## Precisão x cobertura (margem 0.10)\n")
    print(f"alunos cadastrados: {acc['enrolled_students']} | "
          f"sondas com dono: {acc['probes_in_gallery']} | "
          f"sondas sem dono: {acc['probes_outsider']}")
    print("\n| limiar | acertos | aluno errado | parecido | precisão | cobertura | revisão |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    for r in acc["curve"]:
        if r["precision"] is None or r["margin"] != 0.10:
            continue
        print(f"| {r['tau']} | {r['true_positive']} | {r['fp_wrong_student']} "
              f"| {r['fp_school_b'] + r['fp_distractor']} | {r['precision']:.4f} "
              f"| {r['coverage']:.3f} | {r['review_rate_enrolled']:.3f} |")

    # O ponto de operação do produto: zero "aluno errado" — o erro grave —
    # com a maior cobertura possível. Precisão global vem depois.
    ok = [
        r
        for r in acc["curve"]
        if r["precision"] is not None and r["fp_wrong_student"] == 0
    ]
    if ok:
        best = max(ok, key=lambda r: r["coverage"])
        print(f"\nMelhor ponto sem nenhum 'aluno errado': limiar {best['tau']}, "
              f"margem {best['margin']} -> cobertura {best['coverage']:.3f}, "
              f"precisão {best['precision']:.4f}, "
              f"revisão {best['review_rate_enrolled']:.3f}")
    else:
        print("\nNenhum ponto zera o erro de aluno errado.")


if __name__ == "__main__":
    main()
