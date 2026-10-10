# Onboarding — IAschool

> Porta de entrada do projeto. Leia isto e você sabe o que é, onde mexer e o que cuidar.
> Gerado a partir da camada de contexto (`AGENTS.md` + `.context/`). Mantenha vivo: doc velha engana.
> **Última atualização:** 2026-10-09

## O que é

A escola sobe as fotos de um evento. O sistema separa por aluno e entrega ao responsável, com autorização e trilha de auditoria. O estado do que está feito e do que falta está em [BACKLOG.md](BACKLOG.md). Regras curtas para quem altera o código: [AGENTS.md](AGENTS.md). Mapa longo de fases e schema: [docs/operacao-agentes.md](docs/operacao-agentes.md).

## Stack e comandos do dia a dia

TypeScript e Node 24 no app, na API, no ingest e nas libs. Python 3.12 no reconhecimento. UI com Vite 7, React 19, wouter e Tailwind 4. API de geração em Express 5. Banco Supabase (Postgres, Auth, RLS, Storage, pgvector). pnpm 11.17.0. Perfil completo: [.context/conventions.md](.context/conventions.md).

- **Instalar:** `corepack pnpm install --frozen-lockfile`
- **Rodar o app:** `pnpm --filter @workspace/iaschool-app run dev`
- **Rodar a API:** `pnpm --filter @workspace/api-server run dev`
- **Rodar o ingest:** `pnpm --filter @workspace/ingest-worker run dev`
- **Rodar o reconhecimento:** `pnpm --filter @workspace/face-worker run setup` e depois `pnpm --filter @workspace/face-worker run dev`
- **Testar um pacote:** `pnpm --filter @workspace/<pacote> run test`
- **Typecheck:** `pnpm run typecheck`
- **Build:** `PORT=5000 BASE_PATH=/ pnpm run build`

Não há script de lint. Variáveis sem valor de exemplo: [.env.example](.env.example).

## Mapa de módulos

- **app** — cadastro, eventos, upload, galeria, revisão, pasta do aluno, entregas e geração unitária. Entrada: `artifacts/iaschool-app/src/main.tsx` e rotas em `src/App.tsx`. SQL e Edge Functions: `artifacts/iaschool-app/supabase/`.
- **design-system** — tokens e componentes. Entrada: `artifacts/iaschool-ui/tokens.json`.
- **api** — geração de imagem, cota e log. Entrada: `artifacts/api-server/src/routes/index.ts`. O `Dockerfile` e o `fly.toml` da raiz são deste módulo.
- **ingest** — miniatura, derivado desfocado da entrega e apagamento do arquivo no bucket. Entrada: `artifacts/ingest-worker/src/index.ts`.
- **face** — detecção e embedding. Entrada: `artifacts/face-worker/src/face_worker/__main__.py`.
- **contrato** — OpenAPI da geração e os clientes gerados. Entrada: `lib/api-spec/openapi.yaml`.

Doc de cada um: `.context/modules/<modulo>/AGENTS.md`.

## Por onde começar uma tarefa

- Tela, aluno, turma, evento, galeria, revisão ou entrega: módulo `app`, a partir de `src/App.tsx`. Componente visual compartilhado: `design-system`.
- Visual de token ou componente: `design-system`, edite `tokens.json` e rode `pnpm --filter @workspace/iaschool-ui run tokens`.
- Geração de imagem: primeiro `lib/api-spec/openapi.yaml`, depois `pnpm --filter @workspace/api-spec run codegen`, depois as rotas em `api`.
- Miniatura, fila de arquivo ou desfoque da entrega: `ingest`.
- Reconhecimento: `face`. O schema que ele consome está no SQL do `app`.
- Tabela, policy, RPC ou bucket: SQL em `artifacts/iaschool-app/supabase/` e migration pelo servidor `supabase-iaschool` do `.mcp.json`. Quem mexe nisso revisa [artifacts/iaschool-app/SUPABASE.md](artifacts/iaschool-app/SUPABASE.md) e [.context/security.md](.context/security.md).

Comece a tarefa de produto achando ou criando o item em [BACKLOG.md](BACKLOG.md).

## Cuidados (o que NÃO quebrar)

- Foto real de criança ou adolescente não entra enquanto [docs/pendencias-producao.md](docs/pendencias-producao.md) não estiver implementado e ligado. Só material de teste ou demonstração.
- WhatsApp comercial fica desligado. A exceção já aprovada é o modo `controlled_zapi`: uma escola, de uma a quatro pessoas allowlisted, teto diário, kill switch, só material sintético ou de adultos. Spec: [docs/spec-whatsapp-api-oficial-entrega-fotos.md](docs/spec-whatsapp-api-oficial-entrega-fotos.md).
- Cadastro, foto, WhatsApp, data de nascimento, consentimento ou compartilhamento: leia [.context/security.md](.context/security.md) antes de mudar código.
- `SUPABASE_SERVICE_ROLE_KEY` só na API, no ingest e no face. Não use prefixo `VITE_`.
- Não rode `pnpm --filter @workspace/db run push`. `lib/db` não é o schema.
- Não edite à mão `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/`, nem `src/index.css` e `src/generated/tokens.tsx` do design system.
- Função nova em `public` que o visitante sem login não deve chamar leva `revoke execute ... from public, anon` na própria migration.
- Não dê push direto na `main`. Schema não muda pelo SQL Editor do painel.
- Vocabulário de código novo: aluno, escola, turma, responsável, arte, evento. O de-para da pivotagem está em [docs/pivotagem-iaschool.md](docs/pivotagem-iaschool.md).
- Check local não prova produção. Separe o que rodou aqui do que foi visto em deploy.

## Armadilhas conhecidas

Nenhuma lição em `.context/lessons/` ainda. O texto operacional antigo, com pegadinhas de schema, grant e worker, está em [docs/operacao-agentes.md](docs/operacao-agentes.md) e ainda não foi fatiado em lições.

## Decisões que moldam o projeto

Nenhum ADR em `.context/decisions/` ainda. O que já está escrito em outro lugar:

- Camadas, auth, validação e a lista do que nunca fazer: [.context/conventions.md](.context/conventions.md).
- Vocabulário e modelo alvo: [docs/pivotagem-iaschool.md](docs/pivotagem-iaschool.md).
- O que entrou em cada fase: [BACKLOG.md](BACKLOG.md). A tabela de fases em `docs/operacao-agentes.md` pode estar atrás do backlog.

## Integrações (MCP/ferramentas)

Só o [.mcp.json](.mcp.json) da raiz.

- `supabase-iaschool` — banco, Auth, Storage e Edge Functions deste produto. Projeto travado, ref `jtyyauivokutperouqyh`. O token fica em `.env.local` (`SUPABASE_ACCESS_TOKEN`).
- `ai-context` — declarado no mesmo arquivo. O repositório não descreve o uso.

App na Vercel (`https://iaschool-app.vercel.app`). API e os dois workers na Fly (`iaschool-api`, `iaschool-ingest-worker`, `iaschool-face-worker`).

## Lacunas de contexto

- `.context/lessons/` e `.context/decisions/` estão vazios. Decisão e pegadinha históricas moram no backlog, na pivotagem e em `docs/operacao-agentes.md`.
- A API não tem um tipo único de erro. Está marcado "a definir" nas convenções.
- A tabela de fases de `docs/operacao-agentes.md` pode estar atrás do [BACKLOG.md](BACKLOG.md). O backlog é a fonte do estado.
- O servidor `ai-context` não tem doc de uso neste repositório.
- Não há script de lint.
