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
2. **Desabilite o cadastro público** no Supabase: Authentication → Settings →
   "Enable email signups" → desativar. Usuários são criados apenas pelo
   administrador (painel + insert manual em `profiles`).
3. Crie o primeiro usuário em Authentication → Users → "Add user"
   (marque *Auto confirm user*).
4. Insira o perfil dele na tabela `profiles` com `role = 'super_admin'`
   (instruções no fim do `setup.sql`).

Novos usuários de escolinha: mesmo fluxo com `role = 'school_user'` e
`school_name` preenchido.


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

## Mapeamento

| Interface (`contract.ts`) | Supabase |
| --- | --- |
| `AuthService` | `supabase.auth` (signInWithPassword, signOut, getSession, onAuthStateChange); papel/nome vêm da tabela `profiles` |
| `StorageService` | `supabase.storage` — buckets privados `students`, `clubs`, `references`, `generated`; paths prefixados com `{uid}/`; URLs assinadas (TTL 1 ano) |
| Repositórios | Tabelas acima; colunas snake_case mapeadas em `src/lib/data/supabase/index.ts`; `owner_id` injetado automaticamente no insert |
| `ImageGenerationService` | api-server `POST /api/generation/post-image` (OpenAI GPT Image) — exige `Authorization: Bearer <access_token>` **e** uma linha válida em `profiles` |

Papéis: `super_admin` e `school_user` (coluna `role` em `profiles`).
Usuário logado sem linha em `profiles` é tratado como deslogado no frontend
e bloqueado na rota de geração (HTTP 403) no backend.

Nenhuma tela importa a implementação diretamente — todas usam
`getDataLayer()` de `src/lib/data`.
