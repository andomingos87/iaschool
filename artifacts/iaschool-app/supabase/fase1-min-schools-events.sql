-- ------------------------------------------------------------
-- IAschool — Fase 1 mínima (M1): escola como tenant real
-- Migration: iaschool_fase1_schools_members_classes
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §4 (revisada em
-- 16/09/2026). Backlog: BACKLOG.md → Fase 1 → M1.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que muda, em ordem:
--   1. `schools` (absorve `clubs`), `school_members`, `classes`, `guardians`,
--      `events`; colunas novas em `students`, `reference_posts` e
--      `generated_posts`.
--   2. `profiles.role` vira papel global: dev | super_admin | user.
--   3. Helpers: is_member_of, is_school_admin_of, is_dev; is_super_admin
--      passa a cobrir `dev`. Morrem my_school_id, my_student_record_id,
--      is_school_user, list_approved_schools e as RPCs de vínculo de conta.
--   4. Migração de dados: uma `schools` por perfil de escola, com o MESMO id
--      do perfil (é o que mantém válido o prefixo `{uid}/` dos arquivos já
--      existentes no Storage); membro como school_admin; `students.guardian`
--      (jsonb) → `guardians`, deduplicado por (school_id, whatsapp).
--   5. RLS por `is_member_of(school_id) or is_super_admin()`.
--   6. Storage: o primeiro segmento do caminho é o id da escola.
--   7. Autocadastro de aluno aposentado (Lei 15.211/2025, art. 24).
--   8. OTP do responsável rechaveado por `guardian_id`.
--   9. Aprovação de escola cria o tenant e o vínculo automaticamente.
--
-- ⚠️ Destrutivo: apaga `guardian_verification_codes` (códigos efêmeros),
-- as colunas de aluno em `profiles` e converte contas `student` em contas
-- `user` recusadas. Sem dado real nesta fase (docs/pendencias-producao.md).
-- ------------------------------------------------------------

-- ============================================================
-- 1. Tabelas novas
-- ============================================================

create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cnpj        text unique,
  address     jsonb,
  contact     jsonb,                                 -- telefone, e-mail, responsável institucional
  logo        jsonb,                                 -- herdado de clubs.logo (StoredImage)
  colors      jsonb not null default '[]'::jsonb,    -- herdado de clubs.colors (até 3 hex)
  plan        text not null default 'pilot',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.school_members (
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('school_admin','school_staff','teacher')),
  created_at  timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index if not exists school_members_user_idx on public.school_members (user_id);

-- Sala é a linha; série é coluna (decisão #6). Lista de séries fixa no app.
create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  school_year  int  not null,                 -- ano letivo: 2026
  grade        text not null,                 -- EI, 1EF..9EF, 1EM..3EM
  name         text not null,                 -- "A", "B", "Manhã"
  teacher_id   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (school_id, school_year, grade, name)
);
create index if not exists classes_school_idx on public.classes (school_id, school_year desc);

