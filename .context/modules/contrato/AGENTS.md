# contrato

Contrato HTTP da geração de imagem e os clientes gerados a partir dele.

## Entrada
- Fonte: `lib/api-spec/openapi.yaml`. Configuração: `lib/api-spec/orval.config.ts`.
- Gerados, não editar à mão: `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/`.

## Depende de
- Orval e Zod. Não acessa o banco.

## Quem depende
- `api` valida e tipa com `@workspace/api-zod`.
- `app` chama a API com `@workspace/api-client-react`.

## Sensível
- Mudar o YAML sem rodar o codegen deixa app e API em contratos diferentes.
- O codegen também roda o typecheck das libs.

## Comandos
- `pnpm --filter @workspace/api-spec run codegen`

## Fora deste módulo
- Upload, evento, biometria e WhatsApp não têm operação neste contrato. Eles falam com o Supabase direto do app.
