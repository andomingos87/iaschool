# Integração com Supabase

O app R9 Escolinhas usa um projeto Supabase externo para autenticação, banco
de dados e Storage. A implementação real vive em `src/lib/data/supabase/` e é
ativada automaticamente quando as variáveis de ambiente existem; sem elas, o
app volta ao modo demonstração (mock em localStorage, com indicador na UI).

## Variáveis de ambiente

| Variável | Onde é usada | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend + api-server | URL do projeto (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | frontend + api-server | Chave anônima pública (Settings → API Keys) |

O api-server também aceita `SUPABASE_URL`/`SUPABASE_ANON_KEY` (têm prioridade)
para validar o token do usuário na rota de geração de imagem.

**Importante:** configure AMBAS as variáveis no servidor de produção. Sem elas
e com `OPENAI_API_KEY` presente, a rota de geração retorna 503 — isso é
intencional para evitar abuso da chave sem autenticação.

## Setup do banco (uma vez)

1. Abra o SQL Editor no painel do Supabase e rode o script
   [`supabase/setup.sql`](./supabase/setup.sql) inteiro. Ele cria:
   - tabelas `profiles`, `students`, `clubs`, `reference_posts`, `metrics`,
     `generated_posts` (todas com `owner_id` para isolamento por usuário);
   - políticas RLS: `super_admin` acessa todos os dados; `school_user` acessa
     apenas os próprios registros (`owner_id = auth.uid()`);
   - seed das 10 métricas pré-definidas;
   - buckets **privados** `students`, `clubs`, `references`, `generated` — imagens são
     servidas via URLs assinadas (1 ano de validade), nunca como URLs públicas.
2. **Habilite o cadastro por e-mail** no Supabase: Authentication →
   Sign In / Up → Email → "Enable email signups" (ativado). O cadastro
   público do app depende disso; a segurança fica garantida pelo fluxo de
   aprovação (contas novas nascem pendentes e não leem nenhum dado).
3. Crie o super admin em Authentication → Users → "Add user"
   (marque *Auto confirm user*).
4. No SQL Editor, rode o script [`supabase/create-super-admin.sql`](./supabase/create-super-admin.sql).
   Ele localiza o usuário pelo e-mail e insere/atualiza o perfil com
   `role = 'super_admin'` e `approval_status = 'approved'` automaticamente.
   ⚠️ Recomendamos trocar a senha após o primeiro login.

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

### Templates de e-mail com a marca R9

Por padrão o Supabase envia e-mails em inglês e sem identidade visual. Os
templates prontos em português, com a marca IAsport/R9 (fundo escuro, destaque
verde neon), estão em
[`supabase/email-templates/`](./supabase/email-templates/):

| Arquivo | Template no painel | Assunto sugerido |
| --- | --- | --- |
| `reset-password.html` | Reset Password | Redefina sua senha — R9 Escolinhas |
| `invite.html` | Invite user | Você foi convidado para o R9 Escolinhas |

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
`rejected`).
Usuário logado sem linha em `profiles` é tratado como deslogado no frontend
e bloqueado na rota de geração (HTTP 403) no backend.

Nenhuma tela importa a implementação diretamente — todas usam
`getDataLayer()` de `src/lib/data`.
