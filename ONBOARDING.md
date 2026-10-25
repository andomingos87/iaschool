# Onboarding — IAschool

**Atualizado em 25/10/2026 contra o código local.** Comece pelo
[README](README.md), consulte o [BACKLOG](BACKLOG.md) para o estado e siga
[AGENTS.md](AGENTS.md) para alterar o projeto. Registro de publicação não é
verificação atual do serviço remoto.

## Começar

Node 24, pnpm 11.17.0, Corepack no PATH e Python 3.12 no reconhecimento.

```bash
corepack pnpm install --frozen-lockfile
PORT=5174 BASE_PATH=/ pnpm --filter @workspace/iaschool-app run dev
```

Para dados de demonstração, não configure Supabase. Para conexão real, as
variáveis públicas ficam em `artifacts/iaschool-app/.env.local`; a API e os
workers recebem variáveis exportadas no terminal. O Vite não lê o `.env.local`
da raiz nem faz proxy local de `/api`. Veja o
[setup completo](docs/development/cross-platform-web.md).

- API, com variáveis de servidor exportadas: `PORT=5000 pnpm --filter @workspace/api-server run dev`.
- Ingest, somente com ambiente autorizado: `PORT=8080 pnpm --filter @workspace/ingest-worker run dev`.
- Face: `pnpm --filter @workspace/face-worker run setup`; depois `PYTHONPATH=src PORT=8081 pnpm --filter @workspace/face-worker run dev` com ambiente autorizado.
- Unitários do app: `pnpm --filter @workspace/iaschool-app run test src`.
- Tipos: `pnpm run typecheck`.
- Build: `PORT=5000 BASE_PATH=/ pnpm run build`.

**Workers consomem e alteram o banco apontado pelas credenciais.** Não os ligue
contra produção para testar o setup. O comando `test` sem filtro no app/API
inclui integração remota. Use o [guia de testes](docs/development/testes.md).

## Módulos e entradas

| Módulo | Responsabilidade | Entrada |
| --- | --- | --- |
| [app](.context/modules/app/AGENTS.md) | Cadastro, turmas/eventos, upload, revisão, pasta/ZIP, wizard, consentimento e álbum | `artifacts/iaschool-app/src/App.tsx` |
| [design-system](.context/modules/design-system/AGENTS.md) | Tokens e componentes | `artifacts/iaschool-ui/tokens.json` |
| [api](.context/modules/api/AGENTS.md) | Artes unitárias/por lote, cota, logs e proxy do álbum | `artifacts/api-server/src/routes/index.ts` |
| [ingest](.context/modules/ingest/AGENTS.md) | Miniaturas, fotos nítidas para entrega, execução dos lotes de arte e expurgo | `artifacts/ingest-worker/src/index.ts` |
| [face](.context/modules/face/AGENTS.md) | Detecção, comparação e referências de rosto; nunca confirmação automática | `artifacts/face-worker/src/face_worker/__main__.py` |
| [contrato](.context/modules/contrato/AGENTS.md) | OpenAPI e geração do cliente/Zod; só `/healthz` está no YAML | `lib/api-spec/openapi.yaml` |
| [geracao-arte](.context/modules/geracao-arte/AGENTS.md) | Índice de domínio entre app, API e ingest, sem pasta de produto | Wizard `/gerar` e `generation-batches.ts` |

SQL, ensaios e sete Edge Functions ficam no módulo app, em
`artifacts/iaschool-app/supabase/`. Leia [SUPABASE.md](artifacts/iaschool-app/SUPABASE.md)
antes de trabalhar em dados e [docs/api.md](docs/api.md) para os endpoints reais.
API usa `Dockerfile`/`fly.toml` da raiz; cada worker tem sua configuração.

## Estado e limites

- O wizard atual exige modelo da escola; usa perfil, referência facial ou foto individual revisada de evento. Registro de app/API publicados em 16/10/2026.
- Entregas novas usam fotos nítidas, desde a publicação registrada em 13/10. Desfoque permanece para compatibilidade de entregas antigas.
- O álbum reutilizável está no código/SQL local de 16/10, sem aplicação remota/publicação registrada. Não presumir esse comportamento no ambiente publicado.
- O termo `delivery_whatsapp.v1` ainda promete desfoque. É uma pendência de produto e homologação, não resolvida pela documentação.
- OTP e consentimento direto existem. `controlled_zapi` é o único modo com provedor implementado; `meta_test` é reconhecido, mas não cria adaptador Meta.

## Regras para alterações

Localize ou crie o item no backlog. Preserve componentes/tokens. Não edite
clientes, Zod ou tokens gerados. Não use `lib/db` como schema. Schema remoto,
secret, dependência, PR e publicação exigem autorização conforme `AGENTS.md`.

Siga [.context/security.md](.context/security.md) e a skill local
[eca-digital](.claude/skills/eca-digital/SKILL.md) para cadastro, fotos,
responsáveis e compartilhamento. Menores reais e WhatsApp comercial seguem
bloqueados pelos [gates de produção](docs/pendencias-producao.md).

## Serviços e lacunas

O `.mcp.json` declara `supabase-iaschool` (projeto travado; credencial local) e
`ai-context`. Não substituir pelo conector Supabase global. O repositório ainda
não documenta um fluxo de uso do `ai-context`.

Publicações históricas: app Vercel `iaschool-app`; Fly `iaschool-api`,
`iaschool-ingest-worker`, `iaschool-face-worker`. Operação e publicação separada
das funções: [guia operacional](docs/operacao-agentes.md).

Continuam pendentes: CI dos testes de domínio, OpenAPI completo, ensaios de
recuperação/backup, métricas de aceite e homologação para dados reais.
`.context/lessons/` e `.context/decisions/` seguem vazios; decisões anteriores
estão no backlog e nas specs. Não há lint nem tipo único de erro da API.
