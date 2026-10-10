# IAschool — AGENTS.md (fonte de verdade)

A escola sobe as fotos de um evento; o sistema separa por aluno e entrega ao responsável, com autorização e trilha de auditoria. Estado do produto: [BACKLOG.md](BACKLOG.md). Operação longa (fases, schema, mapa): [docs/operacao-agentes.md](docs/operacao-agentes.md).

<!-- AUREA:SYNC:START -->
## GUARDRAILS

**SEMPRE**
- SEMPRE rode os testes do pacote tocado e `pnpm run typecheck` antes de finalizar ou abrir PR. Não há script de lint.
- SEMPRE altere só o que foi pedido — mudança mínima.
- SEMPRE que a mudança tocar lógica de domínio (rota, serviço, RPC, fila ou regra de consentimento), escreva ou atualize teste.
- SEMPRE que mudar comportamento, atualize o doc do módulo (`.context/modules/<modulo>/AGENTS.md`).
- SEMPRE que a doc de contexto citar tabela ou coluna do banco, escreva `public.<tabela>` ou `public.<tabela>.<coluna>` e o arquivo SQL em `artifacts/iaschool-app/supabase/`. Nome solto não identifica a tabela.
- SEMPRE entregue estados de erro, vazio e carregando, validação e o caso de borda que a mudança afeta.
- SEMPRE consulte a doc atualizada da lib (via MCP) antes de escrever código que usa terceiro.
- SEMPRE use vocabulário escolar em código novo: aluno, escola, turma, responsável, arte, evento.
- SEMPRE que a tarefa tocar cadastro, foto, WhatsApp, data de nascimento, consentimento ou compartilhamento, siga a skill `eca-digital`.
- SEMPRE diferencie protótipo, código local, integração configurada e evidência de produção.
- SEMPRE que aplicar migration, atualize o SQL de referência no mesmo commit.
- SEMPRE que criar função em `public` que o visitante sem login não deve chamar, faça `revoke execute ... from public, anon` na própria migration.
- SEMPRE comece tarefa de produto localizando ou criando o item em `BACKLOG.md`. Concluído e verificado: `[x]` com data absoluta e a linha "Atualizado em". Escrito e não rodado: `[~]`.

**PERGUNTE ANTES**
- PERGUNTE ANTES de mudar schema, adicionar dependência, mexer em secret, introduzir padrão de design novo, fazer deploy, publicar, abrir PR, ou rodar `apply_migration` ou `execute_sql` no banco real.
- PERGUNTE ANTES de inserir foto real de criança ou adolescente, ou de ligar envio comercial de WhatsApp.
- PERGUNTE quando faltar informação. Lacuna vira pergunta, nunca chute.

**NUNCA**
- NUNCA dê push direto na main.
- NUNCA rode migration pelo SQL Editor do painel. O caminho é `apply_migration` do MCP `supabase-iaschool`, com autorização explícita.
- NUNCA edite à mão cliente, schema Zod ou token gerado. Use os comandos da seção Comandos.
- NUNCA escreva código de produto fora de um módulo declarado em `.context/modules/`.
- NUNCA exponha dado sensível em log, resposta, commit ou Markdown.
- NUNCA use MCP global. Só o `.mcp.json` da raiz. O banco deste produto é o servidor `supabase-iaschool`.
- NUNCA rode `pnpm --filter @workspace/db run push` nem `push-force`. `lib/db` não é o schema.
- NUNCA gere `package-lock.json` ou `yarn.lock`. O gerenciador é pnpm.
- NUNCA remova `minimumReleaseAge` de `pnpm-workspace.yaml`.
- NUNCA coloque foto real de criança ou adolescente no produto enquanto [docs/pendencias-producao.md](docs/pendencias-producao.md) não estiver implementado e ligado. Só material de teste ou demonstração.
- NUNCA ligue o fluxo comercial de WhatsApp. A exceção já aprovada é o modo `controlled_zapi`: uma escola, de uma a quatro pessoas allowlisted, teto diário, kill switch, só material sintético ou de adultos.
- NUNCA use em código novo: atleta, escolinha, clube, brasão, uniforme, posição, métrica, R9, IAsport.
- NUNCA coloque `SUPABASE_SERVICE_ROLE_KEY` no browser. Ela fica só na API, no ingest e no face-worker.

