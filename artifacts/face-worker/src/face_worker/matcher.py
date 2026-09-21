"""Limiares da atribuição (spec §7.3, passo 4).

Função pura: recebe os vizinhos que o banco devolveu e o tamanho do rosto,
devolve o que gravar. Sem I/O, para que a regra que decide de quem é o rosto
de uma criança seja legível e testável isolada.

| Condição | `state` | Persiste embedding? |
| --- | --- | --- |
| `sim ≥ tau` **e** `sim − sim₂ ≥ margem` **e** rosto ≥ `min_face_px` | `suggested` | sim |
| passa no limiar mas rosto < `min_face_px` | `unassigned` com `runner_up_*` | **não** |
| `sim < tau` ou margem insuficiente | `unassigned` com `runner_up_*` | **não** |

Nunca há atribuição final automática: `suggested` é sugestão, e a confirmação
é humana (D6). O embedding só persiste no primeiro caso — e mesmo ali o banco
confere de novo se o aluno tem `biometric_sorting` ativo (D5).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Thresholds:
    tau: float
    margin: float
    min_face_px: int

    @classmethod
    def from_row(cls, row: dict[str, object]) -> Thresholds:
        return cls(
            tau=float(row.get("tau", 0.52) or 0.52),
            margin=float(row.get("margin", 0.10) or 0.10),
            min_face_px=int(row.get("min_face_px", 60) or 60),
        )


@dataclass(frozen=True)
class Neighbor:
    student_id: str
    sim: float


@dataclass(frozen=True)
class Decision:
    state: str
    student_id: str | None
    match_score: float | None
    runner_up_student_id: str | None
    runner_up_score: float | None
    """True quando o vetor deve ser gravado (D5)."""
    persist_embedding: bool


def decide(
    neighbors: list[Neighbor],
    face_px: int,
    thresholds: Thresholds,
) -> Decision:
    if not neighbors:
        return Decision("unassigned", None, None, None, None, False)

    # A busca já vem ordenada por distância; ordenar de novo custa nada e tira
    # a dependência de o banco manter essa promessa.
    ordered = sorted(neighbors, key=lambda n: n.sim, reverse=True)
    best = ordered[0]
    # O segundo colocado que importa é o do PRÓXIMO aluno: duas referências do
    # mesmo aluno não competem entre si, e tratá-las como competição zeraria a
    # margem justamente de quem cadastrou duas fotos.
    runner_up = next((n for n in ordered[1:] if n.student_id != best.student_id), None)

    unassigned = Decision(
        state="unassigned",
        student_id=None,
        match_score=None,
        runner_up_student_id=best.student_id,
        runner_up_score=best.sim,
        persist_embedding=False,
    )

    if best.sim < thresholds.tau:
        return unassigned
    if runner_up is not None and (best.sim - runner_up.sim) < thresholds.margin:
        return unassigned
    if face_px < thresholds.min_face_px:
        # Passou no limiar, mas o rosto é pequeno demais para o número do spike
        # valer. Vai para revisão com o candidato registrado.
        return unassigned

    return Decision(
        state="suggested",
        student_id=best.student_id,
        match_score=best.sim,
        runner_up_student_id=runner_up.student_id if runner_up else None,
        runner_up_score=runner_up.sim if runner_up else None,
        persist_embedding=True,
    )
