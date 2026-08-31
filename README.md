<div align="center">

<img src="./artifacts/iaschool-ui/public/logo-color.png" alt="IAschool" height="72" />

# IAschool

Plataforma de gestão e distribuição de fotos escolares — a escola sobe as fotos
de um evento, o sistema separa por aluno e entrega ao responsável, com
autorização e trilha de auditoria.

</div>

Este repositório reúne a base técnica do IAschool: aplicação web em React/Vite,
design system compartilhado, API Express, contrato OpenAPI, validações Zod,
banco Supabase (PostgreSQL gerenciado, com Auth, RLS e Storage) e ferramentas
para desenvolvimento local em macOS, Linux e Windows.

> [!IMPORTANT]
> **Regra de conformidade desta fase:** enquanto as pendências de
> [`docs/pendencias-producao.md`](docs/pendencias-producao.md) não estiverem
> ligadas, **nenhuma foto real de criança ou adolescente entra no produto** e o
> **fluxo de WhatsApp não é acionado de verdade**. O banco já tem a estrutura de
> proteção do ECA Digital; os mecanismos que a alimentam (e-mail transacional e
> OTP do responsável) ainda não existem.

## Estado do projeto

O produto passou por uma **pivotagem** em 30/08/2026: de gerador de cards de
desempenho para escolinha de futebol (R9 / IAsport) para plataforma de fotos
escolares. O plano completo está em
[`docs/pivotagem-iaschool.md`](docs/pivotagem-iaschool.md).

| Fase | Escopo | Estado |
| --- | --- | --- |
| 0 — Descontaminação | Vocabulário, entidades de futebol, marca, nomes de pacote | ✅ concluída |
| 1 — Fundação escolar | `schools`, `classes`, `events`, papéis, RLS por escola | ⏳ próxima |
| 2 — Upload em massa | Tabela `photos`, fila, workers, thumbnails | ❌ |
| 3 — Reconhecimento facial | Embeddings, pgvector, fila de revisão | ❌ |
| 4 — Autorização granular | Escopos, revogação, portal do responsável | ❌ |
| 5 — Lote e WhatsApp | Templates de evento, geração e envio em lote | ❌ |

**Funciona hoje:** cadastro de escola com aprovação pelo admin, autenticação,
conformidade ECA (consentimento do responsável, trilha de compartilhamento),
cota de geração e criação **unitária** de arte — um aluno por vez.

**Não existe ainda:** upload em massa, reconhecimento facial, turmas, eventos e
envio em lote.

## Comece por aqui

Requisitos: Node.js 24 e pnpm 11.17.0 via Corepack.

```bash
corepack pnpm install --frozen-lockfile
pnpm run typecheck
PORT=5000 BASE_PATH=/ pnpm run build
```

