# Instruções de colaboração

## Decisões e esclarecimentos

Sempre que uma decisão, aprovação ou esclarecimento do usuário for necessário,
apresente exatamente três opções mutuamente exclusivas, numeradas como `1`,
`2` e `3`.

- A opção `1` deve ser a recomendação, quando houver uma alternativa preferível.
- Cada opção deve ser curta, autoexplicativa e suficiente para que o usuário
  responda somente com o respectivo número.
- Interprete uma resposta isolada `1`, `2` ou `3` de acordo com a última
  pergunta numerada feita pelo agente.
- Evite perguntas abertas. Quando faltar um detalhe que não possa ser inferido
  com segurança, converta-o em três alternativas objetivas.

## O que é o IAschool

Plataforma de gestão e distribuição de **fotos escolares**: a escola sobe as
fotos de um evento, o sistema separa por aluno e entrega ao responsável, com
autorização e trilha de auditoria.

O produto é resultado de uma **pivotagem** (30/08/2026) a partir de um gerador
de cards de desempenho para escolinha de futebol (R9 / IAsport). Leia
[`docs/pivotagem-iaschool.md`](docs/pivotagem-iaschool.md) antes de qualquer
trabalho de produto — ele define o de-para de vocabulário, o modelo de dados
alvo e o roadmap por fases.

| Fase | Escopo | Estado |
| --- | --- | --- |
| 0 — Descontaminação | Vocabulário, entidades de futebol, marca, nomes de pacote | ✅ concluída |
| 1 — Fundação escolar | `schools`, `classes`, `events`, papéis, RLS por escola | 🔨 M1 no ar: migration aplicada, edge function republicada e 55 testes de integração verdes (20/09/2026); faltam dados da escola e séries/salas |
| 2 — Upload em massa | Tabela `photos`, fila, workers, thumbnails | ❌ |
| 3 — Reconhecimento facial | Embeddings, pgvector, fila de revisão | ❌ |
| 4 — Autorização granular | Escopos, revogação, papel `guardian` | ❌ |
| 5 — Lote e WhatsApp | Templates de evento, geração e envio em lote | ❌ |

O detalhe por item, com o que está feito e o que falta em cada fase, está em
[`BACKLOG.md`](BACKLOG.md). Esta tabela é o resumo; o backlog é a fonte.

**O que existe hoje** é o núcleo herdado da Fase 0: cadastro com aprovação,
autenticação, conformidade ECA, cota de geração e geração **unitária** de arte
(1 aluno por vez). Upload em massa, reconhecimento facial, `events`, `classes`
e envio em lote **não existem, nem parcialmente**.

Ao trabalhar aqui, diferencie sempre protótipo, código local, integração
configurada e evidência de produção.

## Regra de conformidade desta fase (bloqueante)

Enquanto as pendências de [`docs/pendencias-producao.md`](docs/pendencias-producao.md)
não estiverem implementadas e ligadas:

- **Nenhuma foto real de criança ou adolescente entra no produto.** Só material
  de teste ou demonstração.
- **O fluxo de WhatsApp não é ligado.** Verificação do responsável e envio podem
  ser simulados no front-end, nunca executados de verdade.

O banco já tem a estrutura de proteção (consentimento do responsável, canal
verificado, `share_logs` imutável), mas os mecanismos que a alimentam ainda não
existem. Rodar com dado real antes disso é tratar imagem de menor sem o canal
verificado exigido pelo Decreto nº 12.880/2026, art. 35.

Para qualquer tarefa que toque cadastro, foto, WhatsApp, data de nascimento,
consentimento ou compartilhamento, use a skill `eca-digital`
(`.claude/skills/eca-digital/`), que traz a Lei nº 15.211/2025, o Decreto nº
12.880/2026 e o checklist de conformidade aplicado a este produto.

## Setup

- Requisito: Node.js 24 e pnpm 11.17.0 via Corepack.
- Instale dependências de forma determinística:

  ```bash
  corepack pnpm install --frozen-lockfile
  ```

