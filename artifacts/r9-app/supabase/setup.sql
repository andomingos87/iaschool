-- ============================================================
-- R9 Escolinhas — setup do projeto Supabase
-- Rode este script inteiro no SQL Editor do painel Supabase
-- (https://supabase.com/dashboard → seu projeto → SQL Editor).
-- Pode ser executado mais de uma vez sem quebrar (idempotente).
-- ============================================================

-- ---------- 1. Tabelas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('super_admin', 'school_user')),
  school_name text,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

-- Template global do prompt de geração (linha única, editada pelo admin).
create table if not exists public.prompt_settings (
  id text primary key default 'default',
  template text not null,
  updated_at timestamptz not null default now()
);

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
    where id = auth.uid() and role = 'super_admin'
  );
$$;

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

-- prompt_settings: leitura para todos autenticados com perfil;
-- escrita (insert/update/delete) apenas para super_admin.
drop policy if exists "prompt_settings_select" on public.prompt_settings;
create policy "prompt_settings_select" on public.prompt_settings
  for select to authenticated
  using (public.has_profile());

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

-- profiles: cada um lê o próprio; super_admin lê todos.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

-- Helper: dado registro pertence ao usuário atual OU ele é super_admin.
-- Usado nas políticas de domínio abaixo.

-- students
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "students_insert" on public.students;
create policy "students_insert" on public.students
  for insert to authenticated
  with check (owner_id = auth.uid() and public.has_profile());

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated
  using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "students_delete" on public.students;
create policy "students_delete" on public.students
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

-- clubs
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs
  for select to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "clubs_insert" on public.clubs;
create policy "clubs_insert" on public.clubs
  for insert to authenticated
  with check (owner_id = auth.uid() and public.has_profile());

drop policy if exists "clubs_update" on public.clubs;
create policy "clubs_update" on public.clubs
  for update to authenticated
  using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "clubs_delete" on public.clubs;
create policy "clubs_delete" on public.clubs
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

-- reference_posts
drop policy if exists "reference_posts_select" on public.reference_posts;
create policy "reference_posts_select" on public.reference_posts
  for select to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "reference_posts_insert" on public.reference_posts;
create policy "reference_posts_insert" on public.reference_posts
  for insert to authenticated
  with check (owner_id = auth.uid() and public.has_profile());

drop policy if exists "reference_posts_delete" on public.reference_posts;
create policy "reference_posts_delete" on public.reference_posts
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

-- generated_posts
drop policy if exists "generated_posts_select" on public.generated_posts;
create policy "generated_posts_select" on public.generated_posts
  for select to authenticated
  using (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists "generated_posts_insert" on public.generated_posts;
create policy "generated_posts_insert" on public.generated_posts
  for insert to authenticated
  with check (owner_id = auth.uid() and public.has_profile());

-- metrics: pré-definidas (owner_id IS NULL) são visíveis a todos logados com perfil.
-- Métricas personalizadas são visíveis/editáveis apenas pelo criador (ou super_admin).
drop policy if exists "metrics_select" on public.metrics;
create policy "metrics_select" on public.metrics
  for select to authenticated
  using (
    public.has_profile() and (
      predefined = true
      or owner_id = auth.uid()
      or public.is_super_admin()
    )
  );

drop policy if exists "metrics_insert" on public.metrics;
create policy "metrics_insert" on public.metrics
  for insert to authenticated
  with check (public.has_profile() and predefined = false and owner_id = auth.uid());

drop policy if exists "metrics_delete" on public.metrics;
create policy "metrics_delete" on public.metrics
  for delete to authenticated
  using (predefined = false and (owner_id = auth.uid() or public.is_super_admin()));

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

-- Upload: qualquer usuário logado com perfil pode enviar.
-- O caminho é sempre prefixado com o uid do usuário (ex: "{uid}/{timestamp}-{nome}").
drop policy if exists "r9_storage_insert" on storage.objects;
create policy "r9_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('students','clubs','references','generated')
    and public.has_profile()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leitura: apenas o dono do arquivo ou super_admin.
drop policy if exists "r9_storage_select" on storage.objects;
create policy "r9_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_super_admin()
    )
  );

-- Remoção: apenas o dono ou super_admin.
drop policy if exists "r9_storage_delete" on storage.objects;
create policy "r9_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_super_admin()
    )
  );

-- ============================================================
-- 6. Primeiro usuário super_admin (faça DEPOIS de rodar o script)
--
-- a) No painel: Authentication → Users → "Add user" → e-mail + senha
--    (marque "Auto confirm user").
-- b) Copie o UUID do usuário criado e rode (trocando os valores):
--
--   insert into public.profiles (id, email, name, role)
--   values ('COLE-O-UUID-AQUI', 'seu@email.com', 'Seu Nome', 'super_admin');
--
-- Para usuários de escolinha, use role = 'school_user' e preencha school_name:
--
--   insert into public.profiles (id, email, name, role, school_name)
--   values ('UUID', 'escola@email.com', 'Nome', 'school_user', 'R9 Osasco');
-- ============================================================
