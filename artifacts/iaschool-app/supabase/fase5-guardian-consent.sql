-- ------------------------------------------------------------
-- IAschool — Fase 5, W2: consentimento direto do responsável
-- Migration: iaschool_fase5_guardian_consent
--
-- Spec: docs/spec-whatsapp-api-oficial-entrega-fotos.md §§6.2, 8.1, 8.2 e W2.
-- Backlog: BACKLOG.md → Fase 5 → W2.
--
-- Aplicar via `apply_migration` do MCP `supabase-iaschool` (nunca pelo SQL
-- Editor). Este arquivo é o SQL de referência; roda mais de uma vez sem
-- quebrar. NÃO foi aplicado ao projeto remoto ainda.
--
-- O que entra:
--   1. `guardian_action_tokens` — token opaco de uso único para ações do
--      responsável (consentimento agora; acesso ao álbum no W4). Só o hash
--      SHA-256 fica no banco; RLS sem policy: só `service_role` e as RPCs.
--   2. `create_guardian_consent_token()` — antiflood de 60s, invalida o pedido
--      anterior pendente e liga o pedido à mensagem externa.
--   3. `get_guardian_consent_status()` — projeção segura para a ficha do
--      aluno (chamável por `authenticated`, com checagem de membro).
--   4. `consume_guardian_consent_token()` — uso único; o aceite grava
--      `authorizations` com `source = 'guardian_link'` para todos os alunos
--      ativos sob o responsável e revoga a declaração anterior da escola
--      (a declaração não pode bloquear o aceite real). A recusa só marca o
--      desfecho no token.
--   5. `authorizations.created_by` passa a aceitar nulo: o aceite do
--      responsável não tem usuário autenticado por trás; quem pediu fica no
--      token (`created_by`) e na evidência (`tokenId`).
--   6. Trocar o número do responsável revoga os pedidos de consentimento
--      pendentes (mesmo trigger de `whatsapp_verified_at`).
--
-- Não entra: `whatsapp_verified_hash` (snapshots do W3/W4) e as tabelas de
-- lote/entrega (W3).
-- ------------------------------------------------------------

-- ============================================================
-- 1. guardian_action_tokens (spec §8.2)
-- ============================================================

create table if not exists public.guardian_action_tokens (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  guardian_id         uuid not null references public.guardians (id) on delete cascade,
  -- `delivery_access` entra agora porque o W4 usa o mesmo cofre; acrescentar
  -- depois exigiria migration só para afrouxar o CHECK.
  purpose             text not null check (purpose in ('guardian_consent', 'delivery_access')),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at          timestamptz not null,
  used_at             timestamptz,
  outcome             text check (outcome in ('accepted', 'declined')),
  revoked_at          timestamptz,
  created_by          uuid references auth.users (id),
  whatsapp_message_id uuid references public.whatsapp_messages (id) on delete set null,
  created_at          timestamptz not null default now(),
  -- Desfecho e uso andam juntos: usado sem desfecho (ou o inverso) é bug.
  check ((used_at is null) = (outcome is null))
);
create index if not exists guardian_action_tokens_guardian_idx
  on public.guardian_action_tokens (guardian_id, purpose, created_at desc);
-- Um único pedido de consentimento pendente por responsável: pedido novo
-- invalida o anterior (o link antigo para de valer).
create unique index if not exists guardian_action_tokens_pending_consent_idx
  on public.guardian_action_tokens (guardian_id)
  where purpose = 'guardian_consent' and used_at is null and revoked_at is null;

alter table public.guardian_action_tokens enable row level security;
-- Sem policy e sem grant: o cliente nunca lê token, hash ou desfecho cru.
revoke all on table public.guardian_action_tokens from public, anon, authenticated;

-- ============================================================
-- 2. create_guardian_consent_token() — service_role
-- ============================================================

