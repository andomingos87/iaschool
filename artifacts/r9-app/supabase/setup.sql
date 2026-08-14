-- ------------------------------------------------------------
-- R9 Escolinhas — setup do projeto Supabase
-- Rode este script inteiro no SQL Editor do painel Supabase
-- (https://supabase.com/dashboard → seu projeto → SQL Editor).
-- Pode ser executado mais de uma vez sem quebrar (idempotente).
-- ------------------------------------------------------------

-- ---------- 1. Tabelas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role text not null,
  school_name text,
  -- Cadastros públicos nascem 'pending'; contas criadas pelo admin, 'approved'.
  approval_status text not null default 'approved',
  -- Para alunos: uid do usuário da escola escolhida no cadastro.
  school_id uuid references public.profiles (id) on delete set null,
  -- Para alunos: registro na tabela students vinculado na aprovação.
  student_record_id uuid,
  created_at timestamptz not null default now()
);

-- Migração de bases existentes: novas colunas + role 'student'.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='approval_status') then
    alter table public.profiles add column approval_status text not null default 'approved';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='school_id') then
    alter table public.profiles add column school_id uuid references public.profiles (id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='student_record_id') then
    alter table public.profiles add column student_record_id uuid;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'school_user', 'student'));
alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

-- Um registro students só pode ter UMA conta vinculada (garantido no banco,
-- não apenas na aplicação — evita corrida entre duas vinculações simultâneas).
create unique index if not exists profiles_student_record_id_key
  on public.profiles (student_record_id)
  where student_record_id is not null;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  whatsapp text not null,
  position text,
  height_cm numeric,
  weight_kg numeric,
  birth_date text,
  notes text,
  photos jsonb not null default '[]'::jsonb,
  club_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Integridade do vínculo conta ↔ registro: se o registro students for
-- excluído, o vínculo é desfeito automaticamente (a conta volta a aparecer
-- no seletor de vínculo). Criada aqui porque students precisa existir antes.
do $$
begin
  -- Limpa referências órfãs de bases existentes antes de criar a FK.
  update public.profiles p
  set student_record_id = null
  where p.student_record_id is not null
    and not exists (
      select 1 from public.students s where s.id = p.student_record_id
    );
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_student_record_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_student_record_id_fkey
      foreign key (student_record_id) references public.students (id)
      on delete set null;
  end if;
end $$;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  logo jsonb,
  uniforms jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reference_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  image jsonb not null,
  title text,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  -- Métricas personalizadas pertencem ao criador; pré-definidas usam um UUID especial.
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  predefined boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null,
  image_url text not null,
  metrics jsonb not null default '[]'::jsonb,
  -- Metadados da geração (prompt final + resumo do payload); null em posts antigos.
  details jsonb,
  created_at timestamptz not null default now(),
  -- Lixeira (soft delete): data em que foi movido; null = ativo.
  -- Itens com mais de 30 dias na lixeira são expurgados pelo app.
  deleted_at timestamptz
);

-- Migração de bases existentes: colunas details e deleted_at em generated_posts.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='generated_posts' and column_name='details') then
    alter table public.generated_posts add column details jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='generated_posts' and column_name='deleted_at') then
    alter table public.generated_posts add column deleted_at timestamptz;
  end if;
end $$;

-- Template global do prompt de geração (linha única, editada pelo admin).
create table if not exists public.prompt_settings (
  id text primary key default 'default',
  template text not null,
  updated_at timestamptz not null default now()
);

-- Histórico de versões do template do prompt (uma linha por salvamento).
create table if not exists public.prompt_template_versions (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_by_name text not null,
  created_at timestamptz not null default now()
);

-- Trigger: cada insert/update em prompt_settings grava uma versão no
-- histórico DENTRO da mesma transação — o save e a versão são atômicos
-- (ou ambos entram, ou nenhum). O nome do autor é resolvido aqui pelo
-- perfil do usuário autenticado.
create or replace function public.record_prompt_template_version()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.prompt_template_versions (template, saved_by, saved_by_name)
  values (
    new.template,
    auth.uid(),
    coalesce(
      (select name from public.profiles where id = auth.uid()),
      'Administrador'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_prompt_settings_saved on public.prompt_settings;
create trigger on_prompt_settings_saved
  after insert or update of template on public.prompt_settings
  for each row execute function public.record_prompt_template_version();

-- Adiciona owner_id a tabelas existentes se a coluna ainda não existir.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='students' and column_name='owner_id') then
    alter table public.students add column owner_id uuid references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='clubs' and column_name='owner_id') then
    alter table public.clubs add column owner_id uuid references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='reference_posts' and column_name='owner_id') then
    alter table public.reference_posts add column owner_id uuid references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='generated_posts' and column_name='owner_id') then
    alter table public.generated_posts add column owner_id uuid references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='metrics' and column_name='owner_id') then
    alter table public.metrics add column owner_id uuid references auth.users(id) on delete cascade;
  end if;
