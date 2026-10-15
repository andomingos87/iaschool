# ingest

Worker Node que processa arquivo depois do upload. Um processo, `/health` na porta 8080.

## Entregas com fotos nítidas — decisão de 13/10/2026

`src/original-delivery-render.ts` prepara a foto inteira nítida: orienta pelo EXIF, converte para JPEG sem máscaras/desfoque e remove os metadados; a miniatura deriva desse JPEG. `public.delivery_items.render_policy = 'original_v1'`, em `artifacts/iaschool-app/supabase/delivery-original-photos.sql`, identifica o formato novo. O contexto dispensa regiões e atestação manual. `protected_regions_v1` preserva a política dos álbuns antigos já aprovados/transmitidos; o renderer localizado abaixo permanece apenas para compatibilidade.

`public.complete_delivery_render_job` exige o marcador da política, dimensões orientadas de `public.photos.width`/`public.photos.height`, versão corrente do rascunho e lease. Os caminhos incluem `original_v1` e o lease, impedindo confusão com um arquivo desfocado antigo ou gravação atrasada. O contexto e a conclusão revalidam escola/evento, vínculo confirmado do aluno, autorização do destinatário e seleção. O guard do álbum mantém aprovação, número verificado, retenção e revogação; `public.delivery_approvals.items` fixa também a política. Todas essas regras estão em `artifacts/iaschool-app/supabase/delivery-original-photos.sql`.

A migration deixa rascunhos antigos sem aprovação/envio com `public.delivery_render_jobs.last_error = 'render_atualizacao_necessaria'` e estado de falha, sem claim automático. Somente a ação explícita de atualizar/repetir converte as fotos selecionadas para `original_v1`. Retirar uma foto defeituosa preserva o arquivo original e permite aprovar as selecionadas válidas. Alterar regiões não invalida uma foto nítida; a cópia protegida já aprovada não é substituída silenciosamente.

Verificação local em 13/10/2026: 69 testes do ingest e typecheck passaram, incluindo contraste de pixels no centro/bordas e na miniatura, orientação/remoção de EXIF e tratamento de arquivo inválido. O PostgreSQL descartável passou com migration idempotente, compatibilidade de snapshots, ausência de processamento automático, consentimento durante o preparo, isolamento entre escolas, recusa do worker antigo, dimensões, lease/rascunho, retirada de falha e privilégios privados. Nenhuma foto real foi processada neste trabalho; publicação e validação integrada pertencem à etapa de entrega.

## Geração em lote — publicada em 12/10/2026

`src/generation-loop.ts` consulta `public.claim_generation_batch_items` de `artifacts/iaschool-app/supabase/generation-batches.sql` e processa uma arte por vez. Usa lease de 600 segundos e requisição de até 420 segundos à API já existente, que pode acordar sob demanda. `GENERATION_API_URL` opcional aponta para a origem HTTPS da API; o padrão é `https://iaschool-api.fly.dev`. Não há segredo novo, chamada OpenAI neste worker ou máquina adicional. O corpo é autenticado por HMAC com a service role existente; falha de transporte não repete o pedido. A próxima reivindicação só recupera o arquivo já salvo se o provedor começou; resultado incerto sem arquivo termina em `unknown` e pede repetição manual explícita.

Falha de um aluno não interrompe os seguintes. Encerramento aguarda o processamento em voo; se o processo for interrompido, o lease persistido permite recuperação sem nova chamada automática à IA. A fila guarda estados em `public.generation_batch_items`, mantém a tentativa por caminho determinístico no bucket privado `generated` e depende das revalidações de consentimento, foto e tenant feitas pelo SQL/API. A migration `iaschool_generation_batches`, versão `20261012194454`, foi aplicada pelo MCP local em 12/10/2026. Ingest release `v4`, imagem `deployment-01M4RTDXDS9HM7ZP0386C2GYWD`, foi publicada na mesma máquina de 1 CPU compartilhada/1 GB; check Fly e health reais passaram, com tick recente, zero trabalhos em voo e zero lotes parados. Os 58 testes locais do worker passaram com mocks e imagens sintéticas. Saúde/polling não comprovam conclusão de uma geração: nenhum lote novo ou chamada OpenAI foi iniciado nesta publicação.

`public.claim_generation_batch_items` também reconcilia até 100 arquivos de lote órfãos, substituídos ou sem autorização por chamada, inserindo em `public.storage_purge_queue` (`generation-batches.sql` e `fase3-review-audit-purge.sql`). Isso cobre arquivo gravado depois que um expurgo anterior terminou, sem apagar a tentativa atual autorizada. O expurgo existente continua assíncrono; não há promessa de corte imediato de URL já emitida.

