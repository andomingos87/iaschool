-- Fixture sintético mínimo EXCLUSIVO local. Não é schema de produção.
-- Tipo extensions.vector substituído por real[]; reconhecimento não exercitado.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage; create schema extensions;
create domain extensions.vector as real[];
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.schools(id uuid primary key default gen_random_uuid(),name text,deleted_at timestamptz);
create table public.school_members(school_id uuid,user_id uuid,role text,primary key(school_id,user_id));
create function public.is_member_of(uuid) returns boolean language sql stable as $$select exists(select 1 from public.school_members where school_id=$1 and user_id=auth.uid())$$;
create function public.is_super_admin() returns boolean language sql stable as $$select false$$;
create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create table public.guardians(id uuid primary key default gen_random_uuid(),school_id uuid,whatsapp text,whatsapp_verified_at timestamptz,name text,deleted_at timestamptz);
create table public.students(id uuid primary key default gen_random_uuid(),school_id uuid,class_id uuid,primary_guardian_id uuid,name text,deleted_at timestamptz);
create table public.events(id uuid primary key default gen_random_uuid(),school_id uuid,class_id uuid,name text,event_date date,deleted_at timestamptz);
create table public.authorizations(id uuid primary key default gen_random_uuid(),school_id uuid,student_id uuid,guardian_id uuid,scope text,granted_at timestamptz,revoked_at timestamptz,evidence jsonb);
create table public.photos(id uuid primary key default gen_random_uuid(),school_id uuid,event_id uuid,storage_path text,width int,height int,created_at timestamptz default now(),deleted_at timestamptz);
create table public.photo_faces(id uuid primary key default gen_random_uuid(),school_id uuid,photo_id uuid,student_id uuid,state text,bbox jsonb,reviewed_by uuid,reviewed_at timestamptz);
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  purpose text not null check (purpose in ('guardian_otp', 'guardian_consent', 'delivery_ready')),
  template_version text not null,
  provider text not null check (provider in ('zapi', 'meta')),
  status text not null check (status in ('reserved', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  phone_e164 text not null,
  provider_message_id text,
  provider_zaap_id text,
  provider_instance_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_school_created_idx
  on public.whatsapp_messages (school_id, created_at desc);
create unique index if not exists whatsapp_messages_provider_id_idx
  on public.whatsapp_messages (provider, provider_message_id)
  where provider_message_id is not null;
alter table public.whatsapp_messages enable row level security;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_message_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider, provider_message_id, status, occurred_at)
);
alter table public.whatsapp_webhook_events enable row level security;


