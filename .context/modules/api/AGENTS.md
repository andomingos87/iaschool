# api

Express em `artifacts/api-server`: geração unitária/por lote, cota, logs e
proxy do álbum. Não serve UI. **Revisado em 25/10/2026 contra o código local.**
Contratos e limites: [docs/api.md](../../../docs/api.md).

## Entradas e dependências

- Pacote `@workspace/api-server`, `src/index.ts`, `src/routes/index.ts`, base `/api`.
- `src/routes/generation-batches.ts`: endpoints do wizard; `src/lib/generation-batch-process.ts`: chamada ao provedor.
- `src/routes/generation.ts`: multipart unitário legado; `generation-logs.ts`: leitura/admin e vinculação de resultado.
- `src/routes/guardian-album.ts`: proxy privado para a Edge Function, origem exata, cookie de álbum sem encaminhar sessão escolar.
- Supabase Auth/RPC/Storage; `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` somente no servidor. `lib/db` é inerte.

## Geração em lote vigente

`POST /api/generation/batches` recebe `requestId`, `schoolId`, `referenceId`,
`prompt`, `students:[{studentId,photo:{source,id}}]` e booleanos opcionais
`noLogo`/`noText`. UUIDs obrigatórios; 1–50 alunos únicos. `prompt` pode ser vazio,
até 3000 caracteres de texto livre; o texto composto tem teto de 3500.
Foto aceita `profile`, `event` ou `reference_face`, resolvida por ID autorizado.
Modelo obrigatório da escola ativa; modelo global não entra.

`public.generation_batches`, `public.generation_batch_items` e
`public.generation_batch_retries` (`artifacts/iaschool-app/supabase/generation-batches.sql`)
persistem seleção, tentativas, leases e idempotência. Reserva atômica em
`public.generation_usage` (mesmo arquivo e `generation-quota.sql`). RPCs
revalidam vínculo escolar, foto e autorização. O ingest reivindica um item
por vez e chama `/generation/batches/internal/process` com HMAC de método,
caminho, timestamp e JSON; não é uma rota de browser.

Cada chamada de edição envia **modelo de estilo + foto do aluno** normalizados
em PNG. SDK com `maxRetries: 0`, timeout de 150 segundos. Identidade é uma
instrução à IA, não garantia de pixels originais. Falha parcial não para outros
itens; falha incerta exige retry manual explícito. Recuperação de persistência
reusa resultado existente. Assinaturas dos resultados duram até 300 segundos;
caminhos internos não saem na resposta.

## Compatibilidade legada

`POST /api/generation/post-image` não é o contrato do wizard:
`photo_prompt` usa uma foto inteira + prompt; composição `original-pixels-v1`
usa dois anexos, mas envia somente o modelo à IA e sobrepõe a pessoa no
servidor. Parser até seis imagens, 8 MiB cada, 24 MiB total, prompt 4000;
cada modo exige sua quantidade exata. O lote não herda o fallback de cota em
memória nem os gates apenas de cliente do caminho antigo.

## Álbum

Proxy `/api/guardian-album` valida `APP_PUBLIC_URL`, ações e tamanho do corpo;
repassa somente cookie `__Host-iaschool-album`, HttpOnly/Secure/SameSite=Lax,
sem Domain, com Path=/ e no máximo 24 h. Usa `Headers.getSetCookie()` para
separar cookie de sessão dos cookies de infraestrutura; rejeita duplicidade
ou formato inválido. `no-store`, `no-referrer`, timeout 20 s.

Reutilização do token depende do SQL local
`artifacts/iaschool-app/supabase/fase5-album-open-link.sql` e das funções/app.
A API proxy não comprova que essa migration esteja aplicada.

## Publicação registrada e pendências

- 12/10/2026: API v4/v5 (álbum e geração simples), depois v6 (lotes); ensaio sintético pago da versão anterior registrado no backlog. Houve falha inicial no cleanup, corrigida e limpeza conferida sem repetir geração.
- 16/10/2026: API v7 e migration `iaschool_generation_batch_reference` (20261016192755), com `public.generation_batches.reference_post_id` e `public.generation_batches.reference_path` em `artifacts/iaschool-app/supabase/generation-batches.sql`; app com modelo publicado. Sem geração paga dessa versão.
- Esses são registros históricos, não checagem remota em 25/10. OpenAPI completo, E2E do wizard atual e padronização dos erros continuam pendentes.

## Verificação e comandos

`PORT=5000 pnpm --filter @workspace/api-server run dev` exige variáveis de
servidor exportadas; não lê `.env.local` automaticamente. Docker/Fly usam
configuração da raiz. Testes locais e filtros explícitos no
[guia de testes](../../../docs/development/testes.md); `run test` sem filtro
inclui integrações com banco real. Não executar os ensaios pagos opt-in sem
autorização específica. Typecheck: `pnpm run typecheck`.
