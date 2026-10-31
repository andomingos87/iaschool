# ingest-worker

**Revisado em 25/10/2026 contra o código local.** Quatro loops em `src/index.ts`:

- Ingestão de `public.photo_jobs` (`kind=ingest`): dimensões/EXIF de reserva, miniatura WebP 320px e conclusão que enfileira reconhecimento; SQL `artifacts/iaschool-app/supabase/fase2-photo-jobs-worker.sql`.
- Preparo de `public.delivery_render_jobs`: fotos nítidas `original_v1`, sem EXIF, e miniatura do mesmo JPEG. Compatibilidade com entregas protegidas antigas; SQL `artifacts/iaschool-app/supabase/fase5-delivery-batches.sql`, `fase5-adjustments-delivery-album.sql` e `delivery-original-photos.sql`.
- Geração de `public.generation_batch_items`: reivindica uma tentativa por vez e chama a API assinada; SQL `artifacts/iaschool-app/supabase/generation-batches.sql`.
- Expurgo de `public.storage_purge_queue`: remove objetos do Storage; SQL `artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql`.

`SUPABASE_SERVICE_ROLE_KEY` é credencial de servidor. API, face-worker e Edge
Functions também a usam; nunca deve ir ao browser.

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
| `PURGE_INTERVAL_MS` / `PURGE_BATCH` | `60000` / `100` | varredura e quantidade de objetos no expurgo |
| `DELIVERY_THUMB_SIZE` / `DELIVERY_JPEG_QUALITY` | `960` / `82` | prévia e JPEG de entrega |
| `DELIVERY_BLUR_SIGMA` | `30` | compatibilidade do render protegido legado |
| `GENERATION_API_URL` | `https://iaschool-api.fly.dev` | destino HTTPS do processamento de arte; iniciar worker local pode chamar a API publicada |
| `LOG_LEVEL` | `info` | pino |

A geração usa claim de um item, lease de 600 s, polling de 5 s e timeout HTTP
de 420 s (`src/generation-loop.ts`); não usa `WORKER_CONCURRENCY` para iniciar
gerações paralelas. Falha incerta aguarda recuperação no banco, sem repetir IA.

## Rodar

Somente com ambiente de servidor exportado e destino autorizado. O processo
consome filas reais das credenciais e pode gerar custos. Para verificar regras,
use o teste local, que simula as dependências.

```bash
# na raiz, com variáveis de servidor já exportadas
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

## Publicação registrada e comandos de referência

Primeira publicação registrada em 26/09/2026: app `iaschool-ingest-worker`, org `personal`, região
`gru`, uma máquina `shared-cpu-1x` 1 GB, check em `/health` passando. Painel:
<https://fly.io/apps/iaschool-ingest-worker/monitoring>.

Registro posterior: ingest v6 em 13/10/2026, fotos nítidas. Não houve
consulta remota nesta revisão. Deploy, secrets e escala abaixo exigem
autorização específica.

Contexto de build = **raiz do repositório** (lockfile e workspace ficam lá).
`--remote-only` porque o Docker local não precisa estar ligado; `--ha=false`
porque a escala é manual (sem a flag o primeiro deploy cria duas máquinas).

```bash
fly secrets set -a iaschool-ingest-worker SUPABASE_URL="https://jtyyauivokutperouqyh.supabase.co" SUPABASE_SERVICE_ROLE_KEY="…"
fly deploy --config artifacts/ingest-worker/fly.toml --dockerfile artifacts/ingest-worker/Dockerfile --remote-only --ha=false .
fly checks list -a iaschool-ingest-worker
fly logs -a iaschool-ingest-worker
```

Escalar com máquinas, não com processos: `fly scale count 2 -a iaschool-ingest-worker`.