Limite do MVP: a reconciliação acompanha o polling de cinco segundos. Antes de crescer o volume de arquivos, medir o custo da consulta e separar seu intervalo do claim; o limite de 100 inserções por rodada não limita sozinho todas as linhas examinadas.

## Entrada
- Pacote `@workspace/ingest-worker`. Arranque: `src/index.ts`.
- Consome a tabela `public.photo_jobs` (`artifacts/iaschool-app/supabase/fase2-photo-jobs-worker.sql`) com `kind = 'ingest'`: dimensões, miniatura WebP 320px, EXIF de reserva.
- Consome `public.delivery_render_jobs` (`artifacts/iaschool-app/supabase/fase5-delivery-batches.sql` e `fase5-adjustments-delivery-album.sql`): derivados localizados por responsável no bucket privado `delivery-assets`.
- S05 **implementada e verificada localmente em 12/10/2026**: `src/localized-delivery-render.ts` mantém a cena nítida, protege a pessoa inteira por máscara retangular/poligonal conferida e faz a proteção prevalecer nas sobreposições. Exige autoria, cobertura dos rostos detectados, dimensões orientadas e atestação de revisão completa corrente; falhas ficam pendentes. Miniatura deriva do mesmo JPEG protegido, sem metadados.
- `public.delivery_render_contexts` obtém em uma chamada por lote (reusando `public.delivery_render_context`) o snapshot de `public.photo_person_regions` e `public.photos.regions_version`, `public.photos.regions_reviewed_version`, `public.photos.all_people_reviewed`, `public.photos.regions_reviewed_width`/`public.photos.regions_reviewed_height` (`artifacts/iaschool-app/supabase/fase5-review-media.sql`). `public.complete_delivery_render_job` confere atomicamente versão do rascunho e da região, grava `public.delivery_items.rendered_regions_version` e recusa render atrasado (`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`). Caminho inclui versão do rascunho/região e `public.delivery_render_jobs.lease_version`, contador monotônico que não zera no retry; trabalhador atrasado não sobrescreve outra versão/lease. Falha parcial agenda ambos os caminhos no expurgo.
- S06/S07 guardam texto/seleção/ordem e aprovação imutável em `public.delivery_approvals`/`public.delivery_item_students`, acesso com hash de token em `public.delivery_album_tokens` e sessão fixa em `public.delivery_access_sessions` (`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`). Reemissão preserva sessões anteriores e revogação fecha acesso; SQL e publicações foram autorizados separadamente; validação integrada de fotos/álbum deve ser conferida no estado do produto.
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

## Diagnóstico do render — publicado em 13/10/2026

`render-handler.ts` grava códigos seguros por etapa: `render_revisao_pendente`, `render_download_falhou`, `render_imagem_invalida`, `render_upload_falhou`, `render_timeout`; contexto ausente usa `render_contexto_indisponivel`, falha inesperada do processamento usa `render_processamento_falhou`. Antes do download, `assertDeliveryReviewReady` recusa revisão incompleta, versão desatualizada, dimensões ausentes ou falta de regiões. Erros nativos de decodificação são substituídos por tipo seguro. O laço e a conclusão não registram mensagens cruas de Storage/SQL/sharp. Caminhos tentados continuam apenas na conclusão da RPC para o expurgo, com as versões do rascunho/regiões/lease preservadas.

O sinal de timeout é conferido entre operações e após cada upload, impedindo concluir com sucesso quando o prazo já expirou. Ele não interrompe por si só uma operação de Storage/sharp que já está em curso. Jobs antigos com `public.delivery_render_jobs.last_error = 'render_indisponivel'` (`artifacts/iaschool-app/supabase/fase5-delivery-batches.sql` e `fase5-adjustments-delivery-album.sql`) não permitem recuperar retrospectivamente qual etapa falhou: o código anterior agrupava todas elas. Correção publicada na release ingest `v5`, imagem `deployment-01M4TCRTQSJ09MPMT63S3NE8X3`, em 13/10/2026, preservando a mesma máquina/configuração de 1 CPU compartilhada/1 GB. Health real 200, tick recente e check Fly passaram. Os 64 testes locais e o typecheck passaram; não foi criado lote nem reenfileirada foto real para validar esta publicação. Saúde do processo não comprova resolução de um job histórico.

## Comandos
- Dev: `pnpm --filter @workspace/ingest-worker run dev`
- Teste: `pnpm --filter @workspace/ingest-worker run test`

- Publicação Fly em 12/10/2026: release `v3`, imagem `deployment-01M4RECYHSM50QTH2GS2V7170X`, mesma máquina compartilhada de 1 CPU/1 GB. Health check e `/health` reais passaram (HTTP 200); saúde do processo não comprova entrega de um lote.


### Publicação coordenada das fotos nítidas — 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
