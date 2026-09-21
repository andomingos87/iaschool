# Integração com Supabase

O app IAschool usa um projeto Supabase externo para autenticação, banco
de dados e Storage. A implementação real vive em `src/lib/data/supabase/` e é
ativada automaticamente quando as variáveis de ambiente existem; sem elas, o
app volta ao modo demonstração (mock em localStorage, com indicador na UI).

## Variáveis de ambiente

| Variável | Onde é usada | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend + api-server | URL do projeto (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | frontend + api-server | Chave anônima pública (Settings → API Keys) |
| `SUPABASE_SERVICE_ROLE_KEY` | api-server (somente) | Chave service_role (Settings → API Keys) — usada para persistir a cota diária de gerações no banco. Nunca exponha no frontend. |

O api-server também aceita `SUPABASE_URL`/`SUPABASE_ANON_KEY` (têm prioridade)
para validar o token do usuário na rota de geração de imagem.

**Importante:** configure AMBAS as variáveis no servidor de produção. Sem elas
e com `OPENAI_API_KEY` presente, a rota de geração retorna 503 — isso é
intencional para evitar abuso da chave sem autenticação.

## Schema do banco

O banco atual foi provisionado do zero em **30/08/2026** por 7 migrations
aplicadas via MCP; as duas do M1 subiram em **20/09/2026**:

| Versão | Migration |
| --- | --- |
| `20260830154203` | `iaschool_core_tables` |
| `20260830154226` | `iaschool_auth_helper_functions` |
| `20260830154256` | `iaschool_signup_trigger_and_rls` |
| `20260830154305` | `iaschool_storage_buckets_and_policies` |
| `20260830154315` | `iaschool_generation_quota_and_logs` |
| `20260830154340` | `iaschool_eca_digital` |
| `20260830154404` | `iaschool_revoke_trigger_functions_from_api` |
| `20260920160511` | `iaschool_fase1_schools_members_classes` |
| `20260920160829` | `iaschool_fase1_fix_function_search_path` |
| `20260921021539` | `iaschool_fase2_photos_batch_jobs_buckets` (M2, aplicada em 20/09/2026 no horário local) |
| `20260921023500` | `iaschool_fase2_photos_event_school_check` (M2: triggers que exigem `photos.school_id` = `events.school_id`, idem `batch_jobs`) |
| `20260921100408` | `iaschool_fase2_photo_jobs_queue` (M3, 21/09/2026: `photo_jobs`, `photos.batch_id` + trigger de enfileiramento, `batch_jobs.upload_finished_at`/`updated_at`, `claim_photo_jobs`) |
| `20260921100446` | `iaschool_fase2_batch_progress_rpcs` (M3, 21/09/2026: `finish_batch_upload`, `complete_photo_job`, `retry_failed_photo_jobs`, `batch_jobs_try_close`, `batch_pending_jobs`, view `stalled_batch_jobs`; `photos_restrict_client_update` passa a respeitar a flag `iaschool.photos_rpc`) |
| `20260921103748` | `iaschool_fase3_authorizations_reference_faces` (M4, 21/09/2026: extensão `vector`, `authorizations` com os 4 escopos, `student_reference_faces`, `has_active_authorization`, view `v_biometric_consent`, RPCs de leitura, bucket `student-refs`, migração do consentimento legado) |
| `20260921103854` | `iaschool_fase3_has_active_authorization_tenant_check` (M4: a função definer passa a conferir o tenant por dentro — sem isso, um autenticado sondaria o consentimento de aluno de outra escola) |
| `20260921105854` | `iaschool_fase3_reference_face_jobs` (M4, 21/09/2026: fila `student_reference_jobs` entre a tela e o motor facial, `claim_student_reference_jobs`/`complete_student_reference_job` só para `service_role`, `retry_student_reference_job` e `delete_student_reference_face` para a tela) |
| `20260921111313` | `iaschool_fase3_reference_job_revoked_guard` (M4: consentimento revogado entre o envio e o processamento derruba o job como `revoked`, em vez de estourar no trigger e deixá-lo preso em `leased`) |
| `20260921113430` | `iaschool_fase3_photo_faces_recognition` (M5, 21/09/2026: `face_recognition_settings`, `photo_faces` com o `embedding` bloqueado por privilégio de coluna, trigger da D5, `match_reference_faces` (D7), `complete_recognize_job`, bucket `face-crops`, `student_photos`) |
| `20260921114100` | `iaschool_fase3_permanent_job_failure` (M5: falha permanente nas duas filas — arquivo ilegível e retrato com dois rostos não melhoram em cinco tentativas) |

### Como alterar o schema

> **Regra:** toda mudança de schema entra por `apply_migration` do servidor MCP
> `supabase-iaschool` (declarado em `.mcp.json` na raiz do repositório).
> **Não use o SQL Editor do painel para mudar schema** — o que não passa por
> migration não fica no histórico e o próximo ambiente nasce diferente.

O fluxo é:

1. Aplicar a migration por `apply_migration`, com nome descritivo em
   `snake_case` (prefixo `iaschool_`).
2. Atualizar, no mesmo commit, o arquivo SQL de referência correspondente em
   [`supabase/`](./supabase/).
3. Confirmar com `list_migrations` / `list_tables`.

O SQL Editor continua válido para **consulta** e para operações pontuais de
dado (não de schema), como rodar
[`supabase/create-super-admin.sql`](./supabase/create-super-admin.sql).

### Arquivos SQL de referência

Os scripts em [`supabase/`](./supabase/) são a **leitura humana** do schema, não
o mecanismo de aplicação. Mantenha-os fiéis ao banco.

| Arquivo | O que descreve |
| --- | --- |
| [`setup.sql`](./supabase/setup.sql) | `profiles`, `students`, `clubs`, `reference_posts`, `generated_posts`, `prompt_settings`, `prompt_template_versions`, funções auxiliares de RLS, buckets e políticas de Storage |
| [`fase1-min-schools-events.sql`](./supabase/fase1-min-schools-events.sql) | **M1 (Fase 1 mínima)**: `schools`, `school_members`, `classes`, `guardians`, `events`; papéis globais; RLS por escola; Storage por escola; OTP por responsável; aprovação criando a escola. Aplicada em 20/09/2026; ensaio com rollback em [`supabase/rehearsal/`](./supabase/rehearsal/README.md) |
| [`fase2-photos-upload.sql`](./supabase/fase2-photos-upload.sql) | **M2 (upload em massa)**: `photos` com dedup por hash, `batch_jobs`, trigger que restringe o UPDATE do cliente a `deleted_at`, buckets `event-photos`/`event-thumbs`/`event-originals` com policies por escola, RPC `event_photo_counts`, Realtime em `batch_jobs`. Aplicada em 20/09/2026 |
| [`fase2-photo-jobs-worker.sql`](./supabase/fase2-photo-jobs-worker.sql) | **M3 (fila e worker)**: `photo_jobs` (RLS sem policy, só `service_role`), `photos.batch_id` + trigger `photos_enqueue_ingest`, `batch_jobs.upload_finished_at`/`updated_at`, `claim_photo_jobs` (`for update skip locked`), RPCs `finish_batch_upload` / `complete_photo_job` / `retry_failed_photo_jobs`, view `stalled_batch_jobs`. Aplicada em 21/09/2026; ensaio em [`supabase/rehearsal/`](./supabase/rehearsal/README.md) (`m3-checks.sql`) |
| [`fase3-authorizations-reference-faces.sql`](./supabase/fase3-authorizations-reference-faces.sql) | **M4 (autorizações e rosto de referência)**: extensão `vector`, `authorizations` (4 escopos, sem delete, prova imutável), `student_reference_faces` (RLS sem policy), `has_active_authorization`, view `v_biometric_consent`, RPCs `list_student_reference_faces` / `student_biometric_readiness`, bucket `student-refs` (insert exige consentimento ativo), migração de `students.guardian->>'consentAt'`. Seção 8: fila `student_reference_jobs` (a referência não existe sem embedding, e o vetor é calculado fora do navegador). Aplicada em 21/09/2026; ensaio em [`supabase/rehearsal/`](./supabase/rehearsal/README.md) (`m4-seed.sql` + `m4-checks.sql` + `m4b-checks.sql`) |
| [`fase3-face-recognition.sql`](./supabase/fase3-face-recognition.sql) | **M5 (rostos, atribuição e pasta do aluno)**: `face_recognition_settings`, `photo_faces` (RLS por linha + privilégio de coluna escondendo `embedding`), trigger da D5, `match_reference_faces` (D7, só `service_role`), `complete_recognize_job` (grava os rostos, conta em `photos.faces_count` e move o evento para `review`), bucket `face-crops`, `student_photos`. Aplicada em 21/09/2026; ensaio em `supabase/rehearsal/m5-checks.sql` |
| [`eca-digital.sql`](./supabase/eca-digital.sql) | `share_logs` e o modelo antigo do OTP (por aluno, superado pelo M1) |
| [`generation-quota.sql`](./supabase/generation-quota.sql) | `generation_usage` + `consume_generation_quota()` |
| [`generation-logs.sql`](./supabase/generation-logs.sql) | `generation_logs` + bucket privado `generation-logs` |
| [`create-super-admin.sql`](./supabase/create-super-admin.sql) | Operação de dado: promove um usuário a `super_admin` aprovado |
| [`pivot-fase0.sql`](./supabase/pivot-fase0.sql) | Migration da pivotagem para bases anteriores a 30/08/2026 (remove posição, altura, peso, uniformes e métricas). ⚠️ Apaga dados. Bases novas já nascem limpas |

### Tabelas em `public`

Todas com RLS habilitada.

| Tabela | Papel |
| --- | --- |
| `profiles` | Usuário do produto: papel **global** (`dev`, `super_admin`, `user`) e `approval_status` |
| `schools` | Tenant: a escola, com identidade visual (`logo`, `colors`) absorvida de `clubs`. Escola migrada ou criada na aprovação nasce com `id` = uid do perfil (mantém válido o prefixo dos objetos no Storage) |
| `school_members` | Vínculo pessoa ↔ escola com papel na escola (`school_admin`, `school_staff`, `teacher`); é o que a RLS consulta |
| `classes` | Sala: `school_year`, `grade` (lista fixa no app), `name`, `teacher_id` |
| `guardians` | Responsável legal, por escola + WhatsApp (E.164); `whatsapp_verified_at` só é carimbado pela RPC do OTP e zera ao trocar o número |
| `events` | Evento escolar (Fase 2): status, retenção das fotos, declaração de direito de imagem |
| `students` | Aluno cadastrado pela escola (`school_id`, `class_id`, `enrollment_number`, `primary_guardian_id`); soft delete via `deleted_at` |
| `clubs` | Legado: identidade visual antiga. Sem uso no app desde o M1; removida depois de um ciclo com `schools` estável |
| `reference_posts` | Modelos de arte (referência de estilo) |
| `generated_posts` | Artes geradas; soft delete via `deleted_at` |
| `prompt_settings` / `prompt_template_versions` | Template de prompt e seu histórico |
| `generation_usage` | Cota diária de geração, persistida |
| `generation_logs` | Auditoria das gerações (tela `/admin/logs`). RLS ligada e **sem políticas**: só o api-server (service_role) lê e escreve |
| `guardian_verification_codes` | OTP de verificação do responsável (ECA Digital), chaveado por `guardian_id` |
| `share_logs` | Trilha imutável de compartilhamento (ECA Digital) |
| `photos` | Foto de evento (M2): `storage_path` em `event-photos`, `content_hash` (SHA-256 do original) com `unique (event_id, content_hash)`, `status` do pipeline (`pending` → `processed`/`failed`); `batch_id` (M3) aponta o lote do upload e dispara o job de ingest; `taken_at` vem do cliente no insert; `thumb_path`/`width`/`height` são escritos pelo worker. Soft delete via `deleted_at`. Pela API autenticada o UPDATE só alcança `deleted_at` (trigger `photos_restrict_client_update`); o resto é do worker (`service_role`) ou de RPC definer com a flag `iaschool.photos_rpc` |
| `batch_jobs` | Lote de processamento: um por sessão de upload (`kind = 'ingest'`). `total` é contado no servidor em `finish_batch_upload`; `processed`/`failed` são incrementados pelo worker via `complete_photo_job`; `upload_finished_at` marca o fim do envio e o lote só fecha (`done`/`failed`) quando `processed + failed >= total`. `updated_at` (trigger) alimenta a view `stalled_batch_jobs`. Publicado no Realtime: o app assina por `event_id` |
| `photo_jobs` | Fila em tabela (D2, M3): `kind` (`ingest`/`recognize`), `status` (`queued`/`leased`/`done`/`failed`), `attempts` (máx. 5), `leased_until`, `last_error`. RLS ligada e **sem políticas**: só o `ingest-worker` (`service_role`) via `claim_photo_jobs`/`complete_photo_job`, e as RPCs definer. Jobs `recognize` ficam `queued` até o `face-worker` (M5) |
| `authorizations` | Consentimento por escopo (M4, spec §5.4): `biometric_sorting`, `delivery_whatsapp`, `internal_use`, `social_media`. Um ativo por (aluno, escopo) — índice único parcial `where revoked_at is null`. Revogar é preencher `revoked_at`: **não há policy de delete** e o privilégio também foi revogado. Pela API o cliente só muda `revoked_at`, e só de nulo para uma data (trigger `authorizations_restrict_client_update`); desrevogar é recusado, reconceder é linha nova. `evidence` guarda termo, versão e origem |
| `photo_faces` | Rosto detectado numa foto de evento (M5, spec §5.3): `bbox` e `det_score` de **todo** rosto, `crop_path` em `face-crops`, `state` (`unassigned`/`suggested`/`confirmed`/`rejected`/`not_a_student`/`adult_or_staff`), `runner_up_*` e `reviewed_by/at`. O `embedding` é nulo para rosto sem correspondência (D5) e **não é legível por `authenticated`**: o `revoke select` + `grant select (colunas)` bloqueia a coluna, não a linha. Escrita só pelo worker (`complete_recognize_job`); confirmar é RPC do M6 |
| `face_recognition_settings` | Linha única com `tau` (0,52), `margin` (0,10), `min_face_px` (60), `det_size_event` (1600), `det_size_reference` (640) e `neighbors` (5) — os números do spike M0. Legível por qualquer autenticado, editável **só pelo papel `dev`**: o worker relê a cada minuto, então recalibrar no piloto não exige deploy |
| `student_reference_jobs` | Fila do rosto de referência (M4): a tela sobe o JPEG em `student-refs` e enfileira; o motor facial (`det_size` 640, spec §7.4) calcula o vetor e a linha de `student_reference_faces` nasce em `complete_student_reference_job`. Mesma forma de `photo_jobs` (lease, 5 tentativas), mas **visível para a escola** — não guarda vetor, só o caminho e o estado. A escola insere e apaga; quem muda o estado é o worker (sem policy nem privilégio de update). Enquanto o `face-worker` (M5) não existir, os jobs ficam `queued` |
| `student_reference_faces` | Rosto de referência do aluno (M4, spec §5.3): `embedding` `vector(512)` com índice HNSW, `authorization_id` obrigatório e conferido pelo trigger (`biometric_sorting` ativo do próprio aluno — D5 no banco, não na tela), `retention_until` = fim do ano letivo corrente, sem renovação automática. RLS ligada e **sem políticas**: só `service_role` e as RPCs definer. A tela lê por `list_student_reference_faces`, que nunca devolve o vetor |

Pontos de RLS e retenção que importam:

- Isolamento por **escola** (M1): toda policy de domínio é
  `is_member_of(school_id) or is_super_admin()`. `is_member_of` é pura (só
  consulta `school_members`); `is_super_admin()` vale para `dev` e
  `super_admin`. `owner_id` continua nas tabelas como auditoria de quem
  cadastrou, sem uso em RLS. Não existe `active_school_id()`: a escola "atual"
  é escolha de interface (seletor no topo para quem é membro de mais de uma).
- Storage: o primeiro segmento do caminho é o **id da escola**
  (`storage_school_id(name)`), conferido com `is_member_of`.
- Lixeira de 30 dias em `students` e `generated_posts`: excluir é `UPDATE` em
  `deleted_at`. A política `students_delete` é restrita a `super_admin`
  justamente para que `school_user` não contorne a retenção via `DELETE` direto
  no PostgREST. O expurgo (registro + arquivos no Storage) é oportunista.
- Buckets **privados** `students`, `clubs`, `references`, `generated` e
  `generation-logs` — imagens servidas por URLs assinadas (TTL 1 ano), nunca
  públicas.
- Buckets do evento (M2, spec §6), também privados e com o id da escola como
  primeiro segmento: `event-photos` (`{school_id}/{event_id}/{photo_id}.jpg`,
  só `image/jpeg`, até 20 MB), `event-thumbs` (só `image/webp`, preenchido pelo
  worker no M3) e `event-originals` (só quando `events.keep_originals`). A
  galeria assina em lotes de 100 com TTL de 1 h. O membro pode apagar objeto
  desses buckets: é o que permite desfazer um upload cujo insert em `photos`
  perdeu a corrida da chave única.
- `photos`: o cliente insere (com `uploaded_by = auth.uid()`) e só altera
  `deleted_at`; qualquer outro campo enviado num UPDATE autenticado é
  descartado pelo trigger. Hard delete só `super_admin`. A dedup é do banco:
  `unique (event_id, content_hash)` devolve 23505 e o app conta "já enviada".
- Biometria e consentimento (M4): `student_reference_faces` não tem policy
  nenhuma — o vetor não sai por consulta de cliente, nem com token válido. A
  tela lê por `list_student_reference_faces` (sem `embedding`) e a lista de
  alunos por `student_biometric_readiness`; as duas checam `is_member_of` por
  dentro. `authorizations` é legível pelo membro, mas indelével: sem policy de
  delete e com o privilégio revogado de `anon`/`authenticated`. O bucket
  `student-refs` (`{school_id}/{student_id}/{ref_id}.jpg`, só `image/jpeg`, até
  10 MB) só aceita insert quando o aluno do 2º segmento tem `biometric_sorting`
  ativo — a mesma trava da tabela, aplicada no Storage. A fila
  `student_reference_jobs` é a exceção visível: a escola precisa ver a própria
  foto esperando, e a linha não guarda vetor. O consentimento é conferido duas
  vezes, ao enfileirar e ao concluir — revogado no meio, o job morre como
  `revoked` e nenhuma referência nasce.
- Rostos detectados (M5): `photo_faces` é a única tabela do produto em que a
  proteção é **privilégio de coluna**, não RLS. A policy diz quais linhas o
  membro enxerga; o `grant select (…)` diz quais colunas — e `embedding` não
  está na lista, então `select=*` e `select=embedding` são recusados pelo
  PostgREST mesmo com token válido. Insert, update e delete não existem para
  o cliente: quem escreve é o worker por `complete_recognize_job`, e confirmar
  rosto é RPC do M6. A busca vetorial (`match_reference_faces`) é
  `security definer` com o `where school_id` por dentro (D7) e executável só
  pelo `service_role` — busca de vizinhos na mão de cliente é inferência de
  identidade. O bucket `face-crops` não tem policy de insert: o recorte é do
  worker; o membro só lê e apaga.
- Fila e progresso (M3): `photo_jobs` não tem policy nenhuma. O cliente só
  toca a fila por três RPCs `security definer` que checam `is_member_of`
  por dentro: `finish_batch_upload` (dono do lote), `retry_failed_photo_jobs`
  (membro da escola do evento) e `batch_pending_jobs` (usada pela view). O
  linter do Supabase aponta essas três como "definer executável por
  authenticated" — é intencional, mesmo padrão de `confirm_guardian_code` e
  `my_schools`. `claim_photo_jobs` e `complete_photo_job` têm `execute` só para
  `service_role`. `stalled_batch_jobs` é `security_invoker`: herda a RLS de
  `batch_jobs`, então cada escola vê só os próprios lotes parados.

### Configuração do projeto (uma vez, no painel)

1. **Habilite o cadastro por e-mail**: Authentication → Sign In / Up → Email →
   "Enable email signups". O cadastro público do app depende disso; a segurança
   fica no fluxo de aprovação (contas novas nascem `pending` e não leem dado).
2. Crie o super admin em Authentication → Users → "Add user" (marque
   *Auto confirm user*).
3. Rode [`supabase/create-super-admin.sql`](./supabase/create-super-admin.sql)
   no SQL Editor. Ele localiza o usuário pelo e-mail e insere/atualiza o perfil
   com `role = 'super_admin'` e `approval_status = 'approved'`.
   ⚠️ Troque a senha após o primeiro login.

Itens de configuração ainda pendentes (SMTP próprio, confirmação de e-mail,
rate limits) estão em
[`docs/pendencias-producao.md`](../../docs/pendencias-producao.md).

## Cadastro público e aprovação

- Na tela de login há "Criar conta": **só escola**. Menor de 16 não tem conta
  própria (Lei 15.211/2025, art. 24); o aluno é um registro em `students`
  feito pela escola. O autocadastro de aluno foi aposentado no M1.
- O `signUp` envia metadados (`signup_role = 'school'`, `signup_name`,
  `signup_school_name`); o trigger `handle_new_user` cria a linha em
  `profiles` com `role = 'user'` e `approval_status = 'pending'`.
- Contas pendentes/recusadas: veem apenas a tela "Aguardando aprovação"
  no app; a RLS (`is_approved()`) impede qualquer leitura de dados e o
  api-server recusa a rota de geração (HTTP 403).
- O super_admin aprova/recusa na tela **Aprovações** (update em
  `profiles.approval_status`). Ao aprovar, o trigger
  `profiles_ensure_school_on_approval` cria a `schools` (id = uid) e o vínculo
  `school_admin` em `school_members`, se a pessoa ainda não é membro de
  nenhuma escola. Para pôr uma segunda pessoa na mesma escola, insira em
  `school_members` antes de aprovar (o trigger então não cria outra escola).
- O app lê as escolas da pessoa pela RPC `my_schools()`.


## Recuperação de senha e convite

- **Esqueci minha senha:** o link na tela de login chama
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <URL do app> })`.
  O e-mail leva o usuário de volta ao app com `type=recovery` na URL; o app
  detecta isso (`src/lib/recovery.ts`) e abre a tela de definição de nova
  senha antes de liberar o acesso.
- **Convite (primeiro acesso):** em vez de "Add user" com senha, o admin pode
  usar Authentication → Users → **"Invite user"**. O Supabase envia o e-mail
  de convite; o link (`type=invite`) abre a mesma tela de definição de senha
  no app. Lembre de inserir a linha correspondente em `profiles` — sem ela o
  usuário é tratado como deslogado.
- **URLs de redirecionamento:** em Authentication → URL Configuration,
  cadastre a URL do app (produção e, se quiser testar, a de desenvolvimento)
  em **Redirect URLs**, senão o Supabase ignora o `redirectTo`.

### Templates de e-mail com a marca IAschool

Por padrão o Supabase envia e-mails em inglês e sem identidade visual. Os
templates prontos em português, com a marca IAschool (fundo escuro, destaque
azul), estão em
[`supabase/email-templates/`](./supabase/email-templates/):

| Arquivo | Template no painel | Assunto sugerido |
| --- | --- | --- |
| `reset-password.html` | Reset Password | Redefina sua senha — IAschool |
| `invite.html` | Invite user | Você foi convidado para o IAschool |

Para aplicar (uma vez, no painel do Supabase):

1. Abra **Authentication → Email Templates**.
2. Selecione o template (**Reset Password** ou **Invite user**).
3. Substitua o campo **Subject** pelo assunto sugerido acima.
4. Apague o conteúdo do **Message body** e cole o HTML do arquivo
   correspondente (modo "Source"/código, não o editor visual).
5. Salve. Repita para o outro template.

Observações:

- Os templates usam a variável `{{ .ConfirmationURL }}`, que o Supabase
  substitui pelo link de recuperação/convite — não a remova nem edite.
- O visual usa apenas HTML inline (compatível com Gmail/Outlook); os
  e-mails não carregam fontes ou imagens externas de propósito, para não
  cair em spam.
- Para testar: use "Esqueci minha senha" na tela de login (Reset Password)
  ou Authentication → Users → "Invite user" (Invite).

## Mapeamento

| Interface (`contract.ts`) | Supabase |
| --- | --- |
| `AuthService` | `supabase.auth` (signInWithPassword, signOut, getSession, onAuthStateChange); papel/nome vêm de `profiles`, escolas de `my_schools()`; `setActiveSchool` guarda a escolha em localStorage |
| `StorageService` | `supabase.storage` — buckets privados `students`, `clubs`, `references`, `generated`; paths prefixados com `{school_id}/` (uid para super_admin sem escola); URLs assinadas (TTL 1 ano) |
| `EventRepository` | Tabela `events` + RPC `event_photo_counts(p_school)`; `declareImageRights` grava `image_rights_declared_at/by` |
| `PhotoRepository` | `photos` + bucket `event-photos` (upload direto do navegador, uma chamada por foto; concorrência e retentativas ficam em `src/lib/upload/`), `batch_jobs` para abrir e fechar o lote |
| Repositórios | Tabelas acima; colunas snake_case mapeadas em `src/lib/data/supabase/index.ts`; `school_id` (escola ativa, ou a do aluno no caso das artes) e `owner_id` injetados no insert. `students` embute `guardians` via `primary_guardian_id`; o responsável do domínio junta a linha de `guardians` (identidade, verificação) com o jsonb `students.guardian` (consentimento, até o M4) |
| `SchoolBrandRepository` | Tabela `schools` (nome, logo, cores) — só leitura/edição das escolas da pessoa |
| `GuardianVerificationService` | Edge function `send-guardian-code` (aceita `studentId` ou `guardianId`) e RPC `confirm_guardian_code(p_guardian_id, p_code)` |
| `ImageGenerationService` | api-server `POST /api/generation/post-image` (OpenAI GPT Image) — exige `Authorization: Bearer <access_token>` **e** uma linha válida em `profiles` |

Papéis globais: `dev`, `super_admin` e `user` (coluna `role` em `profiles`);
papel na escola: `school_admin`, `school_staff`, `teacher` (`school_members`);
`approval_status` controla o acesso (`pending`/`approved`/`rejected`). O papel
`guardian` (responsável) previsto na pivotagem entra na Fase 4 como quarto
valor do `check` de `profiles.role` — `guardians.user_id` já existe para isso.
Usuário logado sem linha em `profiles` é tratado como deslogado no frontend
e bloqueado na rota de geração (HTTP 403) no backend.

Nenhuma tela importa a implementação diretamente — todas usam
`getDataLayer()` de `src/lib/data`.
