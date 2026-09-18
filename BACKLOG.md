# Backlog — IAschool

Fonte única de acompanhamento do projeto. Vive em Markdown, na raiz, e é
referenciado por [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md).

**Atualizado em:** 18/09/2026
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
| 1 — Fundação escolar | M1 (mínima) + Fase 1 completa | ⏳ próxima, **escopo fechado em 16/09/2026** | 2–2,5 sem (M1) |
| 2 — Upload em massa | M2, M3 | ❌ | 3,5 sem |
| 3 — Reconhecimento facial | M0 ✅, M4, M5, M6 | 🔬 spike feito, código zero | 6 sem |
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

- [ ] Commitar o que está solto no working tree: spec, relatório do spike, `scripts/spike-face/`, deck regenerado (01/09), `scripts/deck/mobile.css`, `AGENTS.md`
- [x] Adicionar `.playwright-mcp/` ao `.gitignore` (15/09/2026)
- [ ] Abrir PR de `pivot/fase-0` → `main` (3 commits locais nunca enviados ao `origin`)
- [x] Apagar specs/planos divergentes (`docs/superpowers/`, memórias `.agents/memory/r9-*`) e corrigir Anexo B da pivotagem, cabeçalho da spec e memória de marca (15/09/2026)
- [ ] Verificar se os Problemas 2 e 3 de `docs/diagnostico-geracao-imagens.md` (modo demo chamando backend sem token; erro real mascarado como falha de rede) foram corrigidos após o reprovisionamento do banco. O Problema 1 (projeto Supabase inexistente) foi superado pelo provisionamento de 30/08. Se corrigidos, marcar o diagnóstico como resolvido

---

## Transversal — Produção e conformidade

Nada aqui andou desde 30/08/2026. Enquanto #1–#7 não fecharem, vale a regra bloqueante.

### Infra e cadastro (`docs/pendencias-producao.md`)

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

---

## Fase 1 — Fundação escolar

### M1 — Fase 1 mínima (spec §4) · 2–2,5 semanas · risco médio

Pré-requisito de tudo: `photos` precisa de `event_id`, que precisa de `school_id`, e a RLS por `owner_id` precisa morrer antes.