create or replace function public.create_guardian_consent_token(
  p_guardian_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by uuid,
  p_whatsapp_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian     public.guardians%rowtype;
  v_last_created timestamptz;
  v_id           uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash';
  end if;
  if p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '25 hours' then
    raise exception 'invalid expiry';
  end if;
  select * into v_guardian from public.guardians
   where id = p_guardian_id and deleted_at is null;
  if not found then raise exception 'guardian unavailable'; end if;
  -- Só convite para canal já verificado (spec §6.2, passo 1).
  if v_guardian.whatsapp_verified_at is null then
    raise exception 'recipient not verified';
  end if;

  -- Antiflood: um pedido a cada 60 segundos por responsável, além do teto
  -- diário que `reserve_whatsapp_send` já aplicou antes desta chamada.
  select max(created_at) into v_last_created
    from public.guardian_action_tokens
   where guardian_id = p_guardian_id and purpose = 'guardian_consent';
  if v_last_created is not null and v_last_created > now() - interval '60 seconds' then
    raise exception 'consent cooldown';
  end if;

  -- Pedido novo invalida o anterior ainda pendente: só o último link vale.
  update public.guardian_action_tokens
     set revoked_at = now()
   where guardian_id = p_guardian_id
     and purpose = 'guardian_consent'
     and used_at is null
     and revoked_at is null;

  insert into public.guardian_action_tokens
    (school_id, guardian_id, purpose, token_hash, expires_at, created_by, whatsapp_message_id)
  values
    (v_guardian.school_id, v_guardian.id, 'guardian_consent',
     p_token_hash, p_expires_at, p_created_by, p_whatsapp_message_id)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.create_guardian_consent_token(uuid, text, timestamptz, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_guardian_consent_token(uuid, text, timestamptz, uuid, uuid)
  to service_role;

-- ============================================================
-- 3. get_guardian_consent_status() — projeção para a escola
-- ============================================================

-- O cliente nunca lê `guardian_action_tokens`. Esta RPC devolve somente o
-- estado necessário para a ficha do aluno, mascarando telefone, hash e token.
create or replace function public.get_guardian_consent_status(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_guardian public.guardians%rowtype;
  v_token   public.guardian_action_tokens%rowtype;
  v_active  public.authorizations%rowtype;
  v_state   text := 'none';
begin
  select * into v_student from public.students
   where id = p_student_id and deleted_at is null;
  if not found then raise exception 'student not found'; end if;
  if not (public.is_member_of(v_student.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  if v_student.primary_guardian_id is null then
    return jsonb_build_object('verified', false, 'state', 'none');
  end if;
  select * into v_guardian from public.guardians
   where id = v_student.primary_guardian_id and deleted_at is null;
  if not found then
    return jsonb_build_object('verified', false, 'state', 'none');
  end if;

  select * into v_active from public.authorizations
   where student_id = p_student_id
     and scope = 'delivery_whatsapp'
     and granted_at is not null
     and revoked_at is null
   order by granted_at desc
   limit 1;

  select * into v_token from public.guardian_action_tokens
   where guardian_id = v_guardian.id and purpose = 'guardian_consent'
   order by created_at desc
   limit 1;

  if v_active.id is not null then
    -- Só o aceite do próprio responsável libera a entrega; a declaração da
    -- escola fica visível como estado separado (preflight do W3 decide).
    if v_active.evidence->>'source' = 'guardian_link' then
      v_state := 'accepted';
    else
      v_state := 'school_declared';
    end if;
  elsif v_token.id is not null then
    if v_token.used_at is not null then
      -- Aceite consumido sem autorização ativa: foi revogado depois.
      v_state := case when v_token.outcome = 'accepted' then 'revoked' else 'declined' end;
    elsif v_token.revoked_at is null and v_token.expires_at > now() then
      v_state := 'pending';
    elsif v_token.revoked_at is null then
      v_state := 'expired';
    end if;
    -- revoked sem uso = substituído por pedido mais novo: cai em 'none'.
  end if;

  return jsonb_build_object(
    'verified', v_guardian.whatsapp_verified_at is not null,
    'state', v_state,
    'requestedAt', v_token.created_at,
    'expiresAt', v_token.expires_at,
    'answeredAt', v_token.used_at
  );
end;
$$;
revoke all on function public.get_guardian_consent_status(uuid) from public, anon;
grant execute on function public.get_guardian_consent_status(uuid) to authenticated, service_role;

-- ============================================================
-- 4. consume_guardian_consent_token() — service_role
-- ============================================================

-- Chamada pela Edge Function pública `guardian-consent`. O aceite cria as
-- autorizações na mesma transação do consumo do token: ou tudo acontece, ou
-- o token continua valendo.
create or replace function public.consume_guardian_consent_token(
  p_token_hash text,
  p_accept boolean,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   public.guardian_action_tokens%rowtype;
  v_guardian public.guardians%rowtype;
  v_now     timestamptz := now();
  v_student record;
  v_granted integer := 0;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if p_accept and (p_terms_version is null or p_terms_version !~ '^[a-z0-9_.-]{1,40}$') then
    raise exception 'terms version required';
  end if;

  select * into v_token from public.guardian_action_tokens
   where token_hash = p_token_hash and purpose = 'guardian_consent'
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_token'); end if;
  if v_token.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_used'); end if;
  if v_token.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_token.expires_at <= v_now then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  select * into v_guardian from public.guardians
   where id = v_token.guardian_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'guardian_unavailable'); end if;

  update public.guardian_action_tokens
     set used_at = v_now,
         outcome = case when p_accept then 'accepted' else 'declined' end
   where id = v_token.id;

  if not p_accept then
    -- Recusa não cria autorização nem apaga histórico: só o desfecho.
    return jsonb_build_object('ok', true, 'outcome', 'declined');
  end if;

  for v_student in
    select id from public.students
     where primary_guardian_id = v_guardian.id
       and school_id = v_token.school_id
       and deleted_at is null
  loop
    -- Declaração anterior da escola (ou consentimento herdado) não pode
    -- bloquear o aceite real: sai de cena como revogada, o histórico fica.
    update public.authorizations
       set revoked_at = v_now
     where student_id = v_student.id
       and scope = 'delivery_whatsapp'
       and granted_at is not null
       and revoked_at is null
       and coalesce(evidence->>'source', '') <> 'guardian_link';

    insert into public.authorizations
      (school_id, student_id, scope, granted_at, guardian_id,
       granted_by_guardian_name, guardian_channel, evidence, created_by)
    values
      (v_token.school_id, v_student.id, 'delivery_whatsapp', v_now, v_guardian.id,
       v_guardian.name, v_guardian.whatsapp,
       jsonb_build_object(
         'source', 'guardian_link',
         'termsVersion', p_terms_version,
         'acceptedAt', v_now,
         'channel', 'whatsapp',
         'tokenId', v_token.id
       ),
       null)
    on conflict (student_id, scope) where revoked_at is null do nothing;
    if found then v_granted := v_granted + 1; end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'accepted',
    'authorizationsCreated', v_granted
  );
end;
$$;
revoke all on function public.consume_guardian_consent_token(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.consume_guardian_consent_token(text, boolean, text)
  to service_role;

-- ============================================================
-- 5. authorizations.created_by passa a aceitar nulo
-- ============================================================

-- O aceite pelo link acontece sem sessão de usuário; `created_by` continua
-- servindo para a declaração da escola. Quem pediu o link fica no token.
alter table public.authorizations alter column created_by drop not null;

-- ============================================================
-- 6. Troca de número revoga pedidos de consentimento pendentes
-- ============================================================

-- Redefine o trigger da fundação (fase4-whatsapp-foundation.sql) somando os
-- tokens: o mesmo evento que zera a verificação precisa parar de aceitar o
-- link antigo.
create or replace function public.invalidate_guardian_whatsapp_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.guardian_verification_codes where guardian_id = new.id;
  update public.whatsapp_messages
     set status = 'failed', error_code = 'guardian_phone_changed', updated_at = now()
   where guardian_id = new.id and status = 'reserved';
  update public.guardian_action_tokens
     set revoked_at = now()
   where guardian_id = new.id and used_at is null and revoked_at is null;
  return new;
end;
$$;
revoke all on function public.invalidate_guardian_whatsapp_pending() from public, anon, authenticated;
drop trigger if exists invalidate_guardian_whatsapp_pending on public.guardians;
create trigger invalidate_guardian_whatsapp_pending after update of whatsapp on public.guardians
for each row when (old.whatsapp is distinct from new.whatsapp)
execute function public.invalidate_guardian_whatsapp_pending();