-- Responsável legal como tabela (decisão #7): irmãos compartilham o
-- responsável e a verificação do WhatsApp é por número, não por aluno.
-- Finalidade única (Lei 15.211/2025, art. 13): não alimenta prompt nem perfil.
create table if not exists public.guardians (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete cascade,
  name                 text not null,
  whatsapp             text not null,                 -- E.164: +5511999998888
  email                text,
  relationship         text,                          -- mãe, pai, avó, responsável legal
  whatsapp_verified_at timestamptz,
  -- Reservado para o portal do responsável (Fase 4). Nulo no M1.
  user_id              uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (school_id, whatsapp)
);
alter table public.guardians drop constraint if exists guardians_whatsapp_e164_check;
alter table public.guardians add constraint guardians_whatsapp_e164_check
  check (whatsapp ~ '^\+[1-9][0-9]{7,14}$');

create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools (id) on delete cascade,
  class_id              uuid references public.classes (id) on delete set null,
  name                  text not null,
  event_date            date not null,
  status                text not null default 'draft'
                        check (status in ('draft','uploading','processing','review','ready','archived')),
  keep_originals        boolean not null default false,
  -- Padrão de 2 anos, sugerido na tela e editável por evento (spec §9.4).
  photo_retention_until date not null default (current_date + interval '2 years'),
  -- Declaração da escola de que possui autorização de uso de imagem dos
  -- alunos presentes. Sem isso o upload não abre (spec §9.2).
  image_rights_declared_at timestamptz,
  image_rights_declared_by uuid references auth.users (id),
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index if not exists events_school_idx
  on public.events (school_id, event_date desc) where deleted_at is null;

-- Colunas novas nas tabelas existentes.
alter table public.students add column if not exists school_id           uuid references public.schools (id) on delete cascade;
alter table public.students add column if not exists class_id            uuid references public.classes (id) on delete set null;
alter table public.students add column if not exists enrollment_number   text;
alter table public.students add column if not exists primary_guardian_id uuid references public.guardians (id) on delete set null;

create index if not exists students_school_idx   on public.students (school_id) where deleted_at is null;
create index if not exists students_class_idx    on public.students (class_id)  where deleted_at is null;
create index if not exists students_guardian_idx on public.students (primary_guardian_id);
create unique index if not exists students_enrollment_idx
  on public.students (school_id, enrollment_number)
  where deleted_at is null and enrollment_number is not null;

-- reference_posts e generated_posts passam a ter tenant. `school_id` nulo é
-- material do super_admin (referências globais de estilo).
alter table public.reference_posts add column if not exists school_id uuid references public.schools (id) on delete cascade;
alter table public.generated_posts add column if not exists school_id uuid references public.schools (id) on delete cascade;
create index if not exists reference_posts_school_idx on public.reference_posts (school_id);
create index if not exists generated_posts_school_idx on public.generated_posts (school_id) where deleted_at is null;

-- ============================================================
-- 2. Papéis globais em profiles
-- ============================================================

-- A constraint antiga só aceita super_admin/school_user/student: cai antes
-- da conversão e volta com os valores novos depois.
alter table public.profiles drop constraint if exists profiles_role_check;

-- Contas de aluno deixam de existir (decisão #2). As que houver viram
-- contas `user` recusadas: sem vínculo em school_members não leem nada.
update public.profiles
   set role = 'user', approval_status = 'rejected'
 where role = 'student';

update public.profiles set role = 'user' where role = 'school_user';

alter table public.profiles add constraint profiles_role_check
  check (role in ('dev', 'super_admin', 'user'));

-- ============================================================
-- 3. Helpers de autorização
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('dev', 'super_admin')
      and approval_status = 'approved'
  );
$$;

create or replace function public.is_dev()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dev' and approval_status = 'approved'
  );
$$;

