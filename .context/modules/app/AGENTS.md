# app

Aplicação web da escola: cadastro, eventos, upload, galeria, revisão, pasta do aluno, entregas e geração unitária de arte.

## Entrada
- Pacote `@workspace/iaschool-app`. Processo: `src/main.tsx`. Rotas em `src/App.tsx`.
- SQL de referência, ensaios e Edge Functions: `artifacts/iaschool-app/supabase/`.
- Integração do banco: `artifacts/iaschool-app/SUPABASE.md`.

## Depende de
- `design-system` para componente e token.
- `contrato` para o que estiver no OpenAPI. A geração de arte chama a API na mão. O fluxo está em `.context/modules/geracao-arte/AGENTS.md`.
- Supabase (Auth, RLS, Storage, Realtime) direto do browser, com a chave anon.

## Quem depende
- `ingest` e `face` consomem o schema e as filas declaradas no SQL deste módulo.
- A Vercel publica este pacote. O rewrite `/api` em `vercel.json` aponta para o módulo `api`.

## Sensível
- Foto, consentimento, data de nascimento, responsável e entrega. Ver `.context/security.md`.
- Mudança de schema: SQL de referência aqui e `apply_migration` no MCP `supabase-iaschool`, no mesmo commit.
- Edge Functions em `supabase/functions/` publicam à parte do app. Listar quais faltam publicar ao fechar a tarefa.

## Comandos
- Dev: `pnpm --filter @workspace/iaschool-app run dev`
- Teste: `pnpm --filter @workspace/iaschool-app run test`
- Teste de integração contra o banco real exige `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` exportadas.

## Fora deste módulo
- `lib/db` não representa estas tabelas.
- `artifacts/mockup-sandbox` é protótipo, não este app.