end $$;

-- ---------- 2. Funções auxiliares de autorização ----------

create or replace function public.has_profile()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and approval_status = 'approved'
  );
$$;

-- Perfil existente E aprovado — contas pendentes/recusadas não leem nada.
create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approval_status = 'approved'
  );
$$;

-- Aprovado E com papel que pode escrever dados de escola (school_user ou super_admin).
-- Alunos são somente leitura no nível do banco — esta função bloqueia todas as
-- escritas de domínio (students, clubs, etc.) para o role student.
create or replace function public.is_school_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and role in ('school_user', 'super_admin')
  );
$$;

-- Registro de aluno vinculado ao usuário atual (null se não houver / não aprovado).
create or replace function public.my_student_record_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select student_record_id from public.profiles
  where id = auth.uid() and role = 'student' and approval_status = 'approved';
$$;

-- Contas de aluno aprovadas e ainda sem vínculo com um registro de students.
-- school_user vê apenas alunos da própria escola; super_admin vê todos.
-- (security definer porque a RLS de profiles só permite ler o próprio perfil.)
create or replace function public.list_linkable_student_accounts()
returns table (id uuid, name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email
  from public.profiles p
  where public.is_school_user()
    and p.role = 'student'
    and p.approval_status = 'approved'
    and p.student_record_id is null
    and (p.school_id = auth.uid() or public.is_super_admin())
  order by p.name;
$$;
grant execute on function public.list_linkable_student_accounts() to authenticated;

-- Vincula manualmente uma conta de aluno a um registro da tabela students
-- (profiles.student_record_id). Usado pela escola quando o vínculo automático
-- por nome falha na aprovação. security definer em vez de política RLS de
-- update em profiles: RLS não restringe a UMA coluna, e a escola não pode
-- alterar mais nada no perfil do aluno.
create or replace function public.link_student_account(
  p_profile_id uuid,
  p_student_record_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_school_user() then
    raise exception 'Apenas escolas podem vincular contas de aluno.';
  end if;
  -- O registro students precisa pertencer à escola que está vinculando.
  if not exists (
    select 1 from public.students s
    where s.id = p_student_record_id
      and (s.owner_id = auth.uid() or public.is_super_admin())
  ) then
    raise exception 'Registro de aluno não encontrado.';
  end if;
  -- O índice único parcial profiles_student_record_id_key garante no banco
  -- que um registro students só tem UMA conta vinculada (mesmo sob corrida).
  begin
    update public.profiles
    set student_record_id = p_student_record_id
    where id = p_profile_id
      and role = 'student'
      and approval_status = 'approved'
      and student_record_id is null -- só vincula contas ainda sem vínculo
      and (school_id = auth.uid() or public.is_super_admin());
  exception when unique_violation then
    raise exception 'Este registro de aluno já tem uma conta vinculada.';
  end;
  if not found then
    raise exception 'Conta de aluno não encontrada, já vinculada ou não pertence à sua escola.';
  end if;
end;
$$;
grant execute on function public.link_student_account(uuid, uuid) to authenticated;

-- Escolas aprovadas para o seletor do cadastro de aluno (acessível sem login;
-- expõe apenas id e nome — nunca e-mail).
create or replace function public.list_approved_schools()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, coalesce(school_name, name) as name
  from public.profiles
  where role = 'school_user' and approval_status = 'approved'
  order by 2;
$$;
grant execute on function public.list_approved_schools() to anon, authenticated;

-- Trigger: cria o profile pendente na hora do signUp (metadados do cliente).
-- Funciona mesmo com confirmação de e-mail ativa (sem sessão no cliente).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'signup_role'
     and new.raw_user_meta_data->>'signup_role' in ('school_user', 'student') then
    insert into public.profiles (id, email, name, role, school_name, school_id, approval_status)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'signup_name', new.email),
      new.raw_user_meta_data->>'signup_role',
      new.raw_user_meta_data->>'signup_school_name',
      nullif(new.raw_user_meta_data->>'signup_school_id', '')::uuid,
      'pending'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. RLS com isolamento de tenant ----------
-- Regra:
--   super_admin  → lê e escreve TODOS os registros
--   school_user  → lê e escreve APENAS os registros onde owner_id = auth.uid()

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.clubs enable row level security;
alter table public.reference_posts enable row level security;
alter table public.metrics enable row level security;
alter table public.generated_posts enable row level security;
alter table public.prompt_settings enable row level security;
alter table public.prompt_template_versions enable row level security;

-- prompt_template_versions: mesma regra de prompt_settings —
-- leitura para aprovados; escrita apenas para super_admin.
drop policy if exists "prompt_template_versions_select" on public.prompt_template_versions;
create policy "prompt_template_versions_select" on public.prompt_template_versions
  for select to authenticated
  using (public.is_approved());

drop policy if exists "prompt_template_versions_insert" on public.prompt_template_versions;
create policy "prompt_template_versions_insert" on public.prompt_template_versions
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "prompt_template_versions_delete" on public.prompt_template_versions;
create policy "prompt_template_versions_delete" on public.prompt_template_versions
  for delete to authenticated
  using (public.is_super_admin());

-- prompt_settings: leitura apenas para aprovados; escrita apenas para super_admin.
drop policy if exists "prompt_settings_select" on public.prompt_settings;
create policy "prompt_settings_select" on public.prompt_settings
  for select to authenticated
  using (public.is_approved());

drop policy if exists "prompt_settings_insert" on public.prompt_settings;
create policy "prompt_settings_insert" on public.prompt_settings
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "prompt_settings_update" on public.prompt_settings;
create policy "prompt_settings_update" on public.prompt_settings
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "prompt_settings_delete" on public.prompt_settings;
create policy "prompt_settings_delete" on public.prompt_settings
  for delete to authenticated
  using (public.is_super_admin());

-- profiles: cada um lê o próprio (inclusive pendente, para ver o status);
-- super_admin lê todos.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

-- Apenas super_admin altera perfis (aprovar/recusar cadastros).
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Helper: dado registro pertence ao usuário atual OU ele é super_admin.
-- Usado nas políticas de domínio abaixo.

-- students: dono aprovado, super_admin, ou o próprio aluno (registro vinculado).
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated
  using (
    (owner_id = auth.uid() and public.is_approved())
    or public.is_super_admin()
    or id = public.my_student_record_id()
  );

drop policy if exists "students_insert" on public.students;
create policy "students_insert" on public.students
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_school_user());

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin())
  with check ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