create table public.whatsapp_controlled_settings(school_id uuid primary key,enabled boolean,kill_switch boolean,daily_limit int);
create table public.whatsapp_controlled_allowlist(school_id uuid,phone_e164 text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
create publication supabase_realtime;
create table if not exists public.storage_purge_queue (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  path       text not null,
  reason     text,
  school_id  uuid references public.schools (id) on delete set null,
  status     text not null default 'queued' check (status in ('queued','leased','done','failed')),
  attempts   int  not null default 0,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists spq_ready_idx on public.storage_purge_queue (status, id)
  where status in ('queued','leased');

-- RLS ligada e sem policy: igual a `photo_jobs`. Só `service_role` e RPC.
alter table public.storage_purge_queue enable row level security;
revoke all on table public.storage_purge_queue from public, anon, authenticated;

create or replace function public.enqueue_storage_purge(
  p_bucket text,
  p_paths  text[],
  p_reason text default null,
  p_school uuid default null
) returns int
language sql security definer set search_path = public as $$
  with novos as (
    insert into public.storage_purge_queue (bucket, path, reason, school_id)
    select p_bucket, p, p_reason, p_school
      from unnest(coalesce(p_paths, '{}'::text[])) as p
     where p is not null and p <> ''
    on conflict (bucket, path) do nothing
    returning 1
  )
  select count(*)::int from novos;
$$;
revoke all on function public.enqueue_storage_purge(text, text[], text, uuid)
  from public, anon, authenticated;


create or replace function public.reserve_whatsapp_send(
  p_guardian_id uuid,
  p_purpose text,
  p_instance_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guardian public.guardians%rowtype;
  v_setting public.whatsapp_controlled_settings%rowtype;
  v_count integer;
  v_id uuid;
  v_today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_purpose not in ('guardian_otp', 'guardian_consent', 'delivery_ready') then
    raise exception 'invalid purpose';
  end if;
  if p_instance_id is null or length(p_instance_id) > 120 then
    raise exception 'provider instance unavailable';
  end if;
  select * into v_guardian from public.guardians
   where id = p_guardian_id and deleted_at is null;
  if not found or v_guardian.whatsapp is null then raise exception 'guardian unavailable'; end if;

  select * into v_setting from public.whatsapp_controlled_settings
   where school_id = v_guardian.school_id for update;
  if not found or not v_setting.enabled or v_setting.kill_switch then
    raise exception 'whatsapp paused';
  end if;
  if (select count(*) from public.whatsapp_controlled_settings where enabled) <> 1 then
    raise exception 'controlled school configuration invalid';
  end if;
  -- OTP e o pedido de aceite seguem o número atual do responsável. Trocar o
  -- WhatsApp no cadastro cria outra linha em guardians; a allowlist não pode
  -- continuar presa ao número antigo. Sai quem não é mais responsável
  -- principal de nenhum aluno, e o número novo ocupa o lugar. O teto segue
  -- em 4. Entrega de foto não entra aqui: continua exigindo a lista.
  if p_purpose in ('guardian_otp', 'guardian_consent')
     and not exists (
       select 1 from public.whatsapp_controlled_allowlist
        where school_id = v_guardian.school_id
          and phone_e164 = v_guardian.whatsapp
     ) then
    delete from public.whatsapp_controlled_allowlist a
     where a.school_id = v_guardian.school_id
       and not exists (
         select 1
           from public.students s
           join public.guardians g on g.id = s.primary_guardian_id
          where s.school_id = a.school_id
            and s.deleted_at is null
            and g.deleted_at is null
            and g.whatsapp = a.phone_e164
       );
    insert into public.whatsapp_controlled_allowlist (school_id, phone_e164)
    values (v_guardian.school_id, v_guardian.whatsapp);
  end if;
  if not exists (
    select 1 from public.whatsapp_controlled_allowlist
     where school_id = v_guardian.school_id and phone_e164 = v_guardian.whatsapp
  ) then raise exception 'recipient not allowlisted'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_guardian.school_id::text || ':' || v_guardian.whatsapp, 0));
  select count(*) into v_count from public.whatsapp_messages
   where school_id = v_guardian.school_id and created_at >= v_today;
  if v_count >= v_setting.daily_limit then raise exception 'daily limit reached'; end if;

  if p_purpose = 'guardian_otp' then
    select count(*) into v_count from public.whatsapp_messages
     where phone_e164 = v_guardian.whatsapp and purpose = 'guardian_otp'
       and created_at >= now() - interval '1 hour';
    if v_count >= 5 then raise exception 'otp hourly limit reached'; end if;
    select count(*) into v_count from public.whatsapp_messages
     where phone_e164 = v_guardian.whatsapp and purpose = 'guardian_otp'
       and created_at >= v_today;
    if v_count >= 10 then raise exception 'otp daily limit reached'; end if;
    if exists (select 1 from public.whatsapp_messages
      where phone_e164 = v_guardian.whatsapp and purpose = 'guardian_otp'
        and created_at >= now() - interval '60 seconds') then
      raise exception 'otp cooldown';
    end if;
  elsif v_guardian.whatsapp_verified_at is null then
    raise exception 'recipient not verified';
  end if;

  insert into public.whatsapp_messages
    (school_id, guardian_id, purpose, template_version, provider, status, phone_e164, provider_instance_id)
  values
    (v_guardian.school_id, v_guardian.id, p_purpose,
     case p_purpose when 'guardian_otp' then 'guardian_otp.v1' when 'guardian_consent' then 'guardian_consent.v1' else 'delivery_ready.v1' end,
     'zapi', 'reserved', v_guardian.whatsapp,
     p_instance_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_whatsapp_send(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_send(uuid, text, text) to service_role;

create or replace function public.complete_whatsapp_send(
  p_message_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_provider_zaap_id text default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('accepted', 'failed', 'unknown') then raise exception 'invalid status'; end if;
  update public.whatsapp_messages set
    status = p_status,
    provider_message_id = p_provider_message_id,
    provider_zaap_id = p_provider_zaap_id,
    error_code = left(p_error_code, 80),
    updated_at = now()
   where id = p_message_id and status = 'reserved';
  if not found then raise exception 'message reservation unavailable'; end if;
end;
$$;
revoke all on function public.complete_whatsapp_send(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_whatsapp_send(uuid, text, text, text, text) to service_role;

create or replace function public.record_whatsapp_provider_status(
  p_provider_message_id text,
  p_status text,
  p_phone text,
  p_instance_id text,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.whatsapp_messages%rowtype;
  v_status text;
  v_old_rank integer;
  v_new_rank integer;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return false; end if;
  if p_occurred_at is null then return false; end if;
  select * into v_message from public.whatsapp_messages
   where provider = 'zapi'
     and provider_message_id = p_provider_message_id
     and phone_e164 = '+' || p_phone
     and provider_instance_id = p_instance_id
   for update;
  if not found then return false; end if;

  insert into public.whatsapp_webhook_events
    (provider, provider_message_id, status, occurred_at)
  values ('zapi', p_provider_message_id, p_status, p_occurred_at)
  on conflict do nothing;
  if not found then return true; end if;

  v_status := v_message.status;
  v_old_rank := case v_status when 'reserved' then -1 when 'accepted' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else -2 end;
  v_new_rank := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else -2 end;
  if v_new_rank > v_old_rank then
    update public.whatsapp_messages set status = p_status, updated_at = now()
     where id = v_message.id;
  end if;
  return true;
end;
$$;
revoke all on function public.record_whatsapp_provider_status(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_whatsapp_provider_status(text, text, text, text, timestamptz) to service_role;


-- Referências: os campos e guards são os reais de fase3-authorizations-reference-faces.sql.
create function public.reference_retention_default() returns date language sql stable as $$select make_date(extract(year from current_date)::int,12,31)$$;
create table public.student_reference_faces(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,embedding extensions.vector not null,source_photo_path text,quality real,
 authorization_id uuid not null references public.authorizations(id),retention_until date not null default public.reference_retention_default(),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.student_reference_jobs(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,authorization_id uuid not null references public.authorizations(id),
 storage_path text not null unique,created_by uuid not null references auth.users(id),status text not null default 'queued' check(status in('queued','leased','done','failed')),
 attempts int not null default 0,leased_until timestamptz,last_error text,reference_face_id uuid references public.student_reference_faces(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create or replace function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;
create or replace function public.photos_restrict_client_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
begin
  if auth.role() is distinct from 'authenticated'
     or current_setting('iaschool.photos_rpc', true) = 'rpc' then
    return new;
  end if;
  v_deleted_at := new.deleted_at;
  new := old;
  new.deleted_at := v_deleted_at;
  return new;
end;
$$;
create trigger photos_restrict_client_update before update on public.photos for each row execute function public.photos_restrict_client_update();


create or replace function public.has_active_authorization(p_student uuid, p_scope text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.authorizations a
      join public.students s on s.id = a.student_id
     where a.student_id = p_student
       and a.scope = p_scope
       and a.granted_at is not null
       and a.revoked_at is null
       -- 'postgres' é a conexão direta (migração, expurgo, ensaio).
       and (coalesce(auth.role(), 'postgres') in ('service_role', 'postgres')
            or public.is_member_of(s.school_id)
            or public.is_super_admin())
  );
$$;
revoke all on function public.has_active_authorization(uuid, text) from public, anon;
grant execute on function public.has_active_authorization(uuid, text) to authenticated, service_role;
create or replace function public.student_reference_faces_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student_school uuid;
  v_auth           public.authorizations%rowtype;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  if v_student_school is null or v_student_school <> new.school_id then
    raise exception 'reference school_id must match student school_id'
      using errcode = '23514';
  end if;

  select * into v_auth from public.authorizations where id = new.authorization_id;
  if v_auth.id is null
     or v_auth.student_id <> new.student_id
     or v_auth.scope <> 'biometric_sorting'
     or v_auth.granted_at is null
     or v_auth.revoked_at is not null then
    raise exception 'reference requires an active biometric_sorting authorization for the student'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.student_reference_faces_check() from public, anon, authenticated;

drop trigger if exists student_reference_faces_check on public.student_reference_faces;
create trigger student_reference_faces_check
  before insert or update on public.student_reference_faces
  for each row execute function public.student_reference_faces_check();

-- RLS ligada e sem policy: igual a photo_jobs e guardian_verification_codes.
-- O vetor biométrico não sai por consulta de cliente, nem com token válido.
alter table public.student_reference_faces enable row level security;
revoke all on table public.student_reference_faces from public, anon, authenticated;


create or replace function public.student_reference_jobs_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student_school uuid;
  v_auth           public.authorizations%rowtype;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  if v_student_school is null or v_student_school <> new.school_id then
    raise exception 'reference job school_id must match student school_id'
      using errcode = '23514';
  end if;

  select * into v_auth from public.authorizations where id = new.authorization_id;
  if v_auth.id is null
     or v_auth.student_id <> new.student_id
     or v_auth.scope <> 'biometric_sorting'
     or v_auth.granted_at is null
     or v_auth.revoked_at is not null then
    raise exception 'reference job requires an active biometric_sorting authorization for the student'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.student_reference_jobs_check() from public, anon, authenticated;

drop trigger if exists student_reference_jobs_check on public.student_reference_jobs;
create trigger student_reference_jobs_check
  before insert on public.student_reference_jobs
  for each row execute function public.student_reference_jobs_check();


create or replace function public.claim_student_reference_jobs(
  p_limit int, p_lease_seconds int
) returns setof public.student_reference_jobs
language sql security definer set search_path = public as $$
  with c as (
    select id from public.student_reference_jobs
    where (status = 'queued' or (status = 'leased' and leased_until < now()))
      and attempts < 5
    order by id
    limit p_limit
    for update skip locked
  )
  update public.student_reference_jobs j
     set status = 'leased',
         attempts = j.attempts + 1,
         leased_until = now() + make_interval(secs => p_lease_seconds)
    from c where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_student_reference_jobs(int,int) from public, anon, authenticated;
grant execute on function public.claim_student_reference_jobs(int,int) to service_role;

