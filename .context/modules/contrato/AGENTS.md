# contrato

Contrato OpenAPI e clientes/Zod gerados. **Estado conferido em 25/10/2026:**
`lib/api-spec/openapi.yaml` contém somente `GET /healthz`.

## Entradas

- Fonte: `lib/api-spec/openapi.yaml`; configuração: `lib/api-spec/orval.config.ts`.
- Gerados: `lib/api-client-react/src/generated/` e `lib/api-zod/src/generated/`. Não editar à mão.
- Codegen: `pnpm --filter @workspace/api-spec run codegen`; também confere os tipos das libs.

## Cobertura e lacunas

A API usa o schema gerado na resposta de saúde. Geração, cota, logs, lotes e
álbum têm contratos manuais no app/API, descritos em
[docs/api.md](../../../docs/api.md); não estão cobertos pelo YAML.
Upload, revisão, consentimento e entregas também usam RPCs/Edge Functions
Supabase diretamente. Banco e funções: módulo app.

Adicionar esses endpoints ao OpenAPI é trabalho pendente de implementação;
a revisão documental não altera o YAML nem gera clientes novos. Mudar a fonte
sem rodar codegen e verificar os consumidores pode deixar contratos divergentes.