drop policy if exists "students_delete" on public.students;
create policy "students_delete" on public.students
  for delete to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

-- clubs
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs
  for select to authenticated
  using ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin());

drop policy if exists "clubs_insert" on public.clubs;
create policy "clubs_insert" on public.clubs
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_school_user());

drop policy if exists "clubs_update" on public.clubs;
create policy "clubs_update" on public.clubs
  for update to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin())
  with check ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

drop policy if exists "clubs_delete" on public.clubs;
create policy "clubs_delete" on public.clubs
  for delete to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

-- reference_posts
drop policy if exists "reference_posts_select" on public.reference_posts;
create policy "reference_posts_select" on public.reference_posts
  for select to authenticated
  using ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin());

drop policy if exists "reference_posts_insert" on public.reference_posts;
create policy "reference_posts_insert" on public.reference_posts
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_school_user());

drop policy if exists "reference_posts_delete" on public.reference_posts;
create policy "reference_posts_delete" on public.reference_posts
  for delete to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

-- generated_posts
-- generated_posts: dono aprovado, super_admin, ou o aluno retratado no post.
drop policy if exists "generated_posts_select" on public.generated_posts;
create policy "generated_posts_select" on public.generated_posts
  for select to authenticated
  using (
    (owner_id = auth.uid() and public.is_approved())
    or public.is_super_admin()
    or student_id = public.my_student_record_id()
  );

drop policy if exists "generated_posts_insert" on public.generated_posts;
create policy "generated_posts_insert" on public.generated_posts
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_school_user());

-- update: lixeira (soft delete/restauração) pela escola dona ou super_admin.
drop policy if exists "generated_posts_update" on public.generated_posts;
create policy "generated_posts_update" on public.generated_posts
  for update to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin())
  with check ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

-- delete: exclusão definitiva (e expurgo da lixeira) pela escola dona ou super_admin.
drop policy if exists "generated_posts_delete" on public.generated_posts;
create policy "generated_posts_delete" on public.generated_posts
  for delete to authenticated
  using ((owner_id = auth.uid() and public.is_school_user()) or public.is_super_admin());

-- metrics: pré-definidas (owner_id IS NULL) são visíveis a todos logados com perfil.
-- Métricas personalizadas são visíveis/editáveis apenas pelo criador (ou super_admin).
drop policy if exists "metrics_select" on public.metrics;
create policy "metrics_select" on public.metrics
  for select to authenticated
  using (
    public.is_approved() and (
      predefined = true
      or owner_id = auth.uid()
      or public.is_super_admin()
    )
  );

