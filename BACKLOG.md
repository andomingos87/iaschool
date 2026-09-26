# Backlog — IAschool

Fonte única de acompanhamento do projeto. Vive em Markdown, na raiz, e é
referenciado por [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md).

**Atualizado em:** 26/09/2026 (**produção conferida na `main`**: os PRs empilhados #10 e #11 foram mergeados fora de ordem, e o #12 levou o deploy para a `main`. Antes, no mesmo dia, **app publicado e API de geração no ar**: `iaschool-app` na Vercel em `https://iaschool-app.vercel.app` (time `andomingos87s-projects`, ligado ao repositório, raiz `artifacts/iaschool-app`) e o `api-server` na Fly como `iaschool-api` (gru, uma máquina que dorme sem tráfego); rewrite `/api` trocado e fallback de SPA no `vercel.json`; Site URL e Redirect URLs do Supabase Auth apontando para o app. Conferido de fora: tela de login sem erro no console, rotas internas com 200, `/api/healthz` 200 e cota 401 sem sessão pelo domínio da Vercel. Geração com usuário logado **não testada** em produção. Antes, no mesmo dia, **correções de código da varredura**: limpeza dos testes de integração refeita (`cleanupTestData`) e 87 usuários + 7 escolas de teste apagados do banco real, com a suíte inteira rodada depois sem deixar resíduo; bug achado no caminho — apagar escola ou aluno com rosto de referência falhava porque a trilha gravava em cima da cascata — corrigido pela migration `iaschool_fase3_audit_tolerates_cascade_delete`; `execute` de `anon` revogado em 8 helpers `security definer` (`iaschool_revoke_definer_helpers_from_anon`); `dev` passa na API de logs e na galeria; teste do api-server sem o papel `student`; texto da aba de referência atualizado. Testes: typecheck ok, 159 unitários do app, 6 unitários e 10 de integração do api-server, 114 de 117 de integração do app — as 3 falhas são de `photo-jobs` e vêm da disputa com o `ingest-worker` da Fly, falham igual no código anterior (item novo em "Publicação, CI e higiene"). Antes, no mesmo dia, **varredura geral** backlog × código × GitHub × Vercel × Supabase × Fly: marcos, as 24 migrations, os workers e os testes batem com o que está escrito — typecheck e 159 + 24 + 33 testes unitários rodados de novo; os achados novos estão em "Publicação, CI e higiene": o app não está publicado, a API de geração está fora do ar, os testes de integração deixam lixo no banco real e a CI não roda testes. Status corrigidos no M3, M4, M5, M6, M0 e na Fase 1 completa. Mais cedo no mesmo dia, **workers implantados na Fly**: `iaschool-ingest-worker` e `iaschool-face-worker`, org `personal`, região gru, uma máquina cada, `/health` passando nos dois. Antes: 21/09/2026, **M4, M5 e M6 concluídos**. M4: consentimento por escopo, rosto de referência e a fila que liga a tela ao motor facial. M5: `face-worker` em Python rodando de verdade contra o banco — 20 rostos detectados numa cena de teste, 3 sugeridos, 17 sem atribuição e sem vetor, evento movido para `review` —, `photo_faces` com o vetor bloqueado por privilégio de coluna, busca vetorial isolada por escola e pasta do aluno. M6: tela `/eventos/:id/revisao` com cartão por aluno e confirmação em lote, fila individual por teclado, `biometric_events` append-only, `purge_expired_biometrics()` diária no `pg_cron`, fila de expurgo do Storage consumida pelo `ingest-worker` e ZIP da pasta do aluno. 275 testes do app (159 unitários + 116 de integração contra o banco real) + 33 do face-worker + 24 do ingest-worker verdes; imagem do face-worker construída e testada)
**Fontes:** [`docs/pivotagem-iaschool.md`](docs/pivotagem-iaschool.md) (roadmap por
fases), [`docs/spec-upload-massa-reconhecimento-facial.md`](docs/spec-upload-massa-reconhecimento-facial.md)
(marcos M0–M6), [`docs/pendencias-producao.md`](docs/pendencias-producao.md),
[`docs/spike-reconhecimento-facial.md`](docs/spike-reconhecimento-facial.md).

## Como usar

- `[x]` feito e verificado · `[~]` em andamento · `[ ]` a fazer · `[!]` bloqueado (diga por quê).
- Um item só vira `[x]` depois de executado e conferido (typecheck, teste, migration aplicada, tela aberta). "Escrito mas não rodado" fica `[~]`.
- Ao concluir um item, registre a data em `(dd/mm/aaaa)`. Datas sempre absolutas.
- Ao abrir uma frente nova, quebre-a aqui **antes** de codar; a spec detalha, o backlog rastreia.
- Regra bloqueante enquanto a seção "Transversal" não fechar: **nenhuma foto real de menor** e **nenhum WhatsApp ligado** (ver `AGENTS.md`).

## Visão geral

| Fase | Marcos | Estado | Prazo estimado |
| --- | --- | --- | --- |
| 0 — Descontaminação | — | ✅ concluída (30/08/2026) | — |
| Transversal — produção e conformidade | pendências #1–#7 + publicação | ❌ #1–#7 parados desde 30/08/2026 (só a reativação do Supabase e o PAT andaram, 20/09/2026); app publicado em `iaschool-app.vercel.app` e API de geração na Fly desde 26/09/2026, ainda sem domínio próprio | depende de compra de domínio/Resend/Meta |
| 1 — Fundação escolar | M1 (mínima) + Fase 1 completa | ✅ **M1 concluído** (20/09/2026); Fase 1 completa (CSV, telas do papel `dev`, professor da turma, remoção de `clubs`) segue aberta | 2–2,5 sem (M1) |
| 2 — Upload em massa | M2, M3 | ✅ **M2** (20/09/2026) e **M3** (21/09/2026) concluídos; `ingest-worker` implantado na Fly (26/09/2026) | — |
| 3 — Reconhecimento facial | M0 ✅, M4, M5, M6 | 🔬 spike feito; ✅ **M4, M5 e M6 concluídos** (21/09/2026); os dois workers implantados na Fly (26/09/2026); faltam as medições de aceite (§12.2) com acervo sintético | 6 sem |
| 4 — Autorização granular + portal | — | ❌ sem spec | 2–3 sem |
| 5 — Lote e WhatsApp | — | ❌ sem spec | 4–6 sem |

MVP para piloto em 1 escola = Fases 0 + 1 + 2 + 3 (com revisão manual
obrigatória) ≈ 2,5 a 3 meses a partir do início do M1 — 11,5 a 12,5 semanas
somando M1 a M6 (spec §13).

---

## Fase 0 — Descontaminação ✅ (30/08/2026)

Detalhe completo no Anexo A da pivotagem. Typecheck, build e 84 testes unitários passando.

- [x] Remover entidades de futebol: `POSITIONS`, `plausibleMetricValue()`, `Student.position/heightCm/weightKg`, `Metric`/`MetricValue`, `Club.uniforms`, `GeneratedPost.metrics`, página `/metricas` (30/08/2026)
- [x] Renomear domínio: `Club` → `SchoolBrand`, `clubId` → `schoolBrandId`, `pages/clubs.tsx` → `school-brands.tsx`, chaves `r9:` → `iaschool:` (30/08/2026)
- [x] Reescrever prompt de geração: placeholders `{{nome_escola}}`, `{{cores_escola}}`, `{{#logo_escola}}`; remover `{{#logo_r9}}`, `{{posicao}}`, `{{metricas}}` (30/08/2026)
- [x] Wizard de geração 7 → 4 passos; selo da plataforma removido por completo (30/08/2026)
- [x] Comunicação: textos de "atleta/escolinha" → "aluno/escola" em todas as telas (30/08/2026)
- [x] Marca e pacotes: `artifacts/r9-app` → `iaschool-app`, `iasport` → `iaschool-ui`, logos, policies `iaschool_storage_*`, templates de e-mail, workflow do GitHub (30/08/2026)
- [x] Rebrand do design system e ligação do modo simulação do OTP (commit `f244acb`) (30/08/2026)
- [x] Banco Supabase `jtyyauivokutperouqyh` provisionado do zero em 7 migrations via MCP; `setup.sql` limpo (30/08/2026)
- [x] Super admin provisionado e aprovado (30/08/2026)
- [x] Edge function `send-guardian-code` em modo simulação, com 7 testes de integração em `tests/guardian-verification.integration.test.ts` (30/08/2026)
- [x] Docs: `pivotagem-iaschool.md`, `pendencias-producao.md`, `diagnostico-geracao-imagens.md`, `AGENTS.md`, `SUPABASE.md` (30/08/2026)

**Deixado de propósito** (não são pendências, são decisões): `LOGS_ADMIN_EMAIL` antigo, variáveis `IASPORT_TEST_*` locais, tabela `clubs` no banco (vai para a Fase 1). `supabase/pivot-fase0.sql` só serve para bases legadas; o banco atual nasceu limpo.

Saíram desta lista na varredura de 26/09/2026 e viraram pendência em "Publicação, CI e higiene": o projeto Vercel `iaschool-api-server` (deploy por Git desligado via `artifacts/api-server/vercel.json` em 26/09/2026, o que funcionou — os commits seguintes não têm status da Vercel; a API da Vercel já devolve 404 para ele) e o `fly.toml` da raiz com `app = "iasport-image-api-r9"`, que parecia inofensivo mas é o destino do rewrite `/api` do app e não existe mais.

### Higiene pendente da Fase 0

- [x] Commitar o que está solto no working tree: spec, relatório do spike, `scripts/spike-face/`, deck regenerado (01/09), `scripts/deck/mobile.css`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, memórias (18/09/2026)
- [x] Adicionar `.playwright-mcp/` ao `.gitignore` (15/09/2026)
- [x] Abrir PR de `pivot/fase-0` → `main`: [andomingos87/iaschool#1](https://github.com/andomingos87/iaschool/pull/1), 9 commits (18/09/2026)
- [x] Apagar specs/planos divergentes (`docs/superpowers/`, memórias `.agents/memory/r9-*`) e corrigir Anexo B da pivotagem, cabeçalho da spec e memória de marca (15/09/2026)
- [x] Verificar os Problemas 2 e 3 de `docs/diagnostico-geracao-imagens.md`: **persistem**, conferido no código em 20/09/2026 (`mock/index.ts:689`, `api-server/routes/generation.ts:79`, `openai-generation.ts:81`). O Problema 1 foi superado pelo provisionamento de 30/08. O diagnóstico fica como spec das correções abaixo (20/09/2026)
- [ ] Geração em modo demo: decidir entre gerador mock (canvas) ou botão desabilitado com aviso; hoje chama o backend real sem token e falha sempre (`src/lib/data/mock/index.ts:1545`, conferido em 26/09/2026; a linha 689 citada em 20/09 mudou com o M4–M6)
- [ ] `api-server`: drenar o corpo da requisição antes de responder em `requireSupabaseUser`, ou mover o multer para antes da auth (`routes/generation.ts:79`). Efeito visto em produção em 26/09/2026: um upload de 20 MB sem sessão válida, pela Vercel, volta `502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR` em vez do 401, porque a API fecha a conexão com o corpo pela metade. Com 10 MB o 401 chega
- [ ] Cliente: tratar `onerror` do XHR sem afirmar que é a internet do usuário (`src/lib/data/openai-generation.ts:81`)

---

## Transversal — Produção e conformidade

As pendências #1–#7 não andaram desde 30/08/2026 (só a reativação do Supabase e o PAT, em 20/09). Enquanto #1–#7 não fecharem, vale a regra bloqueante.

### Infra e cadastro (`docs/pendencias-producao.md`)

- [x] Projeto Supabase `jtyyauivokutperouqyh` estava **pausado** (free tier, inatividade); Anderson reativou em 20/09/2026. As 7 migrations e o super_admin estão intactos; o banco não tem mais nenhuma linha (20/09/2026)
- [x] **`SUPABASE_ACCESS_TOKEN` renovado** por Anderson em 20/09/2026; `apply_migration` via MCP voltou a funcionar e a migration do M1 subiu no mesmo dia. Fica registrado, para a próxima vez: `psql` direto em `db.jtyyauivokutperouqyh.supabase.co:5432` com `SUPABASE_DB_PASSWORD` é a saída enquanto o PAT não vem (foi o caminho do ensaio); o `DATABASE_URL` do `.env.local` aponta para o pooler de transação (porta 6543), que não conhece o tenant, e o de sessão (`aws-0-us-east-1`, porta 5432) funciona (20/09/2026)
- [ ] Evitar nova pausa por inatividade: ou subir o plano, ou um ping semanal (cron/edge) na REST enquanto o piloto não começa. Provavelmente já resolvido de fato: desde 26/09/2026 os dois workers consultam o banco a cada 1–5 s (`ingest-worker/src/config.ts:39-40`, `face_worker/config.py:20-21`). Não verificado se o Supabase conta isso como atividade; fechar quando passar uma semana sem pausa

- [ ] #1 Comprar domínio — bloqueia #2 e #3
- [ ] #2 Assinar o Resend — bloqueia #3
- [ ] #3 Confirmar domínio no Resend (SPF + DKIM, DMARC recomendado); configurar SMTP no Supabase; subir rate limits; cadastrar Redirect URLs — bloqueia #5
- [ ] #4 Criar template "Confirm signup" pt-BR (`supabase/email-templates/`); `reset-password.html` e `invite.html` já prontos
- [ ] #5 Ligar "Confirm email" no Supabase Auth
- [ ] #6 Testar cadastro ponta a ponta: escola → e-mail → confirma → "Aguardando aprovação" → super_admin aprova em `/aprovacoes`

### Publicação, CI e higiene (varredura de 26/09/2026)

Achados da comparação entre backlog, código local, GitHub, Vercel, Supabase e
Fly. Os três primeiros bloqueiam o piloto tanto quanto o e-mail e o WhatsApp:
sem eles a escola não tem onde abrir o sistema.

- [x] **Publicar o `iaschool-app`.** Projeto `iaschool-app` criado na Vercel (time `andomingos87s-projects`), ligado a `andomingos87/iaschool` com raiz `artifacts/iaschool-app`, build `PORT=5173 BASE_PATH=/ pnpm run build`, saída `dist/public`, Node 24 e pnpm pelo Corepack (`ENABLE_EXPERIMENTAL_COREPACK=1`). Variáveis: só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Produção em `https://iaschool-app.vercel.app`, aberta; os previews ficam atrás do login da Vercel. O `vercel.json` ganhou fallback de SPA (sem ele, recarregar `/eventos` dava 404) e `x-vercel-enable-rewrite-caching: 0` no `/api`. No Supabase Auth, o Site URL era `http://localhost:3000` e a lista de Redirect URLs estava vazia, então o link de recuperação de senha caía no localhost: agora apontam para o app, os previews e `localhost:5174`. Conferido: login sem erro no console, bundle com a URL do Supabase certa, `/eventos` e `/alunos/:id` com 200. Não testado: login e geração com usuário de verdade no domínio publicado (26/09/2026)
- [x] **Subir a API de geração de arte e trocar o rewrite.** App `iaschool-api` na Fly (org `personal`, gru, shared-cpu-1x 512 MB, uma máquina, `auto_stop_machines = "stop"`), segredos `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY`. `fly.toml` e `vercel.json` trocados no mesmo commit. O `Dockerfile` da raiz passou para o molde do `ingest-worker` (instala só o api-server, `pnpm deploy`, usuário sem privilégio, `HEALTHCHECK` em `/api/healthz`). Conferido: `/api/healthz` 200 direto e pela Vercel, e `/api/generation/quota` 401 sem sessão. Um upload de 20 MB passa pelo rewrite. O 502 que aparece nesse tamanho sem sessão é o bug do corpo não drenado, ver o item do `requireSupabaseUser` na higiene da Fase 0 (26/09/2026)
- [ ] Geração de arte ponta a ponta no domínio publicado, com a conta de QA e material de teste (nunca foto de menor): login → aluno de teste → gerar → `generation_logs`. Não medido também: o tempo máximo que o rewrite da Vercel espera a resposta da Fly, que importa porque a OpenAI pode levar dezenas de segundos
- [x] O deploy de produção da Vercel e a imagem da `iaschool-api` saíram da branch `feat/publicar-app-e-api`, empilhada sobre `fix/varredura-codigo` (PR #10), e não da `main`. Conferido depois dos merges: o PR #11 entrou na `fix/varredura-codigo` 16 s depois de o #10 chegar à `main`, e o deploy de produção que a Vercel fez do #10 subiu com o `vercel.json` antigo (`/eventos` 404, `/api` 502) por uns 2 minutos. Corrigido pelo [andomingos87/iaschool#12](https://github.com/andomingos87/iaschool/pull/12). A produção agora roda `cc5d031`, da `main`, com rotas 200, `/api/healthz` 200 e cota 401. A imagem da `iaschool-api` não muda: `api-server`, `lib/`, `Dockerfile`, `fly.toml` e lockfile estão iguais entre `d847e85` e a `main`. Lição para PR empilhado: mergear o de cima primeiro, ou retargetar para a `main` antes de mergear (26/09/2026)
- [ ] Conferir o plano do time na Vercel: Hobby não permite uso comercial (`docs/estimativa-custos-por-aluno.md`), e o piloto é comercial
- [ ] Confirmar no painel da Vercel que o `iaschool-api-server` foi apagado (a API devolve 404 para ele em 26/09/2026, no mesmo time onde os deploys rodavam) e apagar os ambientes `Preview` e `Production` que sobraram no GitHub
- [ ] Desligar o produto antigo na Vercel: `ia-sport-image-r9-app` (repo `IA-Sport-image`) está no ar sem senha em `ia-sport-image-r9-app-two.vercel.app`; `ia-sport-image-api` está em `ERROR`
- [x] **Limpar o resíduo dos testes de integração no banco real** e corrigir a limpeza no `afterAll` (26/09/2026). Duas causas. (1) Ordem: o `afterAll` apagava o usuário antes da escola, e `events.created_by`, `photos.uploaded_by`, `authorizations.created_by` e outras colunas apontam para `auth.users` sem cascata — o delete do usuário falhava calado e ele ficava. (2) Bug de produto: apagar escola ou aluno com rosto de referência falhava sempre (ver o item do M6 sobre a trilha em cascata), por isso as 3 "Escola B" do teste de autorizações. Correção: `cleanupTestData()` nos utilitários de teste do app e do api-server apaga escola antes de usuário e **falha alto** se sobrar algo; os 7 arquivos de integração do app e os 3 do api-server passaram a usá-la (o api-server também deixava a escola da aprovação para trás). Apagados do banco: 87 usuários `rls-test-*@example.com` e as 7 escolas deles. Ficaram os 2 super_admins, a conta `escola@th2teste.com` e as 2 escolas demo. Verificado: a suíte inteira (app + api-server) rodou depois e não deixou nenhum usuário nem escola de teste; a mesma suíte de `photo-jobs` no código anterior deixou 2 usuários
- [ ] Decidir se as 2 escolas "(demo)" do banco real (12 alunos, 2 eventos, nenhuma foto) ficam como acervo de demonstração ou saem
- [ ] **Testes de integração disputam a fila com os workers da Fly.** Desde o deploy de 26/09/2026 o `ingest-worker` e o `face-worker` consomem `photo_jobs` e `student_reference_jobs` no mesmo banco em que os testes simulam o worker chamando `claim_*`. Resultado: 3 casos de `tests/photo-jobs.integration.test.ts` falham (o worker real leva parte dos jobs antes do teste: "29 ≥ 39", id de job diferente do esperado), e `authorizations` ("com consentimento o job entra…") falha às vezes pelo mesmo motivo. Não é regressão: falham igual no código anterior. Caminhos: pausar os workers durante a suíte (`fly scale count 0`), rodar a integração num branch do Supabase, ou fazer o teste reivindicar só jobs das escolas dele. Decisão pendente
- [ ] **CI rodando testes.** `.github/workflows/cross-platform-web.yml` faz só typecheck, build, testes de compatibilidade e smoke: nenhum dos números de teste deste backlog roda na CI. Falta também um comando só dos unitários do app — `test` (`vitest run`) junta os de integração, que batem no banco real e quebram sem as variáveis de ambiente. Rodar na CI: unitários do app (`vitest run src`), do ingest-worker e do face-worker (pytest)
- [x] Corrigir `artifacts/api-server/tests/generation-auth.integration.test.ts` (26/09/2026): gravava `role: "student"`, que a constraint recusa desde o M1. Saíram o usuário aluno, o caso "conta de aluno → 403" e o parâmetro `signup_school_id` dos utilitários; o ramo `role === "student"` de `supabase-auth.ts` foi apagado (código morto). Os 3 arquivos de integração do api-server rodaram contra o banco real: 10 de 10
- [x] Revogar `execute` de `anon` nas funções `security definer` (26/09/2026, migration `iaschool_revoke_definer_helpers_from_anon`): `confirm_guardian_code`, `has_profile`, `is_approved`, `is_dev`, `is_member_of`, `is_school_admin_of`, `is_super_admin`, `my_schools`. O grant vinha dos default privileges do Supabase, que `revoke ... from public` não alcança (regra registrada no `AGENTS.md`). Antes de aplicar: nenhuma policy para `anon`/`public` chama esses helpers e todo chamador do app é sessão autenticada; ensaio com rollback conferiu `anon` sem acesso e `authenticated`/`service_role` com. O linter caiu de 9 para 1 alerta de `anon`, que é `rls_auto_enable` (função de event trigger da plataforma, não chamável pela API)
- [ ] Ligar a proteção contra senha vazada no Supabase Auth (aviso do linter; conferir se o plano atual permite)
- [ ] Decidir se `andomingos87/iaschool` continua **público**. Nenhum segredo versionado (conferido em 26/09/2026; secret scanning sem alerta), mas specs de conformidade, deck, estimativa de custos e o SQL das travas estão abertos. Junto: proteger a `main` (hoje sem regra) e ligar o Dependabot
- [ ] Apagar as branches já mergeadas: 6 remotas (`feat/m1-*`, `feat/m2-*`, `feat/m3-*`, `feat/m4-*`, `fix/compat-scripts`, `pivot/fase-0`) e a local `switch`

### WhatsApp oficial + OTP (#7) — bloqueia foto real de menor

Decisão tomada: Meta WhatsApp Cloud API direto. Fallback interino: Twilio Verify (SMS).

- [ ] Meta Business Suite: criar WABA, verificar empresa, número dedicado
- [ ] Template `guardian_verification_code`, categoria Authentication, `pt_BR`, botão de copiar código
- [ ] Secrets `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` no Supabase
- [ ] Trocar o bloco `SIMULAÇÃO` de `send-guardian-code` pela chamada à Graph API; parar de devolver `demoCode`/`simulated` (autorização, TTL 10 min, antiflood 60 s já são produção)
- [ ] Teste ponta a ponta: aluno menor → verificar responsável → compartilhar → linha em `share_logs`

### Comercial e piloto (`docs/apresentacao-iaschool.md`)

O deck (HTML 16:9 e 9:16, PDFs) está pronto e foi regenerado em 01/09/2026. Faltam decisões de negócio que ele já referencia:

- [ ] Definir preço e modelo de cobrança (slide 10 / anexo). A base de custo já existe: `docs/estimativa-custos-por-aluno.md`, com `scripts/custos-por-aluno.py` e `scripts/custos-por-aluno-xlsx.py`
- [ ] Escolher 3 exemplos reais de arte para o slide 7 (material de teste, nunca foto real de menor)
- [ ] Confirmar prazos do piloto (slide 10)
- [ ] Obter identidade visual da rede-alvo para personalizar a capa
- [ ] Agendar a reunião com a diretora/mantenedora; objetivo é sair com piloto em 1 escola

### Conformidade antes de dado real (spec §9.6)

- [ ] Avaliação de impacto (Lei 15.211/2025 art. 8º, I; Decreto 12.880/2026 art. 47), incluindo a decisão D1
- [ ] Termo de consentimento do responsável para o escopo `biometric_sorting`, versionado — depende de texto jurídico; bloqueia **colher** consentimento no M4, não criar a tabela
- [ ] Política de privacidade descrevendo tratamento biométrico e prazo de guarda
- [ ] O termo precisa declarar três coisas que as decisões de 18/09/2026 assumiram: (a) a imagem do aluno autorizado **circula entre as famílias da turma** — o escopo `delivery_whatsapp`, como está, só cobre "enviar as fotos do meu filho para mim"; (b) revogar não recupera o que já foi entregue; (c) validar os prazos provisórios de **5 anos** de trilha e **15 dias** de resposta ao titular. Sobre os 5 anos: contra menor de 16 a prescrição não corre, então a trilha de um aluno da educação infantil talvez deva viver mais de uma década

---

## Fase 1 — Fundação escolar

### M1 — Fase 1 mínima (spec §4) · 2–2,5 semanas · risco médio

Pré-requisito de tudo: `photos` precisa de `event_id`, que precisa de `school_id`, e a RLS por `owner_id` precisa morrer antes.

> **Escopo fechado em 16/09/2026.** As propostas de 15/09 viraram decisão (#2, #3,
> #5 a #8, ver "Decisões tomadas") e a spec §4 foi reescrita no mesmo commit.
> O prazo subiu de ~2 para 2–2,5 semanas: entraram `guardians`, a consolidação de
> `clubs` e a migração do OTP do responsável, que não estavam orçados.

- [x] Migration `iaschool_fase1_schools_members_classes`: SQL de referência em `artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`, **ensaiado com rollback na base real em 20/09/2026** (estrutura + migração de dados semeada + triggers + RLS por sessão simulada; 2 bugs de ordem corrigidos no ensaio: drops de função antes das policies dependentes, e conversão de `role` antes de trocar a constraint). Roteiro em `supabase/rehearsal/README.md`. **Aplicada em 20/09/2026** via MCP `apply_migration`, sem surpresa em relação ao ensaio. Decisão de implementação: escola migrada nasce com `schools.id = uid` do perfil, para o prefixo `{uid}/` dos objetos já no Storage continuar válido sem mover arquivo; a aprovação de cadastro cria escola + vínculo por trigger (`ensure_school_on_approval`), então a tela de aprovações não muda
  - [x] `schools` (tenant real, **absorve `clubs`**: `name`, `cnpj`, `address`, `contact`, `logo`, `colors`, `plan`) e `school_members` (`school_admin`, `school_staff`, `teacher`) (20/09/2026)
  - [x] `profiles.role` passa a papel **global**: `dev`, `super_admin`, `user`; vínculo com escola só por `school_members`. `is_super_admin()` passa a valer para `dev` e `super_admin`; `is_dev()` novo (20/09/2026)
  - [x] `classes` = sala, com série como coluna: `school_year`, `grade` (lista fixa no app: EI, 1EF…9EF, 1EM…3EM), `name`, `teacher_id`; `unique (school_id, school_year, grade, name)` (20/09/2026)
  - [x] `guardians` (`school_id`, `name`, `whatsapp`, `relationship`, `whatsapp_verified_at`, `user_id` nulo reservado para a Fase 4; `unique (school_id, whatsapp)`) — irmãos compartilham o responsável; substitui `students.guardian` (jsonb) (20/09/2026)
  - [x] `students.school_id`, `students.class_id`, `students.enrollment_number` (único por escola quando preenchido, chave da importação CSV), `students.primary_guardian_id` + índices (20/09/2026)
  - [x] `events` com `status`, `keep_originals`, `photo_retention_until`, `image_rights_declared_at/by` (20/09/2026)
  - [x] Helper `is_member_of(uuid)` **puro** (sem `is_super_admin()` embutido; as policies escrevem `is_member_of(school_id) or is_super_admin()`) e `is_dev()`. **Não** reaproveitar `my_school_id()` (colisão com o modelo antigo) e **não criar `active_school_id()`**: com `limit 1` ela quebra para admin de várias escolas; a escola "atual" é escolha de UI (20/09/2026)
- [x] Migração de dados `owner_id` → `school_id` (spec §4.7) — seção 4 do mesmo SQL, executada junto com a migration em 20/09/2026 (a base estava sem perfil de escola, então não havia linha a migrar; o caminho foi validado no ensaio semeado): uma `schools` por perfil `school_user` (dados de `clubs` copiados para a mesma linha); membro como `school_admin`; `students.school_id` preenchido; `students.guardian` (jsonb) → linha em `guardians`, deduplicada por `(school_id, whatsapp)`; `owner_id` vira coluna de auditoria
- [x] **Refazer o OTP do responsável no novo modelo** (spec §4.7, item 8) — SQL (seção 8: `guardian_verification_codes.guardian_id`, `confirm_guardian_code(p_guardian_id, p_code)`, trigger que impede carimbar `whatsapp_verified_at` fora da RPC e zera ao trocar o número), edge function reescrita (aceita `guardianId` ou `studentId`, autoriza por `school_members`) e `tests/guardian-verification.integration.test.ts` reescrito com 12 casos, **todos verdes contra o projeto em 20/09/2026**; a edge function foi republicada na versão 2 no mesmo dia. Antes disso, `guardian_verification_codes` é chaveada por `student_id`, `confirm_guardian_code` autoriza por `owner_id = auth.uid()` e escreve em `students.guardian`, e a edge function `send-guardian-code` segue a mesma chave. Os três passam a operar por `guardian_id`, com autorização por `is_member_of(guardians.school_id) or is_super_admin()`, gravando `guardians.whatsapp_verified_at`. O fluxo de conformidade que já estava no ar segue funcionando, agora por responsável
- [x] Trocar policies de `students`, `reference_posts`, `generated_posts` e dos buckets — aplicadas (seções 5 e 6) e cobertas pelos 43 casos de `tests/rls.integration.test.ts` (20/09/2026); `reference_posts` e `generated_posts` ganharam `school_id`; Storage valida o 1º segmento como uuid de escola via `storage_school_id()` para `is_member_of(school_id) or is_super_admin()`; `dev`/`super_admin` continuam vendo tudo
- [x] Ensaiar a migração e rodar `tests/rls.integration.test.ts` **reescrito** para o modelo por escola (pendente, recusado, órfão sem escola, isolamento A/B em 11 tabelas, admin de rede em A e B, lixeira, prefixo de Storage): 43 casos verdes contra o projeto depois da migration aplicada — membro de A não lê B, admin de A e B lê as duas, `user` sem vínculo não lê nada (20/09/2026)
- [x] Ajustar hooks/repositórios do app (`src/lib/data/supabase/`) para o modelo por escola, com seletor de escola atual para quem é membro de mais de uma (20/09/2026; typecheck do workspace, 81 testes unitários e fluxos do modo demo no navegador: login, cadastro de aluno com responsável e matrícula, OTP, wizard com a escola do aluno, aprovações, identidade da escola, cadastro público só de escola)
  - [x] `types.ts`: `UserRole` = `dev | super_admin | user`; `AppUser.schools` (RPC `my_schools`) + `Session.activeSchoolId`; `isPlatformAdmin()` (20/09/2026)
  - [x] `supabase/index.ts`: perfil + `my_schools()`, `setActiveSchool`, `signUp` só escola, upload com prefixo da escola ativa, `students` com embed de `guardians` e upsert por (escola, número), `schoolBrands` em `schools`, `school_id` em artes e referências, `confirmCode` por `guardian_id`, aprovações sem vínculo de conta (20/09/2026)
  - [x] `mock/index.ts` e `mock/seed.ts` no mesmo modelo, tolerando sessão gravada antes do M1 (20/09/2026)
  - [x] Checagens de papel de plataforma via `isPlatformAdmin` (aceita `dev`) em `App.tsx`, `app-shell.tsx`, `students.tsx`, `student-detail.tsx`; `gallery.tsx` ainda usa `role === "super_admin"` (só esconde ações de admin; corrigir quando o papel `dev` for usado de fato) (20/09/2026). A varredura de 26/09/2026 achou um segundo caso, no servidor — ver "Checagens de papel que ainda ignoram `dev`" na Fase 1 completa
- [x] Telas: identidade da escola virou só edição (a escola nasce na aprovação); ficha do aluno ganhou **matrícula** e perdeu o seletor de escola; seletor de escola ativa no topo para quem é membro de mais de uma (20/09/2026). Os dois toggles de consentimento (foto e envio por WhatsApp) e a foto de referência entram no M4, porque gravam em `authorizations`
  - [x] **Cadastro da escola** (`/escolas`, agora "Escola"): CNPJ com máscara e validação dos dígitos verificadores, endereço (CEP, logradouro, número, complemento, bairro, cidade, UF) e contato (telefone, e-mail, responsável). `schools.address`/`contact` são jsonb; jsonb só com campos vazios grava null, e CNPJ vazio grava null para não estourar o unique. O cartão mostra CNPJ, cidade e contato, com aviso de "cadastro incompleto" enquanto não houver CNPJ. O 23505 do CNPJ vira "Este CNPJ já está cadastrado em outra escola" (20/09/2026)
  - [x] **Turmas** (`/turmas`): CRUD de `classes` agrupado por ano letivo, série em lista fixa no app (`GRADES`/`GRADE_LABEL` em `types.ts`), contagem de alunos por sala e aviso de "N alunos ainda estão sem turma". A duplicata de (ano letivo, série, nome) é recusada no mock e no banco (unique 23505), com a mesma mensagem. Excluir a turma deixa o aluno sem turma (`on delete set null`), nunca apaga o cadastro (20/09/2026)
  - [x] **`students.class_id` ligado**: seletor de turma na ficha do aluno (turmas da escola do aluno, não da ativa), coluna "Turma" na lista e linha "Turma" na ficha (20/09/2026)
  - [x] Camada de dados: `ClassRepository` no contrato, com implementação Supabase e mock; `SchoolBrand` ganhou `cnpj`, `address` e `contact` (20/09/2026)
  - [x] Verificado: typecheck do workspace, 145 testes (87 unitários — 6 novos de `classes` no mock —, 46 de RLS — 3 novos do cadastro da escola — e 12 do OTP) e o fluxo no navegador em modo demo: criar turma, vincular a aluna demo, ver a contagem virar "1 aluno", gravar CNPJ/cidade/telefone e ver o CNPJ inválido ser recusado (20/09/2026)
- [x] Aposentar o autocadastro de aluno (decisão #2): saíram `role = 'student'`, `list_approved_schools()`, `my_school_id()`, `profiles.school_id`, `profiles.student_record_id`, `student-area.tsx`, `link-student-account-dialog.tsx`, o ramo de aluno de `signup.tsx` e o usuário demo "aluno". `src/lib/eca.ts` mantém `requiresGuardianAccount`/`AGE_ACCOUNT_LINK` (sem uso de produto, cobertos por teste) para a Fase 4 (20/09/2026)
- [x] Atualizar `SUPABASE.md` e a tabela de fases de `AGENTS.md` (20/09/2026; a spec §4 já tinha sido atualizada em 16/09/2026)
- [x] **Migration aplicada** (`iaschool_fase1_schools_members_classes` via MCP), edge function `send-guardian-code` republicada (versão 2, modelo por `guardian_id`) e os dois testes de integração rodados contra o projeto: `tests/rls.integration.test.ts` (43 casos) e `tests/guardian-verification.integration.test.ts` (12 casos), todos verdes. Duas correções saíram daí: o `afterAll` do teste do OTP não apagava as escolas criadas pela aprovação (`schools.id` é o uid, sem FK para `auth.users`, então não cascateia) e as funções `storage_school_id`/`touch_updated_at` nasceram sem `search_path` fixo (migration `iaschool_fase1_fix_function_search_path`; o SQL de referência também foi corrigido) (20/09/2026)

### Fase 1 completa (fora do M1, sem prazo)

- [ ] Importação de lista de alunos e responsáveis (CSV), casando por `enrollment_number`
- [ ] Professor responsável pela turma (`classes.teacher_id`): a coluna e o campo no domínio existem desde o M1, mas a tela não os expõe — falta listar os membros da escola (`school_members`), que hoje não tem repositório no app
- [ ] Remover a tabela `clubs` depois de um ciclo com `schools` estável (a consolidação em si entrou no M1; `my_school_id()` já morre no M1 com o autocadastro de aluno). O app não consulta mais a tabela (0 linhas no banco), mas o trabalho é maior do que parece: o **bucket** `clubs` ainda guarda o logo da escola (`src/lib/constants.ts:7`, `school-brand-form-dialog.tsx:409`) e `tests/rls.integration.test.ts:35` lista `clubs` entre as tabelas do domínio — apagar a tabela sem mexer nos dois quebra o upload do logo e o teste
- [~] Papel `dev`: telas de manutenção (`face_recognition_settings`, `prompt_settings`, expurgo manual, logs técnicos) — o papel nasce no M1, as telas podem vir depois. **Parcial** (conferido em 26/09/2026): `/admin/prompt` e `/admin/logs` existem desde a Fase 0 (`App.tsx:71-76`) e o `dev` já os enxerga, mas não são exclusivos dele como pede a decisão #5 (a policy de `prompt_settings` usa `is_super_admin()`, `setup.sql:493-505`). Faltam a tela de `face_recognition_settings` (com os cortes do lote) e o expurgo manual
- [x] Checagens de papel que ainda ignoravam `dev` (26/09/2026): `gallery.tsx` passou a usar `isPlatformAdmin`, e `logs-admin-auth.ts` aceita `super_admin` ou `dev`. A API de logs continua exigindo também o e-mail `LOGS_ADMIN_EMAIL`, que segue deixado de propósito (Fase 0)

---

## Fase 2 — Upload em massa

### M2 — Fotos e upload no cliente (spec §5.1, §6, §7.1) · 2 semanas · risco médio ✅ (20/09/2026)

Migrations `iaschool_fase2_photos_batch_jobs_buckets` e `iaschool_fase2_photos_event_school_check` (foto e lote só apontam para evento da própria escola) aplicadas no banco real em 20/09/2026 (referência em `supabase/fase2-photos-upload.sql`). Uploader em `src/lib/upload/` (sem React nem Supabase: recebe hash, preparo, repositório e store por injeção), telas em `src/pages/events.tsx`, `event-new.tsx`, `event-detail.tsx`.

- [x] Tabela `photos` com `unique (event_id, content_hash)` (idempotência do upload) e tabela `batch_jobs`; UPDATE do cliente só alcança `deleted_at` (trigger `photos_restrict_client_update`); RPC `event_photo_counts` (20/09/2026)
- [x] Buckets `event-photos` (só JPEG, 20 MB), `event-thumbs` (só WebP), `event-originals`, policies com `school_id` como primeiro segmento do caminho (20/09/2026)
- [x] Telas `/eventos` (lista por ano, status, contagem de fotos, selo da declaração) e `/eventos/novo` (nome, data, turma, retenção com **padrão de 2 anos** editável, `keep_originals`, declaração de direito de imagem — sem ela o upload não abre; a tela do evento oferece a declaração depois) (20/09/2026)
- [x] Aviso no evento: "N alunos desta turma estão sem referência; as fotos deles vão para a fila manual" — avisa, não bloqueia. Até o M4 não existe `student_reference_faces`, então o aviso conta todos os alunos ativos da turma (ou da escola); `ReferenceCoverageNotice` passa a subtrair quem tem referência quando a tabela chegar (20/09/2026)
- [x] Tela `/eventos/:id` com dropzone de pasta (drop recursivo via File and Directory Entries API + `webkitdirectory`), progresso do lote, lista de falhas com "tentar de novo", grade paginada das fotos enviadas (a galeria virtualizada com miniaturas é do M3) (20/09/2026)
- [x] Upload no cliente: 6 simultâneos; 3 retentativas com backoff 1s/4s/16s; SHA-256 em Web Worker antes do redimensionamento; fila em IndexedDB por `event_id` com retomada (persiste nome/tamanho/data e estado — o File volta quando a pasta é arrastada de novo, e só o que falta segue); limite 5.000 arquivos por lote; 2560px lado maior, JPEG q85 (D3). 18 testes unitários do orquestrador e do store (20/09/2026)
  - [~] HEIC convertido no cliente via `heic-to` (libheif em wasm, carregado sob demanda; licença LGPL-3.0) — código escrito e tipado, **não exercitado com um arquivo HEIC real** (sem amostra na máquina)
- [x] Contagem de "já enviada" no conflito de hash (R2): conferência em lote antes de subir (`findExistingHashes`) + 23505 no insert como rede de segurança; o arquivo já subido é removido do bucket (20/09/2026)
- [x] `useImageUpload` atual permanece para logo e modelos de arte (20/09/2026)
- [x] Testes de RLS contra o banco real (`tests/photos-rls.integration.test.ts`, 11 testes): dedup por hash, isolamento entre escolas, UPDATE restrito a `deleted_at`, `batch_jobs`, `event_photo_counts`, Storage com prefixo da escola e MIME (20/09/2026)
- [x] Sobra do M2 resolvida no M3: `events.status` anda `draft` → `uploading` → `processing` (`finish_batch_upload`); o cliente sobe o original para `event-originals` (`{school_id}/{event_id}/{photo_id}.orig`, `Content-Type` do arquivo) quando `keep_originals` está ligado, e o `taken_at` é lido do EXIF do original antes do redimensionamento (21/09/2026)
  - [ ] Lixeira de eventos sem tela de restauração (continua): `EventRepository` só tem `moveToTrash` (`contract.ts:238`), sem listar nem restaurar; com fotos é igual (`contract.ts:312`)
  - [ ] Apagar foto pela tela: `useMovePhotosToTrash` (`hooks/use-photos.ts:79`) existe, mas nenhuma tela o usa (achado da varredura de 26/09/2026)

### M3 — Fila, ingest-worker e galeria (spec §5.2, §7.2, §10, §11) · 1,5 semanas · risco baixo ✅ (21/09/2026; deploy em 26/09/2026)

Migrations `iaschool_fase2_photo_jobs_queue` e `iaschool_fase2_batch_progress_rpcs` aplicadas no banco real em 21/09/2026 (referência em `supabase/fase2-photo-jobs-worker.sql`; ensaio com rollback e roundtrip funcional em `supabase/rehearsal/m3-checks.sql`). Worker em `artifacts/ingest-worker/`; cliente em `src/lib/gallery/`, `src/hooks/use-batch-progress.ts`, `src/components/event-photo-grid.tsx`, `event-upload-progress.tsx`.

- [x] Tabela `photo_jobs` + RPC `claim_photo_jobs` com `FOR UPDATE SKIP LOCKED`, `execute` só para `service_role` (D2). Enfileiramento por trigger `after insert on photos` a partir de `photos.batch_id` (nullable: cliente antigo segue inserindo, foto fica `pending` sem job — backfill opcional documentado). RLS ligada e sem policy (21/09/2026)
- [x] Job com 5 tentativas estouradas → `failed` com `last_error` (`complete_photo_job`), foto `failed` com `error`, e botão "N fotos não processadas — tentar de novo" na tela do evento (`retry_failed_photo_jobs`, membro da escola). A RPC seta a flag transacional `iaschool.photos_rpc` que o trigger `photos_restrict_client_update` passou a respeitar (21/09/2026)
- [x] `ingest-worker` (Node 24 + `sharp`, concorrência 8, claim de 16 com lease de 120 s): dimensões orientadas, EXIF só como reserva de `taken_at` (o cliente manda a data no insert), miniatura WebP 320px q80 em `event-thumbs` (D4), `complete_photo_job` enfileira `recognize`. Rodado contra o banco real com 12 fotos sintéticas + 1 corrompida: 12 processadas, 1 `failed` na 5ª tentativa, lote fechado como `failed`, 12 jobs `recognize` na fila. ~1–3 s por foto **daqui** (rede até o Storage domina); a meta de ≤ 300 ms (§11.1) só se mede com o worker na mesma região (21/09/2026)
- [x] Galeria virtualizada (`@tanstack/react-virtual`, `useWindowVirtualizer`): metadados das fotos de uma vez (paginado em blocos de 1.000 — antes o PostgREST cortava em 1.000 linhas), URLs assinadas só das células visíveis em lotes de 100 com cache por evento; célula sem miniatura vira skeleton, falhada vira aviso; lightbox assina a foto grande sob demanda. **Meta de ≤ 2 s com 2.000 fotos não medida**: não há acervo de demonstração desse tamanho (21/09/2026)
- [x] Progresso: contador otimista do cliente + assinatura Realtime em `batch_jobs` filtrada por `event_id`, com polling de 15 s como rede de segurança; a galeria é refeita com throttle de 3 s enquanto o worker roda. Polling de 2 s do M2 removido; fotos enviadas entram na lista sem refetch (R1) (21/09/2026)
- [x] Deploy do worker na Fly (26/09/2026): app `iaschool-ingest-worker`, org `personal`, gru, uma máquina `shared-cpu-1x` 1 GB, `min_machines_running = 1`, `auto_stop_machines = off`, check em `/health` passando; secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` via `fly secrets set`. Build no builder remoto da Fly (Docker local continua desligado). Na primeira subida o worker já esvaziou a `storage_purge_queue` (5 recortes órfãos apagados do bucket `face-crops`)
- [x] `/health` responde 503 quando a view `stalled_batch_jobs` (lote `running` parado há > 10 min **com job pendente**) tem linhas, quando o laço trava (> 60 s sem tick) ou durante o encerramento; a checagem da Fly reinicia a máquina. Lote abandonado pelo cliente sem job pendente não derruba o health (21/09/2026)
- [x] Log estruturado (pino) com `batch_id`, `photo_id`, `job_id`, `attempt`, `duration_ms`, `result`; nunca nome de arquivo, nome de aluno ou URL assinada — verificado no ensaio ao vivo (21/09/2026)
- [x] Testes: 8 de integração da fila (`tests/photo-jobs.integration.test.ts`: `photo_jobs` invisível para `authenticated`, trigger de enfileiramento, `claim_photo_jobs` com 4 chamadas paralelas sem id repetido, lease expirado, ciclo completo até `failed` e retry, grants, `stalled_batch_jobs` sob RLS) + os 11 de RLS de `photos` do M2 (dedup e isolamento entre escolas) verdes; 20 unitários do worker (sharp com imagem sintética, laço com concorrência ≤ 8 e shutdown, health, config); 23 unitários novos no app (EXIF, layout, cache de URLs, throttle, uploader) (21/09/2026)
- [ ] Sobras do M3: backfill das fotos `pending` do M2 sem `batch_id` (só se houver dado real — hoje não há nenhuma foto no banco); medir R3 (≤ 2 s com 2.000 fotos) com acervo de demonstração; HEIC continua sem amostra real. Saíram daqui em 26/09/2026: o `events.status` parado em `processing`, resolvido pelo M5 (`fase3-face-recognition.sql:314-328` passa o evento para `review` e `fase3-review-audit-purge.sql:500` para `ready`), e a medição da §11.1, que ficou só nas sobras do M5

---

## Fase 3 — Reconhecimento facial

### M0 — Spike ✅ (31/08/2026)

- [x] Benchmarks de velocidade, escala, acurácia e vazão em `scripts/spike-face/` (LFW, Apple M4, CPU) (31/08/2026)
- [x] D1 confirmada: InsightFace `buffalo_l` self-hosted. Precisão 0,993, cobertura 0,954, 4,6% para revisão, 0,21 s/foto, ~7 min por evento de 2.000 fotos (31/08/2026)
- [x] Limiares recalibrados na spec: `tau` 0,52, margem 0,10, rosto < 60px direto para revisão, `det_size` 640 na referência / 1600 no evento, 1 processo por máquina (31/08/2026)
- [x] `Dockerfile` do `face-worker` esboçado, apagando `genderage` e landmarks da imagem (31/08/2026)
- Dispensada, fora do backlog: medição em GPU — CPU cumpre a meta com folga
- Opcional, fora do backlog: comparação com AWS Rekognition — não executada (sem credencial)
- [!] Acurácia em criança de 4 a 10 anos — **não pode ser medida antes do piloto** (regra de conformidade proíbe foto real). É o risco que sustenta a revisão humana obrigatória (D6)

### M4 — Autorizações e rosto de referência (spec §5.3, §5.4, §7.4) · 1 semana · risco médio ✅ (21/09/2026; embedding entregue pelo M5 no mesmo dia)

Quatro migrations aplicadas no banco real em 21/09/2026
(`iaschool_fase3_authorizations_reference_faces`,
`iaschool_fase3_has_active_authorization_tenant_check`,
`iaschool_fase3_reference_face_jobs` e
`iaschool_fase3_reference_job_revoked_guard`; referência em
`supabase/fase3-authorizations-reference-faces.sql`, ensaio com rollback,
migração de dados semeada e roundtrip funcional em
`supabase/rehearsal/m4-seed.sql`, `m4-checks.sql` e `m4b-checks.sql`).

Camada de app: `AuthorizationRepository` e `ReferenceFaceRepository` no
contrato, com implementação Supabase e mock; `use-authorizations.ts` e
`use-reference-faces.ts`; `student-authorizations-card.tsx` e
`student-reference-faces.tsx`; indicador de prontidão em `students.tsx`.

- [x] Tabela `authorizations` com os **quatro** escopos da spec §5.4 (`biometric_sorting`, `delivery_whatsapp`, `internal_use`, `social_media`), `guardian_id`, `evidence` (termo, versão, data), `revoked_at`, **sem policy de delete**. Criar a tabela **não** depende do texto jurídico; `internal_use` entra desde já porque separar escopos depois exige recolher o consentimento outra vez (21/09/2026). Três travas além do que a spec pedia, todas cobertas pelo roundtrip: um índice único parcial garante um consentimento ativo por (aluno, escopo) — reconceder depois de revogar é linha nova, o histórico fica; o trigger `authorizations_check_school` recusa aluno ou responsável de outra escola; e `authorizations_restrict_client_update` congela a prova (pela API só `revoked_at` muda, e só de nulo para uma data — desrevogar dá erro). O privilégio de `delete` também foi revogado de `anon`/`authenticated`, não só a policy
- [!] Colher consentimento real em `authorizations` — bloqueado pelo texto jurídico do termo (seção Transversal). O que trava é gravar `granted_at` com `evidence` de um responsável de verdade, não a estrutura
- [x] Migrar `students.guardian->>'consentAt'` para `authorizations`, mantendo o booleano como origem (21/09/2026). **Decisão de conformidade:** o carimbo legado é um booleano genérico ("autorizou o uso da imagem e dos dados"), então vira **só `internal_use`** — o escopo mais restrito que cobre o que o produto já fazia. Nenhum `biometric_sorting`, `delivery_whatsapp` ou `social_media` é inferido dele: consentimento que ninguém deu não se deduz de um booleano antigo. `evidence.source = 'students.guardian.consentAt'` marca o que é herança para a revisão jurídica. Na base real não havia linha a migrar (banco sem alunos); o caminho foi validado no ensaio com `m4-seed.sql`
- [x] Ficha do aluno: dois toggles, "foto para reconhecimento" → `biometric_sorting` e "envio por WhatsApp" → `delivery_whatsapp` (21/09/2026). Cada toggle grava uma linha em `authorizations` com `evidence` (`source: school_declaration`, quem registrou, quando, `terms_version` **nulo** enquanto o texto jurídico não existir), nunca um booleano em `students`. O cartão diz na tela que marcar ali é a escola declarar que colheu, não o aceite do responsável, e que revogar não recupera o que já saiu. Desligar abre confirmação e carimba `revoked_at`; a linha anterior fica no histórico. `internal_use` aparece só de leitura, marcado como herança quando veio da migração do consentimento antigo
- [x] Tabela `student_reference_faces` (sem policy; só `service_role` e RPC) + bucket `student-refs` (21/09/2026). A extensão `vector` foi instalada aqui (estava listada no M5; sem ela a coluna `embedding` não existe). O trigger `student_reference_faces_check` exige `authorization_id` de `biometric_sorting` **ativa e do próprio aluno** — a D5 passa a viver no banco, não na tela. O bucket repete a trava no Storage: o insert só passa se o aluno do 2º segmento do caminho tiver consentimento ativo. Leitura pela tela por `list_student_reference_faces`, que nunca devolve o vetor
- [x] Aba "Rosto de referência" em `/alunos/:id` (21/09/2026): **1 foto aceita no cadastro**, com aviso "cobertura baixa" até haver 2; sem `biometric_sorting` ativo a tela não deixa cadastrar e explica que a trava é do banco, não dela (decisão #8). A foto é preparada no cliente (HEIC → JPEG, 1280px de lado maior, sem EXIF — `prepareReferencePhoto`), sobe para `student-refs` e entra na fila; a tela mostra "aguardando processamento", deixa descartar, e mostra falha com "tentar de novo". Remover uma referência processada passa por `delete_student_reference_face`, que devolve o caminho para o cliente apagar o objeto
- [x] `student_reference_faces.retention_until` = **fim do ano letivo**, sem renovação automática (21/09/2026): default `reference_retention_default()` = 31/12 do ano corrente. O efeito de vencer (apagar a referência mantendo o `student_id` das fotos confirmadas) é o expurgo do M6, que passou a rodar diariamente no `pg_cron` em 21/09/2026 — até lá o prazo era registro, não ação
- [x] Indicador de prontidão na lista de alunos (21/09/2026): "N de M com rosto de referência · N sem consentimento · N autorizados sem foto · N aguardando processamento · N com cobertura baixa", com os dois primeiros recortes clicáveis. Junta `student_biometric_readiness(p_school)` com a contagem da fila; a coluna "Situação" da tabela passa a mostrar o estado por aluno. `ReferenceCoverageNotice` (aviso do evento, M2) passa a subtrair quem já tem referência processada
- [x] Texto da aba de referência (26/09/2026): saiu "Esse serviço ainda não está no ar"; a tela agora diz que o rosto vira referência depois que o reconhecimento processa a foto e que foto sem exatamente um rosto volta como falha. Comentário do componente atualizado. Conferido no modo demo com uma foto sintética na fila
- [x] Embedding de referência com `det_size` 640 — entregue pelo laço de referência do `face-worker` (M5, `face_worker/loop.py` e `handlers.handle_reference`) em 21/09/2026 e no ar desde 26/09/2026. Status corrigido de `[~]` para `[x]` na varredura de 26/09/2026. Histórico: no M4, **o caminho estava pronto, o motor não**. A fila `student_reference_jobs` liga a tela ao worker (mesma forma de `photo_jobs`: lease, 5 tentativas, `claim`/`complete` só para `service_role`), o roundtrip está testado no banco real e o consentimento é conferido duas vezes, ao enfileirar e ao concluir — revogado no meio, o job morre como `revoked` e nenhuma referência nasce. O que falta é quem calcula o vetor: InsightFace em Python, que é o `face-worker` do M5. Decisão de 21/09/2026: não duplicar esse worker no M4 nem gravar embedding de mentira para destravar tela — até o M5 as fotos ficam `queued` e a tela diz isso

### M5 — face-worker, atribuição e pasta do aluno (spec §5.3, §7.3, §7.6, §11) · 2,5 semanas · **risco alto** ✅ (21/09/2026; deploy em 26/09/2026)

Migrations `iaschool_fase3_photo_faces_recognition` e
`iaschool_fase3_permanent_job_failure` aplicadas no banco real em 21/09/2026
(referência em `supabase/fase3-face-recognition.sql`; ensaio com rollback e
roundtrip funcional em `supabase/rehearsal/m5-checks.sql`). Worker em
`artifacts/face-worker/`; pasta do aluno em
`src/components/student-photo-folder.tsx`.

- [x] Instalar extensão `vector` no projeto (21/09/2026, antecipada no M4: `student_reference_faces.embedding` depende dela)
- [x] `docker build` — feito em 21/09/2026, do `Dockerfile` do próprio `face-worker` (o de `scripts/spike-face/` era o esqueleto). A imagem sobe, carrega os modelos embutidos em ~1,1 s e responde `/health` 200 sem baixar nada em runtime. Conferido também que só `det_10g.onnx` e `w600k_r50.onnx` ficam na imagem: `genderage` e os dois de landmark são apagados
- [ ] Rodar `bench_throughput.py` **na máquina alvo** da Fly antes de dimensionar; os números do spike são de Apple M4
- [x] `face-worker` (Python 3.12, `onnxruntime` + `insightface`, modelos embutidos, `service_role`, 1 processo por máquina) (21/09/2026). Um motor só serve os dois `det_size`: `FaceAnalysis.prepare()` troca campos do detector sem recarregar sessão ONNX, então 1600 e 640 dividem os mesmos modelos em memória
- [x] Laço de **referência** no mesmo worker (`det_size` 640), com prioridade sobre o reconhecimento: é ele que destrava o cadastro da escola (21/09/2026). Retrato sem rosto ou com mais de um é recusado **de vez**, não retentado — escolher o maior arriscaria matricular o rosto errado, e referência errada não erra uma foto, erra todas as daquele aluno
- [x] Tabela `photo_faces` com `state` (`suggested`, `unassigned`, `confirmed`, `rejected`, `not_a_student`, `adult_or_staff`), `runner_up_*`, `reviewed_by/at` (21/09/2026)
- [x] `face_recognition_settings` (linha única) com `tau`, margem, `min_face_px`, `det_size` de evento e de referência (21/09/2026). Leitura para qualquer autenticado; **escrita só do papel `dev`** (decisão #5, não "super admin" como dizia este item): mexer no limiar muda quantos rostos de criança o sistema atribui sozinho. O worker relê a linha a cada minuto — recalibrar no piloto não exige deploy. Falta a tela, que é o item "Papel `dev`" da Fase 1 completa
- [x] Busca vetorial dos 5 vizinhos **filtrada por `school_id` dentro de função `security definer`** (D7), executável só pelo `service_role` (21/09/2026). Referência vencida não entra na comparação
- [x] Persistir embedding só quando corresponde a aluno com `biometric_sorting` ativo; rosto sem correspondência guarda só bbox + recorte (D5) — o worker nem tenta, e o trigger recusa se tentar (21/09/2026)
- [x] **`bbox` e `det_score` de todo rosto detectado sobrevivem ao expurgo do recorte e do vetor** (21/09/2026): as duas colunas são `not null`, e o M6 vai apagar recorte e vetor sem tocá-las
- [x] Bucket `face-crops` para os recortes da revisão (21/09/2026). Caminho `{school_id}/{event_id}/{photo_id}-{i}.jpg` em vez do `{face_id}.jpg` da spec §6: é determinístico, então reprocessar o lote sobrescreve em vez de deixar recorte órfão. Escrita só do worker (sem policy de insert); membro lê e apaga
- [x] `revoke select on photo_faces from authenticated` + `grant select` de colunas sem `embedding` (21/09/2026). Testado pela API: `select=embedding` e `select=*` são recusados, e o conjunto de colunas permitido volta normal
- [x] Pasta do aluno como consulta N:N (R4, R6), aba "Fotos de eventos" em `/alunos/:id` (21/09/2026). RPC `student_photos`, só `confirmed`; foto com cinco crianças confirmadas aparece nas cinco pastas, com um arquivo só. A aba ficou vazia até o M6; desde a tela de revisão ela enche com o que uma pessoa confirmou, e ganhou o botão de baixar tudo em ZIP
- [x] `SUPABASE_SERVICE_ROLE_KEY` só nos workers; nunca logar embedding, recorte ou nome (21/09/2026) — o log é JSON com id, contagem, duração e resultado, e o formatter não deixa passar nem stack trace do OpenCV, que carregaria caminho de arquivo
- [x] Deploy do `face-worker` na Fly (26/09/2026): app `iaschool-face-worker`, org `personal`, gru, uma máquina `shared-cpu-2x` 2 GB, check em `/health` passando, motor carregado em ~13 s. Pegadinha registrada no README: o `fly deploy` precisa rodar **de dentro** de `artifacts/face-worker` (passar a pasta como contexto faz o flyctl não achar o `--config`)
- [ ] Sobras do M5: medir §11.1 (≤ 300 ms por miniatura) com o worker na mesma região (agora possível: os dois workers rodam em gru); recalibrar `tau`/margem com dado de criança no piloto. O `bench_throughput.py` na máquina da Fly é o item próprio acima

### M6 — Revisão, trilha, expurgo e aceite (spec §7.5, §9.4, §12) · 2,5 semanas · risco médio ✅ (21/09/2026, exceto aceite medido; deploy dos workers em 26/09/2026)

> **Decisão de 18/09/2026:** D6 mantida, com o custo operacional atacado por
> confirmação em lote por aluno. Prazo de 2 para 2,5 semanas — é uma tela a mais
> que a fila original, com RPC de lote e testes de concorrência.

Cinco migrations aplicadas no banco real em 21/09/2026
(`iaschool_fase3_biometric_events`, `iaschool_fase3_storage_purge_queue`,
`iaschool_fase3_review_rpcs`, `iaschool_fase3_purge_expired_biometrics` e
`iaschool_fase3_purge_cron`; referência em
`supabase/fase3-review-audit-purge.sql`, roundtrip funcional com rollback em
`supabase/rehearsal/m6-checks.sql`).

Camada de app: `FaceReviewRepository` no contrato, com implementação Supabase
e mock; `use-face-review.ts`; `pages/event-review.tsx`;
`components/review-student-card.tsx` e `review-face-queue.tsx`; `lib/zip.ts`.
Varredura do Storage em `artifacts/ingest-worker/src/purge.ts`.

- [x] Tela `/eventos/:id/revisao`, **aba padrão por aluno**: um cartão por aluno com a grade dos `suggested` dele no evento, partida por faixa de confiança (alta marcada, "precisa de atenção" desmarcada), confirmação em lote; célula de 150px para cima — recorte pequeno não é revisão, é carimbo (21/09/2026). Os dois cortes (`bulk_min_sim` 0,64 e `bulk_min_margin` 0,15) moram em `face_recognition_settings`, recalibráveis sem deploy, e a RPC já devolve `high_confidence` pronto
- [x] Mesma tela, **aba de exceção**: fila individual (recorte, foto inteira, candidatos, atalhos `←/→`, `1..3`, `N`, `A`) para `unassigned` e para os desmarcados no cartão (21/09/2026). **Divergência da spec §7.5, que pedia 3 candidatos sempre:** rosto `unassigned` não guardou vetor — por D5, biometria só persiste para aluno com consentimento —, então para ele não há candidato a calcular. A tela diz isso e cai para a busca de aluno por nome. Onde há vetor, `face_candidates` roda a busca dos 3 vizinhos
- [x] RPCs `confirm_face` e `reject_face` (`security definer`, checam `is_member_of` e a autorização do aluno); `not_a_student` e `adult_or_staff` apagam recorte e vetor na hora e enfileiram o objeto para o expurgo do Storage (21/09/2026)
- [x] RPC `confirm_faces_bulk(p_face_ids uuid[], p_student_id uuid)`: `security definer`, **em transação**, as mesmas checagens de `confirm_face` aplicadas ao conjunto — uma face reprovada não confirma nenhuma (21/09/2026). As linhas são travadas em ordem de `id`, que é o que evita deadlock entre dois revisores
- [x] Nenhum `confirmed` sem `reviewed_by` (D6, R7), **inclusive vindo de lote**: além da RPC, um CHECK no banco recusa a linha por qualquer caminho, e `auth.uid()` nulo derruba a chamada — de propósito o `service_role` não confirma rosto nenhum. Uma linha em `biometric_events` por lote (`kind='face_confirmed'`, `detail={face_ids,count,event_ids}`) (21/09/2026)
- [x] Teste de concorrência: duas chamadas paralelas de `confirm_faces_bulk` no mesmo aluno somam exatamente 2 confirmações de 2 faces — não confirmam duas vezes nem perdem face (`tests/face-review.integration.test.ts`) (21/09/2026)
- [x] Ação "não é aluno" **dupla** na revisão: "Criança de fora" (`not_a_student`, sai borrada) e "Adulto / equipe" (`adult_or_staff`, vai nítido). O sistema não infere idade — o `genderage` foi apagado da imagem do worker de propósito (21/09/2026). Os dois mantêm `bbox` e `det_score`, verificado em teste
- [x] Aba Fotos de `/alunos/:id` mostra **só `confirmed`** (já era assim desde o M5; o M6 é o que faz um rosto chegar a `confirmed`); sugestão nenhuma sai dali para download ou envio (21/09/2026)
- [x] Baixar as fotos do aluno em ZIP, gerado sob demanda (21/09/2026). ZIP "store" escrito à mão em `src/lib/zip.ts` (9 testes): JPEG já é comprimido, e o workspace aplica `minimumReleaseAge` a pacote novo. Nada é guardado no Storage — um ZIP parado seria uma segunda cópia da imagem do menor para expurgar depois
- [x] `biometric_events` append-only, com `student_ref` (matrícula gravada no momento do fato) (21/09/2026). **Mais restrito do que a spec §9.4 pedia:** sem policy de insert para `authenticated` — trilha que o cliente escreve é trilha que ele forja. Consentimento e referência viram linha por **trigger**; revisão e expurgo, por RPC `security definer`
- [x] `purge_expired_biometrics()` diária via `pg_cron` (03:20 UTC): retenção vencida, revogação, aluno expurgado, evento vencido (21/09/2026). Foto e evento passam pela lixeira de 30 dias; **biometria não** — ver a decisão do dia. `purge_expired_student_trash()` foi reescrita: ela apagava o aluno sem tocar na biometria, o que deixaria rosto confirmado sem dono, recorte órfão no bucket e trilha sem `student_ref`
- [x] Fila `storage_purge_queue` + varredura no `ingest-worker` (21/09/2026): apagar a linha no banco não apaga o objeto no bucket. Agrupada por bucket, com lease, 5 tentativas e log sem caminho de arquivo (4 testes unitários)
- [x] Prazos: foto do evento 2 anos, referência até o fim do ano letivo, trilha 5 anos (provisório) — implementados como gatilho do expurgo (21/09/2026)
- [x] Testes unit: máquina de estados de `photo_faces` e agrupamento por aluno/faixa de confiança no mock (10), ZIP e CRC-32 (9). Limiares, hash/dedup e EXIF já estavam cobertos desde o M2/M3 (21/09/2026)
- [x] Testes RLS e de conformidade: 16 casos em `tests/face-review.integration.test.ts` contra o banco real — escola A não lê a revisão de B, `authenticated` não lê `embedding` (M5), trilha append-only e invisível para a outra escola, `storage_purge_queue` invisível para o cliente, lote tudo-ou-nada, concorrência, `confirmed` sempre com revisor, recusa preservando `bbox` (21/09/2026)
- [ ] Aceite §12.2 com dado sintético/adulto: precisão `suggested` ≥ 0,99, cobertura ≥ 0,85, revisão ≤ 15%, falso positivo entre escolas = 0. **Não medido** — depende de um acervo de 2.000 fotos sintéticas que não existe nesta máquina
- [ ] Recalibrar limiares com dado real da escola no piloto **antes** de reduzir a revisão manual
- [ ] Sobras do M6: a lista de eventos mostra o selo "Em revisão" (`events.tsx:112`), mas não **quantos** rostos faltam revisar — a contagem só aparece na tela do evento; a tela do papel `dev` para `face_recognition_settings` (incluindo os dois cortes novos) continua na Fase 1 completa; o expurgo nunca rodou com dado de verdade, só no ensaio — o `pg_cron` roda todo dia e a última execução, em 26/09/2026 às 03:20 UTC, terminou `succeeded`
- [x] **Trilha em cascata derrubava o delete** (26/09/2026, migration `iaschool_fase3_audit_tolerates_cascade_delete`). Os triggers de auditoria disparam também na cascata, e `log_biometric_event` gravava uma linha apontando para a escola ou o aluno que estava sendo apagado — a FK recusava e o delete inteiro caía: apagar escola ou aluno com rosto de referência falhava sempre (o expurgo não era afetado, porque apaga a referência antes do aluno). Agora, com a escola sendo apagada a função não grava (a trilha dela sai junto pelo `on delete cascade`), e com o aluno sendo apagado grava sem a FK e com o identificador de reserva `aluno:xxxxxxxx`. Ensaiado com rollback nos dois caminhos; caso novo em `tests/authorizations.integration.test.ts` (vermelho antes, verde depois), e o `afterAll` do mesmo arquivo cobre o delete da escola
- [ ] **Apagar a escola apaga a trilha biométrica dela** (`biometric_events.school_id` é `on delete cascade`), o que contradiz o prazo de 5 anos da trilha. Hoje não há tela que apague escola, mas o fim de contrato de uma escola vai passar por aqui. Levar para a revisão jurídica junto com os prazos provisórios; a alternativa técnica é soft delete de escola ou FK `set null` com `school_ref` gravado, como `student_ref`
- [ ] Revisar o `grant` de `purge_expired_student_trash()` a `authenticated`: ela varre **todas** as escolas, não só a de quem chamou. Não é escalada — só apaga o que já venceu, e é assim desde a Fase 0 —, mas agora que o `pg_cron` roda o expurgo sozinho, o `execute` do cliente virou dispensável. O linter do Supabase também aponta as RPCs novas da revisão como "definer executável por authenticated": isso é intencional, elas checam `is_member_of` por dentro (mesmo padrão de `confirm_guardian_code` e `student_photos`). O `execute` de `anon` nas funções `security definer` é outra coisa e virou item próprio em "Publicação, CI e higiene" (26/09/2026, já feito). Conferido em 26/09/2026 para quando for revogar: o `pg_cron` já cobre a lixeira de alunos (passo 3 de `purge_expired_biometrics()`), mas o app ainda chama a RPC como expurgo oportunista em `src/lib/data/supabase/index.ts:949` — revogar sem apagar essa chamada só troca o expurgo por um erro engolido pelo `catch`

---

## Fase 4 — Autorização granular + portal do responsável · 2–3 semanas · risco médio

Sem spec. `authorizations` (M4) já deixa os ganchos.

- [ ] Spec da fase
- [ ] Revogação com efeito retroativo sobre material já entregue. **O que já saiu no WhatsApp de outra família não volta** — o termo precisa dizer isso
- [ ] Eliminação a pedido do responsável (LGPD art. 18, VI): tira o aluno de cena (revoga, apaga biometria e `photo_faces` dele), **não apaga o arquivo**, que tem outras crianças autorizadas. Resposta em 15 dias (provisório)
- [ ] Quem pode apagar antes do prazo: `school_admin` derruba evento e foto; `teacher`/`school_staff`, só foto do evento que criou; `dev`/`super_admin`, expurgo manual com trilha obrigatória
- [ ] Papel `guardian` e portal do responsável — os ganchos nascem no M1: `guardians.user_id` (nulo) e `profiles.role`, cujo `check` ganha `'guardian'` como quarto valor
- [x] Decisão de produto: foto com criança sem autorização na hora da entrega — **desfocar quem não autorizou** (18/09/2026; spec §9.3.1). A implementação está na Fase 5, como a decisão de 18/09 diz (movida para lá em 26/09/2026)

---

## Fase 5 — Criação e envio em lote · 4–6 semanas · **risco alto** (dependência da Meta)

Sem spec. Depende da pendência #7 fechada.

- [ ] Spec da fase
- [ ] Templates de evento e geração em lote (1 arte → N alunos); subir cota e rate limit de `generation-quota.ts`
- [ ] `delivery_queue` com retry por canal
- [ ] Envio em lote via WhatsApp Business API com templates aprovados pela Meta
- [ ] Trava de autorização por escopo (`delivery_whatsapp`, `social_media`) antes de qualquer envio/publicação
- [ ] Implementar o desfoque na entrega (decisão de 18/09/2026, spec §9.3.1): aplicado no arquivo, nunca como sobreposição de tela; gerado a partir do original para refletir a autorização do momento. Depende do `bbox` e do `det_score` que o M5 e o M6 já preservam

---

## Decisões em aberto

| # | Decisão | Onde | Bloqueia |
| --- | --- | --- | --- |
| 4 | Fallback Twilio Verify se o onboarding da Meta travar | pendências #7 | Transversal |

Ainda sem decisão:

- **Animação distribuindo as fotos nas pastas** no momento da confirmação em lote. Toca a tela do M6. Se entrar, mostra as fotos em estado "sugerido", nunca como atribuição final.
- **Versão desfocada: gerada a cada entrega ou cacheada?** Recomendação em aberto: gerar na entrega, a partir do original, para refletir a autorização do momento. Fase 5.

## Decisões tomadas

**21/09/2026** — M6: **biometria não passa pela lixeira de 30 dias.** A
decisão de 18/09 dizia "sempre pela lixeira"; ela vale para foto e evento, que
a escola pode querer de volta. Vetor e recorte de rosto são outra coisa:
manter biometria por 30 dias depois de o responsável revogar é exatamente o
que a revogação proíbe. Eles somem na hora; a foto continua esperando os 30
dias. Decidido junto: (a) a trilha **não** tem policy de insert para o
cliente — ela nasce de trigger (consentimento, referência) e de RPC `security
definer` (revisão, expurgo), porque trilha que o cliente escreve é trilha que
ele forja, e isso é mais restrito do que a spec §9.4 pedia; (b) apagar linha
no banco não apaga objeto no bucket, então o expurgo enfileira em
`storage_purge_queue` e o `ingest-worker` remove de fato — sem isso, "expurgo"
seria só esconder o arquivo; (c) aluno expurgado não perde a linha do rosto:
ela fica sem vetor, sem recorte e sem vínculo, em `unassigned`, que é o estado
que a entrega borra — apagar a linha inteira tiraria o `bbox` e deixaria a
criança **nítida** numa foto que ela não pode mais autorizar; (d) a fila
individual não tem 3 candidatos para rosto `unassigned`, porque esse rosto não
guardou vetor (D5) — inventar candidato exigiria guardar biometria de quem não
autorizou; (e) `confirm_faces_bulk` exige `auth.uid()`, então o `service_role`
não confirma rosto nenhum, nem por engano de script.

**21/09/2026** — M5: **um processo por máquina, um job de cada vez**, sem
concorrência interna. Não é simplificação: o spike mediu 1, 4 e 8 processos
com a mesma vazão agregada, porque o `onnxruntime` já satura os núcleos numa
sessão. Concorrência aqui só criaria disputa de CPU e lease vencido; escala-se
com `fly scale count`. Decidido junto: um motor só para os dois `det_size`
(`prepare()` troca campos do detector sem recarregar sessão); a fila de
referência tem prioridade sobre a de reconhecimento; retrato com zero ou mais
de um rosto é **falha permanente**, não retentativa, e o mesmo vale para
arquivo ilegível — cinco leases de 5 minutos por foto que nunca vai processar
travariam o lote; e o recorte da revisão vai para
`{school_id}/{event_id}/{photo_id}-{i}.jpg`, não `{face_id}.jpg` como a spec
§6 dizia, porque o caminho determinístico faz o reprocessamento sobrescrever
em vez de deixar órfão no bucket.

**21/09/2026** — M4: o embedding de referência **não** é reimplementado no M4.
O vetor sai de InsightFace em Python, que é o `face-worker` do M5; duplicá-lo
agora custaria o marco inteiro e seria jogado fora. O M4 entrega o caminho —
fila `student_reference_jobs`, `claim`/`complete` para `service_role`, retry e
remoção para a tela — e o M5 pluga o motor. Descartadas: gravar embedding
sintético para a tela parecer pronta (o M5 buscaria contra vetor falso) e
deixar a aba de referência só de leitura (não faria nada, porque
`student_reference_faces.embedding` é `not null`). Decidido junto: o toggle da
ficha do aluno grava `evidence.source = 'school_declaration'` com
`terms_version` nulo, e a tela diz que isso é declaração da escola, não o
aceite do responsável — colher o aceite de verdade continua bloqueado pelo
texto jurídico.

**21/09/2026** — M3: deploy na Fly só preparado (Dockerfile, `fly.toml`,
roteiro), sem `fly deploy` neste marco; `taken_at` extraído no **cliente** do
EXIF do arquivo original (o JPEG sobe sem EXIF: nada de GPS nem modelo de
câmera no Storage), com `OffsetTimeOriginal` quando existe e o fuso do
navegador quando não — o worker lê EXIF só como reserva; `keep_originals`
implementado no cliente (original vai para `event-originals`); alerta de lote
parado = view `stalled_batch_jobs` + `/health` 503 no worker, sem `pg_cron`;
`batch_jobs.total` contado no **servidor** em `finish_batch_upload`;
`photos.status` não passa por `processing` (só `pending` → `processed`/`failed`).

**31/08/2026** — D1 InsightFace self-hosted, D2 fila em tabela, D3 2560px q85,
D4 miniaturas pelo worker, D5 embedding só com consentimento, D6 revisão humana
obrigatória, D7 isolamento por escola na busca vetorial, escopo do M1 = Fase 1
mínima, métricas removidas, WhatsApp = Cloud API oficial.

**16/09/2026** — modelo do M1 (propostas de 15/09 confirmadas). A spec §4 foi
reescrita no mesmo commit:

| # | Decisão | Resposta | Onde |
| --- | --- | --- | --- |
| 2 | Destino do perfil `student` | aposentado — menor de 16 não tem conta própria; aluno é só registro em `students` | spec §4.7, item 7 |
| 3 | Consolidar `clubs` em `schools` | sim, já na migration do M1; `clubs` só é removida depois de um ciclo estável | spec §4.1 |
| 5 | O que o papel `dev` faz a mais | tudo do `super_admin` + `face_recognition_settings`, `prompt_settings`, expurgo manual e logs técnicos | spec §4.1 |
| 6 | Série: coluna ou tabela `grades` | coluna `grade` em `classes`, lista fixa no app | spec §4.2 |
| 7 | Responsável: tabela ou jsonb | tabela `guardians`; verificação de WhatsApp por número, não por aluno | spec §4.3 e §4.7 item 8 |
| 8 | Foto de referência: 1 ou 2 | 1 aceita no cadastro, com aviso de cobertura baixa até haver 2 | spec §7.4 |

Duas consequências decididas junto, que não estavam em nenhuma das propostas:
`guardians.user_id` nasce nulo no M1, para que o papel `guardian` da Fase 4 seja
só mais um valor no `check` de `profiles.role`; e `authorizations` ganha
`guardian_id`, porque o canal verificado passou a ter dono.

**18/09/2026** — manter a D6 e atacar só o custo operacional da revisão, com
confirmação em lote por aluno (spec §7.5). A D6 foi reexaminada: a trava é
decisão de produto, não exigência legal — a LGPD art. 20 dá direito de
**solicitar** revisão e teve vetado o parágrafo que exigiria revisor humano, e
nem a Lei 15.211/2025 nem o Decreto 12.880/2026 tratam de revisão de
classificação. O que sustenta a D6 é o buraco de medição: acurácia em criança de
4 a 10 anos nunca foi medida. Não é bypass — `reviewed_by` e `reviewed_at`
continuam por linha; um ato humano passa a cobrir N linhas olhadas numa grade.

**18/09/2026** — decisão #1: foto em que aparece criança sem autorização, na
hora da entrega, vai **com o rosto dela desfocado** (spec §9.3.1). Descartadas:
bloquear a foto inteira (derrubaria o acervo, porque quase toda foto de evento
tem mais de uma criança) e entregar só foto individual (sobraria quase nada de
uma festa junina). A implementação é Fase 5, mas o M5 e o M6 passam a preservar
`bbox` e `det_score` de todo rosto detectado — sem isso não há o que desfocar.

**18/09/2026** — regra de nitidez e prazos de guarda:

| Decisão | Resposta |
| --- | --- |
| Aluno autorizado em foto entregue a outra família | nítido; o termo precisa declarar |
| Adulto (professora, pai, fotógrafo) | nítido; estado `adult_or_staff`, marcado por pessoa na revisão — o sistema não infere idade |
| Rosto não triado (`unassigned`) | borrado; o default protege |
| Foto do evento | 2 anos |
| Rosto de referência | fim do ano letivo, sem renovação automática |
| Expiração da referência | mesma regra da revogação: confirmadas mantêm o `student_id` |
| Forma de apagar | sempre pela lixeira de 30 dias |
| Trilha | 5 anos — **provisório**, revisão jurídica pendente |
| Eliminação a pedido do responsável | tira o aluno de cena, não apaga o arquivo; 15 dias — **provisório** |

Também corrigido nesta data: a justificativa da D6 na spec §3 e §9.1 dizia que
ela sustenta o direito de revisão da LGPD art. 20. Não sustenta — o art. 20 dá
direito de **solicitar** revisão e o parágrafo do revisor humano foi vetado. A
D6 fica pelo buraco de medição em criança, não por obrigação legal.