-- Puro de propósito: não embute is_super_admin(). Cada policy escreve
-- `is_member_of(school_id) or is_super_admin()` para o privilégio de
-- plataforma aparecer no texto da policy.
create or replace function public.is_member_of(p_school uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_school is not null and exists (
    select 1
    from public.school_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and p.approval_status = 'approved'
  );
$$;

create or replace function public.is_school_admin_of(p_school uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_school is not null and exists (
    select 1
    from public.school_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.role = 'school_admin'
      and p.approval_status = 'approved'
  );
$$;

-- Escolas do usuário atual (para o seletor de escola do app).
create or replace function public.my_schools()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, m.role
  from public.school_members m
  join public.schools s on s.id = m.school_id
  where m.user_id = auth.uid()
    and s.deleted_at is null
    and public.is_approved()
  order by s.name;
$$;
grant execute on function public.my_schools() to authenticated;

-- Aposentados junto com o autocadastro de aluno (spec §4.7, item 7).
drop function if exists public.list_linkable_student_accounts();
drop function if exists public.list_linked_student_record_ids();
drop function if exists public.link_student_account(uuid, uuid);
drop function if exists public.list_linked_student_accounts();
drop function if exists public.unlink_student_account(uuid);
drop function if exists public.list_approved_schools();
-- my_student_record_id(), my_school_id() e is_school_user() ainda são
-- referenciadas pelas policies antigas de students, generated_posts e do
-- Storage: só podem cair depois que as policies forem reescritas (fim da
-- seção 6).

-- ============================================================
-- 4. Migração de dados: owner_id → school_id
-- ============================================================

do $$
declare
  r record;
  v_club record;
  v_guardian_id uuid;
  v_whatsapp text;
begin
  -- 4.1 Uma escola por perfil de escola, com o MESMO id do perfil.
  --     Motivo: os arquivos no Storage estão em `{uid}/...`; com
  --     schools.id = uid, a policy por escola continua válida sem mover
  --     nenhum objeto.
  for r in
    select p.id, coalesce(nullif(p.school_name, ''), p.name) as school_name
    from public.profiles p
    where p.role = 'user'
      and p.approval_status = 'approved'
      and not exists (select 1 from public.school_members m where m.user_id = p.id)
      and not exists (select 1 from public.schools s where s.id = p.id)
  loop
    -- Identidade visual: a `clubs` mais recente do dono, se houver.
    select logo, colors into v_club
      from public.clubs where owner_id = r.id
      order by updated_at desc limit 1;

    insert into public.schools (id, name, logo, colors)
    values (r.id, r.school_name, v_club.logo, coalesce(v_club.colors, '[]'::jsonb))
    on conflict (id) do nothing;

    insert into public.school_members (school_id, user_id, role)
    values (r.id, r.id, 'school_admin')
    on conflict do nothing;
  end loop;

  -- 4.2 Alunos e material passam a pertencer à escola do dono.
  update public.students s
     set school_id = s.owner_id
   where s.school_id is null
     and exists (select 1 from public.schools sc where sc.id = s.owner_id);

  update public.reference_posts rp
     set school_id = rp.owner_id
   where rp.school_id is null
     and exists (select 1 from public.schools sc where sc.id = rp.owner_id);

  update public.generated_posts gp
     set school_id = gp.owner_id
   where gp.school_id is null
     and exists (select 1 from public.schools sc where sc.id = gp.owner_id);

  -- 4.3 students.guardian (jsonb) → guardians, deduplicado por número.
  --     O jsonb fica na tabela como origem até o fim do M4 (spec §4.7, 4).
  for r in
    select s.id, s.school_id, s.guardian
    from public.students s
    where s.primary_guardian_id is null
      and s.school_id is not null
      and s.guardian is not null
      and coalesce(s.guardian->>'whatsapp', '') <> ''
  loop
    v_whatsapp := '+' || regexp_replace(r.guardian->>'whatsapp', '\D', '', 'g');
    if v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
      raise notice 'guardian de % ignorado: whatsapp inválido (%)', r.id, r.guardian->>'whatsapp';
      continue;
    end if;

    insert into public.guardians (school_id, name, whatsapp, email, relationship, whatsapp_verified_at)
    values (
      r.school_id,
      coalesce(nullif(r.guardian->>'name', ''), 'Responsável'),
      v_whatsapp,
      nullif(r.guardian->>'email', ''),
      nullif(r.guardian->>'relationship', ''),
      nullif(r.guardian->>'whatsappVerifiedAt', '')::timestamptz
    )
    on conflict (school_id, whatsapp) do update
      set whatsapp_verified_at = coalesce(public.guardians.whatsapp_verified_at, excluded.whatsapp_verified_at),
          updated_at = now()
    returning id into v_guardian_id;

    update public.students set primary_guardian_id = v_guardian_id where id = r.id;
  end loop;
end $$;

-- ============================================================
-- 5. RLS
-- ============================================================

alter table public.schools        enable row level security;
alter table public.school_members enable row level security;
alter table public.classes        enable row level security;
alter table public.guardians      enable row level security;
alter table public.events         enable row level security;

-- schools: membro lê; school_admin edita; criação só pelo super_admin ou
-- pelo trigger de aprovação (seção 9).
drop policy if exists "schools_select" on public.schools;
create policy "schools_select" on public.schools
  for select to authenticated
  using (public.is_member_of(id) or public.is_super_admin());

drop policy if exists "schools_insert" on public.schools;
create policy "schools_insert" on public.schools
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "schools_update" on public.schools;
create policy "schools_update" on public.schools
  for update to authenticated
  using (public.is_school_admin_of(id) or public.is_super_admin())
  with check (public.is_school_admin_of(id) or public.is_super_admin());

drop policy if exists "schools_delete" on public.schools;
create policy "schools_delete" on public.schools
  for delete to authenticated
  using (public.is_super_admin());

-- school_members: membro vê quem mais é da escola; school_admin gerencia.
drop policy if exists "school_members_select" on public.school_members;
create policy "school_members_select" on public.school_members
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "school_members_insert" on public.school_members;
create policy "school_members_insert" on public.school_members
  for insert to authenticated
  with check (public.is_school_admin_of(school_id) or public.is_super_admin());

drop policy if exists "school_members_update" on public.school_members;
create policy "school_members_update" on public.school_members
  for update to authenticated
  using (public.is_school_admin_of(school_id) or public.is_super_admin())
  with check (public.is_school_admin_of(school_id) or public.is_super_admin());

drop policy if exists "school_members_delete" on public.school_members;
create policy "school_members_delete" on public.school_members
  for delete to authenticated
  using (public.is_school_admin_of(school_id) or public.is_super_admin());

-- classes, guardians, events: membro lê e escreve; delete definitivo só
-- school_admin/super_admin (a escola usa a lixeira, deleted_at).
drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "classes_insert" on public.classes;
create policy "classes_insert" on public.classes
  for insert to authenticated
  with check (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "classes_update" on public.classes;
create policy "classes_update" on public.classes
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "classes_delete" on public.classes;
create policy "classes_delete" on public.classes
  for delete to authenticated
  using (public.is_school_admin_of(school_id) or public.is_super_admin());

drop policy if exists "guardians_select" on public.guardians;
create policy "guardians_select" on public.guardians
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "guardians_insert" on public.guardians;
create policy "guardians_insert" on public.guardians
  for insert to authenticated
  with check (public.is_member_of(school_id) or public.is_super_admin());
-- update: nunca pela API o whatsapp_verified_at — só a RPC confirm_guardian_code
-- (seção 8) grava a verificação. Trocar o número zera a verificação (trigger).
drop policy if exists "guardians_update" on public.guardians;
create policy "guardians_update" on public.guardians
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "guardians_delete" on public.guardians;
create policy "guardians_delete" on public.guardians
  for delete to authenticated
  using (public.is_school_admin_of(school_id) or public.is_super_admin());

create or replace function public.guardians_protect_verification()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Só a RPC (que roda como definer e marca a sessão) pode carimbar a
  -- verificação; qualquer outro update mantém o valor antigo.
  if current_setting('iaschool.guardian_verification', true) is distinct from 'rpc' then
    new.whatsapp_verified_at := old.whatsapp_verified_at;
  end if;
  -- Número novo = canal não verificado.
  if new.whatsapp is distinct from old.whatsapp then
    new.whatsapp_verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guardians_protect_verification on public.guardians;
create trigger guardians_protect_verification
  before update on public.guardians
  for each row execute function public.guardians_protect_verification();

drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert to authenticated
  with check ((public.is_member_of(school_id) and created_by = auth.uid()) or public.is_super_admin());
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());
drop policy if exists "events_delete" on public.events;
create policy "events_delete" on public.events
  for delete to authenticated
  using (public.is_school_admin_of(school_id) or public.is_super_admin());

-- students: por escola. owner_id vira auditoria (quem cadastrou).
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "students_insert" on public.students;
create policy "students_insert" on public.students
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and owner_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());

-- Hard DELETE continua restrito ao super_admin (lixeira de 30 dias).
drop policy if exists "students_delete" on public.students;
create policy "students_delete" on public.students
  for delete to authenticated
  using (public.is_super_admin());

-- reference_posts: da escola, ou globais (school_id nulo) só do super_admin.
drop policy if exists "reference_posts_select" on public.reference_posts;
create policy "reference_posts_select" on public.reference_posts
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "reference_posts_insert" on public.reference_posts;
create policy "reference_posts_insert" on public.reference_posts
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and owner_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "reference_posts_delete" on public.reference_posts;
create policy "reference_posts_delete" on public.reference_posts
  for delete to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

-- generated_posts
drop policy if exists "generated_posts_select" on public.generated_posts;
create policy "generated_posts_select" on public.generated_posts
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "generated_posts_insert" on public.generated_posts;
create policy "generated_posts_insert" on public.generated_posts
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and owner_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "generated_posts_update" on public.generated_posts;
create policy "generated_posts_update" on public.generated_posts
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "generated_posts_delete" on public.generated_posts;
create policy "generated_posts_delete" on public.generated_posts
  for delete to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

-- clubs: legado. Continua por owner_id até ser removida (Fase 1 completa);
-- só troca is_school_user() pelo equivalente novo.
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs
  for select to authenticated
  using ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin());
