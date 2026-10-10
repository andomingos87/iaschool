# geracao-arte

Índice de domínio da geração unitária de arte. Não tem pasta de código. O arquivo continua no módulo que já o possui: tela e tabelas no `app`, chamada ao modelo no `api`, contrato HTTP no `contrato`.

Uma arte por aluno. O modelo de arte e a foto do aluno vão ao servidor. A chave da OpenAI não sai de lá.

## Fluxo

1. A tela `/gerar` monta o assistente em `art-wizard.ts`: aluno, escola quando há mais de uma na sessão, modelo de arte. Não há passo de logo.
2. `generationBlockers` (`src/lib/eca.ts`) barra o menor de 18 sem data de nascimento, sem responsável cadastrado ou sem “Reconhecer o rosto” ativo. `guardian.consentAt` não libera a geração. Adulto com data de nascimento passa.
3. O cliente monta o prompt com a linha `id = 'default'` da tabela `public.prompt_settings` (`artifacts/iaschool-app/supabase/setup.sql`). Se essa leitura não devolve linha, ou se falha, usa o padrão embutido em `prompt-template.ts`.
4. `openai-generation.ts` envia, nesta ordem, o modelo de arte e a foto do aluno para `POST /api/generation/post-image`, com o JWT. Imagem acima de 1 MB é comprimida no browser antes do envio.
5. A API autentica, aplica rajada e cota, chama `images.edit` no modelo `gpt-image-2.5-flare` em `1024x1024` e devolve a imagem em data URL mais um `logId`. O contrato dessa chamada está em `.context/modules/geracao-arte/gpt-image-2.5/AGENTS.md`. Não existe id `gpt-image-2.5`.
6. O cliente carimba a faixa “IMAGEM GERADA POR IA” (`watermark.ts`) e só então grava no bucket `generated` e na tabela `public.generated_posts` (`artifacts/iaschool-app/supabase/setup.sql`).
7. Se a URL salva é HTTP, o cliente chama `POST /api/generation/logs/:id/result`. Falha nesse passo não apaga a arte.

O envio da arte pronta é outro portão: `shareBlockers` e, quando passa, `wa.me` na própria tela. Não passa pela API de geração.

## Onde mexer

| Mudança | Dono | Arquivo |
| --- | --- | --- |
| Assistente, tela, selo | `app` | `artifacts/iaschool-app/src/pages/generate.tsx`, `src/lib/art-wizard.ts`, `src/lib/watermark.ts`, `src/lib/eca.ts` |
| Prompt e modelos de arte | `app` | `src/pages/admin-prompt.tsx`, `src/pages/references.tsx`, `src/lib/prompt-template.ts` |
| Histórico da arte | `app` | `src/lib/data/supabase/index.ts`, tabela `public.generated_posts` (`artifacts/iaschool-app/supabase/setup.sql`), bucket `generated` |
| Chamada, cota, log | `api` | `artifacts/api-server/src/routes/generation.ts`, `generation-logs.ts`, `src/lib/generation-quota.ts`, `src/lib/generation-log.ts` |
| Modelo da OpenAI | `geracao-arte` | `.context/modules/geracao-arte/gpt-image-2.5/AGENTS.md` |
| SQL | `app` | `artifacts/iaschool-app/supabase/setup.sql`, `generation-quota.sql`, `generation-logs.sql` |
| Contrato | `contrato` | `lib/api-spec/openapi.yaml` hoje só tem `/healthz` |

Rotas do app: `/gerar`, `/referencias`, `/admin/prompt`, `/admin/logs`.

## Regras que o código aplica

- A API não relê `generationBlockers`. Quem tem sessão pode chamar `POST /generation/post-image` com imagens e prompt. O portão do menor está no cliente.
- `showSchoolLogo` sai `false` na tela. O cliente até sabe anexar logo, mas a tela não pede.
- Limites no servidor: 6 imagens, 8 MB cada, 24 MB no total, prompt de 4000 caracteres, MIME `image/png`, `image/jpeg` ou `image/webp`.
- Rajada: 10 pedidos em 10 minutos, em memória, por usuário. Cota diária: `GENERATION_DAILY_QUOTA` (padrão 50), em UTC, pela RPC `consume_generation_quota`. Se o banco falha, a cota cai num contador em memória.
- O log guarda prompt, metadados e miniatura. Não guarda o base64 da imagem. As tabelas `public.generation_logs` (`artifacts/iaschool-app/supabase/generation-logs.sql`) e `public.generation_usage` (`artifacts/iaschool-app/supabase/generation-quota.sql`) têm RLS e nenhuma policy de cliente. A tela `/admin/logs` lê pela API.
- O selo é desenhado no canvas. Se o canvas falha, a imagem segue sem faixa. A marcação não pode impedir o usuário de ver o resultado.
- Não há moderação do prompt auxiliar neste caminho. O texto livre entra no prompt.

## O que não é este domínio

- A tabela `public.reference_posts` (`artifacts/iaschool-app/supabase/setup.sql`) é modelo de estilo da arte. Rosto de referência do reconhecimento é a tabela `public.student_reference_faces` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`), no módulo `face`.
- Foto de evento, miniatura, reconhecimento e entrega em lote passam por `ingest` e `face`, não por esta API.
- `lib/db` não representa estas tabelas.

## Testes

- App: `src/lib/art-wizard.test.ts`, `src/lib/eca.test.ts`, `src/lib/data/openai-generation.test.ts`, `src/lib/data/supabase/generated-posts.test.ts`.
- API: `artifacts/api-server/tests/generation-quota.unit.test.ts` e os testes de integração de geração, que exigem o banco.

## Lacunas

- As rotas de geração não estão no OpenAPI. O app chama na mão, sem o cliente gerado.
- O portão do menor não é repetido no servidor.
- O prompt auxiliar não tem lista de termos vedados nem revisão da imagem de saída.
- O recorte em `.claude/skills/eca-digital/references/aplicacao-iaschool.md` é de 23/08/2026. O selo e o `generationBlockers` já existem. O `wa.me` continua na tela, atrás de `shareBlockers`.