- O workspace aplica uma espera mínima de 1.440 minutos para pacotes novos.
  Não remova `minimumReleaseAge` de `pnpm-workspace.yaml`; exceções devem ser
  explícitas e justificadas.
- Variáveis de ambiente são locais. Copie de [`.env.example`](.env.example),
  nunca registre valores de segredos e mantenha `.env*` fora do Git.

## Mapa do workspace

- `artifacts/iaschool-app/` — aplicação web principal (Vite/React) e os scripts
  SQL do Supabase em `supabase/`.
- `artifacts/iaschool-ui/` — design system IAschool, tokens, componentes e preview.
- `artifacts/api-server/` — servidor Express e fluxo de geração de imagens.
- `artifacts/mockup-sandbox/` — sandbox para prototipação visual.
- `lib/api-spec/` — contrato OpenAPI e configuração do Orval.
- `lib/api-client-react/` — cliente React gerado a partir do contrato.
- `lib/api-zod/` — schemas e tipos Zod gerados.
- `lib/db/` — pacote Drizzle **inerte**; ver "Banco de dados" abaixo antes de tocar.
- `scripts/` — scripts auxiliares e testes de compatibilidade local.
- `docs/` — documentação de produto e engenharia (índice abaixo).
- `attached_assets/` — referências visuais e materiais fornecidos para o
  produto; não trate esses arquivos como código-fonte executável.

## Documentação

| Documento | Para quê |
| --- | --- |
| [`BACKLOG.md`](BACKLOG.md) | **Backlog oficial**, por fase: feito, em andamento, a fazer, bloqueado. Único lugar de rastreio |
| [`docs/pivotagem-iaschool.md`](docs/pivotagem-iaschool.md) | Plano da pivotagem, roadmap por fases, decisões em aberto |
| [`docs/pendencias-producao.md`](docs/pendencias-producao.md) | O que falta para rodar com dado real (domínio, Resend, OTP) |
| [`docs/spec-upload-massa-reconhecimento-facial.md`](docs/spec-upload-massa-reconhecimento-facial.md) | Spec das Fases 2 e 3: upload em massa, biometria, fila de revisão, pasta do aluno |
| [`docs/spike-reconhecimento-facial.md`](docs/spike-reconhecimento-facial.md) | Spike M0: números medidos do motor facial, limiares calibrados e o que ficou sem medir |
| [`docs/diagnostico-geracao-imagens.md`](docs/diagnostico-geracao-imagens.md) | Diagnóstico da falha de geração de imagens |
| [`artifacts/iaschool-app/SUPABASE.md`](artifacts/iaschool-app/SUPABASE.md) | Integração Supabase: variáveis, tabelas, RLS, buckets |
| [`docs/development/cross-platform-web.md`](docs/development/cross-platform-web.md) | Compatibilidade macOS/Linux/Windows |
| `artifacts/iaschool-ui/docs/` | Guias de consumo e migração do design system |

## Comandos de desenvolvimento

Na raiz:

```bash
pnpm run typecheck
pnpm run build
pnpm run verify:native
pnpm run smoke:web
pnpm run test:compat
```

Para executar o build completo localmente, defina as variáveis exigidas pelos
apps Vite:

```bash
PORT=5000 BASE_PATH=/ pnpm run build
```

Para iniciar superfícies específicas:

```bash
pnpm --filter @workspace/iaschool-app run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/iaschool-ui run dev
pnpm --filter @workspace/mockup-sandbox run dev
```

O servidor da API usa a porta 5000 quando iniciado pelo fluxo documentado.
Confirme a porta real no ambiente antes de compartilhar uma URL.

## Testes e validação

- Para testes autenticados de aceitação, use exclusivamente a conta de QA
  configurada localmente nas variáveis `IASPORT_TEST_EMAIL` e
  `IASPORT_TEST_PASSWORD`. Os nomes mantêm o prefixo antigo de propósito: são
  variáveis da máquina do desenvolvedor, renomeá-las quebra o ambiente local.
  Nunca grave os valores dessas variáveis no repositório, em `AGENTS.md`, nos
  logs, capturas de tela ou commits.
