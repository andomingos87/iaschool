-- ------------------------------------------------------------
-- IAschool — Fase 3, M4: autorizações por escopo e rosto de referência
-- Migrations: iaschool_fase3_authorizations_reference_faces (seções 1–7),
--             iaschool_fase3_reference_face_jobs (seção 8),
--             iaschool_fase3_reference_job_revoked_guard (revisão da 8.2)
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §5.3, §5.4, §6, §7.4, §8.
-- Backlog: BACKLOG.md → Fase 3 → M4.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. Extensão `vector` (antecipada do M5: `student_reference_faces.embedding`
--      não existe sem ela).
--   2. `authorizations` — os quatro escopos da spec §5.4, unique parcial por
--      (aluno, escopo) ativo, RLS de membro, SEM delete: revogar é preencher
--      `revoked_at`. Trigger congela a prova (só `revoked_at` muda pela API).
--   3. `has_active_authorization()` + view `v_biometric_consent`.
--   4. `student_reference_faces` — RLS ligada e SEM policy (igual a
--      `photo_jobs`): só `service_role` e as RPCs `security definer`. Trigger
--      recusa referência sem `biometric_sorting` ativo (D5 no banco, não na tela).
--   5. RPCs de leitura para a tela, sem nunca expor `embedding`.
--   6. Bucket `student-refs` + policies; o insert exige consentimento ativo.
--   7. Migração de `students.guardian->>'consentAt'` para `authorizations`.
--   8. `student_reference_jobs` — a fila entre a tela e o motor facial: a
--      referência não existe sem embedding, e quem calcula o vetor roda fora
--      do navegador. Mesma forma de `photo_jobs` (D2), mas por aluno.
--
-- Não entra: `photo_faces` e a busca vetorial (M5); `biometric_events` e
-- `purge_expired_biometrics()` (M6) — até lá, revogar e vencer a retenção
-- NÃO apagam nada sozinhos, só travam o uso.
-- ------------------------------------------------------------

-- ============================================================
-- 1. Extensão vector
-- ============================================================

create extension if not exists vector with schema extensions;

-- ============================================================
-- 2. authorizations (spec §5.4)
-- ============================================================

create table if not exists public.authorizations (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references public.schools (id) on delete cascade,
  student_id               uuid not null references public.students (id) on delete cascade,
  scope                    text not null check (scope in (
                             'biometric_sorting',   -- separar fotos por rosto
                             'delivery_whatsapp',   -- enviar ao responsável
                             'internal_use',        -- uso interno da escola
                             'social_media')),      -- publicação externa
  granted_at               timestamptz,
  -- Quem autorizou. A FK é a fonte; o nome fica desnormalizado como prova
  -- congelada no momento do aceite, mesmo que o cadastro mude depois.
  guardian_id              uuid references public.guardians (id) on delete set null,
  granted_by_guardian_name text,
  guardian_channel         text,          -- WhatsApp verificado, como estava no aceite
  revoked_at               timestamptz,
  evidence                 jsonb,         -- termo aceito, IP, timestamp, versão do texto
  created_by               uuid not null references auth.users (id),
  created_at               timestamptz not null default now()
);

-- Um consentimento ativo por (aluno, escopo). Reconceder depois de revogar é
-- linha nova: o histórico inteiro fica.
create unique index if not exists authorizations_active_idx
  on public.authorizations (student_id, scope) where revoked_at is null;
create index if not exists authorizations_school_idx
  on public.authorizations (school_id, scope);
create index if not exists authorizations_guardian_idx
  on public.authorizations (guardian_id) where guardian_id is not null;

-- Aluno e responsável têm de ser da mesma escola da linha — a RLS sozinha não
-- impede apontar para outro tenant (mesmo padrão de photos_check_event_school).
create or replace function public.authorizations_check_school()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student_school  uuid;
  v_guardian_school uuid;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  if v_student_school is null or v_student_school <> new.school_id then
    raise exception 'authorization school_id must match student school_id'
      using errcode = '23514';
  end if;
  if new.guardian_id is not null then
    select school_id into v_guardian_school from public.guardians where id = new.guardian_id;
    if v_guardian_school is null or v_guardian_school <> new.school_id then
      raise exception 'authorization school_id must match guardian school_id'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.authorizations_check_school() from public, anon, authenticated;

