"""Curva precisão x cobertura variando limiar e margem (spec §14, item 3).

Reproduz a regra de decisão da spec §7.3:

    sugerido  se  sim1 >= tau  E  (sim1 - sim2) >= margem
    revisão   caso contrário

onde `sim1`/`sim2` são as similaridades do 1º e do 2º **aluno** (não da 1ª e
2ª foto de referência — cada aluno tem várias, e vale o máximo).

Saída: `results/accuracy.json`.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dataset import Identity, Split, build_split, index_lfw  # noqa: E402
from engine import FaceEngine  # noqa: E402

REFS_PER_IDENTITY = 2


def embed_image(engine: FaceEngine, path: Path) -> np.ndarray | None:
    """Vetoriza o rosto dominante da imagem. None quando não há rosto útil."""
    bgr = cv2.imread(str(path))
    if bgr is None:
        return None
    # As fotos do LFW são recortes 250x250 já centrados: o limiar de 40px da
    # spec não faz sentido aqui, ele vale para a foto de evento (bench_scale).
    faces = engine.analyze(bgr, min_det_score=0.5, min_face_px=20)
    if not faces:
        return None
    return max(faces, key=lambda f: f.bbox[2] * f.bbox[3]).embedding


def build_gallery(
    engine: FaceEngine, identities: list[Identity], label: str
) -> tuple[np.ndarray, list[str], dict[str, list[np.ndarray]]]:
    """Devolve (matriz de referências, dono de cada linha, sondas por identidade)."""
    ref_vecs: list[np.ndarray] = []
    ref_owner: list[str] = []
    probes: dict[str, list[np.ndarray]] = {}

    for ident in tqdm(identities, desc=f"galeria {label}", unit="id"):
        got_refs: list[np.ndarray] = []
        got_probes: list[np.ndarray] = []
        for img in ident.images:
            emb = embed_image(engine, img)
            if emb is None:
                continue
            if len(got_refs) < REFS_PER_IDENTITY:
                got_refs.append(emb)
            else:
                got_probes.append(emb)
        # Aluno sem as 2 referências que a spec exige não entra na base.
        if len(got_refs) < REFS_PER_IDENTITY:
            continue
        for v in got_refs:
            ref_vecs.append(v)
            ref_owner.append(ident.name)
        if got_probes:
            probes[ident.name] = got_probes

    return np.vstack(ref_vecs).astype(np.float32), ref_owner, probes


def top2_per_student(
    sims: np.ndarray, owners: np.ndarray, students: np.ndarray
) -> tuple[str, float, str | None, float]:
    """Agrega por aluno (máximo entre as referências dele) e devolve o top-2."""
    best = {}
    for owner, sim in zip(owners, sims):
        if sim > best.get(owner, -1.0):
            best[owner] = float(sim)
    ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
    first, second = ranked[0], (ranked[1] if len(ranked) > 1 else (None, -1.0))
    return first[0], first[1], second[0], second[1]


def suggested_enrolled(rows, tau: float, margin: float) -> int:
    """Quantas sondas de aluno da escola receberam sugestão (certa ou errada)."""
    return sum(
        1
        for truth, _t1, s1, s2, kind in rows
        if kind == "enrolled" and s1 >= tau and (s1 - s2) >= margin
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lfw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--enrolled", type=int, default=200)
    ap.add_argument("--distractors", type=int, default=500)
    ap.add_argument("--det-size", type=int, default=640)
    args = ap.parse_args()

    engine = FaceEngine(det_size=args.det_size)
    split: Split = build_split(
        index_lfw(args.lfw),
        n_enrolled=args.enrolled,
        n_distractors=args.distractors,
        refs_per_identity=REFS_PER_IDENTITY,
    )

    t0 = time.perf_counter()
    refs_a, owners_a, probes_a = build_gallery(engine, split.school_a, "escola A")
    _, _, probes_b = build_gallery(engine, split.school_b, "escola B")

    distractor_vecs: list[np.ndarray] = []
    for ident in tqdm(split.distractors, desc="distratores", unit="id"):
        emb = embed_image(engine, ident.images[0])
        if emb is not None:
            distractor_vecs.append(emb)

    owners_arr = np.array(owners_a)
    students_arr = np.unique(owners_arr)

    # Uma linha por sonda. `kind` separa os três tipos de erro possíveis,
    # que têm gravidade muito diferente no produto:
    #   enrolled   -> aluno da escola A; errar = foto do aluno errado
    #   school_b   -> aluno de outra escola; errar = vazamento entre escolas
    #   distractor -> pessoa sem cadastro; errar = foto atribuída a estranho
    rows: list[tuple[str | None, str, float, float, str]] = []
    for name, vecs in probes_a.items():
        for v in vecs:
            t1, s1, _, s2 = top2_per_student(refs_a @ v, owners_arr, students_arr)
            rows.append((name, t1, s1, s2, "enrolled"))
    n_school_b = sum(len(v) for v in probes_b.values())
    for v in [v for vs in probes_b.values() for v in vs]:
        t1, s1, _, s2 = top2_per_student(refs_a @ v, owners_arr, students_arr)
        rows.append((None, t1, s1, s2, "school_b"))
    for v in distractor_vecs:
        t1, s1, _, s2 = top2_per_student(refs_a @ v, owners_arr, students_arr)
        rows.append((None, t1, s1, s2, "distractor"))

    taus = [round(x, 2) for x in np.arange(0.30, 0.91, 0.02)]
    margins = [0.0, 0.03, 0.05, 0.10]
    in_gallery = [r for r in rows if r[4] == "enrolled"]
    curve = []
    for margin in margins:
        for tau in taus:
            tp = 0
            fp_wrong_student = fp_school_b = fp_distractor = 0
            for truth, top1, s1, s2, kind in rows:
                if s1 < tau or (s1 - s2) < margin:
                    continue  # vai para revisão
                if truth is not None and top1 == truth:
                    tp += 1
                elif kind == "enrolled":
                    fp_wrong_student += 1
                elif kind == "school_b":
                    fp_school_b += 1
                else:
                    fp_distractor += 1
            fp = fp_wrong_student + fp_school_b + fp_distractor
            suggested = tp + fp
            curve.append(
                {
                    "margin": margin,
                    "tau": tau,
                    "suggested": suggested,
                    "true_positive": tp,
                    "false_positive": fp,
                    "fp_wrong_student": fp_wrong_student,
                    "fp_school_b": fp_school_b,
                    "fp_distractor": fp_distractor,
                    "precision": (tp / suggested) if suggested else None,
                    "coverage": tp / len(in_gallery),
                    # Fração dos rostos DE ALUNO da escola que sobra para
                    # revisão. Medir sobre todas as sondas inflaria o número
                    # com os estranhos, que devem mesmo ser recusados.
                    "review_rate_enrolled": 1 - suggested_enrolled(rows, tau, margin) / len(in_gallery),
                    "outsider_suggested_rate": (fp_school_b + fp_distractor)
                    / max(1, len(rows) - len(in_gallery)),
                }
            )

    result = {
        "dataset": "LFW (adultos, público)",
        "enrolled_students": int(len(students_arr)),
        "reference_vectors": int(refs_a.shape[0]),
        "probes_in_gallery": len(in_gallery),
        "probes_outsider": len(rows) - len(in_gallery),
        "probes_outsider_school_b": n_school_b,
        "probes_outsider_distractors": len(distractor_vecs),
        "elapsed_seconds": round(time.perf_counter() - t0, 1),
        "curve": curve,
        "raw_rows": [
            {"truth": t, "top1": t1, "sim1": round(s1, 4), "sim2": round(s2, 4), "kind": k}
            for t, t1, s1, s2, k in rows
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2))
    print(f"gravado em {args.out}")


if __name__ == "__main__":
    main()
