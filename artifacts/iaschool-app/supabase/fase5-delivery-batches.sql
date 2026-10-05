-- ------------------------------------------------------------
-- IAschool — Fase 5, W3: lote de entrega, derivados protegidos e prévia
-- Migration: iaschool_fase5_delivery_batches
--
-- Spec: docs/spec-whatsapp-api-oficial-entrega-fotos.md §§6.3, 6.4, 8.2, 8.3,
-- 10.1, 12.2 e 15.3.
-- Backlog: BACKLOG.md → Fase 5 → W3.
--
-- Aplicar via `apply_migration` do MCP `supabase-iaschool` (nunca pelo SQL
-- Editor). Este arquivo é o SQL de referência; roda mais de uma vez sem
-- quebrar. NÃO foi aplicado ao projeto remoto ainda.
--
-- O que entra:
--   1. Tabelas do lote: `delivery_batches`, `delivery_recipients`,
--      `delivery_recipient_students`, `delivery_items`, `delivery_render_jobs`,
--      `delivery_access_sessions` e a trilha `delivery_events`.
--   2. Bucket privado `delivery-assets` SEM policy para anon/authenticated:
--      a escola vê a prévia por URLs assinadas de curta duração (Edge Function
--      `delivery-preview`) e o responsável acessa pelo W4 (`guardian-delivery`).
--   3. RPCs: `delivery_preflight` (motivos de bloqueio), `create_delivery_batch`
--      (congelamento transacional), `approve_delivery_batch` (revalida e
--      enfileira), `cancel_delivery_batch`, `retry_failed_delivery_render_jobs`,
--      `claim_delivery_render_jobs`, `complete_delivery_render_job`,
--      `delivery_batches_for_event` e `delivery_batch_detail` (projeções sem
--      telefone completo, sem token e sem caminho de objeto).
--   4. Realtime em `delivery_batches` (progresso sem dado do destinatário).
--
-- Regras de elegibilidade (spec §6.3 e §15.3):
--   - só entra foto com `photo_faces.state = 'confirmed'` do aluno;
--   - responsável precisa de número verificado E aceite `guardian_link`
--     ativo para cada aluno com fotos confirmadas;
--   - revisão com cara de aluno pendente (`suggested`) bloqueia o
--     destinatário: mandar antes de revisar perderia fotos para sempre,
--     porque a entrega é uma por responsável e evento;
--   - rosto sem atribuição (`unassigned`, sem aluno) é aviso global, não
--     bloqueio: ainda não dá para saber de quem é.
--
-- Não entra: envio, webhook de entrega e acesso do responsável (W4).
-- ------------------------------------------------------------

-- ============================================================
-- 1. Tabelas do lote
-- ============================================================

