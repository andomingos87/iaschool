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

Este repositório é um workspace pnpm para o IAsport. Ele reúne a aplicação web
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

- `artifacts/r9-app/` — aplicação web principal baseada em Vite.
- `artifacts/iasport/` — design system IAsport, tokens, componentes e preview.
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
pnpm --filter @workspace/r9-app run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/iasport run dev
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

## Design system IAsport

- A fonte de verdade visual é `artifacts/iasport/tokens.json`.
- Edite tokens e regenere os arquivos com `pnpm --filter @workspace/iasport run tokens`.
- Não edite manualmente `src/index.css` ou `src/generated/tokens.tsx`.
- Use os componentes e tokens de `@workspace/iasport`; não copie valores ou
  componentes para uma aplicação consumidora.
- Cada componente web relevante deve manter sua história em
  `artifacts/iasport/src/preview/demos/` e seu registro em
  `artifacts/iasport/src/preview/registry.tsx`.
- Siga os guias específicos antes de alterar UI:
  - Web: `artifacts/iasport/docs/consuming-web.md`.
  - Expo: `artifacts/iasport/docs/consuming-expo.md`.
  - Migração web: `artifacts/iasport/docs/migrating-web.md`.
  - Migração Expo: `artifacts/iasport/docs/migrating-expo.md`.

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
