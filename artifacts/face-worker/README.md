# face-worker

Worker de reconhecimento facial do IAschool (spec §7.3 e §7.4, marco M5).
Python 3.12 + `onnxruntime` + `insightface`, **um processo por máquina**.

Consome duas filas:

| Fila | O que faz | `det_size` |
| --- | --- | --- |
| `photo_jobs` (`kind = 'recognize'`) | detecta os rostos de uma foto de evento, compara com as referências da escola e grava `photo_faces` | 1600 |
| `student_reference_jobs` | vetoriza o retrato de referência de um aluno | 640 |

A fila de referência tem prioridade: ela destrava o cadastro da escola, e sem
referência o reconhecimento não tem contra o que comparar.

## O que este worker nunca faz

- **Não confirma atribuição.** O melhor que ele produz é `suggested`; a
  confirmação é humana (D6, spec §7.5). A tela de revisão é do M6.
- **Não guarda vetor de quem não consentiu.** O embedding de um rosto sem
  correspondência existe em memória, pelo tempo da comparação, e morre ali
  (D5, spec §9.3). O banco recusa se o worker tentar.
- **Não infere idade nem gênero.** `genderage` é removido da imagem *e* não é
  carregado pelo código (Lei 15.211/2025, art. 13).
- **Não loga** nome de aluno, nome de arquivo, URL assinada, recorte ou
  embedding. O log tem id, contagem, duração e resultado.

## Desenvolvimento

```bash
pnpm --filter @workspace/face-worker run setup   # cria .venv e instala
pnpm --filter @workspace/face-worker run test    # pytest
```

Para rodar contra o banco:

```bash
set -a; . ./.env.local; set +a
artifacts/face-worker/.venv/bin/python -m face_worker
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são obrigatórias. O resto tem
padrão (`config.py`). Os **limiares não estão aqui**: `tau`, margem e
`min_face_px` vivem em `face_recognition_settings`, no banco, para o piloto
recalibrá-los sem deploy. O worker relê a linha a cada minuto.

Na primeira execução local o `buffalo_l` (~275 MB) é baixado para
`~/.insightface`. No contêiner ele já vem na imagem.

## Verificação ponta a ponta

`scripts/live_check.py` semeia uma escola de ensaio, sobe material de teste,
roda **este mesmo binário** e confere o resultado no banco, apagando tudo no
fim:

```bash
set -a; . ./.env.local; set +a
artifacts/face-worker/.venv/bin/python artifacts/face-worker/scripts/live_check.py
```

O material é `scripts/spike-face/results/sample_scene_20_faces.jpg` — cena
sintética com 20 rostos do LFW, conjunto público **de adultos**. Nenhuma foto
real de criança entra aqui (spec §9.5).

Executado em 21/09/2026: 20 rostos detectados, 3 sugeridos (os alunos com
referência), 17 `unassigned` sem vetor, evento movido para `review`.

## Deploy

```bash
fly deploy --config artifacts/face-worker/fly.toml \
           --dockerfile artifacts/face-worker/Dockerfile artifacts/face-worker
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... -a iaschool-face-worker
```

Escale com `fly scale count N`, **não** com mais processos por máquina: o
`onnxruntime` já usa todos os núcleos dentro de uma sessão, e o spike mediu 1,
4 e 8 processos com a mesma vazão agregada (spec §11).

`/health` responde 503 quando o laço trava, quando há lote parado com job
pendente (view `stalled_batch_jobs`) ou durante o encerramento — a checagem da
Fly reinicia a máquina.

## Desempenho medido

Nesta máquina (Apple M4, contra o Supabase em us-east-1):

| Trabalho | Tempo |
| --- | --- |
| Carregar os dois modelos | ~0,5 s |
| Retrato de referência (`det_size` 640) | 1,5–2,2 s |
| Foto de 2560px com **20 rostos** (`det_size` 1600) | ~12,5 s |

A meta da spec §11.1 é ≤ 0,5 s por foto com ~3 rostos. O número acima não a
contradiz nem a confirma: 20 rostos são 20 buscas vetoriais e 20 uploads de
recorte, e daqui a rede até o Storage domina o relógio — o mesmo que aconteceu
com o `ingest-worker` no M3. **A medição que vale é com o worker na mesma
região**, e ela ainda não foi feita.
