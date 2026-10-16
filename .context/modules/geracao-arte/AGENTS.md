# geracao-arte

Índice de domínio, sem pasta própria. UI e SQL no `app`, geração na `api`, execução persistente no `ingest`. Atualizado em 15/10/2026.

## Fluxo vigente — wizard com modelo

`/gerar` tem três etapas: alunos e turmas; modelo da escola; confirmação das fotos. Uma arte por aluno, um modelo por lote. Turma marca os alunos aptos; dá para desmarcar e acrescentar aluno de outra turma. A lista sai em ordem alfabética, agrupada pela turma. O texto é opcional. O servidor grava um prompt não vazio com a regra das duas imagens em `public.generation_batches.prompt`.

O app envia IDs, escola, texto livre, `referenceId`, atalhos e requestId para `/api/generation/batches`. O servidor compõe o prompt e revalida vínculo, modelo e autorização. A primeira imagem da edição é o modelo em `public.reference_posts` (bucket `references`, só a escola ativa; modelo global fica de fora). A segunda é a foto do aluno. Foto de perfil continua o padrão. `reference_face` usa `public.student_reference_faces.source_photo_path` no bucket `student-refs`, com retenção vigente. Evento continua exigindo aluno sozinho e revisão. Identidade é orientação à IA, sem promessa de pixels iguais.

`public.generation_batches.reference_post_id` e `public.generation_batches.reference_path` estão no SQL de referência `artifacts/iaschool-app/supabase/generation-batches.sql`. A migration nova ainda não foi aplicada no projeto.

`public.generation_batches`, `public.generation_batch_items` e `public.generation_batch_retries` (`artifacts/iaschool-app/supabase/generation-batches.sql`, migration `iaschool_generation_batches` aplicada via MCP local em 12/10/2026) persistem o lote e reservam cota completa atomicamente em `public.generation_usage` (mesmo SQL e `generation-quota.sql`). Pedido repetido não duplica cota/lote. O ingest existente reivindica um item e aciona a API com assinatura interna; SDK sem retry automático. Fechar a página não cancela o lote. Falha parcial continua os outros; nova tentativa paga somente por ação explícita para falhos/incertos. Resultado já persistido recupera salvamento sem gerar novamente.

Cada sucesso salva `public.generated_posts` (`artifacts/iaschool-app/supabase/setup.sql` e `generation-batches.sql`) e asset determinístico no bucket `generated`. RLS restringe o namespace novo, revalida origem/consentimento e impede escrita pelo browser. Assinaturas de até cinco minutos, renovadas sem cache longo; URLs já emitidas podem continuar válidas até expirar ou o expurgo remover o arquivo. Revogação enfileira o expurgo. Ampliação/download renovam URL por detalhe. Envio manual continua com `shareBlockers` e auditoria; WhatsApp comercial permanece desligado.

## Arquivos principais

- App: `artifacts/iaschool-app/src/pages/generate.tsx`, `src/components/generation-student-picker.tsx`, `generation-model-picker.tsx`, `generation-photo-picker.tsx`, `generation-batch-progress.tsx`, `generation-batch-wait.tsx`, `src/lib/generation-batches.ts`, `batch-asset-signing.ts`.
- API: `artifacts/api-server/src/routes/generation-batches.ts`, `src/lib/generation-batch-service.ts`, `generation-batch-process.ts`.
- Ingest: `artifacts/ingest-worker/src/generation-loop.ts` e `src/index.ts`.
- SQL: `artifacts/iaschool-app/supabase/generation-batches.sql`; tabelas internas sem SELECT de cliente, RPCs autenticadas com escopo e helpers privados somente service_role.
- Decisões/aceite: `docs/specs/ajustes-2026-10-11/08-wizard-geracao-lote.md`.

## Verificação

A rodada de 12/10/2026 (313 testes do app, 49 da API, 58 do ingest, PostgreSQL descartável, typecheck e build) continua o histórico publicado. A rodada de 15/10/2026 cobre o modelo no lote; o resultado fica no backlog. Migration nova e geração paga não rodaram.

## Compatibilidade legada

`POST /generation/post-image` mantém `photo_prompt` unitário e composição de duas imagens para páginas antigas; não é o contrato do wizard. Portões anteriores somente no cliente e fallback de cota em memória são limitações legadas, não regras do lote novo. O template administrativo de prompt não entra no lote. O modelo de estilo da escola entra. A página `/referencias` continua o lugar de enviar modelos. Histórico mantém arquivos anteriores, inclusive faixa antiga. Fotos do reconhecimento são `public.student_reference_faces` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`), distintas de modelos em `public.reference_posts` (`setup.sql`). `lib/db` não representa o banco deste produto.

As rotas de geração ainda não estão no OpenAPI; contrato manual tipado no app/API, sem editar código gerado.
