# Backlog — IAschool

Fonte única de acompanhamento do projeto. Vive em Markdown, na raiz, e é
referenciado por [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md).

**Atualizado em:** 21/09/2026 (M4 iniciado na branch `feat/m4-autorizacoes-rosto-referencia`; M3 implementado: fila `photo_jobs` e RPCs no banco real, `ingest-worker` rodado contra o banco com fotos sintéticas, galeria virtualizada e progresso por Realtime; 129 testes unitários do app + 20 do worker + 19 de integração verdes; deploy na Fly preparado, não executado)
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
| Transversal — produção e conformidade | pendências #1–#7 | ❌ nenhum item andou | depende de compra de domínio/Resend/Meta |
| 1 — Fundação escolar | M1 (mínima) + Fase 1 completa | ✅ **M1 concluído** (20/09/2026); Fase 1 completa (CSV, papel `dev`, professor da turma) segue aberta | 2–2,5 sem (M1) |
| 2 — Upload em massa | M2, M3 | ✅ **M2** (20/09/2026) e **M3** (21/09/2026) concluídos; deploy do `ingest-worker` na Fly preparado, **não executado** | — |
| 3 — Reconhecimento facial | M0 ✅, M4, M5, M6 | 🔬 spike feito; **M4 em andamento** (21/09/2026), M5 e M6 a fazer | 6 sem |
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

**Deixado de propósito** (não são pendências, são decisões): `fly.toml` com `app = "iasport-image-api-r9"`, `LOGS_ADMIN_EMAIL` antigo, variáveis `IASPORT_TEST_*` locais, tabela `clubs` no banco (vai para a Fase 1). `supabase/pivot-fase0.sql` só serve para bases legadas; o banco atual nasceu limpo.

### Higiene pendente da Fase 0

