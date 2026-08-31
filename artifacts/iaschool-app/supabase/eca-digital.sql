-- ------------------------------------------------------------
-- IAschool — conformidade com o ECA Digital
-- Lei nº 15.211/2025 e Decreto nº 12.880/2026
--
-- Rode este script no SQL Editor do Supabase DEPOIS do setup.sql.
-- Idempotente: pode ser executado mais de uma vez.
--
-- Cobre três bloqueadores:
--   1. Data de nascimento e vínculo com responsável legal (arts. 10, 24)
--   2. Verificação do canal do responsável (Decreto, art. 35)
--   3. Trilha auditável de envio de imagem de menor (arts. 6º, V e 7º, § 2º)
-- ------------------------------------------------------------

-- ---------- 1. Responsável legal no cadastro do aluno ----------

-- O responsável fica em jsonb junto do aluno: nome, whatsapp, e-mail,
-- vínculo, data da verificação do canal e data do consentimento.
-- Finalidade única (Lei, art. 13) — não alimenta prompt nem perfilamento.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='students' and column_name='guardian') then
    alter table public.students add column guardian jsonb;
  end if;
end $$;

-- Faixa etária e responsável no cadastro público (tela de Aprovações).
-- Guardamos a FAIXA, nunca a data de nascimento exata, no perfil de auth
-- (Decreto, art. 24, § 3º — minimização do dado de aferição).
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='age_bracket') then
    alter table public.profiles add column age_bracket text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='guardian_name') then
    alter table public.profiles add column guardian_name text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='guardian_consent') then
    alter table public.profiles add column guardian_consent boolean not null default false;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_age_bracket_check;
alter table public.profiles add constraint profiles_age_bracket_check
  check (age_bracket is null or age_bracket in ('crianca', 'adolescente', 'adulto'));

-- Menor de 16 anos não pode ter conta sem responsável legal com autorização
-- registrada (Lei, art. 24). O banco garante o caso INEQUÍVOCO: 'crianca' é
-- sempre menor de 12 e, portanto, sempre menor de 16.
--
-- A faixa 'adolescente' cobre 12 a 17 e não distingue 15 de 17, então o corte
-- exato dos 16 anos é decidido pela aplicação a partir da data de nascimento
-- (artifacts/iaschool-app/src/lib/eca.ts) ANTES de chamar o signUp. Guardar a data
-- exata no perfil resolveria a checagem no banco, mas violaria a minimização
-- do dado de aferição (Decreto, art. 24, § 3º) — a troca é deliberada.
alter table public.profiles drop constraint if exists profiles_guardian_required_check;
alter table public.profiles add constraint profiles_guardian_required_check
  check (
    role <> 'student'
    or age_bracket is distinct from 'crianca'
    or (guardian_name is not null and guardian_consent)
  );

-- O trigger de criação de perfil passa a gravar faixa etária e responsável.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'signup_role'
     and new.raw_user_meta_data->>'signup_role' in ('school_user', 'student') then
    insert into public.profiles (
      id, email, name, role, school_name, school_id, approval_status,
      age_bracket, guardian_name, guardian_consent
    )
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'signup_name', new.email),
      new.raw_user_meta_data->>'signup_role',
      new.raw_user_meta_data->>'signup_school_name',
      nullif(new.raw_user_meta_data->>'signup_school_id', '')::uuid,
      'pending',
      nullif(new.raw_user_meta_data->>'signup_age_bracket', ''),
      nullif(new.raw_user_meta_data->>'signup_guardian_name', ''),
      coalesce((new.raw_user_meta_data->>'signup_guardian_consent')::boolean, false)
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

-- ---------- 2. Verificação do WhatsApp do responsável ----------

-- Códigos de confirmação. Nunca são lidos pelo cliente: só a RPC
-- confirm_guardian_code (security definer) os enxerga.
create table if not exists public.guardian_verification_codes (
  student_id uuid primary key references public.students (id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.guardian_verification_codes enable row level security;
-- Sem policy nenhuma: nenhum papel autenticado lê ou escreve direto.
-- O acesso passa obrigatoriamente pela edge function e pela RPC abaixo.

create or replace function public.confirm_guardian_code(
  p_student_id uuid,
  p_code text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.guardian_verification_codes%rowtype;
  v_owner uuid;
begin
  -- Só quem pode editar o aluno pode confirmar o responsável dele.
  select owner_id into v_owner from public.students where id = p_student_id;
  if v_owner is null then
    raise exception 'student not found';
  end if;
  if not (v_owner = auth.uid() or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select * into v_row from public.guardian_verification_codes
    where student_id = p_student_id;
  if not found then
    raise exception 'invalid code';
  end if;
  if v_row.expires_at < now() then
    delete from public.guardian_verification_codes where student_id = p_student_id;
    raise exception 'code expired';
  end if;
  -- Antiabuso: 5 tentativas por código.
  if v_row.attempts >= 5 then
    delete from public.guardian_verification_codes where student_id = p_student_id;
    raise exception 'code expired';
  end if;
  if v_row.code <> p_code then
    update public.guardian_verification_codes
      set attempts = attempts + 1
      where student_id = p_student_id;
    raise exception 'invalid code';
  end if;

  update public.students
    set guardian = coalesce(guardian, '{}'::jsonb)
      || jsonb_build_object('whatsappVerifiedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        updated_at = now()
    where id = p_student_id;

  delete from public.guardian_verification_codes where student_id = p_student_id;
end;
$$;

revoke all on function public.confirm_guardian_code(uuid, text) from public;
grant execute on function public.confirm_guardian_code(uuid, text) to authenticated;

-- ---------- 3. Trilha de envio de imagem ----------

-- Append-only por RLS: há policy de insert e de select, e NENHUMA de update
-- ou delete. Nem a escola nem o super_admin apagam um registro de envio pela
-- API — é isso que dá valor probatório à trilha (Decreto, art. 35).
create table if not exists public.share_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  student_id uuid not null references public.students (id) on delete cascade,
  student_name text not null,
  channel text not null default 'whatsapp',
  target_whatsapp text not null,
  target_label text not null,
  student_age_bracket text not null,
  guardian_consent_at timestamptz,
  sent_by_user_id uuid not null references auth.users (id) on delete cascade,
  sent_by_name text not null,
  created_at timestamptz not null default now()
);

alter table public.share_logs drop constraint if exists share_logs_channel_check;
alter table public.share_logs add constraint share_logs_channel_check
  check (channel in ('whatsapp'));

alter table public.share_logs drop constraint if exists share_logs_age_bracket_check;
alter table public.share_logs add constraint share_logs_age_bracket_check
  check (student_age_bracket in ('crianca', 'adolescente', 'adulto'));

create index if not exists share_logs_student_id_idx
  on public.share_logs (student_id, created_at desc);

alter table public.share_logs enable row level security;

drop policy if exists "share_logs_select" on public.share_logs;
create policy "share_logs_select" on public.share_logs
  for select to authenticated
  using (
    sent_by_user_id = auth.uid()
    or public.is_super_admin()
    or student_id in (
      select id from public.students where owner_id = auth.uid()
    )
  );

drop policy if exists "share_logs_insert" on public.share_logs;
create policy "share_logs_insert" on public.share_logs
  for insert to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and student_id in (
      select id from public.students
      where owner_id = auth.uid() or public.is_super_admin()
    )
  );

-- Sem policy de update/delete: a trilha é imutável pela API.
