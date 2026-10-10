# ingest

Worker Node que processa arquivo depois do upload. Um processo, `/health` na porta 8080.

## Entrada
- Pacote `@workspace/ingest-worker`. Arranque: `src/index.ts`.
- Consome `photo_jobs` (`kind = 'ingest'`): dimensões, miniatura WebP 320px, EXIF de reserva.
- Consome `delivery_render_jobs`: derivado desfocado por destinatário no bucket `delivery-assets`.
- Varre `storage_purge_queue`: apagar a linha no banco não apaga o objeto; este laço remove o arquivo.
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