Copie [`.env.example`](.env.example) para `.env.local` e preencha os valores no
ambiente local. Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` a aplicação
cai em modo demonstração (mock em localStorage, com indicador na UI).

Para iniciar a aplicação web:

```bash
pnpm --filter @workspace/iaschool-app run dev
```

Para iniciar a API:

```bash
pnpm --filter @workspace/api-server run dev
```

## O que existe no workspace

| Diretório | Responsabilidade |
| --- | --- |
| `artifacts/iaschool-app` | Aplicação web principal em Vite/React e os scripts SQL do Supabase |
| `artifacts/iaschool-ui` | Tokens, componentes e preview do design system |
| `artifacts/api-server` | API Express e processamento no servidor |
| `artifacts/mockup-sandbox` | Prototipação visual com o design system |
| `lib/api-spec` | Contrato OpenAPI e geração de código |
| `lib/api-client-react` | Cliente React gerado |
| `lib/api-zod` | Schemas e tipos Zod gerados |
| `lib/db` | Pacote Drizzle inerte — **não é o schema deste produto** (ver abaixo) |
| `scripts` | Automação e gates locais de compatibilidade |

## Desenvolvimento

Comandos de validação disponíveis na raiz:

```bash
pnpm run verify:native
pnpm run smoke:web
pnpm run test:compat
pnpm run typecheck
PORT=5000 BASE_PATH=/ pnpm run build
```

O contrato da API vive em `lib/api-spec/openapi.yaml`. Após mudanças no
contrato, regenere os artefatos:

```bash
pnpm --filter @workspace/api-spec run codegen
```

O design system usa `artifacts/iaschool-ui/tokens.json` como fonte de verdade:

```bash
pnpm --filter @workspace/iaschool-ui run tokens
```

Leia os guias de consumo antes de alterar uma interface:

- [Desenvolvimento web multiplataforma](docs/development/cross-platform-web.md)
- [Consumo web do design system](artifacts/iaschool-ui/docs/consuming-web.md)
- [Consumo Expo do design system](artifacts/iaschool-ui/docs/consuming-expo.md)
- [Referências visuais e de marca](artifacts/iaschool-ui/docs/references/README.md)

## Banco de dados

O banco é um projeto **Supabase** provisionado do zero em 30/08/2026 por 7
migrations. Autenticação, RLS e Storage fazem parte do banco, não da aplicação.

Tabelas em `public`: `profiles`, `students`, `clubs`, `reference_posts`,
`generated_posts`, `prompt_settings`, `prompt_template_versions`,
`generation_usage`, `generation_logs`, `guardian_verification_codes`,
`share_logs` — todas com RLS habilitada.

Mudanças de schema são aplicadas **por migration**, através do servidor MCP
`supabase-iaschool` declarado em [`.mcp.json`](.mcp.json) — não pelo SQL Editor
do painel. Os scripts em `artifacts/iaschool-app/supabase/*.sql` são a
referência legível do schema e devem acompanhar cada migration.

Detalhes de variáveis, buckets e políticas:
[`artifacts/iaschool-app/SUPABASE.md`](artifacts/iaschool-app/SUPABASE.md).

> [!WARNING]
> `lib/db` é um pacote Drizzle **inerte**: `lib/db/src/schema/index.ts` é um stub
> vazio e não representa nenhuma tabela deste produto. Não rode
> `pnpm --filter @workspace/db run push` — ele apontaria o `drizzle-kit` para a
> `DATABASE_URL` tentando alinhar o banco real a um schema vazio.

Mantenha variáveis e credenciais em arquivos locais não versionados. Nenhuma
implantação, migration remota ou integração de produção é presumida apenas por
existir um script local.

## Documentação

| Documento | Para quê |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Regras de colaboração, fronteiras de segurança, comandos e critérios de validação |
| [`docs/pivotagem-iaschool.md`](docs/pivotagem-iaschool.md) | Plano da pivotagem, roadmap por fases, decisões em aberto |
| [`docs/pendencias-producao.md`](docs/pendencias-producao.md) | O que falta para rodar com dado real |
| [`docs/diagnostico-geracao-imagens.md`](docs/diagnostico-geracao-imagens.md) | Diagnóstico da falha de geração de imagens |
| [`artifacts/iaschool-app/SUPABASE.md`](artifacts/iaschool-app/SUPABASE.md) | Integração Supabase |
| `.claude/skills/eca-digital/` | ECA Digital (Lei nº 15.211/2025, Decreto nº 12.880/2026) aplicado ao produto |

## Próximos passos

1. Fechar as pendências de produção 1–6 (domínio, Resend, confirmação de
   e-mail) — habilita cadastro real de escola.
2. Iniciar a **Fase 1**: entidades `schools`, `classes` e `events`, papéis
   novos e RLS por escola em vez de por usuário.
3. Decidir os pontos em aberto de `docs/pivotagem-iaschool.md` §9 — motor de
   reconhecimento facial, consolidação de `clubs` em `schools` e regra da foto
   com várias crianças.
