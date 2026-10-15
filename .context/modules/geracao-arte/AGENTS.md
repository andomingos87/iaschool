# geracao-arte

Índice de domínio, sem pasta própria. UI e SQL no `app`, geração na `api`, execução persistente no `ingest`. Atualizado em 12/10/2026.

## Fluxo vigente — wizard por aluno e turma

`/gerar` tem três etapas: alunos/turmas com autocomplete; foto principal com troca no modal Todas/Eventos; prompt comum e confirmação da quantidade. Uma arte por aluno, sem recorte manual obrigatório ou segundo modelo. Turmas incluem apenas alunos aptos, sem duplicação. Aluno sem foto principal existente no Storage, nascimento válido ou autorização `biometric_sorting` não aparece; menor exige responsável conforme regras atuais.

O app envia IDs, escola, prompt e requestId para `/api/generation/batches`. O servidor revalida vínculo e autorização antes da chamada, do upload e da conclusão. Fotos de evento exigem aluno sozinho, rosto confirmado e revisão completa atual; originais coletivos não entram no seletor. Identidade é orientação à IA, sem promessa de pixels iguais.

`public.generation_batches`, `public.generation_batch_items` e `public.generation_batch_retries` (`artifacts/iaschool-app/supabase/generation-batches.sql`, migration `iaschool_generation_batches` aplicada via MCP local em 12/10/2026) persistem o lote e reservam cota completa atomicamente em `public.generation_usage` (mesmo SQL e `generation-quota.sql`). Pedido repetido não duplica cota/lote. O ingest existente reivindica um item e aciona a API com assinatura interna; SDK sem retry automático. Fechar a página não cancela o lote. Falha parcial continua os outros; nova tentativa paga somente por ação explícita para falhos/incertos. Resultado já persistido recupera salvamento sem gerar novamente.

Cada sucesso salva `public.generated_posts` (`artifacts/iaschool-app/supabase/setup.sql` e `generation-batches.sql`) e asset determinístico no bucket `generated`. RLS restringe o namespace novo, revalida origem/consentimento e impede escrita pelo browser. Assinaturas de até cinco minutos, renovadas sem cache longo; URLs já emitidas podem continuar válidas até expirar ou o expurgo remover o arquivo. Revogação enfileira o expurgo. Ampliação/download renovam URL por detalhe. Envio manual continua com `shareBlockers` e auditoria; WhatsApp comercial permanece desligado.

## Arquivos principais

- App: `artifacts/iaschool-app/src/pages/generate.tsx`, `src/components/generation-student-picker.tsx`, `generation-photo-picker.tsx`, `generation-batch-progress.tsx`, `src/lib/generation-batches.ts`, `batch-asset-signing.ts`.
- API: `artifacts/api-server/src/routes/generation-batches.ts`, `src/lib/generation-batch-service.ts`, `generation-batch-process.ts`.
- Ingest: `artifacts/ingest-worker/src/generation-loop.ts` e `src/index.ts`.
- SQL: `artifacts/iaschool-app/supabase/generation-batches.sql`; tabelas internas sem SELECT de cliente, RPCs autenticadas com escopo e helpers privados somente service_role.
- Decisões/aceite: `docs/specs/ajustes-2026-10-11/08-wizard-geracao-lote.md`.

## Verificação

313 testes do app, 49 da API, 58 do ingest, PostgreSQL descartável, typecheck e build passaram. UI sintética: turma, teclado, acentos, troca de foto, falha parcial/retry, recarga e galeria sem duplicatas. Estado de publicação atual está no backlog; teste simulado não prova geração real.

## Compatibilidade legada

`POST /generation/post-image` mantém `photo_prompt` unitário e composição de duas imagens para páginas antigas; não é o contrato do wizard. Portões anteriores somente no cliente e fallback de cota em memória são limitações legadas, não regras do lote novo. Template/modelos antigos permanecem nas páginas administrativas, sem requisito no wizard. Histórico mantém arquivos anteriores, inclusive faixa antiga. Fotos do reconhecimento são `public.student_reference_faces` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`), distintas de modelos em `public.reference_posts` (`setup.sql`). `lib/db` não representa o banco deste produto.

As rotas de geração ainda não estão no OpenAPI; contrato manual tipado no app/API, sem editar código gerado.
