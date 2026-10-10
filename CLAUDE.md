# IAschool

Fonte de verdade: [AGENTS.md](AGENTS.md). Operação longa: [docs/operacao-agentes.md](docs/operacao-agentes.md). Backlog: [BACKLOG.md](BACKLOG.md).

<!-- AUREA:SYNC:START -->
## GUARDRAILS

**SEMPRE**
- SEMPRE rode os testes do pacote tocado e `pnpm run typecheck` antes de finalizar ou abrir PR. Não há script de lint.
- SEMPRE altere só o que foi pedido — mudança mínima.
- SEMPRE que a mudança tocar lógica de domínio (rota, serviço, RPC, fila ou regra de consentimento), escreva ou atualize teste.
- SEMPRE que mudar comportamento, atualize o doc do módulo (`.context/modules/<modulo>/AGENTS.md`).
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