drop policy if exists "clubs_insert" on public.clubs;
create policy "clubs_insert" on public.clubs
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_member_of(auth.uid()));
drop policy if exists "clubs_update" on public.clubs;
create policy "clubs_update" on public.clubs
  for update to authenticated
  using ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin())
  with check ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin());
drop policy if exists "clubs_delete" on public.clubs;
create policy "clubs_delete" on public.clubs
  for delete to authenticated
  using ((owner_id = auth.uid() and public.is_approved()) or public.is_super_admin());

-- share_logs: trilha imutável, agora lida por escola.
drop policy if exists "share_logs_select" on public.share_logs;
create policy "share_logs_select" on public.share_logs
  for select to authenticated
  using (
    public.is_super_admin()
    or student_id in (
      select id from public.students where public.is_member_of(school_id)
    )
  );

drop policy if exists "share_logs_insert" on public.share_logs;
create policy "share_logs_insert" on public.share_logs
  for insert to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and student_id in (
      select id from public.students
      where public.is_member_of(school_id) or public.is_super_admin()
    )
  );

-- is_school_user(), my_student_record_id() e my_school_id() ainda são usadas
-- pelas policies antigas do Storage — caem no fim da seção 6.

-- ============================================================
-- 6. Storage: o primeiro segmento do caminho é o id da escola
-- ============================================================