drop trigger if exists authorizations_check_school on public.authorizations;
create trigger authorizations_check_school
  before insert or update of student_id, guardian_id, school_id on public.authorizations
  for each row execute function public.authorizations_check_school();

-- A prova é congelada: pela API, o cliente só consegue mexer em `revoked_at`,
-- e só de nulo para uma data. Desrevogar é recusado — reconceder é linha nova.
create or replace function public.authorizations_restrict_client_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_revoked_at timestamptz;
begin
  -- service_role (workers) e conexões diretas (migração, expurgo) passam direto.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'authorization already revoked; grant a new one instead'
      using errcode = '23514';
  end if;
  v_revoked_at := new.revoked_at;
  new := old;
  new.revoked_at := v_revoked_at;
  return new;
end;
$$;
revoke all on function public.authorizations_restrict_client_update() from public, anon, authenticated;

drop trigger if exists authorizations_restrict_client_update on public.authorizations;
create trigger authorizations_restrict_client_update
  before update on public.authorizations
  for each row execute function public.authorizations_restrict_client_update();

alter table public.authorizations enable row level security;

drop policy if exists "authorizations_select" on public.authorizations;
create policy "authorizations_select" on public.authorizations
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "authorizations_insert" on public.authorizations;
create policy "authorizations_insert" on public.authorizations
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

-- Update libera o membro; o trigger acima decide o que de fato pode mudar.
drop policy if exists "authorizations_update" on public.authorizations;
create policy "authorizations_update" on public.authorizations
  for update to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin())
  with check (public.is_member_of(school_id) or public.is_super_admin());

-- Sem policy de delete (spec §8). O revoke abaixo é a segunda tranca: nem um
-- super admin apaga consentimento pela API.
revoke delete on table public.authorizations from anon, authenticated;

-- ============================================================
-- 3. Consentimento ativo
-- ============================================================

-- Definer porque também é chamada de policy de Storage, onde a RLS de
-- `authorizations` não deve decidir se o upload passa. Como definer fura a
-- RLS, a checagem de tenant é feita aqui dentro: sem ela, qualquer usuário
-- autenticado sondaria "este aluno tem consentimento?" para um uuid de outra
-- escola. Quem não é membro recebe `false`, não um erro — a função é usada em
-- policy, e erro ali vira 500 em vez de negativa.
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

create or replace view public.v_biometric_consent with (security_invoker = true) as
  select student_id, school_id, granted_at
    from public.authorizations
   where scope = 'biometric_sorting' and revoked_at is null and granted_at is not null;

-- ============================================================
-- 4. student_reference_faces (spec §5.3)
-- ============================================================

-- Fim do ano letivo corrente. Não renova sozinha (spec §9.4): o recadastro
-- anual é o que o spike recomenda, porque o rosto da criança muda.
create or replace function public.reference_retention_default()
returns date
language sql stable set search_path = public as $$
  select make_date(extract(year from current_date)::int, 12, 31);
$$;

create table if not exists public.student_reference_faces (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  embedding         extensions.vector(512) not null,
  source_photo_path text,                  -- recorte guardado p/ re-embedding
  quality           real,
  authorization_id  uuid not null references public.authorizations (id),
  retention_until   date not null default public.reference_retention_default(),
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now()
);
create index if not exists srf_vec_idx on public.student_reference_faces
  using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists srf_student_idx
  on public.student_reference_faces (school_id, student_id);

