# Spike M0 — reconhecimento facial

Marco M0 de [`docs/spec-upload-massa-reconhecimento-facial.md`](../../docs/spec-upload-massa-reconhecimento-facial.md).
Serve para **fixar com número** os parâmetros que a spec chutou (§7.3 e §11.1)
e confirmar ou reverter a decisão D1 (InsightFace self-hosted).

Roda **fora do app**: não importa nada de `artifacts/`, não toca o Supabase e
não escreve no banco.

## Regra de dado

Não usa — e não pode usar — foto real de criança ou adolescente
(spec §9.5, [`docs/pendencias-producao.md`](../../docs/pendencias-producao.md)).
O conjunto é o **LFW**, público e de adultos. A consequência disso para a
leitura dos resultados está registrada em
[`docs/spike-reconhecimento-facial.md`](../../docs/spike-reconhecimento-facial.md).

## O que cada script mede

| Script | Pergunta | Saída |
| --- | --- | --- |
| `src/bench_speed.py` | quanto tempo custa uma foto de 2560px com 1, 3, 8 e 20 rostos, por `det_size` | `results/speed.json` |
| `src/bench_scale.py` | a partir de que tamanho de rosto o detector falha, e como a similaridade cai | `results/scale.json` |
| `src/bench_throughput.py` | 1, 4 ou 8 processos por máquina — qual dá mais vazão | `results/throughput.json` |
| `src/bench_accuracy.py` | curva precisão × cobertura variando limiar e margem | `results/accuracy.json` |
| `src/report.py` | consolida os três em tabela | stdout |

Módulos de apoio: `src/engine.py` (motor), `src/dataset.py` (recorte do LFW),
`src/build_scenes.py` (composição das fotos sintéticas de evento).

## Como rodar

```bash
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
mkdir -p data && curl -L -o data/lfw.tgz https://ndownloader.figshare.com/files/5976015
tar -xzf data/lfw.tgz -C data
SPIKE_PYTHON=./.venv/bin/python ./run_all.sh
```

A primeira execução baixa o `buffalo_l` (~275 MB) para `~/.insightface`.

## Contêiner

O `Dockerfile` é o esqueleto do `face-worker` de produção: modelos embutidos na
imagem, sem download em runtime, usuário sem privilégio, e `genderage` +
landmarks **removidos da imagem** — inferir idade e gênero do rosto de uma
criança é tratamento sem finalidade no produto (Lei 15.211/2025, art. 13).

```bash
docker build -t iaschool/face-worker:spike .
docker run --rm iaschool/face-worker:spike
```

## O que fica fora

Fila, Supabase, RLS, recorte para revisão e expurgo. Tudo isso é M5/M6 da spec —
aqui só se mede o motor.