> **Escopo fechado em 16/09/2026.** As propostas de 15/09 viraram decisão (#2, #3,
> #5 a #8, ver "Decisões tomadas") e a spec §4 foi reescrita no mesmo commit.
> O prazo subiu de ~2 para 2–2,5 semanas: entraram `guardians`, a consolidação de
> `clubs` e a migração do OTP do responsável, que não estavam orçados.

- [ ] Migration `iaschool_fase1_schools_members_classes`, aplicada via `apply_migration` (nunca SQL Editor); SQL de referência `artifacts/iaschool-app/supabase/fase1-min-schools-events.sql` nasce no mesmo commit (ainda não existe)
  - [ ] `schools` (tenant real, **absorve `clubs`**: `name`, `cnpj`, `address`, `contact`, `logo`, `colors`, `plan`) e `school_members` (`school_admin`, `school_staff`, `teacher`)
  - [ ] `profiles.role` passa a papel **global**: `dev`, `super_admin`, `user`; vínculo com escola só por `school_members`. `is_super_admin()` passa a valer para `dev` e `super_admin`; `is_dev()` novo
  - [ ] `classes` = sala, com série como coluna: `school_year`, `grade` (lista fixa no app: EI, 1EF…9EF, 1EM…3EM), `name`, `teacher_id`; `unique (school_id, school_year, grade, name)`
  - [ ] `guardians` (`school_id`, `name`, `whatsapp`, `relationship`, `whatsapp_verified_at`, `user_id` nulo reservado para a Fase 4; `unique (school_id, whatsapp)`) — irmãos compartilham o responsável; substitui `students.guardian` (jsonb)
  - [ ] `students.school_id`, `students.class_id`, `students.enrollment_number` (único por escola quando preenchido, chave da importação CSV), `students.primary_guardian_id` + índices
  - [ ] `events` com `status`, `keep_originals`, `photo_retention_until`, `image_rights_declared_at/by`
  - [ ] Helper `is_member_of(uuid)` **puro** (sem `is_super_admin()` embutido; as policies escrevem `is_member_of(school_id) or is_super_admin()`) e `is_dev()`. **Não** reaproveitar `my_school_id()` (colisão com o modelo antigo) e **não criar `active_school_id()`**: com `limit 1` ela quebra para admin de várias escolas; a escola "atual" é escolha de UI
- [ ] Migração de dados `owner_id` → `school_id` (spec §4.7): uma `schools` por perfil `school_user` (dados de `clubs` copiados para a mesma linha); membro como `school_admin`; `students.school_id` preenchido; `students.guardian` (jsonb) → linha em `guardians`, deduplicada por `(school_id, whatsapp)`; `owner_id` vira coluna de auditoria
- [ ] **Refazer o OTP do responsável no novo modelo** (spec §4.7, item 8) — hoje `guardian_verification_codes` é chaveada por `student_id`, `confirm_guardian_code` autoriza por `owner_id = auth.uid()` e escreve em `students.guardian`, e a edge function `send-guardian-code` segue a mesma chave. Os três passam a operar por `guardian_id`, com autorização por `is_member_of(guardians.school_id) or is_super_admin()`, gravando `guardians.whatsapp_verified_at`. Republicar a edge function e estender `tests/guardian-verification.integration.test.ts` (7 testes). **Sem isto a migração quebra o único fluxo de conformidade que já está no ar**
- [ ] Trocar policies de `students`, `reference_posts`, `generated_posts` e dos buckets para `is_member_of(school_id) or is_super_admin()`; `dev`/`super_admin` continuam vendo tudo
- [ ] Ensaiar a migração numa branch do Supabase e rodar `tests/rls.integration.test.ts` estendido (membro de A não lê B; admin de A e B lê as duas; `user` sem vínculo não lê nada) antes do merge
- [ ] Ajustar hooks/repositórios do app (`src/lib/data/supabase/`) para o modelo por escola, com seletor de escola atual para quem é membro de mais de uma
- [ ] Telas: cadastro de escola (dados + identidade, substitui `/escolas`), séries/salas, e ficha do aluno com nome, matrícula, sala, responsável e WhatsApp. Os dois toggles de consentimento (foto e envio por WhatsApp) e a foto de referência entram no M4, porque gravam em `authorizations`
- [ ] Aposentar o autocadastro de aluno (decisão #2): menor de 16 não deve ter conta própria (Lei 15.211/2025, art. 24). Saem `role = 'student'`, `list_approved_schools()`, `my_school_id()`, `profiles.school_id`, `profiles.student_record_id`, `student-area.tsx` e o ramo de aluno de `signup.tsx`; a constraint de `profiles` que exige responsável autorizado para conta de criança perde o objeto — revisar `src/lib/eca.ts` no mesmo passo
- [ ] Atualizar `SUPABASE.md` e a tabela de fases de `AGENTS.md` ao fechar (a spec §4 já foi atualizada em 16/09/2026)

### Fase 1 completa (fora do M1, sem prazo)

- [ ] Importação de lista de alunos e responsáveis (CSV), casando por `enrollment_number`
- [ ] Remover a tabela `clubs` depois de um ciclo com `schools` estável (a consolidação em si entrou no M1; `my_school_id()` já morre no M1 com o autocadastro de aluno)
- [ ] Papel `dev`: telas de manutenção (`face_recognition_settings`, `prompt_settings`, expurgo manual, logs técnicos) — o papel nasce no M1, as telas podem vir depois

---

## Fase 2 — Upload em massa

### M2 — Fotos e upload no cliente (spec §5.1, §6, §7.1) · 2 semanas · risco médio

- [ ] Tabela `photos` com `unique (event_id, content_hash)` (idempotência do upload) e tabela `batch_jobs`
- [ ] Buckets `event-photos`, `event-thumbs`, `event-originals`, policies com `school_id` como primeiro segmento do caminho
- [ ] Telas `/eventos` (lista) e `/eventos/novo` (nome, data, turma, retenção, declaração de direito de imagem — sem ela o upload não abre)
- [ ] Tela `/eventos/:id` com dropzone de pasta
- [ ] Upload no cliente: 6 simultâneos; 3 retentativas com backoff 1s/4s/16s; SHA-256 em Web Worker antes do redimensionamento; fila em IndexedDB por `event_id` com retomada; JPEG/PNG/HEIC (HEIC convertido no cliente); limite 5.000 arquivos por lote; 2560px lado maior, JPEG q85 (D3)
- [ ] Contagem de "já enviada" no conflito de hash (R2)
- [ ] `useImageUpload` atual permanece para logo e modelos de arte

### M3 — Fila, ingest-worker e galeria (spec §5.2, §7.2, §10, §11) · 1,5 semanas · risco baixo

- [ ] Tabela `photo_jobs` + RPC `claim_photo_jobs` com `FOR UPDATE SKIP LOCKED`, `execute` só para `service_role` (D2)
- [ ] Job com 5 tentativas estouradas → `failed` com `last_error` e botão "tentar de novo" na tela do evento
- [ ] `ingest-worker` (Node 24 + `sharp`, concorrência 8): dimensões, EXIF, miniatura WebP 320px (D4), enfileira `recognize`
- [ ] Galeria virtualizada (`@tanstack/react-virtual`) abrindo em ≤ 2 s com 2.000 miniaturas (R3)
- [ ] Progresso: contador otimista + assinatura Realtime em `batch_jobs` (R1)
- [ ] Deploy do worker na Fly (um app por worker), `/health`, alerta para `batch_jobs` parado > 10 min
- [ ] Log estruturado com `batch_id`, `photo_id`, duração; nunca nome de aluno
- [ ] Testes: dedup por `unique(event_id, content_hash)`; `claim_photo_jobs` sem corrida com 4 workers; RLS de `photos` entre escolas

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
- [ ] Embedding de referência com `det_size` 640

### M5 — face-worker, atribuição e pasta do aluno (spec §5.3, §7.3, §7.6, §11) · 2,5 semanas · **risco alto**

- [ ] Instalar extensão `vector` no projeto (disponível 0.8.2, não instalada)
- [ ] `docker build` do `Dockerfile` de `scripts/spike-face/` — nunca foi construído (sem Docker na máquina do spike)
- [ ] Rodar `bench_throughput.py` **na máquina alvo** da Fly antes de dimensionar; os números do spike são de Apple M4
- [ ] `face-worker` (Python 3.12, `onnxruntime` + `insightface`, modelos embutidos, `service_role`, 1 processo por máquina)
- [ ] Tabela `photo_faces` com `state` (`suggested`, `unassigned`, `confirmed`, `not_a_student`, `rejected`), `runner_up_*`, `reviewed_by/at`
- [ ] `face_recognition_settings` (linha única, editável pelo super admin) com `tau`, margem, `min_face_px`
- [ ] Busca vetorial dos 5 vizinhos **filtrada por `school_id` dentro de função `security definer`** (D7)
- [ ] Persistir embedding só quando corresponde a aluno com `biometric_sorting` ativo; rosto sem correspondência guarda só bbox + recorte (D5)
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
- [ ] `biometric_events` append-only (mesmo padrão de `share_logs`)
- [ ] `purge_expired_biometrics()` diária via `pg_cron`: retenção vencida, revogação, aluno expurgado, evento vencido
- [ ] Testes unit: limiares e margem, hash/dedup, EXIF, máquina de estados de `photo_faces`
- [ ] Testes RLS: escola A não lê `photos`/`photo_faces`/Storage de B; `authenticated` não lê `embedding`; `student_reference_faces` inacessível fora do `service_role`
- [ ] Aceite §12.2 com dado sintético/adulto: precisão `suggested` ≥ 0,99, cobertura ≥ 0,85, revisão ≤ 15%, falso positivo entre escolas = 0
- [ ] Recalibrar limiares com dado real da escola no piloto **antes** de reduzir a revisão manual

---

## Fase 4 — Autorização granular + portal do responsável · 2–3 semanas · risco médio

Sem spec. `authorizations` (M4) já deixa os ganchos.

- [ ] Spec da fase
- [ ] Revogação com efeito retroativo sobre material já entregue
- [ ] Papel `guardian` e portal do responsável — os ganchos nascem no M1: `guardians.user_id` (nulo) e `profiles.role`, cujo `check` ganha `'guardian'` como quarto valor
- [ ] Decisão de produto: foto com criança sem autorização **na hora da entrega** (bloquear, desfocar ou só envio individual) — pivotagem §9 item 3, spec §9.3

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
| 1 | Foto com criança sem autorização na entrega | pivotagem §9.3, spec §9.3 | Fase 5 (não bloqueia M1–M6) |
| 4 | Fallback Twilio Verify se o onboarding da Meta travar | pendências #7 | Transversal |

## Decisões tomadas

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