- [x] Commitar o que está solto no working tree: spec, relatório do spike, `scripts/spike-face/`, deck regenerado (01/09), `scripts/deck/mobile.css`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, memórias (18/09/2026)
- [x] Adicionar `.playwright-mcp/` ao `.gitignore` (15/09/2026)
- [x] Abrir PR de `pivot/fase-0` → `main`: [andomingos87/iaschool#1](https://github.com/andomingos87/iaschool/pull/1), 9 commits (18/09/2026)
- [x] Apagar specs/planos divergentes (`docs/superpowers/`, memórias `.agents/memory/r9-*`) e corrigir Anexo B da pivotagem, cabeçalho da spec e memória de marca (15/09/2026)
- [x] Verificar os Problemas 2 e 3 de `docs/diagnostico-geracao-imagens.md`: **persistem**, conferido no código em 20/09/2026 (`mock/index.ts:689`, `api-server/routes/generation.ts:79`, `openai-generation.ts:81`). O Problema 1 foi superado pelo provisionamento de 30/08. O diagnóstico fica como spec das correções abaixo (20/09/2026)
- [ ] Geração em modo demo: decidir entre gerador mock (canvas) ou botão desabilitado com aviso; hoje chama o backend real sem token e falha sempre (`src/lib/data/mock/index.ts:689`)
- [ ] `api-server`: drenar o corpo da requisição antes de responder em `requireSupabaseUser`, ou mover o multer para antes da auth (`routes/generation.ts:79`)
- [ ] Cliente: tratar `onerror` do XHR sem afirmar que é a internet do usuário (`src/lib/data/openai-generation.ts:81`)

---

## Transversal — Produção e conformidade

Nada aqui andou desde 30/08/2026. Enquanto #1–#7 não fecharem, vale a regra bloqueante.

### Infra e cadastro (`docs/pendencias-producao.md`)

- [x] Projeto Supabase `jtyyauivokutperouqyh` estava **pausado** (free tier, inatividade); Anderson reativou em 20/09/2026. As 7 migrations e o super_admin estão intactos; o banco não tem mais nenhuma linha (20/09/2026)
- [x] **`SUPABASE_ACCESS_TOKEN` renovado** por Anderson em 20/09/2026; `apply_migration` via MCP voltou a funcionar e a migration do M1 subiu no mesmo dia. Fica registrado, para a próxima vez: `psql` direto em `db.jtyyauivokutperouqyh.supabase.co:5432` com `SUPABASE_DB_PASSWORD` é a saída enquanto o PAT não vem (foi o caminho do ensaio); o `DATABASE_URL` do `.env.local` aponta para o pooler de transação (porta 6543), que não conhece o tenant, e o de sessão (`aws-0-us-east-1`, porta 5432) funciona (20/09/2026)
- [ ] Evitar nova pausa por inatividade: ou subir o plano, ou um ping semanal (cron/edge) na REST enquanto o piloto não começa

- [ ] #1 Comprar domínio — bloqueia #2 e #3
- [ ] #2 Assinar o Resend — bloqueia #3
- [ ] #3 Confirmar domínio no Resend (SPF + DKIM, DMARC recomendado); configurar SMTP no Supabase; subir rate limits; cadastrar Redirect URLs — bloqueia #5
- [ ] #4 Criar template "Confirm signup" pt-BR (`supabase/email-templates/`); `reset-password.html` e `invite.html` já prontos
- [ ] #5 Ligar "Confirm email" no Supabase Auth
- [ ] #6 Testar cadastro ponta a ponta: escola → e-mail → confirma → "Aguardando aprovação" → super_admin aprova em `/aprovacoes`

### WhatsApp oficial + OTP (#7) — bloqueia foto real de menor

Decisão tomada: Meta WhatsApp Cloud API direto. Fallback interino: Twilio Verify (SMS).

- [ ] Meta Business Suite: criar WABA, verificar empresa, número dedicado
- [ ] Template `guardian_verification_code`, categoria Authentication, `pt_BR`, botão de copiar código
- [ ] Secrets `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` no Supabase
- [ ] Trocar o bloco `SIMULAÇÃO` de `send-guardian-code` pela chamada à Graph API; parar de devolver `demoCode`/`simulated` (autorização, TTL 10 min, antiflood 60 s já são produção)
- [ ] Teste ponta a ponta: aluno menor → verificar responsável → compartilhar → linha em `share_logs`

### Comercial e piloto (`docs/apresentacao-iaschool.md`)

O deck (HTML 16:9 e 9:16, PDFs) está pronto e foi regenerado em 01/09/2026. Faltam decisões de negócio que ele já referencia:

- [ ] Definir preço e modelo de cobrança (slide 10 / anexo)
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
  - [x] Checagens de papel de plataforma via `isPlatformAdmin` (aceita `dev`) em `App.tsx`, `app-shell.tsx`, `students.tsx`, `student-detail.tsx`; `gallery.tsx` ainda usa `role === "super_admin"` (só esconde ações de admin; corrigir quando o papel `dev` for usado de fato) (20/09/2026)
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
- [ ] Remover a tabela `clubs` depois de um ciclo com `schools` estável (a consolidação em si entrou no M1; `my_school_id()` já morre no M1 com o autocadastro de aluno)
- [ ] Papel `dev`: telas de manutenção (`face_recognition_settings`, `prompt_settings`, expurgo manual, logs técnicos) — o papel nasce no M1, as telas podem vir depois

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
  - [ ] Lixeira de eventos sem tela de restauração (continua)

### M3 — Fila, ingest-worker e galeria (spec §5.2, §7.2, §10, §11) · 1,5 semanas · risco baixo ✅ (21/09/2026, exceto deploy)

Migrations `iaschool_fase2_photo_jobs_queue` e `iaschool_fase2_batch_progress_rpcs` aplicadas no banco real em 21/09/2026 (referência em `supabase/fase2-photo-jobs-worker.sql`; ensaio com rollback e roundtrip funcional em `supabase/rehearsal/m3-checks.sql`). Worker em `artifacts/ingest-worker/`; cliente em `src/lib/gallery/`, `src/hooks/use-batch-progress.ts`, `src/components/event-photo-grid.tsx`, `event-upload-progress.tsx`.

- [x] Tabela `photo_jobs` + RPC `claim_photo_jobs` com `FOR UPDATE SKIP LOCKED`, `execute` só para `service_role` (D2). Enfileiramento por trigger `after insert on photos` a partir de `photos.batch_id` (nullable: cliente antigo segue inserindo, foto fica `pending` sem job — backfill opcional documentado). RLS ligada e sem policy (21/09/2026)
- [x] Job com 5 tentativas estouradas → `failed` com `last_error` (`complete_photo_job`), foto `failed` com `error`, e botão "N fotos não processadas — tentar de novo" na tela do evento (`retry_failed_photo_jobs`, membro da escola). A RPC seta a flag transacional `iaschool.photos_rpc` que o trigger `photos_restrict_client_update` passou a respeitar (21/09/2026)
- [x] `ingest-worker` (Node 24 + `sharp`, concorrência 8, claim de 16 com lease de 120 s): dimensões orientadas, EXIF só como reserva de `taken_at` (o cliente manda a data no insert), miniatura WebP 320px q80 em `event-thumbs` (D4), `complete_photo_job` enfileira `recognize`. Rodado contra o banco real com 12 fotos sintéticas + 1 corrompida: 12 processadas, 1 `failed` na 5ª tentativa, lote fechado como `failed`, 12 jobs `recognize` na fila. ~1–3 s por foto **daqui** (rede até o Storage domina); a meta de ≤ 300 ms (§11.1) só se mede com o worker na mesma região (21/09/2026)
- [x] Galeria virtualizada (`@tanstack/react-virtual`, `useWindowVirtualizer`): metadados das fotos de uma vez (paginado em blocos de 1.000 — antes o PostgREST cortava em 1.000 linhas), URLs assinadas só das células visíveis em lotes de 100 com cache por evento; célula sem miniatura vira skeleton, falhada vira aviso; lightbox assina a foto grande sob demanda. **Meta de ≤ 2 s com 2.000 fotos não medida**: não há acervo de demonstração desse tamanho (21/09/2026)
- [x] Progresso: contador otimista do cliente + assinatura Realtime em `batch_jobs` filtrada por `event_id`, com polling de 15 s como rede de segurança; a galeria é refeita com throttle de 3 s enquanto o worker roda. Polling de 2 s do M2 removido; fotos enviadas entram na lista sem refetch (R1) (21/09/2026)
- [~] Deploy do worker na Fly: `artifacts/ingest-worker/Dockerfile`, `fly.toml` (app `iaschool-ingest-worker`, gru, `min_machines_running = 1`, `auto_stop_machines = off`, check em `/health`) e roteiro no README **prontos, deploy não executado** (decisão de 21/09/2026). `docker build` também não rodou: daemon do Docker desligado nesta máquina
- [x] `/health` responde 503 quando a view `stalled_batch_jobs` (lote `running` parado há > 10 min **com job pendente**) tem linhas, quando o laço trava (> 60 s sem tick) ou durante o encerramento; a checagem da Fly reinicia a máquina. Lote abandonado pelo cliente sem job pendente não derruba o health (21/09/2026)
- [x] Log estruturado (pino) com `batch_id`, `photo_id`, `job_id`, `attempt`, `duration_ms`, `result`; nunca nome de arquivo, nome de aluno ou URL assinada — verificado no ensaio ao vivo (21/09/2026)
- [x] Testes: 8 de integração da fila (`tests/photo-jobs.integration.test.ts`: `photo_jobs` invisível para `authenticated`, trigger de enfileiramento, `claim_photo_jobs` com 4 chamadas paralelas sem id repetido, lease expirado, ciclo completo até `failed` e retry, grants, `stalled_batch_jobs` sob RLS) + os 11 de RLS de `photos` do M2 (dedup e isolamento entre escolas) verdes; 20 unitários do worker (sharp com imagem sintética, laço com concorrência ≤ 8 e shutdown, health, config); 23 unitários novos no app (EXIF, layout, cache de URLs, throttle, uploader) (21/09/2026)
- [ ] Sobras do M3: `events.status` fica em `processing` até o M5 consumir os jobs `recognize`; backfill das fotos `pending` do M2 sem `batch_id` (só se houver dado real — hoje o banco está vazio); medir R3 (≤ 2 s) e §11.1 (≤ 300 ms/miniatura) com acervo de demonstração e worker na Fly; HEIC continua sem amostra real

---

## Fase 3 — Reconhecimento facial

### M0 — Spike ✅ (31/08/2026)

- [x] Benchmarks de velocidade, escala, acurácia e vazão em `scripts/spike-face/` (LFW, Apple M4, CPU) (31/08/2026)
- [x] D1 confirmada: InsightFace `buffalo_l` self-hosted. Precisão 0,993, cobertura 0,954, 4,6% para revisão, 0,21 s/foto, ~7 min por evento de 2.000 fotos (31/08/2026)
- [x] Limiares recalibrados na spec: `tau` 0,52, margem 0,10, rosto < 60px direto para revisão, `det_size` 640 na referência / 1600 no evento, 1 processo por máquina (31/08/2026)
- [x] `Dockerfile` do `face-worker` esboçado, apagando `genderage` e landmarks da imagem (31/08/2026)
- [ ] Medição em GPU — dispensada; CPU cumpre a meta com folga
- [ ] Comparação com AWS Rekognition — não executada (sem credencial); virou opcional
- [!] Acurácia em criança de 4 a 10 anos — **não pode ser medida antes do piloto** (regra de conformidade proíbe foto real). É o risco que sustenta a revisão humana obrigatória (D6)

### M4 — Autorizações e rosto de referência (spec §5.3, §5.4, §7.4) · 1 semana · risco médio

- [ ] Tabela `authorizations` com os **quatro** escopos da spec §5.4 (`biometric_sorting`, `delivery_whatsapp`, `internal_use`, `social_media`), `guardian_id`, `evidence` (termo, versão, data), `revoked_at`, **sem policy de delete**. Criar a tabela **não** depende do texto jurídico; `internal_use` entra desde já porque separar escopos depois exige recolher o consentimento outra vez
- [!] Colher consentimento real em `authorizations` — bloqueado pelo texto jurídico do termo (seção Transversal). O que trava é gravar `granted_at` com `evidence` de um responsável de verdade, não a estrutura
- [ ] Migrar `students.guardian->>'consentAt'` para `authorizations`, mantendo o booleano como origem
- [ ] Ficha do aluno: dois toggles, "foto para reconhecimento" → `biometric_sorting` e "envio por WhatsApp" → `delivery_whatsapp`. Cada toggle grava uma linha em `authorizations` com `evidence` (quem registrou, quando, versão do termo), nunca um booleano em `students`. Toggle marcado pela escola é declaração de que colheu, não consentimento do responsável; o OTP de WhatsApp fecha o ciclo depois
- [ ] Tabela `student_reference_faces` (sem policy; só `service_role` e RPC) + bucket `student-refs`
- [ ] Aba "Rosto de referência" em `/alunos/:id`: **1 foto aceita no cadastro** para não travar a matrícula, com aviso "cobertura baixa" até haver 2 frontais (o spike mediu com 2); estado do consentimento, botão de revogar; sem `biometric_sorting` ativo a tela não deixa cadastrar (decisão #8)
- [ ] `student_reference_faces.retention_until` = **fim do ano letivo**, sem renovação automática; ao vencer, as fotos já confirmadas mantêm o `student_id` (mesma regra da revogação)
- [ ] Indicador de prontidão na lista de alunos: "182 de 240 com referência · 58 sem consentimento", clicável para a lista de quem falta
- [ ] Embedding de referência com `det_size` 640

### M5 — face-worker, atribuição e pasta do aluno (spec §5.3, §7.3, §7.6, §11) · 2,5 semanas · **risco alto**

- [ ] Instalar extensão `vector` no projeto (disponível 0.8.2, não instalada)
- [ ] `docker build` do `Dockerfile` de `scripts/spike-face/` — nunca foi construído (sem Docker na máquina do spike)
- [ ] Rodar `bench_throughput.py` **na máquina alvo** da Fly antes de dimensionar; os números do spike são de Apple M4
- [ ] `face-worker` (Python 3.12, `onnxruntime` + `insightface`, modelos embutidos, `service_role`, 1 processo por máquina)
- [ ] Tabela `photo_faces` com `state` (`suggested`, `unassigned`, `confirmed`, `rejected`, `not_a_student` = criança de fora, `adult_or_staff` = adulto), `runner_up_*`, `reviewed_by/at`
- [ ] `face_recognition_settings` (linha única, editável pelo super admin) com `tau`, margem, `min_face_px`
- [ ] Busca vetorial dos 5 vizinhos **filtrada por `school_id` dentro de função `security definer`** (D7)
- [ ] Persistir embedding só quando corresponde a aluno com `biometric_sorting` ativo; rosto sem correspondência guarda só bbox + recorte (D5)
- [ ] **`bbox` e `det_score` de todo rosto detectado sobrevivem ao expurgo do recorte e do vetor**, inclusive `not_a_student` — é o que torna o desfoque da entrega possível (spec §9.3.1). Sem isso, a única saída na Fase 5 vira bloquear a foto inteira
- [ ] Bucket `face-crops` para os recortes da revisão
- [ ] `revoke select on photo_faces from authenticated` + `grant select` de colunas sem `embedding` (privilégio de coluna)
- [ ] Pasta do aluno como consulta N:N (R4, R6), aba "Fotos" em `/alunos/:id`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` só nos workers; nunca logar embedding, recorte ou nome

### M6 — Revisão, trilha, expurgo e aceite (spec §7.5, §9.4, §12) · 2,5 semanas · risco médio

> **Decisão de 18/09/2026:** D6 mantida, com o custo operacional atacado por
> confirmação em lote por aluno. Prazo de 2 para 2,5 semanas — é uma tela a mais
> que a fila original, com RPC de lote e testes de concorrência.

- [ ] Tela `/eventos/:id/revisao`, **aba padrão por aluno**: um cartão por aluno com a grade dos `suggested` dele no evento, partida por faixa de confiança (alta marcada, "precisa de atenção" desmarcada), confirmação em lote; recorte grande o bastante para se enxergar o rosto
- [ ] Mesma tela, **aba de exceção**: fila individual (recorte, foto inteira, 3 candidatos, atalhos `←/→` e `1..3`) para `unassigned` e para os desmarcados no cartão
- [ ] RPCs `confirm_face` e `reject_face` (`security definer`, checam `is_member_of` e autorização do aluno); `not_a_student` apaga recorte e vetor na hora
- [ ] RPC `confirm_faces_bulk(p_face_ids uuid[], p_student_id uuid)`: `security definer`, **em transação**, as mesmas checagens de `confirm_face` aplicadas ao conjunto — uma face reprovada não confirma nenhuma
- [ ] Nenhum `confirmed` sem `reviewed_by` (D6, R7), **inclusive vindo de lote**; uma linha em `biometric_events` por lote (`kind='face_confirmed'`, `detail={face_ids,count}`)
- [ ] Teste de concorrência: dois revisores no mesmo aluno ao mesmo tempo não confirmam duas vezes nem perdem face
- [ ] Ação "não é aluno" **dupla** na revisão: "Criança de fora" (`not_a_student`, sai borrada) e "Adulto / equipe" (`adult_or_staff`, vai nítido). O sistema não infere idade — o `genderage` foi apagado da imagem do worker de propósito
- [ ] Aba Fotos de `/alunos/:id` mostra **só `confirmed`**; sugestão nenhuma sai dali para download ou envio
- [ ] Baixar as fotos do aluno em ZIP, gerado sob demanda
- [ ] `biometric_events` append-only (mesmo padrão de `share_logs`), com `student_ref` (matrícula gravada no momento do fato) — a FK é `on delete set null` e sozinha deixaria a trilha ilegível depois do expurgo do aluno
- [ ] `purge_expired_biometrics()` diária via `pg_cron`: retenção vencida, revogação, aluno expurgado, evento vencido. **Nada é apagado direto** — tudo passa pela lixeira de 30 dias
- [ ] Prazos: foto do evento 2 anos, referência até o fim do ano letivo, trilha 5 anos (provisório)
- [ ] Testes unit: limiares e margem, hash/dedup, EXIF, máquina de estados de `photo_faces`
- [ ] Testes RLS: escola A não lê `photos`/`photo_faces`/Storage de B; `authenticated` não lê `embedding`; `student_reference_faces` inacessível fora do `service_role`
- [ ] Aceite §12.2 com dado sintético/adulto: precisão `suggested` ≥ 0,99, cobertura ≥ 0,85, revisão ≤ 15%, falso positivo entre escolas = 0
- [ ] Recalibrar limiares com dado real da escola no piloto **antes** de reduzir a revisão manual

---

## Fase 4 — Autorização granular + portal do responsável · 2–3 semanas · risco médio

Sem spec. `authorizations` (M4) já deixa os ganchos.

- [ ] Spec da fase
- [ ] Revogação com efeito retroativo sobre material já entregue. **O que já saiu no WhatsApp de outra família não volta** — o termo precisa dizer isso
- [ ] Eliminação a pedido do responsável (LGPD art. 18, VI): tira o aluno de cena (revoga, apaga biometria e `photo_faces` dele), **não apaga o arquivo**, que tem outras crianças autorizadas. Resposta em 15 dias (provisório)
- [ ] Quem pode apagar antes do prazo: `school_admin` derruba evento e foto; `teacher`/`school_staff`, só foto do evento que criou; `dev`/`super_admin`, expurgo manual com trilha obrigatória
- [ ] Papel `guardian` e portal do responsável — os ganchos nascem no M1: `guardians.user_id` (nulo) e `profiles.role`, cujo `check` ganha `'guardian'` como quarto valor
- [x] Decisão de produto: foto com criança sem autorização na hora da entrega — **desfocar quem não autorizou** (18/09/2026; spec §9.3.1)
- [ ] Implementar o desfoque na entrega: aplicado no arquivo, nunca como sobreposição de tela; gerado a partir do original para refletir a autorização do momento

---

## Fase 5 — Criação e envio em lote · 4–6 semanas · **risco alto** (dependência da Meta)

Sem spec. Depende da pendência #7 fechada.

- [ ] Spec da fase
- [ ] Templates de evento e geração em lote (1 arte → N alunos); subir cota e rate limit de `generation-quota.ts`
- [ ] `delivery_queue` com retry por canal
- [ ] Envio em lote via WhatsApp Business API com templates aprovados pela Meta
- [ ] Trava de autorização por escopo (`delivery_whatsapp`, `social_media`) antes de qualquer envio/publicação

---

## Decisões em aberto

| # | Decisão | Onde | Bloqueia |
| --- | --- | --- | --- |
| 4 | Fallback Twilio Verify se o onboarding da Meta travar | pendências #7 | Transversal |

Ainda sem decisão:

- **Animação distribuindo as fotos nas pastas** no momento da confirmação em lote. Toca a tela do M6. Se entrar, mostra as fotos em estado "sugerido", nunca como atribuição final.
- **Versão desfocada: gerada a cada entrega ou cacheada?** Recomendação em aberto: gerar na entrega, a partir do original, para refletir a autorização do momento. Fase 5.

## Decisões tomadas

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
