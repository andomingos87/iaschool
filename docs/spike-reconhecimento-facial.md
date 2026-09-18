# Spike M0 — reconhecimento facial: resultados

**Marco:** M0 de [`docs/spec-upload-massa-reconhecimento-facial.md`](spec-upload-massa-reconhecimento-facial.md) §14
**Executado em:** 31/08/2026
**Código:** [`scripts/spike-face/`](../scripts/spike-face/) · saídas em `scripts/spike-face/results/`
**Máquina:** Apple M4, 15 núcleos, 24 GB, **CPU** (`onnxruntime` 1.29, `CPUExecutionProvider`)
**Motor:** InsightFace `buffalo_l` — SCRFD `det_10g` (detecção) + ArcFace `w600k_r50` (512-d)

---

## 1. Veredito

**D1 confirmada: InsightFace self-hosted.** O motor entrega, em CPU comum e sem
GPU, precisão e vazão acima das metas da spec §12.2 e §11.1. Não há razão
técnica para mandar rosto de criança para uma API de terceiro.

Mas o spike **derruba quatro parâmetros** que a spec tinha chutado. As correções
estão na §6, e a spec já foi atualizada.

| Meta da spec | Alvo | Medido | Situação |
| --- | --- | --- | --- |
| Precisão da faixa `suggested` | ≥ 0,99 | **0,993** | atingida |
| Cobertura | ≥ 0,85 | **0,954** | atingida |
| Rostos na fila de revisão | ≤ 15% | **4,6%** | atingida |
| Falso positivo entre escolas | 0 | 5 em 1.183 — **ver §4.2** | atingida por construção, não por limiar |
| Detecção + embedding por foto | ≤ 1,5 s | **0,21 s** (2560px, 3 rostos, `det_size` 1600) | atingida |
| Evento de 2.000 fotos | ≤ 60 min | **~7 min** nesta máquina | atingida — mas ver §5.3 |

> **A leitura tem um teto.** O conjunto é LFW: **adultos**, recorte alinhado,
> majoritariamente frontal e bem iluminado (§7). Foto real de evento escolar,
> com criança em movimento, contraluz e rosto de perfil, é mais difícil.
> Trate estes números como **limite superior**, não como previsão de produção.

---

## 2. O que foi medido

| Script | Pergunta |
| --- | --- |
| `bench_speed.py` | tempo por foto de 2560px, por `det_size` e nº de rostos |
| `bench_scale.py` | a partir de que tamanho de rosto o detector falha |
| `bench_accuracy.py` | curva precisão × cobertura, com os falsos positivos separados por tipo |
| `bench_throughput.py` | vazão agregada da máquina com 1, 4 e 8 processos |

Conjunto: LFW, 13.233 imagens, 5.749 identidades. Recorte usado: 200 alunos
"matriculados" (2 fotos de referência + até 5 sondas), 200 identidades de uma
segunda escola e 499 distratores sem cadastro.

---

## 3. Velocidade

Foto de 2560×1706, CPU, só os modelos de detecção e reconhecimento.

| `det_size` | 1 rosto | 3 rostos | 8 rostos | 20 rostos |
| --- | --- | --- | --- | --- |
| 640 | 47 ms | 81 ms | 168 ms | 379 ms |
| 800 | 63 ms | 97 ms | 185 ms | 400 ms |
| 1024 | 90 ms | 123 ms | 214 ms | 432 ms |
| **1600** | 178 ms | **213 ms** | 300 ms | **511 ms** |

Subir de 640 para 1600 custa 132 ms por foto de 3 rostos — e é o que recupera o
rosto pequeno (§5.1). Em foto cheia (20 rostos) a diferença cai para 132 ms
também, porque aí o custo é dominado pelo reconhecimento, que roda por rosto e
independe do `det_size`.

### 3.1 Os modelos extras custam 82%

`buffalo_l` traz cinco modelos. O produto usa dois.

| Configuração | 3 rostos |
| --- | --- |
| só detecção + reconhecimento | 81 ms |
| pacote completo (+ `genderage`, `2d106det`, `1k3d68`) | **148 ms** |

Ligar `genderage` custaria 82% de tempo **e** inferiria idade e gênero do rosto
de uma criança — tratamento sem finalidade declarada no produto (Lei
15.211/2025, art. 13). O motor do spike carrega apenas os dois necessários, e o
`Dockerfile` **apaga os outros três da imagem**: o que não está no contêiner não
é ligado por engano depois.

---

## 4. Acurácia

### 4.1 A separação é limpa

| Distribuição de `sim1` | mediana | p05 / p99 | extremo |
| --- | --- | --- | --- |
| sonda de aluno, top-1 correto (n=736) | 0,695 | p05 = 0,542 | — |
| sonda de pessoa sem cadastro (n=1.183) | 0,187 | p99 = 0,303 | máx **0,712** |

A sobreposição é um caso: um único par de sósias que chega a 0,712 — acima da
mediana dos acertos. Nenhum limiar separa esse caso; é exatamente para ele que
existe a revisão humana (D6).

