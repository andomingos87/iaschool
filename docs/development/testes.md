# Testes e limites da verificação

**Revisado em 25/10/2026.** Executar da raiz, com dependências já instaladas.
O script `test` do app e da API usa `vitest run`: sem filtro, inclui integração.
O app carrega `.env.local` da raiz. Nunca presumir que a suíte inteira é local.

## Unitários sem Supabase/OpenAI/WhatsApp reais

```bash
pnpm --filter @workspace/iaschool-app run test src
pnpm --filter @workspace/api-server run test tests/art-protection.unit.test.ts tests/generation-batch-images.unit.test.ts tests/generation-batch-routes.unit.test.ts tests/generation-batches.unit.test.ts tests/generation-original.unit.test.ts tests/generation-quota.unit.test.ts tests/guardian-album.unit.test.ts tests/original-composition.unit.test.ts tests/supabase-auth-unit.test.ts
pnpm --filter @workspace/ingest-worker run test
pnpm --filter @workspace/face-worker run test
pnpm run test:compat
pnpm run typecheck
```

Não acrescente `--` entre `run test` e `src`. A lista explícita da API evita
selecionar os arquivos `*.integration.test.ts`. Alguns testes criam servidor
HTTP em loopback; um erro `listen EPERM` em sandbox indica falta de permissão
local, não falha de regra de produto.

O face-worker precisa da `.venv` de Python 3.12 preparada pelo `run setup`.
Testes pytest configuram `pythonpath = ["src"]` no `pyproject.toml`; isso não
configura o comando de execução normal do worker.

Edge Functions possuem testes Deno locais em `_shared`. Da raiz, com Deno
instalado e imports disponíveis:

```bash
deno test artifacts/iaschool-app/supabase/functions/_shared/delivery/album.test.ts artifacts/iaschool-app/supabase/functions/_shared/delivery/dispatch.test.ts artifacts/iaschool-app/supabase/functions/_shared/delivery/preview.test.ts artifacts/iaschool-app/supabase/functions/_shared/whatsapp/tokens.test.ts artifacts/iaschool-app/supabase/functions/_shared/whatsapp/zapi-provider.test.ts
```

Esses testes usam dependências injetadas/simuladas. Não confundir resultado
Deno local com publicação ou resposta real das funções.

## Integração: autorização e ambiente próprios

- `artifacts/iaschool-app/tests/*.integration.test.ts` e os equivalentes da API criam/alteram dados no Supabase configurado; alguns exercitam workers/Storage e funções publicados.
- `generation-batch-real-synthetic.integration.test.ts` exige `IASCHOOL_BATCH_REAL_SMOKE=approved_single_synthetic_generation` e faz geração paga. A suíte `generation-real-synthetic.integration.test.ts` também é opt-in de custo; ler suas condições antes de executar.
- `artifacts/face-worker/scripts/live_check.py` cria dados e executa reconhecimento real; não é teste unitário.
- Ensaios SQL em `artifacts/iaschool-app/supabase/rehearsal/` precisam de destino identificado. Rollback não transforma banco de produção em ambiente de testes seguro.

O histórico registra disputa de jobs entre testes e workers publicados e
resíduos de rodadas anteriores. Escolher um ambiente isolado antes da
integração e conferir limpeza dos dados próprios. Não pausar workers ou rodar
SQL remoto como efeito colateral de um comando genérico de teste.

## O que cada sinal comprova

Unitários verificam regras com dependências simuladas; typecheck verifica
tipos; build verifica empacotamento; smoke verifica HTTP local. Nenhum deles
prova schema aplicado, segredo configurado, entrega ao telefone, reconhecimento
no acervo real ou geração paga. Esses aceites precisam de ensaio separado e
registro no [BACKLOG](../../BACKLOG.md).

A CI atual (`.github/workflows/cross-platform-web.yml`) executa tipos, build,
compatibilidade e smoke nas três plataformas. Inclusão dos testes de domínio,
OpenAPI completo e isolamento da integração continuam pendentes.