Gates completos: skill `aurea-standards`.

## Modo de Execução
- **Autônomo e enxuto:** execute sem narrar cada passo nem mandar mensagem de progresso; corrija erros sozinho.
- **Interrompa só em decisão do usuário:** escolha de arquitetura, biblioteca ou implementação, requisito ambíguo, mudança destrutiva ou ação de saída. Nesses casos, explique as opções e aguarde.
- **Resposta final fixa:** resumo da implementação, arquivos modificados, resultado dos testes, pendências.
- **Decisão neste projeto:** exatamente três opções mutuamente exclusivas, numeradas `1`, `2` e `3`. A `1` é a recomendação. Cada uma basta para responder só com o número.
<!-- AUREA:SYNC:END -->

## Comandos
- Instalar: `corepack pnpm install --frozen-lockfile`
- Typecheck: `pnpm run typecheck`
- Build: `PORT=5000 BASE_PATH=/ pnpm run build`
- Testes do pacote: `pnpm --filter @workspace/<pacote> run test`
- Compatibilidade: `pnpm run test:compat`
- Dev: `pnpm --filter @workspace/<pacote> run dev`
- Setup do face-worker: `pnpm --filter @workspace/face-worker run setup`
- Tokens do design system: `pnpm --filter @workspace/iaschool-ui run tokens`
- Contrato (cliente e Zod): `pnpm --filter @workspace/api-spec run codegen`
- Migration: `apply_migration` no MCP `supabase-iaschool`. Não há comando de CLI. O SQL de referência entra no mesmo commit.

## Stack
- TypeScript, Node 24, pnpm 11.17.0. UI: Vite 7, React 19, wouter, Tailwind 4.
- API de geração: Express 5. Reconhecimento: Python 3.12.
- Banco: Supabase (Postgres, Auth, RLS, Storage, pgvector). Detalhe em [artifacts/iaschool-app/SUPABASE.md](artifacts/iaschool-app/SUPABASE.md).
- Validação: Zod no formulário e no contrato. O banco valida com CHECK e trigger.
- Perfil da stack: [.context/conventions.md](.context/conventions.md).

## Camada de contexto
- Módulos: `app`, `design-system`, `api`, `ingest`, `face`, `contrato`. Doc em `.context/modules/<modulo>/AGENTS.md`.
- `geracao-arte` é índice de domínio, sem pasta de código. Os arquivos continuam nos três módulos acima.
- Convenções: [.context/conventions.md](.context/conventions.md). Segurança: [.context/security.md](.context/security.md).
- Decisões: `.context/decisions/`. Lições: `.context/lessons/`.
- Skills pelo nome: `aurea-standards`, `convention-detection`, `project-onboarding`, `agents-md`, `eca-digital`.

## Regras de domínio
- Vocabulário e modelo alvo: [docs/pivotagem-iaschool.md](docs/pivotagem-iaschool.md).
- Conformidade desta fase: [.context/security.md](.context/security.md).
- Mudou fase, marco ou decisão de roadmap: atualize `BACKLOG.md` e a tabela de fases em `docs/operacao-agentes.md` no mesmo commit.
- Conta de QA só nas variáveis locais `IASPORT_TEST_EMAIL` e `IASPORT_TEST_PASSWORD`. Não renomeie e não grave o valor.
- Check local não prova deploy nem produção. Diga o que não rodou.

## MCP (local)
- `.mcp.json` na raiz: `supabase-iaschool` (projeto travado, ref `jtyyauivokutperouqyh`) e `ai-context`.
- `SUPABASE_ACCESS_TOKEN` fica em `.env.local`. Não entra no Git, no `.mcp.json`, em log ou em resposta.

## Variáveis de ambiente
- Modelo sem valores: [.env.example](.env.example).
- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Servidor: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.
- `DATABASE_URL` não alimenta o schema. Não use com Drizzle.