-- Converte o primeiro segmento em uuid sem estourar em nomes fora do padrão.
create or replace function public.storage_school_id(p_name text)
returns uuid
language sql immutable set search_path = '' as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(p_name))[1]::uuid
    else null
  end;
$$;

drop policy if exists "iaschool_storage_insert" on storage.objects;
create policy "iaschool_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('students','clubs','references','generated')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

drop policy if exists "iaschool_storage_select" on storage.objects;
create policy "iaschool_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

drop policy if exists "iaschool_storage_delete" on storage.objects;
create policy "iaschool_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('students','clubs','references','generated')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

-- Policies antigas do Storage já substituídas: agora sem dependentes.
drop function if exists public.is_school_user();
drop function if exists public.my_student_record_id();
drop function if exists public.my_school_id();

-- ============================================================
-- 7. Autocadastro de aluno aposentado
-- ============================================================

-- A constraint que exigia responsável autorizado para conta de criança perde
-- o objeto: não existe mais conta de menor (Lei 15.211/2025, art. 24).
alter table public.profiles drop constraint if exists profiles_guardian_required_check;
alter table public.profiles drop constraint if exists profiles_age_bracket_check;
alter table public.profiles drop constraint if exists profiles_student_record_id_fkey;
drop index if exists public.profiles_student_record_id_key;
alter table public.profiles drop column if exists student_record_id;
alter table public.profiles drop column if exists school_id;
alter table public.profiles drop column if exists age_bracket;
alter table public.profiles drop column if exists guardian_name;
alter table public.profiles drop column if exists guardian_consent;

-- O cadastro público passa a ser só de escola. `signup_role` aceita
-- 'school' e o legado 'school_user' (cliente antigo em cache).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'signup_role'
     and new.raw_user_meta_data->>'signup_role' in ('school', 'school_user') then
    insert into public.profiles (id, email, name, role, school_name, approval_status)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'signup_name', new.email),
      'user',
      new.raw_user_meta_data->>'signup_school_name',
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