### 4.2 Curva, com os erros separados por gravidade

Regra: sugere se `sim1 ≥ tau` **e** `sim1 − sim2 ≥ margem`. Margem 0,10.

| tau | acertos | **aluno errado** | pessoa parecida | precisão | cobertura | revisão |
| --- | --- | --- | --- | --- | --- | --- |
| 0,40 | 731 | 1 | 5 | 0,9919 | 0,980 | 1,9% |
| 0,50 | 721 | 1 | 5 | 0,9917 | 0,966 | 3,2% |
| **0,52** | **712** | **0** | **5** | **0,9930** | **0,954** | **4,6%** |
| 0,58 | 665 | 0 | 5 | 0,9925 | 0,891 | 10,9% |
| 0,64 | 557 | 0 | 3 | 0,9946 | 0,747 | 25,3% |
| 0,70 | 349 | 0 | 1 | 0,9971 | 0,468 | 53,2% |
| 0,72 | 276 | 0 | 0 | 1,0000 | 0,370 | 63,0% |

Três tipos de erro, com gravidades muito diferentes:

| Tipo | O que é no produto | Resultado |
| --- | --- | --- |
| **Aluno errado** | a foto de uma criança entra na pasta de outra | **zera em `tau ≥ 0,52`** com margem 0,10 |
| Pessoa parecida | um irmão, um visitante ou um adulto vira "aluno" | 5 em 1.183 (0,42%); só zera em `tau ≥ 0,72` |
| Distrator | pessoa sem nenhuma referência recebe sugestão | **0 em qualquer limiar** |

A margem faz trabalho real: sem ela, `aluno errado` só zera em `tau = 0,62`
(cobertura 0,81). Com margem 0,10, zera em `tau = 0,52` (cobertura 0,95). Os
casos que ela pega são justamente os de dois candidatos empatados — o padrão do
erro grave.

### 4.3 Sobre o "falso positivo entre escolas"

As 5 sugestões erradas vêm de sondas de identidades da "escola B" comparadas
contra a galeria da escola A. **Isso não é o teste de vazamento entre escolas** —
esse é resolvido por construção: o filtro `school_id` está dentro da função de
busca (spec D7), então a comparação nunca acontece em produção. O que essas 5
medem é o caso real: **alguém que não é aluno daquela escola, mas se parece com
um**. É a mesma família dos distratores, só que com sondas mais numerosas.

O teste de vazamento propriamente dito é de RLS, não de modelo, e está em
§12.3 da spec.

---

## 5. Operação

### 5.1 Tamanho do rosto — `det_size` é o parâmetro que decide

Taxa de detecção do rosto colado, em foto de 2560px:

| Rosto | `det_size` 640 | 1024 | 1600 | similaridade quando detecta |
| --- | --- | --- | --- | --- |
| ≥ 110 px | 100% | 100% | 100% | 0,72 |
| 90 px | 70% | 100% | 100% | 0,72 |
| 70 px | 35% | 98% | 100% | 0,71 |
| 60 px | 8% | 92% | 100% | 0,69 |
| 50 px | 0% | 72% | 98% | 0,68 |
| 40 px | 0% | 30% | 88% | 0,63 |
| 30 px | 0% | 0% | 52% | 0,54 |

Dois achados:

1. **`det_size` 640 perde o fundo da foto de turma.** Rosto de 70px — a criança
   na terceira fileira — só é achado em 35% das vezes. Era o valor que a spec
   assumia.
2. **A similaridade cai devagar.** Rosto detectado a 40px ainda dá 0,63. O
   gargalo é detecção, não reconhecimento — e `det_size` alto resolve.

### 5.2 `det_size` alto **quebra** o retrato

Medido: com `det_size` 1024, **14 de 15 retratos de 250px não foram detectados**.
O SCRFD reescala a imagem inteira para o `det_size`; ampliar um retrato põe o
rosto acima da maior âncora do detector e ele não vê nada.

Consequência de arquitetura: **`det_size` é por tipo de trabalho, não global.**

| Trabalho | Imagem | `det_size` |
| --- | --- | --- |
| Rosto de referência do aluno | retrato, rosto grande | **640** |
| Foto de evento | 2560px, rostos de 40 a 300px | **1600** |

O embedding em si é indiferente: o mesmo rosto vetorizado com `det_size` 640 e
1024 dá similaridade **0,990**. Só a detecção muda, então misturar `det_size`
entre referência e sonda é seguro.

### 5.3 Vazão: escala com máquinas, não com processos

| Processos em paralelo | Vazão agregada |
| --- | --- |
| **1** | **292 fotos/min** |
| 4 | 255 fotos/min |
| 8 | 207 fotos/min |

Medido por `src/bench_throughput.py`, `det_size` 1600, 3 rostos por foto.

O `onnxruntime` já usa todos os núcleos dentro de uma sessão. Rodar mais
processos só adiciona disputa. **A concorrência do `face-worker` é 1 por
máquina** — a spec dizia "2 por vCPU", o que degradaria a vazão.