-- D5 no banco: referência só existe sob `biometric_sorting` ativo do próprio
-- aluno. A tela também barra (decisão #8), mas a trava real é esta.
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

-- ============================================================
-- 5. Leitura pela tela (nunca o embedding)
-- ============================================================

create or replace function public.list_student_reference_faces(p_student uuid)
returns table (
  id                uuid,
  quality           real,
  source_photo_path text,
  retention_until   date,
  expired           boolean,
  created_by        uuid,
  created_at        timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.students s where s.id = p_student;
  if v_school is null then
    return;
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.quality, f.source_photo_path, f.retention_until,
           f.retention_until < current_date, f.created_by, f.created_at
      from public.student_reference_faces f
     where f.student_id = p_student
     order by f.created_at;
end;
$$;
revoke all on function public.list_student_reference_faces(uuid) from public, anon;
grant execute on function public.list_student_reference_faces(uuid) to authenticated;

-- Indicador de prontidão da lista de alunos ("182 de 240 com referência ·
-- 58 sem consentimento"). Uma linha por aluno ativo da escola.
create or replace function public.student_biometric_readiness(p_school uuid)
returns table (
  student_id      uuid,
  has_consent     boolean,
  reference_count integer,
  low_coverage    boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_member_of(p_school) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.id,
           c.student_id is not null,
           coalesce(f.n, 0)::int,
           -- Uma referência matricula, duas é o que o spike mediu (decisão #8).
           coalesce(f.n, 0) < 2
      from public.students s
      left join public.v_biometric_consent c on c.student_id = s.id
      left join (
        select r.student_id, count(*) as n
          from public.student_reference_faces r
         where r.school_id = p_school
         group by r.student_id
      ) f on f.student_id = s.id
     where s.school_id = p_school
       and s.deleted_at is null;
end;
$$;
revoke all on function public.student_biometric_readiness(uuid) from public, anon;
grant execute on function public.student_biometric_readiness(uuid) to authenticated;

-- ============================================================
-- 6. Storage: bucket student-refs (spec §6)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-refs', 'student-refs', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: {school_id}/{student_id}/{ref_id}.jpg — o 1º segmento dá o tenant
-- (public.storage_school_id, M1), o 2º diz de quem é o rosto.
create or replace function public.storage_student_id(p_name text)
returns uuid
language sql immutable set search_path = '' as $$
  select case
    when (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(p_name))[2]::uuid
    else null
  end;
$$;

-- Subir referência exige consentimento ativo — a mesma trava da tabela, agora
-- no Storage, para não haver foto de rosto sem base legal nem por acidente.
drop policy if exists "student_refs_insert" on storage.objects;
create policy "student_refs_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-refs'
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
    and public.has_active_authorization(public.storage_student_id(name), 'biometric_sorting')
  );

drop policy if exists "student_refs_select" on storage.objects;
create policy "student_refs_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-refs'
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

drop policy if exists "student_refs_delete" on storage.objects;
create policy "student_refs_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-refs'
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

-- ============================================================
-- 7. Migração do consentimento legado
-- ============================================================

-- `students.guardian->>'consentAt'` (jsonb, Fase 0) é um booleano com data:
-- "o responsável autorizou o uso da imagem e dos dados do menor". Ele NÃO
-- distingue escopo, então vira `internal_use` — o mais restrito que cobre o
-- que o produto fazia (gerar arte com a imagem dentro da escola). Nenhum
-- `biometric_sorting`, `delivery_whatsapp` ou `social_media` é inferido daqui:
-- consentimento que ninguém deu não se deduz de um booleano antigo.
-- `evidence.source` marca a origem para a revisão jurídica saber o que é
-- herança e o que é aceite novo.
insert into public.authorizations (
  school_id, student_id, scope, granted_at, guardian_id,
  granted_by_guardian_name, created_by, evidence
)
select s.school_id,
       s.id,
       'internal_use',
       (s.guardian->>'consentAt')::timestamptz,
       s.primary_guardian_id,
       nullif(s.guardian->>'name', ''),
       s.owner_id,
       jsonb_build_object(
         'source', 'students.guardian.consentAt',
         'migrated_at', now(),
         'registered_by', nullif(s.guardian->>'consentRegisteredBy', ''),
         'terms_version', null
       )
  from public.students s
 where s.school_id is not null
   and s.deleted_at is null
   and nullif(s.guardian->>'consentAt', '') is not null
   and not exists (
     select 1 from public.authorizations a
      where a.student_id = s.id
        and a.scope = 'internal_use'
        and a.revoked_at is null
   );

-- ============================================================
-- 8. Fila do rosto de referência (spec §7.4)
-- Migration: iaschool_fase3_reference_face_jobs
-- ============================================================

-- `student_reference_faces.embedding` é `not null`: a tela não consegue
-- gravar a referência sozinha, porque quem calcula o vetor é o motor facial
-- (InsightFace, `det_size` 640 — spec §7.4), que roda fora do navegador.
-- Esta fila é o caminho entre os dois: a tela sobe o JPEG em `student-refs`
-- e enfileira; o worker consome, calcula e grava a linha.
--
-- Estrutura igual à de `photo_jobs` (D2: fila em tabela, `FOR UPDATE SKIP
-- LOCKED`, 5 tentativas), com duas diferenças: a fila é por ALUNO, não por
-- foto de evento — `photo_jobs.photo_id` referencia `photos`, que uma foto de
-- referência não é —, e a linha aqui é visível para a escola, porque não
-- guarda vetor nenhum: só o caminho do arquivo e o estado.
--
-- Enquanto o `face-worker` não existir (M5), o job fica `queued` e a tela diz
-- "aguardando processamento". Nada de embedding falso para destravar tela.

create table if not exists public.student_reference_jobs (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  -- A autorização sob a qual a foto foi colhida; é ela que o worker copia
  -- para `student_reference_faces.authorization_id`.
  authorization_id  uuid not null references public.authorizations (id),
  -- `{school_id}/{student_id}/{job_id}.jpg` no bucket `student-refs`.
  storage_path      text not null unique,
  status            text not null default 'queued'
                    check (status in ('queued','leased','done','failed')),
  attempts          int not null default 0,
  leased_until      timestamptz,
  last_error        text,
  reference_face_id uuid references public.student_reference_faces (id) on delete set null,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists srj_claim_idx
  on public.student_reference_jobs (status, id) where status in ('queued','leased');
create index if not exists srj_student_idx
  on public.student_reference_jobs (school_id, student_id);

drop trigger if exists student_reference_jobs_touch on public.student_reference_jobs;
create trigger student_reference_jobs_touch
  before update on public.student_reference_jobs
  for each row execute function public.touch_updated_at();

-- Mesma trava da tabela de referências (D5): sem `biometric_sorting` ativa do
-- próprio aluno não entra job. Sem isso, revogar o consentimento deixaria um
-- job na fila que viraria embedding depois.
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

alter table public.student_reference_jobs enable row level security;

drop policy if exists "student_reference_jobs_select" on public.student_reference_jobs;
create policy "student_reference_jobs_select" on public.student_reference_jobs
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

drop policy if exists "student_reference_jobs_insert" on public.student_reference_jobs;
create policy "student_reference_jobs_insert" on public.student_reference_jobs
  for insert to authenticated
  with check (
    (public.is_member_of(school_id) and created_by = auth.uid())
    or public.is_super_admin()
  );

-- Desistir de uma referência que ainda não virou vetor é apagar a linha; o
-- estado do job é do worker, então não há policy de update.
drop policy if exists "student_reference_jobs_delete" on public.student_reference_jobs;
create policy "student_reference_jobs_delete" on public.student_reference_jobs
  for delete to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

-- A fila é da escola logada: `anon` não tem nada aqui, e nem `authenticated`
-- muda estado (o grant default do Supabase dá tudo para os dois).
revoke all on table public.student_reference_jobs from anon;
revoke update on table public.student_reference_jobs from authenticated;

-- 8.1 Worker: reivindicar
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

-- 8.2 Worker: concluir.
-- Devolve 'done' | 'failed' | 'requeued' | 'revoked' | 'noop' | 'missing'.
--
-- É aqui que a linha de `student_reference_faces` nasce. O consentimento é
-- conferido de novo agora, e não só no enfileiramento: entre uma coisa e
-- outra a escola pode ter revogado. Nesse caso o job morre como 'revoked'
-- em vez de estourar no trigger — se estourasse, a transação voltaria, o job
-- ficaria 'leased' até o lease vencer e o ciclo se repetiria até as 5
-- tentativas, deixando a linha presa para sempre.
-- `p_permanent`: retrato sem rosto, ou com dois, não melhora na quinta
-- tentativa — a escola precisa ver a falha e mandar outra foto (M5).
--
-- A assinatura ganhou um parâmetro: sem o drop, o `create or replace` criaria
-- uma SOBRECARGA e o PostgREST recusaria a chamada por ambiguidade.
drop function if exists public.complete_student_reference_job(
  uuid, boolean, extensions.vector, real, text);
create or replace function public.complete_student_reference_job(
  p_job_id    uuid,
  p_ok        boolean,
  p_embedding extensions.vector(512) default null,
  p_quality   real                   default null,
  p_error     text                   default null,
  p_permanent boolean                default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job   public.student_reference_jobs%rowtype;
  v_error text := left(p_error, 2000);
  v_face  uuid;
begin
  select * into v_job from public.student_reference_jobs where id = p_job_id for update;
  if not found then
    return 'missing';
  end if;
  if v_job.status <> 'leased' then
    return 'noop';
  end if;

  if p_ok then
    if p_embedding is null then
      raise exception 'embedding is required when the job succeeds' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.authorizations a
       where a.id = v_job.authorization_id
         and a.student_id = v_job.student_id
         and a.scope = 'biometric_sorting'
         and a.granted_at is not null
         and a.revoked_at is null
    ) then
      update public.student_reference_jobs
         set status = 'failed', leased_until = null,
             last_error = 'consentimento de reconhecimento revogado antes do processamento'
       where id = p_job_id;
      return 'revoked';
    end if;
    insert into public.student_reference_faces (
      school_id, student_id, embedding, source_photo_path, quality,
      authorization_id, created_by
    ) values (
      v_job.school_id, v_job.student_id, p_embedding, v_job.storage_path, p_quality,
      v_job.authorization_id, v_job.created_by
    ) returning id into v_face;
    update public.student_reference_jobs
       set status = 'done', leased_until = null, last_error = null,
           reference_face_id = v_face
     where id = p_job_id;
    return 'done';
  end if;

  if p_permanent or v_job.attempts >= 5 then
    update public.student_reference_jobs
       set status = 'failed', leased_until = null, last_error = v_error
     where id = p_job_id;
    return 'failed';
  end if;

  update public.student_reference_jobs
     set status = 'queued', leased_until = null, last_error = v_error
   where id = p_job_id;
  return 'requeued';
end;
$$;
revoke all on function public.complete_student_reference_job(uuid,boolean,extensions.vector,real,text,boolean)
  from public, anon, authenticated;
grant execute on function public.complete_student_reference_job(uuid,boolean,extensions.vector,real,text,boolean)
  to service_role;

-- 8.3 Tela: "tentar de novo" numa referência que falhou (mesmo papel do
-- `retry_failed_photo_jobs` do M3). Zera as tentativas, não cria linha nova.
create or replace function public.retry_student_reference_job(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_job public.student_reference_jobs%rowtype;
begin
  select * into v_job from public.student_reference_jobs where id = p_job_id;
  if not found then
    return false;
  end if;
  if not (public.is_member_of(v_job.school_id) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_job.status <> 'failed' then
    return false;
  end if;
  update public.student_reference_jobs
     set status = 'queued', attempts = 0, leased_until = null, last_error = null
   where id = p_job_id;
  return true;
end;
$$;
revoke all on function public.retry_student_reference_job(uuid) from public, anon;
grant execute on function public.retry_student_reference_job(uuid) to authenticated, service_role;

-- 8.4 Tela: remover uma referência já processada. `student_reference_faces`
-- não tem policy, então a exclusão passa por aqui. Devolve o caminho do
-- arquivo para o cliente apagar o objeto no bucket.
--
-- Isto NÃO é o expurgo do M6: apagar uma referência a pedido da escola é
-- outra coisa, e não mexe em foto de evento nem em atribuição confirmada.
create or replace function public.delete_student_reference_face(p_face_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_face public.student_reference_faces%rowtype;
begin
  select * into v_face from public.student_reference_faces where id = p_face_id;
  if not found then
    return null;
  end if;
  if not (public.is_member_of(v_face.school_id) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.student_reference_faces where id = p_face_id;
  return v_face.source_photo_path;
end;
$$;
revoke all on function public.delete_student_reference_face(uuid) from public, anon;
grant execute on function public.delete_student_reference_face(uuid) to authenticated;