-- ============================================================
-- 8. OTP do responsável rechaveado por guardian_id (spec §4.7, item 8)
-- ============================================================

-- Códigos são efêmeros (10 min): recriar a tabela é seguro.
drop table if exists public.guardian_verification_codes;
create table public.guardian_verification_codes (
  guardian_id uuid primary key references public.guardians (id) on delete cascade,
  code        text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.guardian_verification_codes enable row level security;
-- Sem policy nenhuma: só a edge function (service_role) e a RPC abaixo.

drop function if exists public.confirm_guardian_code(uuid, text);
create or replace function public.confirm_guardian_code(
  p_guardian_id uuid,
  p_code text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.guardian_verification_codes%rowtype;
  v_school uuid;
begin
  select school_id into v_school
    from public.guardians
   where id = p_guardian_id and deleted_at is null;
  if v_school is null then
    raise exception 'guardian not found';
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select * into v_row from public.guardian_verification_codes
    where guardian_id = p_guardian_id;
  if not found then
    raise exception 'invalid code';
  end if;
  if v_row.expires_at < now() then
    delete from public.guardian_verification_codes where guardian_id = p_guardian_id;
    raise exception 'code expired';
  end if;
  -- Antiabuso: 5 tentativas por código.
  if v_row.attempts >= 5 then
    delete from public.guardian_verification_codes where guardian_id = p_guardian_id;
    raise exception 'code expired';
  end if;
  if v_row.code <> p_code then
    update public.guardian_verification_codes
      set attempts = attempts + 1
      where guardian_id = p_guardian_id;
    raise exception 'invalid code';
  end if;

  -- Libera o trigger de proteção só dentro desta transação.
  perform set_config('iaschool.guardian_verification', 'rpc', true);
  update public.guardians
     set whatsapp_verified_at = now()
   where id = p_guardian_id;

  delete from public.guardian_verification_codes where guardian_id = p_guardian_id;
end;
$$;

revoke all on function public.confirm_guardian_code(uuid, text) from public;
grant execute on function public.confirm_guardian_code(uuid, text) to authenticated;

-- ============================================================
-- 9. Aprovação de escola cria o tenant e o vínculo
-- ============================================================

-- Quando o super_admin aprova um cadastro `user` com school_name e a pessoa
-- ainda não é membro de escola nenhuma, nasce a escola (id = uid, pelo mesmo
-- motivo da seção 4.1) e o vínculo como school_admin. Mantém a tela de
-- aprovações como está: aprovar continua sendo um PATCH em profiles.
create or replace function public.ensure_school_on_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'approved'
     and old.approval_status is distinct from 'approved'
     and new.role = 'user'
     and not exists (select 1 from public.school_members m where m.user_id = new.id)
  then
    insert into public.schools (id, name)
    values (new.id, coalesce(nullif(new.school_name, ''), new.name))
    on conflict (id) do nothing;

    insert into public.school_members (school_id, user_id, role)
    values (new.id, new.id, 'school_admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_school_on_approval on public.profiles;
create trigger profiles_ensure_school_on_approval
  after update of approval_status on public.profiles
  for each row execute function public.ensure_school_on_approval();

-- ============================================================
-- 10. Realtime e privilégios
-- ============================================================

-- Funções de trigger não são chamáveis pela API (mesma regra da migration
-- iaschool_revoke_trigger_functions_from_api).
revoke all on function public.guardians_protect_verification() from public, anon, authenticated;
revoke all on function public.ensure_school_on_approval() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- updated_at automático nas tabelas novas.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

drop trigger if exists schools_touch_updated_at on public.schools;
create trigger schools_touch_updated_at before update on public.schools
  for each row execute function public.touch_updated_at();
drop trigger if exists classes_touch_updated_at on public.classes;
create trigger classes_touch_updated_at before update on public.classes
  for each row execute function public.touch_updated_at();
drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at before update on public.events
  for each row execute function public.touch_updated_at();
