# ingest-worker

Consome a fila `photo_jobs` (`kind = 'ingest'`) do IAschool: para cada foto
enviada, baixa o JPEG 2560px de `event-photos`, lê as dimensões, usa o EXIF
como reserva de `taken_at` (o cliente já manda a data no insert), gera a
miniatura WebP 320px em `event-thumbs` e conclui pela RPC
`complete_photo_job`, que atualiza `photos`, enfileira `recognize` e mexe nos
contadores de `batch_jobs` (o app assina por Realtime). Spec §7.2 e §11.

É o único lugar, além do `api-server`, que carrega `SUPABASE_SERVICE_ROLE_KEY`.

## Variáveis

| Variável | Padrão | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | obrigatória | projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | obrigatória | fila e Storage ignoram RLS |
| `PORT` | `8080` | `/health` |
| `WORKER_CONCURRENCY` | `8` | jobs em paralelo (spec §7.2) |
| `CLAIM_BATCH` | `16` | jobs por `claim_photo_jobs` |
| `LEASE_SECONDS` | `120` | lease do job; expirou → outro worker repega |
| `JOB_TIMEOUT_MS` | `60000` | teto por job |
| `IDLE_BACKOFF_MIN_MS` / `IDLE_BACKOFF_MAX_MS` | `1000` / `5000` | espera com fila vazia |
| `STALL_CHECK_INTERVAL_MS` | `30000` | consulta a `stalled_batch_jobs` |
| `LOOP_STALE_MS` | `60000` | laço sem tick há mais que isto → `/health` 503 |
| `THUMB_SIZE` / `THUMB_QUALITY` | `320` / `80` | miniatura (D4) |
| `LOG_LEVEL` | `info` | pino |

## Rodar

```bash
# na raiz, com .env.local exportado (set -a; . ./.env.local; set +a)
pnpm --filter @workspace/ingest-worker run dev
pnpm --filter @workspace/ingest-worker run test
pnpm --filter @workspace/ingest-worker run build && pnpm --filter @workspace/ingest-worker run start
curl -s localhost:8080/health
```

`/health` responde `200 {ok:true,…}` ou `503` com `reason` em
`stalled_batches` (lote `running` parado há > 10 min **com job pendente**),
`loop_stale` (laço travado) ou `stopping`. Lote abandonado pelo cliente sem
job pendente não derruba o health, senão a Fly reiniciaria a máquina em laço.

## Log

Estruturado (pino). Por job: `batch_id`, `photo_id`, `job_id`, `attempt`,
`duration_ms`, `result`, `reason` e, em erro, `err` (mensagem curta). Nunca
nome de arquivo original, nome de aluno, URL assinada ou conteúdo da foto.

## Contêiner

```bash
docker build -f artifacts/ingest-worker/Dockerfile -t iaschool-ingest-worker .
docker run --rm -p 8080:8080 -e SUPABASE_URL -e SUPABASE_SERVICE_ROLE_KEY iaschool-ingest-worker
```

## Deploy na Fly — roteiro (**não executado**)

`fly.toml` e `Dockerfile` estão prontos; o deploy real não foi feito neste
marco (decisão de 21/09/2026, BACKLOG M3). Quando for:

```bash
fly launch --no-deploy --copy-config --config artifacts/ingest-worker/fly.toml --name iaschool-ingest-worker --region gru
fly secrets set -a iaschool-ingest-worker SUPABASE_URL="https://jtyyauivokutperouqyh.supabase.co" SUPABASE_SERVICE_ROLE_KEY="…"
fly deploy --config artifacts/ingest-worker/fly.toml --dockerfile artifacts/ingest-worker/Dockerfile .
fly checks list -a iaschool-ingest-worker
fly logs -a iaschool-ingest-worker
```

Escalar com máquinas, não com processos: `fly scale count 2 -a iaschool-ingest-worker`.
