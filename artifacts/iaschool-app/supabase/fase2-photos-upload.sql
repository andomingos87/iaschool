-- ------------------------------------------------------------
-- IAschool — Fase 2, M2: fotos e upload em massa no cliente
-- Migrations: iaschool_fase2_photos_batch_jobs_buckets (tudo abaixo, exceto os
-- triggers de escola do evento) e iaschool_fase2_photos_event_school_check.
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §5.1, §5.2 (só
-- `batch_jobs`), §6, §8. Backlog: BACKLOG.md → Fase 2 → M2.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. `photos` com `unique (event_id, content_hash)` — é o que torna o
--      upload idempotente: a mesma pasta arrastada duas vezes só conta
--      "já enviada" na segunda.
--   2. `batch_jobs` — um lote por sessão de upload; no M3 o ingest-worker
--      passa a atualizar `processed`/`failed` e o app assina via Realtime.
--   3. RLS: membro da escola lê e insere; o UPDATE do cliente só alcança
--      `deleted_at` (trigger); `photo_jobs` fica para o M3 (só service_role).
--   4. Buckets privados `event-photos`, `event-thumbs`, `event-originals`
--      com o id da escola como primeiro segmento do caminho.
--   5. RPC `event_photo_counts` para a lista de eventos.
--
-- Não entra aqui (M3): `photo_jobs`, `claim_photo_jobs`, miniaturas, worker.
-- ------------------------------------------------------------

-- ============================================================
-- 1. photos
-- ============================================================

create table if not exists public.photos (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  storage_path      text not null,          -- bucket event-photos: {school_id}/{event_id}/{photo_id}.jpg
  thumb_path        text,                   -- bucket event-thumbs (M3)
  content_hash      text not null,          -- sha-256 (hex) do arquivo ORIGINAL, antes do redimensionamento
  original_filename text not null,
  bytes             int  not null,          -- tamanho do arquivo enviado (já redimensionado)
  width             int,
  height            int,
  taken_at          timestamptz,            -- EXIF DateTimeOriginal, quando houver (M3)
  status            text not null default 'pending'
                    check (status in ('pending','processing','processed','failed')),
  faces_count       int,
  error             text,
  uploaded_by       uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (event_id, content_hash)           -- dedup (R2)
);
create index if not exists photos_event_idx
  on public.photos (event_id, created_at) where deleted_at is null;
create index if not exists photos_status_idx
  on public.photos (status) where status in ('pending','processing');
create index if not exists photos_school_idx
  on public.photos (school_id) where deleted_at is null;

-- ============================================================
-- 2. batch_jobs
-- ============================================================

create table if not exists public.batch_jobs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  event_id    uuid references public.events (id) on delete cascade,
  kind        text not null check (kind in ('ingest','recognize','reference')),
  status      text not null default 'queued'
              check (status in ('queued','running','done','failed','cancelled')),
  total       int not null default 0,
  processed   int not null default 0,
  failed      int not null default 0,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists batch_jobs_event_idx
  on public.batch_jobs (event_id, created_at desc);

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.photos     enable row level security;
alter table public.batch_jobs enable row level security;

-- photos: membro da escola lê e insere (o upload é do próprio usuário).
drop policy if exists "photos_select" on public.photos;
create policy "photos_select" on public.photos
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "photos_insert" on public.photos;
create policy "photos_insert" on public.photos
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and uploaded_by = auth.uid())
    or public.is_super_admin()
  );

-- update: a policy libera o membro; o trigger abaixo garante que, pela API
-- autenticada, só `deleted_at` muda (lixeira). Dimensões, status, miniatura
-- e erro são do worker (service_role, que não passa pelo trigger).
drop policy if exists "photos_update" on public.photos;
create policy "photos_update" on public.photos
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());

-- Hard delete só do super_admin: a escola usa a lixeira (spec §9.4).
drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete" on public.photos
  for delete to authenticated
  using (public.is_super_admin());