drop policy if exists "metrics_insert" on public.metrics;
create policy "metrics_insert" on public.metrics
  for insert to authenticated
  with check (public.is_school_user() and predefined = false and owner_id = auth.uid());

drop policy if exists "metrics_delete" on public.metrics;
create policy "metrics_delete" on public.metrics
  for delete to authenticated
  using (predefined = false and (owner_id = auth.uid() or public.is_super_admin()));

-- ---------- 3b. Realtime para o badge de aprovações ----------
-- O app assina mudanças em `profiles` para atualizar em tempo real o
-- contador de cadastros pendentes no menu do super_admin. O Realtime
-- respeita as políticas RLS acima (apenas super_admin recebe as linhas).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ---------- 4. Seed das 10 métricas pré-definidas ----------
-- owner_id NULL = métrica global (pré-definida); não podem ser removidas via app.

insert into public.metrics (name, predefined, owner_id)
select m.name, true, null
from (values
  ('Chutes'), ('Gols'), ('Passes'), ('Assistências'), ('Roubos de bola'),
  ('Finalizações'), ('Dribles'), ('Desarmes'), ('Cruzamentos'), ('Defesas')
) as m(name)
where not exists (
  select 1 from public.metrics where predefined = true and metrics.name = m.name
);

-- ---------- 5. Buckets de Storage PRIVADOS ----------
-- Imagens de alunos contêm dados sensíveis (WhatsApp, data de nascimento).
-- Os buckets são privados; as URLs são assinadas (1 ano de validade) geradas
-- no cliente logo após o upload.

insert into storage.buckets (id, name, public)
values
  ('students',   'students',   false),
  ('clubs',      'clubs',      false),
  ('references', 'references', false),
  ('generated',  'generated',  false)
on conflict (id) do update set public = false;

-- Upload: apenas school_user e super_admin aprovados podem enviar.
-- Alunos não podem fazer upload (somente leitura no banco e no Storage).
drop policy if exists "r9_storage_insert" on storage.objects;
create policy "r9_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('students','clubs','references','generated')
    and public.is_school_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leitura: apenas o dono aprovado ou super_admin.
drop policy if exists "r9_storage_select" on storage.objects;
create policy "r9_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_approved())
      or public.is_super_admin()
    )
  );

-- Remoção: apenas o dono school_user aprovado ou super_admin.
drop policy if exists "r9_storage_delete" on storage.objects;
create policy "r9_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_school_user())
      or public.is_super_admin()
    )
  );

-- ------------------------------------------------------------
-- 6. Cota diária de gerações de imagem (persistida no banco)
--
-- O api-server chama consume_generation_quota() com a chave service_role a
-- cada geração; a contagem por usuário/dia é atômica e resiste a reinícios.
-- ------------------------------------------------------------

create table if not exists public.generation_usage (
  user_id    uuid        not null,
  day        date        not null,
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Somente o backend (service_role, que ignora RLS) acessa esta tabela.
alter table public.generation_usage enable row level security;

-- Consome 1 geração da cota do dia (UTC). Retorna o total do dia após o
-- consumo, ou NULL se a cota (p_limit) já foi atingida — nada é consumido
-- nesse caso. Operação atômica (INSERT ... ON CONFLICT com condição).
create or replace function public.consume_generation_quota(
  p_user_id uuid,
  p_limit   integer
)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.generation_usage as gu (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update
    set count = gu.count + 1, updated_at = now()
    where gu.count < p_limit
  returning count;
$$;

-- Apenas o service_role pode executar (o backend); nunca o cliente.
revoke execute on function public.consume_generation_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid, integer)
  to service_role;

-- ------------------------------------------------------------
-- 7. Primeiro usuário super_admin (faça DEPOIS de rodar o script)
--
-- a) No painel: Authentication → Users → "Add user" → e-mail + senha
--    (marque "Auto confirm user").
-- b) Copie o UUID do usuário criado e rode (trocando os valores):
--
--   insert into public.profiles (id, email, name, role, approval_status)
--   values ('<UUID do usuário criado>', '<email>', '<nome>', 'super_admin', 'approved');
--
-- Escolas e alunos agora se cadastram pelo app ("Criar conta") e entram como
-- pendentes; o super_admin aprova em "Aprovações". Para isso o cadastro por
-- e-mail precisa estar HABILITADO no Supabase:
--   Authentication → Sign In / Up → Email → "Enable email signups" (ativado).
-- Contas pendentes/recusadas não leem nenhum dado (RLS acima).
-- ------------------------------------------------------------
