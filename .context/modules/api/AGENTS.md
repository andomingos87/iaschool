# api

Servidor Express da geração unitária de imagem, cota e log. Não serve a UI.

## Entrada
- Pacote `@workspace/api-server`. Rotas em `src/routes/` (`health`, `generation`, `generation-logs`).
- Auth: `src/middlewares/supabase-auth.ts`.
- Sobe na Fly como `iaschool-api`. O `Dockerfile` e o `fly.toml` da raiz do repositório são deste módulo. Deploy: `fly deploy --remote-only --ha=false` a partir da raiz.
- O app alcança este servidor pelo rewrite `/api`. Renomear o app na Fly e o rewrite no mesmo commit.

## Depende de
- `contrato` (`@workspace/api-zod`).
- Supabase com `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY`, só no servidor.

## Quem depende
- A tela de geração do `app`. O fluxo, o portão do menor e o que esta API não confere estão em `.context/modules/geracao-arte/AGENTS.md`.

## Sensível
- A service role não volta em resposta, log ou variável `VITE_`.
- Cota diária e log de geração são regra de domínio: mudança pede teste.

## Comandos
- Dev: `pnpm --filter @workspace/api-server run dev` (porta 5000 no fluxo documentado).
- Teste: `pnpm --filter @workspace/api-server run test`

## Fora deste módulo
- Upload, miniatura, reconhecimento e expurgo de arquivo não passam por aqui.