create table if not exists public.delivery_batches (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete cascade,
  event_id         uuid not null references public.events (id) on delete cascade,
  status           text not null default 'draft' check (status in (
                     'draft','preparing','awaiting_review','ready','queued',
                     'processing','completed','completed_with_errors','canceled')),
  terms_version    text not null,
  created_by       uuid not null references auth.users (id),
  approved_by      uuid references auth.users (id),
  approved_at      timestamptz,
  canceled_by      uuid references auth.users (id),
  canceled_at      timestamptz,
  recipient_count  int not null default 0,
  item_count       int not null default 0,
  rendered_count   int not null default 0,
  failed_count     int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
-- Um lote ativo por evento: o preflight trabalha sobre o estado atual, e
-- dois lotes simultâneos do mesmo evento competiriam pelos mesmos alunos.
create unique index if not exists delivery_batches_active_event_idx
  on public.delivery_batches (event_id)
  where status not in ('canceled','completed','completed_with_errors');
create index if not exists delivery_batches_school_idx
  on public.delivery_batches (school_id, created_at desc);

create table if not exists public.delivery_recipients (
  id                            uuid primary key default gen_random_uuid(),
  batch_id                      uuid not null references public.delivery_batches (id) on delete cascade,
  school_id                     uuid not null references public.schools (id) on delete cascade,
  -- Desnormalizado para a regra "uma entrega por responsável e evento"
  -- (spec §15.4) valer entre lotes diferentes.
  event_id                      uuid not null references public.events (id) on delete cascade,
  guardian_id                   uuid not null references public.guardians (id) on delete cascade,
  -- O servidor precisa transmitir ao provedor (W4); o cliente recebe só a
  -- versão mascarada por RPC.
  target_whatsapp               text not null check (target_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at_snapshot          timestamptz not null,
  status                        text not null default 'preparing' check (status in (
                                  'preparing','blocked','awaiting_review','ready','queued',
                                  'sending','accepted','sent','delivered','read',
                                  'failed','unknown','canceled','revoked','expired')),
  attempts                      int not null default 0,
  next_attempt_at               timestamptz,
  leased_until                  timestamptz,
  current_whatsapp_message_id   uuid references public.whatsapp_messages (id) on delete set null,
  last_error                    text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
-- Um destinatário ativo por (evento, responsável). Estados terminais ou
-- excludentes (cancelado, falho, revogado, vencido, bloqueado) liberam o
-- responsável para um lote futuro.
create unique index if not exists delivery_recipients_active_idx
  on public.delivery_recipients (event_id, guardian_id)
  where status not in ('blocked','failed','canceled','revoked','expired');
create index if not exists delivery_recipients_batch_idx
  on public.delivery_recipients (batch_id, status);

create table if not exists public.delivery_recipient_students (
  id                        uuid primary key default gen_random_uuid(),
  recipient_id              uuid not null references public.delivery_recipients (id) on delete cascade,
  student_id                uuid not null references public.students (id) on delete cascade,
  authorization_id          uuid not null references public.authorizations (id),
  terms_version_snapshot    text not null,
  authorization_accepted_at timestamptz not null,
  created_at                timestamptz not null default now(),
  unique (recipient_id, student_id)
);
create index if not exists delivery_recipient_students_student_idx
  on public.delivery_recipient_students (student_id);

create table if not exists public.delivery_items (
  id                 uuid primary key default gen_random_uuid(),
  recipient_id       uuid not null references public.delivery_recipients (id) on delete cascade,
  recipient_student_id uuid not null references public.delivery_recipient_students (id) on delete cascade,
  photo_id           uuid not null references public.photos (id) on delete cascade,
  asset_path         text,
  thumb_path         text,
  asset_hash         text,
  image_width        int,
  image_height       int,
  render_status      text not null default 'queued' check (render_status in ('queued','done','failed')),
  preview_reviewed_by uuid references auth.users (id) on delete set null,
  preview_reviewed_at timestamptz,
  retention_until    timestamptz,
  assets_purged_at   timestamptz,
  created_at         timestamptz not null default now(),
  unique (recipient_student_id, photo_id)
);
create index if not exists delivery_items_recipient_idx
  on public.delivery_items (recipient_id, render_status);
create index if not exists delivery_items_retention_idx
  on public.delivery_items (retention_until)
  where asset_path is not null and assets_purged_at is null;

create table if not exists public.delivery_render_jobs (
  id           bigint generated always as identity primary key,
  item_id      uuid not null unique references public.delivery_items (id) on delete cascade,
  batch_id     uuid not null references public.delivery_batches (id) on delete cascade,
  status       text not null default 'queued' check (status in ('queued','leased','done','failed')),
  attempts     int not null default 0,
  leased_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists delivery_render_jobs_claim_idx
  on public.delivery_render_jobs (status, id) where status in ('queued','leased');
create index if not exists delivery_render_jobs_batch_idx
  on public.delivery_render_jobs (batch_id, status);

create table if not exists public.delivery_access_sessions (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references public.delivery_recipients (id) on delete cascade,
  session_hash     text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists delivery_access_sessions_recipient_idx
  on public.delivery_access_sessions (recipient_id);

create table if not exists public.delivery_events (
  id           bigint generated always as identity primary key,
  school_id    uuid not null references public.schools (id) on delete cascade,
  batch_id     uuid references public.delivery_batches (id) on delete cascade,
  recipient_id uuid references public.delivery_recipients (id) on delete cascade,
  item_id      uuid references public.delivery_items (id) on delete set null,
  event_type   text not null check (event_type in (
                 'batch_created','batch_approved','batch_canceled','recipient_blocked',
                 'render_started','render_completed','render_failed','preview_approved',
                 'assets_purged',
                 'provider_accepted','provider_sent','provider_delivered','provider_read','provider_failed',
                 'access_opened','photo_downloaded','zip_downloaded',
                 'authorization_revoked','access_revoked')),
  detail       jsonb,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index if not exists delivery_events_batch_idx
  on public.delivery_events (batch_id, created_at desc);

-- `updated_at` nos três lugares que a operação mexe (touch_updated_at é do M1).
drop trigger if exists delivery_batches_touch_updated_at on public.delivery_batches;
create trigger delivery_batches_touch_updated_at
  before update on public.delivery_batches
  for each row execute function public.touch_updated_at();
drop trigger if exists delivery_recipients_touch_updated_at on public.delivery_recipients;
create trigger delivery_recipients_touch_updated_at
  before update on public.delivery_recipients
  for each row execute function public.touch_updated_at();
drop trigger if exists delivery_render_jobs_touch_updated_at on public.delivery_render_jobs;
create trigger delivery_render_jobs_touch_updated_at
  before update on public.delivery_render_jobs
  for each row execute function public.touch_updated_at();

-- Todo item nasce com um job de render: gerar o derivado é sempre necessário
-- antes de qualquer envio (spec §6.3, passo 5).
create or replace function public.delivery_items_enqueue_render()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
begin
  select r.batch_id into v_batch from public.delivery_recipients r where r.id = new.recipient_id;
  if v_batch is null then
    raise exception 'delivery item without recipient' using errcode = '23514';
  end if;
  insert into public.delivery_render_jobs (item_id, batch_id)
  values (new.id, v_batch)
  on conflict (item_id) do nothing;
  return new;
end;
$$;
revoke all on function public.delivery_items_enqueue_render() from public, anon, authenticated;
drop trigger if exists delivery_items_enqueue_render on public.delivery_items;
create trigger delivery_items_enqueue_render
  after insert on public.delivery_items
  for each row execute function public.delivery_items_enqueue_render();

-- ============================================================
-- 2. RLS e privilégios (spec §8.3)
-- ============================================================

alter table public.delivery_batches enable row level security;
drop policy if exists "delivery_batches_select" on public.delivery_batches;
create policy "delivery_batches_select" on public.delivery_batches
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());
revoke insert, update, delete on table public.delivery_batches from public, anon, authenticated;

-- Internas: RLS ligada e sem policy — só `service_role` e as RPCs definer.
alter table public.delivery_recipients enable row level security;
revoke all on table public.delivery_recipients from public, anon, authenticated;
alter table public.delivery_recipient_students enable row level security;
revoke all on table public.delivery_recipient_students from public, anon, authenticated;
alter table public.delivery_items enable row level security;
revoke all on table public.delivery_items from public, anon, authenticated;
alter table public.delivery_render_jobs enable row level security;
revoke all on table public.delivery_render_jobs from public, anon, authenticated;
alter table public.delivery_access_sessions enable row level security;
revoke all on table public.delivery_access_sessions from public, anon, authenticated;

-- Trilha: leitura pelo membro, escrita só por RPC/trigger.
alter table public.delivery_events enable row level security;
drop policy if exists "delivery_events_select" on public.delivery_events;
create policy "delivery_events_select" on public.delivery_events
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());
revoke insert, update, delete on table public.delivery_events from public, anon, authenticated;

-- ============================================================
-- 3. Bucket `delivery-assets` (spec §8.3: sem policy para o cliente)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-assets', 'delivery-assets', false, 20971520,
        array['image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 4. Realtime: só o lote (progresso sem dado do destinatário)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'delivery_batches'
  ) then
    alter publication supabase_realtime add table public.delivery_batches;
  end if;
end $$;

-- ============================================================
-- 5. Auxiliares
-- ============================================================

-- Telefone mascarado para as projeções da escola (spec §8.2). Nunca devolve
-- o número completo; E.164 mantém o DDI para a operação reconhecer o país.
create or replace function public.mask_phone_e164(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(v_digits) < 8 then return '•••'; end if;
  if length(v_digits) >= 12 then
    return '+' || substr(v_digits, 1, 2) || ' ' || substr(v_digits, 3, 2) || ' '
           || substr(v_digits, 5, 1) || '****-' || right(v_digits, 4);
  end if;
  return '•••-' || right(v_digits, 4);
end;
$$;
revoke all on function public.mask_phone_e164(text) from public, anon, authenticated;

-- Motivo de bloqueio de um destinatário, estável para a UI. Devolve null
-- quando o destinatário está apto.
create or replace function public.delivery_recipient_reason(
  p_guardian_id uuid,
  p_verified_at timestamptz,
  p_confirmed_total int,
  p_consent_ok boolean,
  p_has_pending boolean
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_guardian_id is null then 'sem_responsavel'
    when p_verified_at is null then 'numero_nao_verificado'
    when p_consent_ok is not true then 'sem_consentimento'
    when p_confirmed_total = 0 then 'sem_fotos'
    when p_has_pending then 'revisao_pendente'
    else null
  end;
$$;
revoke all on function public.delivery_recipient_reason(uuid, timestamptz, int, boolean, boolean)
  from public, anon, authenticated;

-- ============================================================
-- 6. delivery_preflight — o retrato antes de criar o lote
-- ============================================================

create or replace function public.delivery_preflight(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_result jsonb;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'event not found'; end if;
  if not (public.is_member_of(v_event.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  with scope as (
    select s.id, s.name, s.primary_guardian_id
      from public.students s
     where s.school_id = v_event.school_id
       and s.deleted_at is null
       and (v_event.class_id is null or s.class_id = v_event.class_id)
  ),
  confirmed as (
    select pf.student_id as sid, count(distinct pf.photo_id)::int as n
      from public.photo_faces pf
      join public.photos p on p.id = pf.photo_id
     where p.event_id = p_event_id and p.deleted_at is null
       and pf.state = 'confirmed' and pf.student_id is not null
     group by 1
  ),
  pending as (
    select pf.student_id as sid, count(*)::int as n
      from public.photo_faces pf
      join public.photos p on p.id = pf.photo_id
     where p.event_id = p_event_id and p.deleted_at is null
       and pf.state = 'suggested' and pf.student_id is not null
     group by 1
  ),
  latest_auth as (
    select distinct on (a.student_id) a.student_id as sid, a.evidence->>'source' as source
      from public.authorizations a
     where a.scope = 'delivery_whatsapp'
       and a.granted_at is not null and a.revoked_at is null
     order by a.student_id, a.granted_at desc
  ),
  cand as (
    select sc.id as student_id, sc.name, sc.primary_guardian_id,
           coalesce(c.n, 0) as confirmed_photos,
           coalesce(pd.n, 0) as pending_faces,
           az.source as consent_source
      from scope sc
      left join confirmed c on c.sid = sc.id
      left join pending pd on pd.sid = sc.id
      left join latest_auth az on az.sid = sc.id
     where coalesce(c.n, 0) > 0 or coalesce(pd.n, 0) > 0
  ),
  grouped as (
    select primary_guardian_id,
           sum(confirmed_photos) as confirmed_total,
           bool_or(pending_faces > 0) as has_pending,
           bool_and(confirmed_photos = 0 or coalesce(consent_source, '') = 'guardian_link') as consent_ok,
           jsonb_agg(jsonb_build_object(
             'student_id', student_id,
             'name', name,
             'confirmed_photos', confirmed_photos,
             'pending_faces', pending_faces,
             'consent_source', consent_source
           ) order by name) as students
      from cand
     group by primary_guardian_id
  ),
  guards as (
    select g.id, g.name, g.whatsapp, g.whatsapp_verified_at
      from public.guardians g
     where g.school_id = v_event.school_id and g.deleted_at is null
  ),
  recipients as (
    select jsonb_build_object(
      'guardian_id', gr.primary_guardian_id,
      'guardian_name', g.name,
      'phone_masked', public.mask_phone_e164(g.whatsapp),
      'verified', g.whatsapp_verified_at is not null,
      'eligible', public.delivery_recipient_reason(
        gr.primary_guardian_id, g.whatsapp_verified_at, gr.confirmed_total::int,
        gr.consent_ok, gr.has_pending) is null,
      'blocked_reason', public.delivery_recipient_reason(
        gr.primary_guardian_id, g.whatsapp_verified_at, gr.confirmed_total::int,
        gr.consent_ok, gr.has_pending),
      'students', gr.students
    ) as rec
      from grouped gr
      left join guards g on g.id = gr.primary_guardian_id
  )
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id, 'name', v_event.name, 'class_id', v_event.class_id),
    'unassigned_pending_faces', (
      select count(*)
        from public.photo_faces pf
        join public.photos p on p.id = pf.photo_id
       where p.event_id = p_event_id and p.deleted_at is null
         and pf.state in ('suggested','unassigned') and pf.student_id is null),
    'recipients', coalesce((select jsonb_agg(rec order by 1) from recipients), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.delivery_preflight(uuid) from public, anon;
grant execute on function public.delivery_preflight(uuid) to authenticated, service_role;

-- ============================================================
-- 7. create_delivery_batch — congela o lote e enfileira o render
-- ============================================================

create or replace function public.create_delivery_batch(
  p_event_id uuid,
  p_guardian_ids uuid[],
  p_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event       public.events%rowtype;
  v_uid         uuid := auth.uid();
  v_batch_id    uuid;
  v_recipient_id uuid;
  v_rs_id       uuid;
  v_guardian    record;
  v_student     record;
  v_guardian_students int;
  v_total_students    int := 0;
  v_items       int;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'event not found'; end if;
  if not public.is_member_of(v_event.school_id) then raise exception 'not allowed'; end if;
  if p_guardian_ids is null or array_length(p_guardian_ids, 1) is null then
    raise exception 'nenhum destinatário selecionado';
  end if;
  if p_terms_version is null or p_terms_version !~ '^[a-z0-9_.-]{1,40}$' then
    raise exception 'invalid terms version';
  end if;
  if exists (
    select 1 from public.delivery_batches
     where event_id = p_event_id
       and status not in ('canceled','completed','completed_with_errors')
  ) then
    raise exception 'já existe um lote ativo para este evento';
  end if;

  insert into public.delivery_batches (school_id, event_id, status, terms_version, created_by)
  values (v_event.school_id, p_event_id, 'preparing', p_terms_version, v_uid)
  returning id into v_batch_id;

  for v_guardian in
    select g.id, g.whatsapp, g.whatsapp_verified_at
      from public.guardians g
     where g.id = any(p_guardian_ids)
       and g.school_id = v_event.school_id
       and g.deleted_at is null
  loop
    if v_guardian.whatsapp_verified_at is null then
      raise exception 'destinatário sem número verificado';
    end if;

    v_guardian_students := 0;

    insert into public.delivery_recipients
      (batch_id, school_id, event_id, guardian_id, target_whatsapp, verified_at_snapshot, status)
    values
      (v_batch_id, v_event.school_id, p_event_id, v_guardian.id,
       v_guardian.whatsapp, v_guardian.whatsapp_verified_at, 'preparing')
    returning id into v_recipient_id;

    for v_student in
      select s.id as student_id,
             a.id as authorization_id,
             coalesce(a.evidence->>'termsVersion', p_terms_version) as terms_version,
             coalesce((a.evidence->>'acceptedAt')::timestamptz, a.granted_at) as accepted_at
        from public.students s
        join lateral (
          select a.id, a.granted_at, a.evidence
            from public.authorizations a
           where a.student_id = s.id
             and a.scope = 'delivery_whatsapp'
             and a.granted_at is not null
             and a.revoked_at is null
             and a.evidence->>'source' = 'guardian_link'
           order by a.granted_at desc
           limit 1
        ) a on true
       where s.school_id = v_event.school_id
         and s.deleted_at is null
         and s.primary_guardian_id = v_guardian.id
         and (v_event.class_id is null or s.class_id = v_event.class_id)
         and exists (
           select 1
             from public.photo_faces pf
             join public.photos p on p.id = pf.photo_id
            where p.event_id = p_event_id and p.deleted_at is null
              and pf.state = 'confirmed' and pf.student_id = s.id)
    loop
      insert into public.delivery_recipient_students
        (recipient_id, student_id, authorization_id, terms_version_snapshot,
         authorization_accepted_at)
      values
        (v_recipient_id, v_student.student_id, v_student.authorization_id,
         v_student.terms_version, v_student.accepted_at)
      returning id into v_rs_id;

      insert into public.delivery_items (recipient_id, recipient_student_id, photo_id)
      select v_recipient_id, v_rs_id, p.id
        from public.photos p
        join public.photo_faces pf
          on pf.photo_id = p.id
         and pf.state = 'confirmed'
         and pf.student_id = v_student.student_id
       where p.event_id = p_event_id and p.deleted_at is null
       group by p.id
      on conflict (recipient_student_id, photo_id) do nothing;

      v_guardian_students := v_guardian_students + 1;
      v_total_students := v_total_students + 1;
    end loop;

    if v_guardian_students = 0 then
      raise exception 'destinatário sem aluno elegível';
    end if;
  end loop;

  update public.delivery_batches b
     set recipient_count = (select count(*) from public.delivery_recipients where batch_id = v_batch_id),
         item_count      = (select count(*)
                              from public.delivery_items i
                              join public.delivery_recipients r on r.id = i.recipient_id
                             where r.batch_id = v_batch_id)
   where id = v_batch_id
   returning item_count into v_items;

  if v_items = 0 then
    raise exception 'lote sem fotos confirmadas';
  end if;

  insert into public.delivery_events (school_id, batch_id, event_type, detail, created_by)
  values (v_event.school_id, v_batch_id, 'batch_created',
          jsonb_build_object('recipient_count', v_total_students, 'item_count', v_items), v_uid);

  return v_batch_id;
end;
$$;
revoke all on function public.create_delivery_batch(uuid, uuid[], text) from public, anon;
grant execute on function public.create_delivery_batch(uuid, uuid[], text) to authenticated, service_role;

-- ============================================================
-- 8. approve_delivery_batch — revalida e enfileira (spec §6.3, §15.3)
-- ============================================================

-- Só `school_admin`/`school_staff` aprovam (D4). `dev`/`super_admin` sem
-- vínculo com a escola não aprovam em nome dela.
create or replace function public.approve_delivery_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_batch      public.delivery_batches%rowtype;
  v_role       text;
  v_rec        record;
  v_approved   int := 0;
  v_blocked    int := 0;
  v_reason     text;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'batch not found'; end if;

  select role into v_role from public.school_members
   where school_id = v_batch.school_id and user_id = v_uid;
  if v_role is null or v_role not in ('school_admin','school_staff') then
    raise exception 'somente a administração da escola aprova o lote';
  end if;
  if v_batch.status <> 'awaiting_review' then
    raise exception 'lote não está aguardando revisão';
  end if;

  for v_rec in
    select r.id
      from public.delivery_recipients r
     where r.batch_id = p_batch_id and r.status = 'ready'
     order by r.id
  loop
    v_reason := null;

    -- Número mudou ou verificação caiu desde o congelamento.
    if exists (
      select 1
        from public.delivery_recipients r
        join public.guardians g on g.id = r.guardian_id
       where r.id = v_rec.id
         and (g.deleted_at is not null
              or g.whatsapp is distinct from r.target_whatsapp
              or g.whatsapp_verified_at is null)
    ) then
      v_reason := 'number_unverified';
    end if;

    -- Aceite revogado desde o congelamento.
    if v_reason is null and exists (
      select 1
        from public.delivery_recipient_students rs
        join public.authorizations a on a.id = rs.authorization_id
       where rs.recipient_id = v_rec.id
         and (a.revoked_at is not null or a.granted_at is null
              or a.evidence->>'source' <> 'guardian_link')
    ) then
      v_reason := 'authorization_revoked';
    end if;

    -- Derivado pendente ou falho: o lote não sai sem a versão final.
    if v_reason is null and exists (
      select 1 from public.delivery_items i
       where i.recipient_id = v_rec.id and i.render_status <> 'done'
    ) then
      v_reason := 'render_incomplete';
    end if;

    if v_reason is not null then
      update public.delivery_recipients
         set status = 'blocked', last_error = v_reason
       where id = v_rec.id;
      insert into public.delivery_events (school_id, batch_id, recipient_id, event_type, detail, created_by)
      values (v_batch.school_id, p_batch_id, v_rec.id, 'recipient_blocked',
              jsonb_build_object('reason', v_reason), v_uid);
      v_blocked := v_blocked + 1;
    else
      update public.delivery_recipients set status = 'queued' where id = v_rec.id;
      v_approved := v_approved + 1;
    end if;
  end loop;

  if v_approved = 0 then
    return jsonb_build_object('approved', 0, 'blocked', v_blocked);
  end if;

  -- Aprovação é o ato de revisão da versão final (spec §15.3): a pessoa que
  -- aprovou fica gravada item a item.
  update public.delivery_items i
     set preview_reviewed_by = v_uid,
         preview_reviewed_at = now()
    from public.delivery_recipients r
   where r.id = i.recipient_id
     and r.batch_id = p_batch_id
     and r.status = 'queued'
     and i.render_status = 'done';

  update public.delivery_batches
     set status = 'queued', approved_by = v_uid, approved_at = now()
   where id = p_batch_id;

  insert into public.delivery_events (school_id, batch_id, event_type, detail, created_by)
  values (v_batch.school_id, p_batch_id, 'batch_approved',
          jsonb_build_object('approved', v_approved, 'blocked', v_blocked), v_uid),
         (v_batch.school_id, p_batch_id, 'preview_approved',
          jsonb_build_object('approved', v_approved), v_uid);

  return jsonb_build_object('approved', v_approved, 'blocked', v_blocked);
end;
$$;
revoke all on function public.approve_delivery_batch(uuid) from public, anon;
grant execute on function public.approve_delivery_batch(uuid) to authenticated, service_role;

-- ============================================================
-- 9. cancel_delivery_batch
-- ============================================================

create or replace function public.cancel_delivery_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_batch   public.delivery_batches%rowtype;
  v_role    text;
  v_paths   text[];
  v_jobs    int;
  v_recips  int;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'batch not found'; end if;
  select role into v_role from public.school_members
   where school_id = v_batch.school_id and user_id = v_uid;

  if v_batch.created_by <> v_uid
     and (v_role is null or v_role not in ('school_admin','school_staff')) then
    raise exception 'sem permissão para cancelar este lote';
  end if;
  if v_batch.status in ('canceled','completed','completed_with_errors') then
    raise exception 'lote já encerrado';
  end if;
  -- Depois de transmitido não há cancelamento (spec §15.4); no W3 nenhum
  -- destinatário chega a esses estados.
  if exists (
    select 1 from public.delivery_recipients
     where batch_id = p_batch_id
       and status in ('sending','accepted','sent','delivered','read')
  ) then
    raise exception 'não é possível cancelar após o início do envio';
  end if;

  update public.delivery_render_jobs
     set status = 'failed', leased_until = null, last_error = 'batch_canceled'
   where batch_id = p_batch_id and status in ('queued','leased');
  get diagnostics v_jobs = row_count;

  select array_agg(path) into v_paths
    from (
      select asset_path as path from public.delivery_items i
        join public.delivery_recipients r on r.id = i.recipient_id
       where r.batch_id = p_batch_id and i.asset_path is not null
      union
      select thumb_path from public.delivery_items i
        join public.delivery_recipients r on r.id = i.recipient_id
       where r.batch_id = p_batch_id and i.thumb_path is not null
    ) paths;

  if v_paths is not null and array_length(v_paths, 1) > 0 then
    perform public.enqueue_storage_purge('delivery-assets', v_paths, 'delivery_batch_canceled', v_batch.school_id);
    update public.delivery_items i
       set assets_purged_at = now()
      from public.delivery_recipients r
     where r.id = i.recipient_id and r.batch_id = p_batch_id
       and (i.asset_path is not null or i.thumb_path is not null);
  end if;

  update public.delivery_recipients
     set status = 'canceled'
   where batch_id = p_batch_id
     and status in ('preparing','awaiting_review','ready','queued');
  get diagnostics v_recips = row_count;

  update public.delivery_batches
     set status = 'canceled', canceled_at = now(), canceled_by = v_uid
   where id = p_batch_id;

  insert into public.delivery_events (school_id, batch_id, event_type, detail, created_by)
  values (v_batch.school_id, p_batch_id, 'batch_canceled',
          jsonb_build_object('recipients', v_recips, 'render_jobs', v_jobs), v_uid);

  return jsonb_build_object('canceled_recipients', v_recips, 'canceled_jobs', v_jobs);
end;
$$;
revoke all on function public.cancel_delivery_batch(uuid) from public, anon;
grant execute on function public.cancel_delivery_batch(uuid) to authenticated, service_role;

-- ============================================================
-- 10. Fila de render: claim, conclusão e retry (padrão do M3)
-- ============================================================

create or replace function public.claim_delivery_render_jobs(
  p_limit int,
  p_lease_seconds int
)
returns setof public.delivery_render_jobs
language sql
security definer
set search_path = public
as $$
  with c as (
    select j.id
      from public.delivery_render_jobs j
      join public.delivery_batches b on b.id = j.batch_id
     where (j.status = 'queued' or (j.status = 'leased' and j.leased_until < now()))
       and j.attempts < 5
       and b.status = 'preparing'
     order by j.id
     limit p_limit
     for update of j skip locked
  )
  update public.delivery_render_jobs j
     set status = 'leased',
         attempts = j.attempts + 1,
         leased_until = now() + make_interval(secs => p_lease_seconds)
    from c
   where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_delivery_render_jobs(int, int) from public, anon, authenticated;
grant execute on function public.claim_delivery_render_jobs(int, int) to service_role;

-- Devolve 'done' | 'failed' | 'requeued' | 'noop' | 'missing', como
-- `complete_photo_job`. `retention_until` = 7 dias (spec §11.3, provisório).
create or replace function public.complete_delivery_render_job(
  p_job_id     bigint,
  p_ok         boolean,
  p_error      text default null,
  p_asset_path text default null,
  p_thumb_path text default null,
  p_asset_hash text default null,
  p_width      int default null,
  p_height     int default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job    public.delivery_render_jobs%rowtype;
  v_item   public.delivery_items%rowtype;
  v_result text;
  v_error  text := left(p_error, 2000);
begin
  select * into v_job from public.delivery_render_jobs where id = p_job_id for update;
  if not found then return 'missing'; end if;
  if v_job.status <> 'leased' then return 'noop'; end if;
  -- Serializa as conclusões do mesmo lote: sem este lock, dois jobs que
  -- terminam juntos recalculam contadores sem ver o item um do outro e o
  -- lote pode ir para `awaiting_review` com `rendered_count` defasado.
  perform 1 from public.delivery_batches where id = v_job.batch_id for update;
  select * into v_item from public.delivery_items where id = v_job.item_id;

  if p_ok then
    update public.delivery_render_jobs
       set status = 'done', leased_until = null, last_error = null
     where id = p_job_id;
    update public.delivery_items
       set render_status = 'done',
           asset_path   = p_asset_path,
           thumb_path   = p_thumb_path,
           asset_hash   = p_asset_hash,
           image_width  = p_width,
           image_height = p_height,
           retention_until = now() + interval '7 days'
     where id = v_job.item_id;
    insert into public.delivery_events (school_id, batch_id, recipient_id, item_id, event_type, detail)
    select b.school_id, v_job.batch_id, v_item.recipient_id, v_job.item_id,
           'render_completed', jsonb_build_object('item_id', v_job.item_id)
      from public.delivery_batches b where b.id = v_job.batch_id;
    v_result := 'done';

  elsif v_job.attempts >= 5 then
    update public.delivery_render_jobs
       set status = 'failed', leased_until = null, last_error = v_error
     where id = p_job_id;
    update public.delivery_items set render_status = 'failed' where id = v_job.item_id;
    insert into public.delivery_events (school_id, batch_id, recipient_id, item_id, event_type, detail)
    select b.school_id, v_job.batch_id, v_item.recipient_id, v_job.item_id,
           'render_failed', jsonb_build_object('error', v_error)
      from public.delivery_batches b where b.id = v_job.batch_id;
    v_result := 'failed';

  else
    update public.delivery_render_jobs
       set status = 'queued', leased_until = null, last_error = v_error
     where id = p_job_id;
    v_result := 'requeued';
  end if;

  -- Contadores e transições do lote/destinatários.
  update public.delivery_batches b
     set rendered_count = (
           select count(*)
             from public.delivery_items i
             join public.delivery_recipients r on r.id = i.recipient_id
            where r.batch_id = b.id and i.render_status = 'done'),
         failed_count = (
           select count(*)
             from public.delivery_items i
             join public.delivery_recipients r on r.id = i.recipient_id
            where r.batch_id = b.id and i.render_status = 'failed')
   where b.id = v_job.batch_id;

  update public.delivery_recipients r
     set status = 'ready'
   where r.batch_id = v_job.batch_id
     and r.status = 'preparing'
     and exists (select 1 from public.delivery_items i
                  where i.recipient_id = r.id and i.render_status = 'done')
     and not exists (select 1 from public.delivery_items i
                      where i.recipient_id = r.id
                        and i.render_status in ('queued','failed'));

  if not exists (
    select 1 from public.delivery_render_jobs
     where batch_id = v_job.batch_id and status in ('queued','leased')
  ) and not exists (
    select 1
      from public.delivery_items i
      join public.delivery_recipients r on r.id = i.recipient_id
     where r.batch_id = v_job.batch_id and i.render_status = 'failed'
  ) then
    update public.delivery_batches
       set status = 'awaiting_review'
     where id = v_job.batch_id and status = 'preparing';
  end if;

  return v_result;
end;
$$;
revoke all on function public.complete_delivery_render_job(bigint, boolean, text, text, text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.complete_delivery_render_job(bigint, boolean, text, text, text, text, int, int)
  to service_role;

create or replace function public.retry_failed_delivery_render_jobs(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch public.delivery_batches%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id;
  if not found then raise exception 'batch not found'; end if;
  if not public.is_member_of(v_batch.school_id) then raise exception 'not allowed'; end if;

  update public.delivery_render_jobs
     set status = 'queued', attempts = 0, leased_until = null, last_error = null
   where batch_id = p_batch_id and status = 'failed';
  get diagnostics v_count = row_count;

  update public.delivery_items i
     set render_status = 'queued'
    from public.delivery_recipients r
   where r.id = i.recipient_id
     and r.batch_id = p_batch_id
     and i.render_status = 'failed';

  if v_count > 0 then
    update public.delivery_batches set status = 'preparing' where id = p_batch_id;
  end if;
  return v_count;
end;
$$;
revoke all on function public.retry_failed_delivery_render_jobs(uuid) from public, anon;
grant execute on function public.retry_failed_delivery_render_jobs(uuid) to authenticated, service_role;

-- ============================================================
-- 11. Projeções para a tela (sem telefone completo nem caminho)
-- ============================================================

create or replace function public.delivery_batches_for_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_result jsonb;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'event not found'; end if;
  if not (public.is_member_of(v_event.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select coalesce(jsonb_agg(batch order by batch->>'created_at' desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', b.id,
        'status', b.status,
        'terms_version', b.terms_version,
        'recipient_count', b.recipient_count,
        'item_count', b.item_count,
        'rendered_count', b.rendered_count,
        'failed_count', b.failed_count,
        'created_at', b.created_at,
        'approved_at', b.approved_at,
        'canceled_at', b.canceled_at,
        'recipients_by_status', (
          select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
            from (
              select status, count(*) as n
                from public.delivery_recipients
               where batch_id = b.id
               group by status
            ) s)
      ) as batch
        from public.delivery_batches b
       where b.event_id = p_event_id
    ) sub;
  return v_result;
end;
$$;
revoke all on function public.delivery_batches_for_event(uuid) from public, anon;
grant execute on function public.delivery_batches_for_event(uuid) to authenticated, service_role;

create or replace function public.delivery_batch_detail(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batch public.delivery_batches%rowtype;
  v_result jsonb;
begin
  select * into v_batch from public.delivery_batches where id = p_batch_id;
  if not found then raise exception 'batch not found'; end if;
  if not (public.is_member_of(v_batch.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'event_id', v_batch.event_id,
      'status', v_batch.status,
      'terms_version', v_batch.terms_version,
      'recipient_count', v_batch.recipient_count,
      'item_count', v_batch.item_count,
      'rendered_count', v_batch.rendered_count,
      'failed_count', v_batch.failed_count,
      'created_at', v_batch.created_at,
      'approved_at', v_batch.approved_at,
      'canceled_at', v_batch.canceled_at),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'guardian_name', g.name,
        'phone_masked', public.mask_phone_e164(r.target_whatsapp),
        'status', r.status,
        'last_error', r.last_error,
        'students', (
          select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
            from public.delivery_recipient_students rs
            join public.students s on s.id = rs.student_id
           where rs.recipient_id = r.id),
        'items_total', (select count(*) from public.delivery_items i where i.recipient_id = r.id),
        'items_rendered', (select count(*) from public.delivery_items i
                            where i.recipient_id = r.id and i.render_status = 'done'),
        'items_failed', (select count(*) from public.delivery_items i
                          where i.recipient_id = r.id and i.render_status = 'failed')
      ) order by g.name)
        from public.delivery_recipients r
        join public.guardians g on g.id = r.guardian_id
       where r.batch_id = p_batch_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.delivery_batch_detail(uuid) from public, anon;
grant execute on function public.delivery_batch_detail(uuid) to authenticated, service_role;

-- ============================================================
-- 12. Expurgo dos derivados vencidos (7 dias, spec §11.3)
-- ============================================================

-- Agendada pelo `pg_cron` na migration de operação do W3/W5; aqui já existe
-- como função para o ensaio e para o cron do projeto.
create or replace function public.enqueue_expired_delivery_assets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_paths text[];
begin
  select count(*), array_agg(p) into v_count, v_paths
    from (
      select i.asset_path as p
        from public.delivery_items i
       where i.asset_path is not null
         and i.assets_purged_at is null
         and i.retention_until is not null
         and i.retention_until <= now()
      union
      select i.thumb_path
        from public.delivery_items i
       where i.thumb_path is not null
         and i.assets_purged_at is null
         and i.retention_until is not null
         and i.retention_until <= now()
    ) expired;

  if coalesce(v_count, 0) = 0 then return 0; end if;

  perform public.enqueue_storage_purge('delivery-assets', v_paths, 'delivery_retention', null);
  update public.delivery_items i
     set assets_purged_at = now()
   where i.asset_path is not null
     and i.assets_purged_at is null
     and i.retention_until is not null
     and i.retention_until <= now();

  insert into public.delivery_events (school_id, event_type, detail)
  select distinct r.school_id, 'assets_purged', jsonb_build_object('paths', v_count)
    from public.delivery_items i
    join public.delivery_recipients r on r.id = i.recipient_id
   where i.assets_purged_at is not null
     and i.retention_until is not null
     and i.retention_until <= now()
     and i.assets_purged_at >= now() - interval '1 minute';
  return v_count;
end;
$$;
revoke all on function public.enqueue_expired_delivery_assets() from public, anon, authenticated;
grant execute on function public.enqueue_expired_delivery_assets() to service_role;