- Testes dos scripts de compatibilidade: `pnpm run test:compat`.
- Typecheck completo: `pnpm run typecheck`.
- Build completo: `pnpm run build`.
- Testes do servidor: `pnpm --filter @workspace/api-server run test`.
- Testes de um pacote devem ser executados com `pnpm --filter <pacote>`.
- Os checks locais não provam que uma implantação ou produção esteja funcionando.
- Sempre informe separadamente checks não executados por falta de dependência,
  serviço, credencial, navegador, hardware ou ambiente remoto.

## Design system IAschool

- A fonte de verdade visual é `artifacts/iaschool-ui/tokens.json`.
- Edite tokens e regenere os arquivos com `pnpm --filter @workspace/iaschool-ui run tokens`.
- Não edite manualmente `src/index.css` ou `src/generated/tokens.tsx`.
- Use os componentes e tokens de `@workspace/iaschool-ui`; não copie valores ou
  componentes para uma aplicação consumidora.
- Cada componente web relevante deve manter sua história em
  `artifacts/iaschool-ui/src/preview/demos/` e seu registro em
  `artifacts/iaschool-ui/src/preview/registry.tsx`.
- Siga os guias específicos antes de alterar UI:
  - Web: `artifacts/iaschool-ui/docs/consuming-web.md`.
  - Expo: `artifacts/iaschool-ui/docs/consuming-expo.md`.
  - Migração web: `artifacts/iaschool-ui/docs/migrating-web.md`.
  - Migração Expo: `artifacts/iaschool-ui/docs/migrating-expo.md`.

## Banco de dados

O banco é um **projeto Supabase** (PostgreSQL gerenciado, com Auth, RLS e
Storage). Foi provisionado do zero em 30/08/2026 por 7 migrations aplicadas via
MCP; a oitava e a nona são do M1 (20/09/2026).

Tabelas atuais em `public`: `profiles`, `students`, `clubs`, `reference_posts`,
`generated_posts`, `prompt_settings`, `prompt_template_versions`,
`generation_usage`, `generation_logs`, `guardian_verification_codes`,
`share_logs`, e desde o M1 `schools`, `school_members`, `classes`, `guardians`
e `events` — todas com RLS habilitada. A migration do M1
(`iaschool_fase1_schools_members_classes`, referência em
`supabase/fase1-min-schools-events.sql`) foi **aplicada em 20/09/2026**: a
escola é o tenant, `profiles.role` é papel global (`dev`/`super_admin`/`user`)
e o vínculo vive em `school_members`. `main` ainda está no modelo antigo, então
o merge da branch do M1 vem antes de qualquer deploy. Estado em `BACKLOG.md`, M1.

**Como alterar o schema:** exclusivamente por `apply_migration` do servidor MCP
`supabase-iaschool` (seção abaixo). Não use o SQL Editor do painel para mudança
de schema — o que não passa por migration não fica registrado no histórico.

Os scripts em `artifacts/iaschool-app/supabase/*.sql` são a referência legível
do schema (`setup.sql`, `eca-digital.sql`, `generation-quota.sql`,
`generation-logs.sql`, `pivot-fase0.sql`). Ao aplicar uma migration, mantenha o
SQL de referência correspondente atualizado no mesmo commit.

> ⚠️ `lib/db/` é um **pacote Drizzle inerte**: `lib/db/src/schema/index.ts` é um
> stub vazio e **não representa nenhuma tabela deste produto**. Não trate esse
> diretório como fonte de verdade do banco e **não execute
> `pnpm --filter @workspace/db run push`** — o comando aponta `drizzle-kit` para
> a `DATABASE_URL` e tentaria alinhar o banco real a um schema vazio. O pacote só
> deve ser usado se e quando o schema for de fato migrado para Drizzle, o que é
> uma decisão em aberto.

