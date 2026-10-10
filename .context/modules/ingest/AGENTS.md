# ingest

Worker Node que processa arquivo depois do upload. Um processo, `/health` na porta 8080.

## Entrada
- Pacote `@workspace/ingest-worker`. Arranque: `src/index.ts`.
- Consome a tabela `public.photo_jobs` (`artifacts/iaschool-app/supabase/fase2-photo-jobs-worker.sql`) com `kind = 'ingest'`: dimensões, miniatura WebP 320px, EXIF de reserva.
- Consome a tabela `public.delivery_render_jobs` (`artifacts/iaschool-app/supabase/fase5-delivery-batches.sql`): derivado desfocado por destinatário no bucket `delivery-assets`.
- Varre a tabela `public.storage_purge_queue` (`artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql`): apagar a linha no banco não apaga o objeto; este laço remove o arquivo.
- `Dockerfile` e `fly.toml` próprios. App na Fly: `iaschool-ingest-worker`.

## Depende de
- Schema e RPCs declarados no módulo `app`.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Quem depende
- A galeria e o progresso de lote do `app` esperam a miniatura e o status do job.
- A entrega espera o derivado gerado aqui.

## Sensível
- Service role só neste processo.
- Teste sem rede, com imagem sintética do `sharp`. Não usar foto real de criança.

## Comandos
- Dev: `pnpm --filter @workspace/ingest-worker run dev`
- Teste: `pnpm --filter @workspace/ingest-worker run test`
