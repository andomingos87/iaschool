"""A tabela de limiares da spec §7.3, passo 4, caso a caso."""

from face_worker.matcher import Neighbor, Thresholds, decide

SPIKE = Thresholds(tau=0.52, margin=0.10, min_face_px=60)


def test_sugere_quando_passa_limiar_margem_e_tamanho():
    d = decide([Neighbor("ana", 0.80), Neighbor("bia", 0.40)], face_px=120, thresholds=SPIKE)
    assert d.state == "suggested"
    assert d.student_id == "ana"
    assert d.match_score == 0.80
    assert d.runner_up_student_id == "bia"
    assert d.persist_embedding is True


def test_abaixo_do_tau_vai_para_revisao_com_candidato():
    d = decide([Neighbor("ana", 0.45)], face_px=120, thresholds=SPIKE)
    assert d.state == "unassigned"
    assert d.student_id is None
    # O candidato é registrado para a fila de revisão mostrar sugestão.
    assert d.runner_up_student_id == "ana"
    assert d.runner_up_score == 0.45
    # D5: sem atribuição, sem vetor.
    assert d.persist_embedding is False


def test_margem_insuficiente_vai_para_revisao():
    # 0,80 e 0,75 passam no tau, mas 0,05 < 0,10: é o caso que a margem
    # existe para pegar — dois alunos parecidos.
    d = decide([Neighbor("ana", 0.80), Neighbor("bia", 0.75)], face_px=120, thresholds=SPIKE)
    assert d.state == "unassigned"
    assert d.persist_embedding is False
    assert d.runner_up_student_id == "ana"


def test_rosto_pequeno_vai_para_revisao_mesmo_passando():
    d = decide([Neighbor("ana", 0.90), Neighbor("bia", 0.10)], face_px=45, thresholds=SPIKE)
    assert d.state == "unassigned"
    assert d.persist_embedding is False


def test_duas_referencias_do_mesmo_aluno_nao_competem():
    # Quem cadastrou duas fotos não pode ser punido com margem zero.
    d = decide([Neighbor("ana", 0.90), Neighbor("ana", 0.88)], face_px=120, thresholds=SPIKE)
    assert d.state == "suggested"
    assert d.student_id == "ana"
    assert d.runner_up_student_id is None


def test_sem_vizinhos_e_sem_candidato():
    d = decide([], face_px=120, thresholds=SPIKE)
    assert d.state == "unassigned"
    assert d.runner_up_student_id is None
    assert d.persist_embedding is False


def test_limiares_vem_do_banco():
    t = Thresholds.from_row({"tau": 0.7, "margin": 0.2, "min_face_px": 80})
    assert (t.tau, t.margin, t.min_face_px) == (0.7, 0.2, 80)
    # Linha incompleta cai nos números do spike.
    padrao = Thresholds.from_row({})
    assert (padrao.tau, padrao.margin, padrao.min_face_px) == (0.52, 0.10, 60)
