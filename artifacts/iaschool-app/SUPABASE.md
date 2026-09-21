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
| `photos` | Foto de evento (M2): `storage_path` em `event-photos`, `content_hash` (SHA-256 do original) com `unique (event_id, content_hash)`, `status` do pipeline; soft delete via `deleted_at`. Pela API autenticada o UPDATE só alcança `deleted_at` (trigger `photos_restrict_client_update`); o resto é do worker (`service_role`) |
| `batch_jobs` | Lote de processamento (M2): um por sessão de upload (`kind = 'ingest'`), com `total`/`processed`/`failed`; publicado no Realtime para o progresso do M3 |

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
