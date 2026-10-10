# Perfil de convencoes do projeto

> Gerado pela skill `convention-detection` e revisado contra o repositório.
> [detectado] = lido do codigo ou do historico git. Decisoes do time confirmadas em 09/10/2026; nao ha item aberto.

## Stack [detectado]
- Linguagem: TypeScript no app, na API, no ingest e nas libs (Node 24). Python 3.12 no face-worker.
- Gerenciador de pacotes: pnpm 11.17.0 (Corepack). `minimumReleaseAge` de 1440 minutos fica.
- Monorepo: pnpm workspaces (`artifacts/*`, `lib/*`, `scripts`).
- UI: Vite 7, React 19, wouter, Tailwind 4. Design system em `@workspace/iaschool-ui`.
- API HTTP: Express 5 (`@workspace/api-server`), so a geracao de imagem.
- Banco/Auth/Storage: Supabase (Postgres, RLS, pgvector). Cliente no browser; `service_role` so na API e nos workers.

## Dados [detectado]
- Schema: SQL de referencia em `artifacts/iaschool-app/supabase/*.sql`. Nao ha pasta `supabase/migrations`.
- Mudanca de schema: migration pelo MCP `supabase-iaschool` (`apply_migration`), no mesmo commit que o SQL de referencia.
- RLS: sim. Tabelas de `public` nascem com RLS. Funcao nova em `public` nasce executavel por `anon`; o que o visitante nao deve chamar leva `revoke execute ... from public, anon` na propria migration.
- `lib/db` (Drizzle) e pacote inerte. Nao representa o schema e nao e fonte do banco.

## Entrega [detectado]
- App web: Vercel (`iaschool-app`), deploy por Git a partir da `main`. Dominio atual: `https://iaschool-app.vercel.app`.
- API e workers: Fly.io (`iaschool-api`, `iaschool-ingest-worker`, `iaschool-face-worker`), Docker, regiao gru.
- CI: GitHub Actions so em `.github/workflows/cross-platform-web.yml`.
- MCP local (`.mcp.json`): `supabase-iaschool` (projeto travado) e `ai-context`.

## Qualidade [detectado]
- Testes: Vitest no app, na API e no ingest-worker; pytest no face-worker; `node --test` em `scripts/replit-compat`.
- Lint: nao ha script de lint nem ESLint. Prettier esta nas devDependencies da raiz, sem script no `package.json`.
- Typecheck: `pnpm run typecheck`.

## Git [detectado]
- Conventional Commits com escopo (`feat(fase5):`, `fix(upload):`, `docs(backlog):`).
- Branch `feat/`, `fix/` ou `docs/` e PR para `main`. Nao ha push direto de feature na `main` no historico recente.

## Estrutura [detectado]
- Pacotes de produto: `artifacts/iaschool-app`, `artifacts/iaschool-ui`, `artifacts/api-server`, `artifacts/ingest-worker`, `artifacts/face-worker`, `lib/api-spec` + `lib/api-client-react` + `lib/api-zod`.
- Fora de modulo de produto: `artifacts/mockup-sandbox` (prototipo), `lib/db` (inerte), `scripts/`, `attached_assets/`, `docs/`, `tools/`.

## Decisoes do time
Confirmadas em 09/10/2026 no init da camada de contexto.

- Camadas: sem camada unica. App em `pages` / `components` / `hooks` / `lib`. API em `routes` / `middlewares` / `lib`. Workers em loop e handlers. Banco em SQL, RLS e RPC. Nao ha repository.
- Erro: sem tipo unico na API. A definir.
- Validacao: Zod nos formularios do app e no contrato `lib/api-zod`. O banco valida com CHECK e trigger.
- Auth: Supabase Auth no app. JWT no middleware da API. `public.profiles.role` (`artifacts/iaschool-app/supabase/setup.sql`) e papel global (`dev` / `super_admin` / `user`). O vinculo com a escola vive em `public.school_members` (`artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`). RLS por escola.
- Doc de contexto: tabela e coluna saem como `public.<tabela>` ou `public.<tabela>.<coluna>`, com o arquivo SQL em `artifacts/iaschool-app/supabase/`. Nome solto nao identifica a tabela.
- Nunca: foto real de crianca ou adolescente antes de `docs/pendencias-producao.md`; WhatsApp comercial fora do modo `controlled_zapi`; `pnpm --filter @workspace/db run push`; MCP de Supabase que nao seja `supabase-iaschool`; migration pelo SQL Editor; `package-lock.json` ou `yarn.lock`; editar token, cliente ou Zod gerado; `SUPABASE_SERVICE_ROLE_KEY` no browser; vocabulario de futebol em codigo novo.