## MCP do Supabase — regra obrigatória

**Sempre use o servidor MCP declarado em `.mcp.json` na raiz deste repositório.
Nunca use o conector Supabase do Claude Code / claude.ai.**

O conector pessoal enxerga todos os projetos da conta e não tem vínculo com
este repositório — usá-lo aqui é como operar o banco errado por engano. O
servidor de projeto está travado no ref correto e é a única forma autorizada
de tocar no banco do IAschool.

- Servidor: `supabase-iaschool` (declarado em [`.mcp.json`](./.mcp.json)).
- Escopo: `--project-ref=jtyyauivokutperouqyh`. As ferramentas de conta
  (`list_projects`, `create_project`, `pause_project`…) **não existem** aqui,
  de propósito.
- Ferramentas: todas as de projeto, com escrita habilitada — `docs`,
  `database`, `debugging`, `development`, `functions`, `branching`, `storage`
  (23 ferramentas, sem `--read-only`).
- Credencial: `SUPABASE_ACCESS_TOKEN` lido de `.env.local` em tempo de
  execução. O token nunca entra no `.mcp.json`, na linha de comando, no Git,
  em logs ou em mensagens.

Como identificar qual está em uso: as ferramentas do servidor de projeto
aparecem com o prefixo `mcp__supabase-iaschool__`. Qualquer outro prefixo
(hash aleatório) é o conector pessoal — **não use**.

Se o servidor não subir, ele falha com mensagem explícita: `.env.local`
ausente (rode o Claude Code a partir da raiz do repo) ou
`SUPABASE_ACCESS_TOKEN` vazio (gere um Personal Access Token em
Supabase → Account → Access Tokens). Não contorne o erro caindo no conector.

> `apply_migration` e `execute_sql` escrevem no banco real deste produto, que
> guarda dados de crianças e adolescentes. Valem as mesmas regras da seção
> "Estilo e segurança": só com autorização explícita e ambiente confirmado.

## API e geração de código

- O contrato está em `lib/api-spec/openapi.yaml`.
- Depois de alterar o contrato, regenere clientes e schemas com:

  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```

- `lib/api-client-react/src/generated/` e `lib/api-zod/src/generated/` são
  gerados; não edite à mão.
- Não declare migrations aplicadas, dados existentes ou integração remota
  comprovada sem uma verificação correspondente.

## Compatibilidade multiplataforma

Consulte `docs/development/cross-platform-web.md`. A sequência recomendada
é:

1. `pnpm run verify:native` para validar ferramentas nativas.
2. `pnpm run smoke:web` para iniciar e verificar a aplicação web.
3. `pnpm run test:compat` para os testes automatizados.

A documentação operacional atual deve ficar consistente com os scripts reais.

## Estilo e segurança

- Use TypeScript, imports explícitos e a organização já existente no pacote.
- Preserve o package manager pnpm; não gere `package-lock.json` ou `yarn.lock`.
- Rode typecheck e testes relevantes após mudanças.
- Nunca exponha credenciais no browser, em logs, commits, Markdown ou exemplos.
- Mantenha fronteiras browser → servidor → banco; privilégios e segredos ficam
  no servidor.
- Não faça reset, descarte ou sobrescrita de trabalho local sem autorização.
- Ao escrever copy, use vocabulário escolar (aluno, escola, turma, responsável,
  arte, evento). Termos do domínio antigo — atleta, escolinha, clube, brasão,
  uniforme, posição, métrica, R9, IAsport — não devem entrar em código novo.

## Pull requests e entrega

- Descreva escopo, arquivos alterados, validações executadas e limitações.
- Diferencie evidência local de CI, preview, deploy e produção.
- Antes de concluir uma implementação, liste arquivos alterados, edge functions
  a publicar e migrations a aplicar. Quando não existirem, declare isso
  explicitamente.
- Sugira um próximo passo concreto, sem afirmar que ele já foi executado.