create or replace function public.photos_restrict_client_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
begin
  -- service_role (workers) e conexões diretas passam direto.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  -- Cliente autenticado: preserva tudo, exceto deleted_at.
  v_deleted_at := new.deleted_at;
  new := old;
  new.deleted_at := v_deleted_at;
  return new;
end;
$$;
revoke all on function public.photos_restrict_client_update() from public, anon, authenticated;

drop trigger if exists photos_restrict_client_update on public.photos;
create trigger photos_restrict_client_update
  before update on public.photos
  for each row execute function public.photos_restrict_client_update();

-- A RLS é por school_id; estes triggers garantem que o evento apontado é da
-- MESMA escola, para uma foto (ou lote) nunca ficar sob o evento de outro
-- tenant. (Migration iaschool_fase2_photos_event_school_check.)
create or replace function public.photos_check_event_school()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_school uuid;
begin
  select school_id into v_event_school from public.events where id = new.event_id;
  if v_event_school is null or v_event_school <> new.school_id then
    raise exception 'photo school_id must match event school_id'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.photos_check_event_school() from public, anon, authenticated;

drop trigger if exists photos_check_event_school on public.photos;
create trigger photos_check_event_school
  before insert or update of event_id, school_id on public.photos
  for each row execute function public.photos_check_event_school();

create or replace function public.batch_jobs_check_event_school()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_school uuid;
begin
  if new.event_id is null then
    return new;
  end if;
  select school_id into v_event_school from public.events where id = new.event_id;
  if v_event_school is null or v_event_school <> new.school_id then
    raise exception 'batch_job school_id must match event school_id'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.batch_jobs_check_event_school() from public, anon, authenticated;

drop trigger if exists batch_jobs_check_event_school on public.batch_jobs;
create trigger batch_jobs_check_event_school
  before insert or update of event_id, school_id on public.batch_jobs
  for each row execute function public.batch_jobs_check_event_school();

-- batch_jobs: membro lê, abre e fecha o próprio lote; contadores de
-- processamento vêm do worker (service_role).
drop policy if exists "batch_jobs_select" on public.batch_jobs;
create policy "batch_jobs_select" on public.batch_jobs
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "batch_jobs_insert" on public.batch_jobs;
create policy "batch_jobs_insert" on public.batch_jobs
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "batch_jobs_update" on public.batch_jobs;
create policy "batch_jobs_update" on public.batch_jobs
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());

-- Sem policy de delete: lote é histórico.

-- ============================================================
-- 4. Storage: buckets privados por escola
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-photos',    'event-photos',    false, 20971520, array['image/jpeg']),
  ('event-thumbs',    'event-thumbs',    false,  2097152, array['image/webp']),
  ('event-originals', 'event-originals', false, 104857600, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Mesmo padrão das iaschool_storage_*: o primeiro segmento é o id da escola
-- (public.storage_school_id, M1) conferido com is_member_of.
drop policy if exists "event_storage_insert" on storage.objects;
create policy "event_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('event-photos','event-thumbs','event-originals')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

drop policy if exists "event_storage_select" on storage.objects;
create policy "event_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('event-photos','event-thumbs','event-originals')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

-- Delete pelo membro: é o que permite ao cliente desfazer um upload cujo
-- insert em `photos` perdeu a corrida da chave única.
drop policy if exists "event_storage_delete" on storage.objects;
create policy "event_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('event-photos','event-thumbs','event-originals')
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

-- ============================================================
-- 5. Contagem de fotos por evento (lista de eventos)
-- ============================================================

-- security invoker: a RLS de photos continua valendo.
create or replace function public.event_photo_counts(p_school uuid)
returns table (event_id uuid, photos bigint)
language sql stable set search_path = public as $$
  select p.event_id, count(*)::bigint
  from public.photos p
  where p.school_id = p_school
    and p.deleted_at is null
  group by p.event_id;
$$;
grant execute on function public.event_photo_counts(uuid) to authenticated;

-- ============================================================
-- 6. Realtime (progresso do lote, consumido a partir do M3)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'batch_jobs'
  ) then
    alter publication supabase_realtime add table public.batch_jobs;
  end if;
end $$;
