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
aplicadas via MCP:

| Versão | Migration |
| --- | --- |
| `20260830154203` | `iaschool_core_tables` |
| `20260830154226` | `iaschool_auth_helper_functions` |
| `20260830154256` | `iaschool_signup_trigger_and_rls` |
| `20260830154305` | `iaschool_storage_buckets_and_policies` |
| `20260830154315` | `iaschool_generation_quota_and_logs` |
| `20260830154340` | `iaschool_eca_digital` |
| `20260830154404` | `iaschool_revoke_trigger_functions_from_api` |

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
| [`eca-digital.sql`](./supabase/eca-digital.sql) | `guardian_verification_codes`, `share_logs`, `confirm_guardian_code()` e o trigger `handle_new_user` com os campos de consentimento |
| [`generation-quota.sql`](./supabase/generation-quota.sql) | `generation_usage` + `consume_generation_quota()` |
| [`generation-logs.sql`](./supabase/generation-logs.sql) | `generation_logs` + bucket privado `generation-logs` |
| [`create-super-admin.sql`](./supabase/create-super-admin.sql) | Operação de dado: promove um usuário a `super_admin` aprovado |
| [`pivot-fase0.sql`](./supabase/pivot-fase0.sql) | Migration da pivotagem para bases anteriores a 30/08/2026 (remove posição, altura, peso, uniformes e métricas). ⚠️ Apaga dados. Bases novas já nascem limpas |

### Tabelas em `public`

Todas com RLS habilitada.

| Tabela | Papel |
| --- | --- |
| `profiles` | Usuário do produto: `role`, `approval_status`, vínculo com escola/aluno |
| `students` | Aluno cadastrado pela escola; soft delete via `deleted_at` |
| `clubs` | Identidade visual da escola (logo e cores) — nome de tabela herdado; consolidar em `schools` é decisão da Fase 1 |
| `reference_posts` | Modelos de arte (referência de estilo) |
| `generated_posts` | Artes geradas; soft delete via `deleted_at` |
| `prompt_settings` / `prompt_template_versions` | Template de prompt e seu histórico |
| `generation_usage` | Cota diária de geração, persistida |
| `generation_logs` | Auditoria das gerações (tela `/admin/logs`). RLS ligada e **sem políticas**: só o api-server (service_role) lê e escreve |
| `guardian_verification_codes` | OTP de verificação do responsável (ECA Digital) |
| `share_logs` | Trilha imutável de compartilhamento (ECA Digital) |

Pontos de RLS e retenção que importam:

- Isolamento por usuário: `super_admin` vê tudo; `school_user` acessa apenas os
  próprios registros (`owner_id = auth.uid()`). Isso **não** é multi-tenancy de
  escola — trocar para `school_id` é a Fase 1 da pivotagem.
- Lixeira de 30 dias em `students` e `generated_posts`: excluir é `UPDATE` em
  `deleted_at`. A política `students_delete` é restrita a `super_admin`
  justamente para que `school_user` não contorne a retenção via `DELETE` direto
  no PostgREST. O expurgo (registro + arquivos no Storage) é oportunista.
- Buckets **privados** `students`, `clubs`, `references`, `generated` e
  `generation-logs` — imagens servidas por URLs assinadas (TTL 1 ano), nunca
  públicas.

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

- Na tela de login há "Criar conta": escolas (`role = 'school_user'`) e
  alunos (`role = 'student'`, com escolha da escola) se cadastram sozinhos.
- O `signUp` envia metadados (`signup_role`, `signup_name`,
  `signup_school_name`/`signup_school_id`); o trigger `handle_new_user`
  (setup.sql) cria a linha em `profiles` com `approval_status = 'pending'`.
- Contas pendentes/recusadas: veem apenas a tela "Aguardando aprovação"
  no app; a RLS (`is_approved()`) impede qualquer leitura de dados e o
  api-server recusa a rota de geração (HTTP 403).
- O super_admin aprova/recusa na tela **Aprovações** do app (update em
  `profiles.approval_status`). Ao aprovar um aluno, o app tenta vincular o
  registro da tabela `students` da escola pelo nome
  (`profiles.student_record_id`).
- Aluno aprovado: área própria somente leitura (perfil + posts gerados
  sobre ele — políticas `students_select`/`generated_posts_select` via
  `my_student_record_id()`). Alunos não geram imagens.
- A lista de escolas do cadastro de aluno vem da RPC pública
  `list_approved_schools()` (só expõe id e nome).


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
| `AuthService` | `supabase.auth` (signInWithPassword, signOut, getSession, onAuthStateChange); papel/nome vêm da tabela `profiles` |
| `StorageService` | `supabase.storage` — buckets privados `students`, `clubs`, `references`, `generated`; paths prefixados com `{uid}/`; URLs assinadas (TTL 1 ano) |
| Repositórios | Tabelas acima; colunas snake_case mapeadas em `src/lib/data/supabase/index.ts`; `owner_id` injetado automaticamente no insert |
| `ImageGenerationService` | api-server `POST /api/generation/post-image` (OpenAI GPT Image) — exige `Authorization: Bearer <access_token>` **e** uma linha válida em `profiles` |

Papéis: `super_admin`, `school_user` e `student` (coluna `role` em
`profiles`); `approval_status` controla o acesso (`pending`/`approved`/
`rejected`). O papel `guardian` (responsável) previsto na pivotagem ainda não
existe.
Usuário logado sem linha em `profiles` é tratado como deslogado no frontend
e bloqueado na rota de geração (HTTP 403) no backend.

Nenhuma tela importa a implementação diretamente — todas usam
`getDataLayer()` de `src/lib/data`.