Um evento de 2.000 fotos com 3 rostos cada leva **~7 minutos** nesta máquina.

> **Este número não vale para a máquina de produção.** É um Apple M4 de 15
> núcleos. Um vCPU compartilhado de nuvem é bem mais lento e o spike não tem
> como medir isso daqui. Antes de dimensionar o M5, rode
> `scripts/spike-face/src/bench_throughput.py` **na máquina alvo**.

### 5.4 Custo

Com concorrência 1 por máquina e ~290 fotos/min de referência, uma máquina
absorve com folga o volume de uma escola piloto (alguns eventos por mês). A
conta de infraestrutura é de **uma máquina pequena de CPU ligada por demanda**,
sem GPU.

Não converti isso em valor mensal: a tabela de preços muda e o número medido
aqui é de um M4, não da máquina que vai rodar. Feche o custo junto com a medição
da §5.3 na máquina alvo.

### 5.5 A comparação com o Rekognition não foi feita

A spec (§14, item 6) previa uma hora comparando com AWS Rekognition em dado
sintético. **Não foi executada**: não há credencial AWS neste ambiente e criar
conta e chave está fora do que o spike podia fazer sozinho.

O que se sabe sem medir: o Rekognition resolveria o problema técnico, e o
argumento contra ele nunca foi acurácia — é que o embedding facial de criança
sairia do perímetro do projeto para uma coleção de terceiro em outro país
(spec §9.1). Como o motor local **atingiu todas as metas**, a comparação virou
opcional. Se ainda assim for desejada, ela é uma tarefa de 1 hora com uma chave
AWS e dado sintético — nunca com foto de aluno.

---

## 6. O que muda na spec

| Onde | Antes | Depois | Por quê |
| --- | --- | --- | --- |
| §7.3, `det_size` | não especificado (640 implícito) | **640 na referência, 1600 na foto de evento** | §5.1 e §5.2 |
| §7.3, `min_face_px` | 40 | **40 mantido, mas rosto < 60px vai direto para revisão** | a 40px a similaridade cai para 0,63 e encosta na faixa de dúvida |
| §7.3, limiares | `tau` 0,65 / banda 0,45–0,65 / margem 0,05 | **`tau` 0,52, margem 0,10**, banda de revisão abaixo disso | §4.2 — `tau` 0,65 jogaria 34% dos rostos na revisão sem ganho de precisão |
| §11, concorrência | "2 por vCPU" | **1 processo por máquina** | §5.3 |
| §11.1, tempo por foto | ≤ 1,5 s | 0,21 s medido; meta revista para **≤ 0,5 s** | §3 |
| §9.1, modelos | "não usar `genderage`" | **`genderage` e landmarks apagados da imagem** | §3.1 |

---

## 7. Limites desta medição

1. **LFW é de adultos.** O ArcFace foi treinado majoritariamente em adulto. Não
   há evidência aqui sobre criança de 4 a 10 anos, que é o público central do
   produto. **Este é o risco não endereçado do spike** — e não pode ser
   endereçado antes do piloto, porque medir exigiria foto real de criança, o que
   a regra de conformidade proíbe nesta fase.
2. **As fotos de evento são sintéticas.** Rostos do LFW colados sobre fundo
   gerado. Isso mede detector e escala com fidelidade, mas não reproduz
   contraluz, movimento, oclusão parcial nem rosto de perfil.
3. **O LFW é alinhado (`funneled`).** Rosto centrado e endireitado — condição
   melhor que a de uma foto de festa junina.
4. **Uma máquina, um sistema operacional.** Apple M4, macOS, arm64. Sem medição
   em x86 nem em GPU.
5. **Duas referências por aluno**, como a spec exige. Mais referências
   provavelmente elevam a cobertura; não foi medido.
6. **O `Dockerfile` não foi construído.** Não há Docker nesta máquina; os
   benchmarks rodaram num venv com as mesmas versões de `requirements.txt`. O
   contêiner é o esqueleto do `face-worker` (modelos embutidos, `genderage` e
   landmarks apagados, usuário sem privilégio) e precisa de um
   `docker build` antes do M5.

### 7.1 Consequência para o piloto

Entrar no piloto com os limiares da §6 e **medir de novo com o dado real da
escola**, antes de reduzir a revisão manual. A tabela de limiares vive em
`face_recognition_settings` justamente para ser recalibrada sem deploy.

Enquanto a calibração com criança não existir, a revisão humana obrigatória
(D6) não é conservadorismo — é o que segura o único risco que este spike não
conseguiu medir.

---

## 8. Reproduzir

```bash
cd scripts/spike-face
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
mkdir -p data && curl -L -o data/lfw.tgz https://ndownloader.figshare.com/files/5976015
tar -xzf data/lfw.tgz -C data && ln -s lfw_funneled data/lfw
SPIKE_PYTHON=./.venv/bin/python ./run_all.sh
```

Sementes fixas (`20260831`), versões travadas em `requirements.txt`.
