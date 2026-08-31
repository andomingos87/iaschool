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

## Visão geral do projeto

Este repositório é um workspace pnpm para o IAschool. Ele reúne a aplicação web
Vite/React, o design system compartilhado, um servidor HTTP Express, contratos
OpenAPI, clientes gerados, validações Zod, persistência PostgreSQL/Drizzle e
scripts locais de verificação multiplataforma.

O produto ainda está em evolução. Ao trabalhar aqui, diferencie claramente
protótipo, código local, integração configurada e evidência de produção.

## Setup

- Requisito: Node.js 24 e pnpm 11.17.0 via Corepack.
- Instale dependências de forma determinística:

  ```bash
  corepack pnpm install --frozen-lockfile
  ```

- O workspace aplica uma espera mínima de 1.440 minutos para pacotes novos.
  Não remova `minimumReleaseAge` de `pnpm-workspace.yaml`; exceções devem ser
  explícitas e justificadas.
- Variáveis de ambiente são locais. Nunca registre valores de segredos; use
  nomes documentados e mantenha `.env` fora do Git.

## Mapa do workspace

- `artifacts/iaschool-app/` — aplicação web principal baseada em Vite.
- `artifacts/iaschool-ui/` — design system IAschool, tokens, componentes e preview.
- `artifacts/api-server/` — servidor Express e fluxo de geração de imagens.
- `artifacts/mockup-sandbox/` — sandbox para prototipação visual.
- `lib/api-spec/` — contrato OpenAPI e configuração do Orval.
- `lib/api-client-react/` — cliente React gerado a partir do contrato.
- `lib/api-zod/` — schemas e tipos Zod gerados.
- `lib/db/` — schema Drizzle e comandos de banco.
- `scripts/` — scripts auxiliares e testes de compatibilidade local.
- `docs/development/` — documentação de desenvolvimento e evidências.
- `attached_assets/` — referências visuais e materiais fornecidos para o
  produto; não trate esses arquivos como código-fonte executável.

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
  `IASPORT_TEST_PASSWORD`. Nunca grave os valores dessas variáveis no
  repositório, em `AGENTS.md`, nos logs, capturas de tela ou commits.
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

## API, banco e geração de código

- O contrato está em `lib/api-spec/openapi.yaml`.
- Depois de alterar o contrato, regenere clientes e schemas com:

  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```

- O schema do banco está em `lib/db/src/schema/`.
- `pnpm --filter @workspace/db run push` altera o banco apontado por
  `DATABASE_URL`; execute apenas com autorização explícita e ambiente correto.
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

## Pull requests e entrega

- Descreva escopo, arquivos alterados, validações executadas e limitações.
- Diferencie evidência local de CI, preview, deploy e produção.
- Antes de concluir uma implementação, liste arquivos alterados, edge functions
  a publicar e migrations a aplicar. Quando não existirem, declare isso
  explicitamente.
- Sugira um próximo passo concreto, sem afirmar que ele já foi executado.
