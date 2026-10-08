-- Referência da fundação WhatsApp Z0/Z1. Aplicar somente como migration
-- aprovada pelo marco; este arquivo não foi aplicado ao projeto remoto.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.whatsapp_controlled_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled boolean not null default false,
  kill_switch boolean not null default true,
  daily_limit integer not null default 40 check (daily_limit between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_controlled_settings enable row level security;
create unique index if not exists whatsapp_one_enabled_school_idx
  on public.whatsapp_controlled_settings ((enabled)) where enabled;

create table if not exists public.whatsapp_controlled_allowlist (
  school_id uuid not null references public.schools(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  primary key (school_id, phone_e164)
);
alter table public.whatsapp_controlled_allowlist enable row level security;

create or replace function public.guard_whatsapp_allowlist_size()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.whatsapp_controlled_settings where school_id = new.school_id for update;
  if not found then raise exception 'controlled school is not configured'; end if;
  if (select count(*) from public.whatsapp_controlled_allowlist where school_id = new.school_id) >= 4 then
    raise exception 'controlled allowlist limit reached';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_whatsapp_allowlist_size() from public, anon, authenticated;
drop trigger if exists guard_whatsapp_allowlist_size on public.whatsapp_controlled_allowlist;
create trigger guard_whatsapp_allowlist_size before insert on public.whatsapp_controlled_allowlist
for each row execute function public.guard_whatsapp_allowlist_size();

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

-- Descarta todo código legado/simulado e armazena só hashes lentos e salgados.
delete from public.guardian_verification_codes;
alter table public.guardian_verification_codes add column if not exists code_hash text;
alter table public.guardian_verification_codes add column if not exists phone_hash text;
alter table public.guardian_verification_codes drop column code;
alter table public.guardian_verification_codes alter column code_hash set not null;
alter table public.guardian_verification_codes alter column phone_hash set not null;

create or replace function public.invalidate_guardian_whatsapp_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.guardian_verification_codes where guardian_id = new.id;
  update public.whatsapp_messages set status = 'failed', error_code = 'guardian_phone_changed', updated_at = now()
   where guardian_id = new.id and status = 'reserved';
  return new;
end;
$$;
revoke all on function public.invalidate_guardian_whatsapp_pending() from public, anon, authenticated;
drop trigger if exists invalidate_guardian_whatsapp_pending on public.guardians;
create trigger invalidate_guardian_whatsapp_pending after update of whatsapp on public.guardians
for each row when (old.whatsapp is distinct from new.whatsapp)
execute function public.invalidate_guardian_whatsapp_pending();

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

create or replace function public.create_guardian_verification_code(
  p_guardian_id uuid,
  p_code text,
  p_phone_e164 text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code !~ '^[0-9]{6}$' or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '11 minutes' then
    raise exception 'invalid verification code';
  end if;
  if not exists (select 1 from public.guardians where id = p_guardian_id
      and whatsapp = p_phone_e164 and deleted_at is null) then
    raise exception 'guardian phone changed';
  end if;
  insert into public.guardian_verification_codes (guardian_id, code_hash, phone_hash, expires_at, attempts, created_at)
  values (p_guardian_id,
          extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
          extensions.crypt(p_phone_e164, extensions.gen_salt('bf', 10)),
          p_expires_at, 0, now())
  on conflict (guardian_id) do update set
    code_hash = excluded.code_hash,
    phone_hash = excluded.phone_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    created_at = now();
end;
$$;
revoke all on function public.create_guardian_verification_code(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_guardian_verification_code(uuid, text, text, timestamptz) to service_role;

drop function if exists public.confirm_guardian_code(uuid, text);
create function public.confirm_guardian_code(p_guardian_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.guardian_verification_codes%rowtype;
  v_school uuid;
  v_phone text;
begin
  select school_id, whatsapp into v_school, v_phone from public.guardians
   where id = p_guardian_id and deleted_at is null;
  if v_school is null then raise exception 'guardian not found'; end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then raise exception 'not allowed'; end if;
  select * into v_row from public.guardian_verification_codes where guardian_id = p_guardian_id for update;
  if not found then return false; end if;
  if v_row.expires_at < now() or v_row.attempts >= 5 then
    delete from public.guardian_verification_codes where guardian_id = p_guardian_id;
    return false;
  end if;
  if extensions.crypt(v_phone, v_row.phone_hash) <> v_row.phone_hash
     or extensions.crypt(p_code, v_row.code_hash) <> v_row.code_hash then
    update public.guardian_verification_codes set attempts = attempts + 1 where guardian_id = p_guardian_id;
    return false;
  end if;
  perform set_config('iaschool.guardian_verification', 'rpc', true);
  update public.guardians set whatsapp_verified_at = now() where id = p_guardian_id;
  delete from public.guardian_verification_codes where guardian_id = p_guardian_id;
  return true;
end;
$$;
revoke all on function public.confirm_guardian_code(uuid, text) from public, anon;
grant execute on function public.confirm_guardian_code(uuid, text) to authenticated;
