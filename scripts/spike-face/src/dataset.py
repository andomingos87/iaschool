"""Índice do conjunto de validação.

**Não usa foto real de criança ou adolescente** (spec §9.5 e §12.1). O conjunto
é o LFW (Labeled Faces in the Wild), público e composto de adultos. A limitação
que isso impõe está registrada em `docs/spike-reconhecimento-facial.md`.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Identity:
    name: str
    images: list[Path] = field(default_factory=list)


def index_lfw(root: Path) -> list[Identity]:
    ids: list[Identity] = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        imgs = sorted(d.glob("*.jpg"))
        if imgs:
            ids.append(Identity(name=d.name, images=imgs))
    return ids


@dataclass
class Split:
    """Recorte usado nos testes de acurácia.

    - `school_a` / `school_b`: identidades cadastradas (2 fotos de referência
      cada, como exige a spec §7.4) mais as sondas restantes.
    - `distractors`: identidades **não** cadastradas em nenhuma escola. São o
      que mede falso positivo — o rosto que aparece na foto do evento e não
      corresponde a nenhum aluno com referência.
    """

    school_a: list[Identity]
    school_b: list[Identity]
    distractors: list[Identity]


def build_split(
    identities: list[Identity],
    n_enrolled: int = 200,
    n_distractors: int = 500,
    refs_per_identity: int = 2,
    max_probes: int = 5,
    seed: int = 20260831,
) -> Split:
    rng = random.Random(seed)
    enrollable = [i for i in identities if len(i.images) >= refs_per_identity + 2]
    singles = [i for i in identities if len(i.images) < refs_per_identity + 2]
    rng.shuffle(enrollable)
    rng.shuffle(singles)

    need = n_enrolled * 2
    if len(enrollable) < need:
        raise SystemExit(
            f"identidades insuficientes: {len(enrollable)} com "
            f">= {refs_per_identity + 2} fotos, precisa de {need}"
        )

    def trim(ident: Identity) -> Identity:
        return Identity(
            name=ident.name,
            images=ident.images[: refs_per_identity + max_probes],
        )

    return Split(
        school_a=[trim(i) for i in enrollable[:n_enrolled]],
        school_b=[trim(i) for i in enrollable[n_enrolled:need]],
        distractors=[
            Identity(name=i.name, images=i.images[:1])
            for i in singles[:n_distractors]
        ],
    )
