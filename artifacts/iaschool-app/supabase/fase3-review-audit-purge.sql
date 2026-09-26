-- ------------------------------------------------------------
-- IAschool — Fase 3, M6: revisão, trilha de auditoria e expurgo
-- Migration: iaschool_fase3_review_audit_purge
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §7.5, §9.3.1, §9.4, §12.
-- Backlog: BACKLOG.md → Fase 3 → M6.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. Limiares da confirmação em lote em `face_recognition_settings`
--      (`bulk_min_sim`, `bulk_min_margin`) — a partição "alta confiança" x
--      "precisa de atenção" da tela (§7.5) se recalibra sem deploy.
--   2. `biometric_events`: a trilha append-only, com `student_ref` gravado no
--      momento do fato para sobreviver ao expurgo do aluno (§9.4).
--   3. `storage_purge_queue`: apagar linha não apaga objeto no bucket. O que
--      o expurgo tira do banco entra aqui e o `ingest-worker` remove de fato.
--   4. Trava D6/R7 no banco: `confirmed` sem `reviewed_by`/`reviewed_at` é
--      recusado por CHECK, inclusive vindo de lote.
--   5. Leitura da tela de revisão (`event_review_faces`, `event_review_counts`,
--      `face_candidates`) — sempre sem o vetor.
--   6. RPCs de revisão: `confirm_face`, `confirm_faces_bulk` (transacional,
--      tudo ou nada) e `reject_face` (ignorar / criança de fora / adulto).
--   7. `purge_expired_biometrics()` + `pg_cron` diário, e a reescrita de
--      `purge_expired_student_trash()`, que até aqui apagava o aluno sem
--      tocar na biometria dele.
--
-- Duas decisões de conformidade tomadas aqui, além do que a spec pedia:
--
--   (a) **Biometria não passa pela lixeira de 30 dias.** A lixeira existe
--       para a escola não perder foto por engano. Vetor e recorte de rosto
--       são outra coisa: manter biometria 30 dias depois de o responsável
--       revogar é exatamente o que a revogação proíbe. Vetor e recorte somem
--       na hora; foto e evento continuam passando pela lixeira (§9.4).
--
--   (b) **A trilha não tem policy de insert para `authenticated`.** Trilha
--       que o cliente escreve é trilha que o cliente forja. Toda linha nasce
--       de trigger (consentimento, referência) ou de RPC `security definer`
--       (revisão, expurgo). O membro lê a sua; ninguém altera nem apaga.
-- ------------------------------------------------------------

-- ============================================================
-- 1. Limiares da confirmação em lote (spec §7.5)
-- ============================================================

-- A tela parte a grade do aluno em duas faixas. A de cima nasce marcada e o
-- botão de lote a alcança; a de baixo nasce desmarcada e exige clique. Os
-- dois cortes moram aqui, ao lado de `tau` e da margem, porque o piloto vai
-- mexer neles com dado de criança e isso não pode exigir deploy.
alter table public.face_recognition_settings
  add column if not exists bulk_min_sim    real not null default 0.64,
  add column if not exists bulk_min_margin real not null default 0.15;

comment on column public.face_recognition_settings.bulk_min_sim is
  'Similaridade mínima para o recorte nascer marcado na grade do aluno (spec §7.5).';
comment on column public.face_recognition_settings.bulk_min_margin is
  'Margem mínima sobre o 2º colocado para o recorte nascer marcado (spec §7.5).';

-- ============================================================
-- 2. biometric_events — a trilha (spec §9.4)
-- ============================================================

create table if not exists public.biometric_events (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  -- Identificador que SOBREVIVE ao expurgo do aluno: gravado no momento do
  -- fato, é o que mantém a trilha legível depois que a FK acima vira nula.
  -- Matrícula quando existe; senão, um prefixo do uuid. Nome de aluno nunca.
  student_ref text,
  kind       text not null check (kind in (
               'consent_granted','consent_revoked','reference_created',
               'reference_purged','face_confirmed','face_rejected',
               'face_purged','photos_purged')),
  detail     jsonb,
  actor      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- `face_rejected` e `photos_purged` não estavam na lista da spec §9.4 e são
-- necessários: a revisão também nega (ignorar, criança de fora, adulto) e o
-- expurgo do evento vencido apaga foto sem aluno associado.

create index if not exists be_school_idx  on public.biometric_events (school_id, created_at desc);
create index if not exists be_student_idx on public.biometric_events (student_id, created_at desc);

alter table public.biometric_events enable row level security;

drop policy if exists "biometric_events_select" on public.biometric_events;
create policy "biometric_events_select" on public.biometric_events
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

-- Sem policy de insert, update ou delete. Ver a decisão (b) no cabeçalho.
revoke all on table public.biometric_events from anon, authenticated;
grant select on table public.biometric_events to authenticated;

-- Matrícula do aluno no momento do fato, ou um identificador estável e não
-- identificante. Nome nunca entra na trilha (spec §9.4, §11).
create or replace function public.student_audit_ref(p_student uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(s.enrollment_number, ''), 'aluno:' || left(s.id::text, 8))
    from public.students s
   where s.id = p_student;
$$;
revoke all on function public.student_audit_ref(uuid) from public, anon, authenticated;

create or replace function public.log_biometric_event(
  p_school  uuid,
  p_student uuid,
  p_kind    text,
  p_detail  jsonb default null,
  p_actor   uuid  default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.biometric_events (school_id, student_id, student_ref, kind, detail, actor)
  values (
    p_school,
    p_student,
    public.student_audit_ref(p_student),
    p_kind,
    p_detail,
    coalesce(p_actor, auth.uid())
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.log_biometric_event(uuid, uuid, text, jsonb, uuid)
  from public, anon, authenticated;

-- 2.1 Consentimento: a trilha nasce de trigger, não de chamada da tela.
create or replace function public.authorizations_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.granted_at is not null then
      perform public.log_biometric_event(
        new.school_id, new.student_id, 'consent_granted',
        jsonb_build_object('scope', new.scope, 'authorization_id', new.id),
        new.created_by
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if old.revoked_at is null and new.revoked_at is not null then
      perform public.log_biometric_event(
        new.school_id, new.student_id, 'consent_revoked',
        jsonb_build_object('scope', new.scope, 'authorization_id', new.id)
      );
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.authorizations_audit() from public, anon, authenticated;

drop trigger if exists authorizations_audit on public.authorizations;
create trigger authorizations_audit
  after insert or update on public.authorizations
  for each row execute function public.authorizations_audit();

-- 2.2 Rosto de referência: criado pelo worker, apagado pela tela ou pelo
-- expurgo. Os dois lados viram linha na trilha sem depender de quem chamou.
create or replace function public.student_reference_faces_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_biometric_event(
      new.school_id, new.student_id, 'reference_created',
      jsonb_build_object('reference_id', new.id, 'retention_until', new.retention_until),
      new.created_by
    );
    return null;
  end if;
  perform public.log_biometric_event(
    old.school_id, old.student_id, 'reference_purged',
    jsonb_build_object('reference_id', old.id, 'retention_until', old.retention_until)
  );
  return null;
end;
$$;
revoke all on function public.student_reference_faces_audit() from public, anon, authenticated;

drop trigger if exists student_reference_faces_audit on public.student_reference_faces;
create trigger student_reference_faces_audit
  after insert or delete on public.student_reference_faces
  for each row execute function public.student_reference_faces_audit();

-- ============================================================
-- 3. storage_purge_queue — o que sai do banco tem de sair do bucket
-- ============================================================

-- Apagar a linha não apaga o arquivo: o objeto continua no Storage, invisível
-- e cobrado. O expurgo enfileira aqui e o `ingest-worker` (que já tem
-- `service_role`) remove de verdade. Enquanto nenhum worker roda, a fila
-- cresce — e isso é visível, que é melhor do que um arquivo esquecido.
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

create or replace function public.claim_storage_purge(
  p_limit         int default 100,
  p_lease_seconds int default 120
) returns setof public.storage_purge_queue
language sql security definer set search_path = public as $$
  update public.storage_purge_queue q
     set status = 'leased',
         attempts = q.attempts + 1,
         leased_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 10))
   where q.id in (
     select id from public.storage_purge_queue
      where status = 'queued'
         or (status = 'leased' and leased_until < now())
      order by id
      limit greatest(coalesce(p_limit, 100), 1)
      for update skip locked
   )
  returning q.*;
$$;
revoke all on function public.claim_storage_purge(int, int) from public, anon, authenticated;
grant execute on function public.claim_storage_purge(int, int) to service_role;

create or replace function public.complete_storage_purge(
  p_ids   bigint[],
  p_ok    boolean default true,
  p_error text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if p_ok then
    -- Some da fila: o objeto já não existe, e guardar o caminho de um
    -- recorte de rosto por mais tempo do que o necessário é o oposto do que
    -- esta migration faz.
    delete from public.storage_purge_queue where id = any(p_ids);
    get diagnostics v_count = row_count;
    return v_count;
  end if;
  update public.storage_purge_queue
     set status = case when attempts >= 5 then 'failed' else 'queued' end,
         leased_until = null,
         last_error = left(p_error, 2000)
   where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.complete_storage_purge(bigint[], boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_storage_purge(bigint[], boolean, text) to service_role;

-- ============================================================
-- 4. D6/R7 no banco: `confirmed` exige revisor
-- ============================================================

-- A revisão em lote (§7.5) faz um ato humano cobrir N linhas. O que ela não
-- pode fazer é deixar linha confirmada sem quem a confirmou — é essa coluna
-- que sustenta a D6. O CHECK vale para qualquer caminho: RPC, lote, worker.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photo_faces_confirmed_needs_reviewer'
  ) then
    alter table public.photo_faces
      add constraint photo_faces_confirmed_needs_reviewer
      check (state <> 'confirmed' or (reviewed_by is not null and reviewed_at is not null));
  end if;
end;
$$;

-- ============================================================
-- 5. Leitura da tela de revisão (spec §7.5, §10)
-- ============================================================

-- Uma consulta, com o nome do aluno e o corte de confiança já resolvidos.
-- `security definer` porque junta `students` e `face_recognition_settings`
-- e porque o cliente não tem privilégio de select na tabela inteira.
-- Pagina: o PostgREST corta em 1.000 linhas e um evento de 2.000 fotos tem
-- ~6.000 rostos.
create or replace function public.event_review_faces(
  p_event  uuid,
  p_states text[] default array['suggested','unassigned'],
  p_limit  int default 500,
  p_offset int default 0
) returns table (
  face_id              uuid,
  photo_id             uuid,
  storage_path         text,
  thumb_path           text,
  taken_at             timestamptz,
  bbox                 jsonb,
  crop_path            text,
  det_score            real,
  quality              real,
  state                text,
  student_id           uuid,
  student_name         text,
  match_score          real,
  runner_up_student_id uuid,
  runner_up_name       text,
  runner_up_score      real,
  high_confidence      boolean,
  reviewed_at          timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_school   uuid;
  v_min_sim  real;
  v_min_marg real;
begin
  select e.school_id into v_school from public.events e where e.id = p_event;
  if v_school is null then
    return;
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.bulk_min_sim, s.bulk_min_margin
    into v_min_sim, v_min_marg
    from public.face_recognition_settings s where s.id = 1;

  return query
    select f.id,
           p.id,
           p.storage_path,
           p.thumb_path,
           p.taken_at,
           f.bbox,
           f.crop_path,
           f.det_score,
           f.quality,
           f.state,
           f.student_id,
           st.name,
           f.match_score,
           f.runner_up_student_id,
           ru.name,
           f.runner_up_score,
           -- Alta confiança: passa no corte E abre margem sobre o 2º colocado.
           -- Sem 2º colocado a margem é o próprio score (nada disputa).
           (f.state = 'suggested'
            and f.match_score >= v_min_sim
            and (f.match_score - coalesce(f.runner_up_score, 0)) >= v_min_marg),
           f.reviewed_at
      from public.photo_faces f
      join public.photos p on p.id = f.photo_id
      left join public.students st on st.id = f.student_id
      left join public.students ru on ru.id = f.runner_up_student_id
     where p.event_id = p_event
       and p.deleted_at is null
       and f.state = any(coalesce(p_states, array['suggested','unassigned']))
     order by f.student_id nulls last, f.match_score desc nulls last, f.id
     limit greatest(coalesce(p_limit, 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.event_review_faces(uuid, text[], int, int) from public, anon;
grant execute on function public.event_review_faces(uuid, text[], int, int) to authenticated;

-- Contadores da tela (e do selo "N rostos para revisar" na lista de eventos).
create or replace function public.event_review_counts(p_event uuid)
returns table (
  suggested      int,
  unassigned     int,
  confirmed      int,
  rejected       int,
  not_a_student  int,
  adult_or_staff int,
  students_pending int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
begin
  select e.school_id into v_school from public.events e where e.id = p_event;
  if v_school is null then
    return;
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select count(*) filter (where f.state = 'suggested')::int,
           count(*) filter (where f.state = 'unassigned')::int,
           count(*) filter (where f.state = 'confirmed')::int,
           count(*) filter (where f.state = 'rejected')::int,
           count(*) filter (where f.state = 'not_a_student')::int,
           count(*) filter (where f.state = 'adult_or_staff')::int,
           count(distinct f.student_id) filter (where f.state = 'suggested')::int
      from public.photo_faces f
      join public.photos p on p.id = f.photo_id
     where p.event_id = p_event
       and p.deleted_at is null;
end;
$$;
revoke all on function public.event_review_counts(uuid) from public, anon;
grant execute on function public.event_review_counts(uuid) to authenticated;

-- Os candidatos da fila individual (spec §7.5: "3 candidatos").
--
-- Só existe resposta para rosto que tem vetor — e, por D5, isso é rosto
-- atribuído a aluno com consentimento. Rosto `unassigned` não guardou vetor
-- nenhum: a alternativa seria manter biometria de criança sem autorização
-- para popular uma lista de palpites, o que a D5 proíbe. Nesse caso a tela
-- cai para a busca de aluno por nome, que é o que a pessoa faria mesmo.
create or replace function public.face_candidates(p_face_id uuid, p_limit int default 3)
returns table (student_id uuid, student_name text, sim real)
language plpgsql stable security definer set search_path = public as $$
declare
  v_face public.photo_faces%rowtype;
begin
  select * into v_face from public.photo_faces where id = p_face_id;
  if not found then
    return;
  end if;
  if not (public.is_member_of(v_face.school_id) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_face.embedding is null then
    return;
  end if;
  return query
    select m.student_id, s.name, m.sim
      from public.match_reference_faces(v_face.school_id, v_face.embedding,
                                        greatest(coalesce(p_limit, 3), 1)) m
      join public.students s on s.id = m.student_id
     where s.deleted_at is null
     order by m.sim desc;
end;
$$;
revoke all on function public.face_candidates(uuid, int) from public, anon;
grant execute on function public.face_candidates(uuid, int) to authenticated;

-- ============================================================
-- 6. RPCs de revisão (spec §7.5)
-- ============================================================

-- Evento sai de `review` quando não sobra rosto pendente. Chamada ao fim de
-- cada ato de revisão; barata, e evita um cron só para virar um status.
create or replace function public.settle_event_review(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event is null then
    return;
  end if;
  if exists (
    select 1
      from public.photo_faces f
      join public.photos p on p.id = f.photo_id
     where p.event_id = p_event
       and p.deleted_at is null
       and f.state in ('suggested','unassigned')
  ) then
    return;
  end if;
  update public.events set status = 'ready' where id = p_event and status = 'review';
end;
$$;
revoke all on function public.settle_event_review(uuid) from public, anon, authenticated;

-- O miolo da confirmação, compartilhado pela fila individual e pelo lote.
-- Tudo ou nada: qualquer face que falhe a checagem derruba a chamada inteira
-- (spec §7.5). Uma linha em `biometric_events` por chamada, com os ids.
create or replace function public.confirm_faces_internal(p_face_ids uuid[], p_student uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_student public.students%rowtype;
  v_face    public.photo_faces%rowtype;
  v_actor   uuid := auth.uid();
  v_ids     uuid[];
  v_changed uuid[] := '{}';
  v_events  uuid[] := '{}';
  v_found   int := 0;
  v_event   uuid;
begin
  if p_student is null then
    raise exception 'confirmar exige um aluno' using errcode = '22023';
  end if;
  -- D6: nenhuma confirmação sem gente. `service_role` não tem `auth.uid()`,
  -- e é de propósito que o worker não consiga confirmar rosto nenhum.
  if v_actor is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_face_ids, '{}'::uuid[])) as x
   where x is not null;
  if v_ids is null or array_length(v_ids, 1) is null then
    return 0;
  end if;

  select * into v_student from public.students where id = p_student;
  if not found then
    raise exception 'aluno inexistente' using errcode = '23503';
  end if;
  if not (public.is_member_of(v_student.school_id) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_student.deleted_at is not null then
    raise exception 'aluno na lixeira' using errcode = '22023';
  end if;
  -- Mesma trava do embedding (D5): sem `biometric_sorting` ativo, a foto não
  -- vira pasta de aluno. Revogar depois não desfaz o que já foi entregue,
  -- mas impede confirmar mais.
  if not public.has_active_authorization(p_student, 'biometric_sorting') then
    raise exception 'confirmar exige autorizacao biometric_sorting ativa'
      using errcode = '42501';
  end if;

  -- `order by id` é o que evita deadlock entre dois revisores no mesmo aluno:
  -- os dois pegam os mesmos locks na mesma ordem. O segundo espera, relê a
  -- linha já confirmada e não confirma de novo (§12.3).
  for v_face in
    select * from public.photo_faces where id = any(v_ids) order by id for update
  loop
    v_found := v_found + 1;
    if v_face.school_id <> v_student.school_id then
      raise exception 'rosto de outra escola no lote' using errcode = '42501';
    end if;
    if v_face.state = 'confirmed' and v_face.student_id = p_student then
      continue;  -- idempotente: outro revisor chegou antes
    end if;
    update public.photo_faces
       set student_id  = p_student,
           state       = 'confirmed',
           reviewed_by = v_actor,
           reviewed_at = now()
     where id = v_face.id;
    v_changed := v_changed || v_face.id;
    select p.event_id into v_event from public.photos p where p.id = v_face.photo_id;
    if v_event is not null and not (v_event = any(v_events)) then
      v_events := v_events || v_event;
    end if;
  end loop;

  if v_found <> array_length(v_ids, 1) then
    raise exception 'rosto inexistente no lote' using errcode = '23503';
  end if;

  if array_length(v_changed, 1) is null then
    return 0;
  end if;

  perform public.log_biometric_event(
    v_student.school_id, p_student, 'face_confirmed',
    jsonb_build_object(
      'face_ids', to_jsonb(v_changed),
      'count', array_length(v_changed, 1),
      'event_ids', to_jsonb(v_events)
    )
  );

  foreach v_event in array v_events loop
    perform public.settle_event_review(v_event);
  end loop;

  return array_length(v_changed, 1);
end;
$$;
revoke all on function public.confirm_faces_internal(uuid[], uuid)
  from public, anon, authenticated;

-- Fila individual: confirma a sugestão como está, ou corrige para outro aluno.
create or replace function public.confirm_face(p_face_id uuid, p_student_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := p_student_id;
begin
  if v_student is null then
    select student_id into v_student from public.photo_faces where id = p_face_id;
  end if;
  return public.confirm_faces_internal(array[p_face_id], v_student);
end;
$$;
revoke all on function public.confirm_face(uuid, uuid) from public, anon;
grant execute on function public.confirm_face(uuid, uuid) to authenticated;

-- Cartão do aluno: um ato humano cobrindo os recortes que a pessoa olhou.
-- Em transação, com as mesmas checagens — uma face reprovada não confirma
-- nenhuma (spec §7.5).
create or replace function public.confirm_faces_bulk(p_face_ids uuid[], p_student_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
begin
  return public.confirm_faces_internal(p_face_ids, p_student_id);
end;
$$;
revoke all on function public.confirm_faces_bulk(uuid[], uuid) from public, anon;
grant execute on function public.confirm_faces_bulk(uuid[], uuid) to authenticated;

-- Os três "não": ignorar, criança de fora e adulto/equipe.
--
-- `not_a_student` e `adult_or_staff` apagam vetor e recorte na hora (§7.5) e
-- mantêm `bbox`/`det_score`, que é o que permite desfocar depois (§9.3.1).
-- A diferença entre os dois não é inferida pelo sistema: o `genderage` foi
-- apagado da imagem do worker de propósito. Quem separa a irmã de 5 anos da
-- professora é a pessoa que revisa.
--
-- Devolve o caminho do recorte para o cliente apagar o objeto na hora; a
-- fila de expurgo é a rede de segurança para quando não houver cliente.
create or replace function public.reject_face(
  p_face_id uuid,
  p_state   text default 'rejected',
  p_reason  text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_face  public.photo_faces%rowtype;
  v_actor uuid := auth.uid();
  v_crop  text;
  v_event uuid;
begin
  if p_state not in ('rejected','not_a_student','adult_or_staff') then
    raise exception 'estado invalido para recusa' using errcode = '22023';
  end if;
  if v_actor is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_face from public.photo_faces where id = p_face_id for update;
  if not found then
    raise exception 'rosto inexistente' using errcode = '23503';
  end if;
  if not (public.is_member_of(v_face.school_id) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_state = 'rejected' then
    -- "Ignorar" não é juízo sobre quem é: o recorte fica, e a pessoa pode
    -- voltar. O vínculo com o aluno, esse sai.
    update public.photo_faces
       set state = 'rejected',
           student_id = null,
           reviewed_by = v_actor,
           reviewed_at = now()
     where id = p_face_id;
  else
    v_crop := v_face.crop_path;
    update public.photo_faces
       set state = p_state,
           student_id = null,
           embedding = null,
           crop_path = null,
           reviewed_by = v_actor,
           reviewed_at = now()
     where id = p_face_id;
    if v_crop is not null then
      perform public.enqueue_storage_purge('face-crops', array[v_crop], p_state, v_face.school_id);
    end if;
  end if;

  perform public.log_biometric_event(
    v_face.school_id,
    v_face.student_id,
    case when p_state = 'rejected' then 'face_rejected' else 'face_purged' end,
    jsonb_build_object(
      'face_ids', to_jsonb(array[p_face_id]),
      'count', 1,
      'state', p_state,
      'reason', left(p_reason, 500)
    )
  );

  select p.event_id into v_event from public.photos p where p.id = v_face.photo_id;
  perform public.settle_event_review(v_event);
  return v_crop;
end;
$$;
revoke all on function public.reject_face(uuid, text, text) from public, anon;
grant execute on function public.reject_face(uuid, text, text) to authenticated;

-- ============================================================
-- 7. Expurgo (spec §9.4)
-- ============================================================

-- Tira o aluno de cena sem apagar a foto: o arquivo tem outras crianças cujos
-- responsáveis autorizaram (§9.4, LGPD art. 18, VI). Some a biometria e some
-- o vínculo; sobra `bbox` para a entrega desfocar o rosto (§9.3.1).
--
-- `p_keep_confirmed` distingue os dois gatilhos da spec: retenção vencida e
-- revogação mantêm o `student_id` das fotos já confirmadas (a foto continua
-- sendo do aluno; a biometria é que some); expurgo do aluno leva tudo.
create or replace function public.purge_student_biometrics(
  p_student        uuid,
  p_reason         text,
  p_keep_confirmed boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_paths  text[];
  v_refs   int := 0;
  v_faces  int := 0;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then
    return jsonb_build_object('references', 0, 'faces', 0);
  end if;

  select coalesce(array_agg(source_photo_path) filter (where source_photo_path is not null), '{}')
    into v_paths
    from public.student_reference_faces where student_id = p_student;
  delete from public.student_reference_faces where student_id = p_student;
  get diagnostics v_refs = row_count;
  perform public.enqueue_storage_purge('student-refs', v_paths, p_reason, v_school);

  -- O recorte é imagem de rosto derivada da foto: sai nos dois casos. A foto
  -- inteira, que tem outras crianças, permanece.
  select coalesce(array_agg(crop_path) filter (where crop_path is not null), '{}')
    into v_paths
    from public.photo_faces where student_id = p_student;
  perform public.enqueue_storage_purge('face-crops', v_paths, p_reason, v_school);

  if p_keep_confirmed then
    -- Vetor e recorte somem; o `student_id` das confirmadas fica, que é o
    -- que mantém a pasta do aluno de pé depois da revogação.
    update public.photo_faces
       set embedding = null, crop_path = null
     where student_id = p_student;
    get diagnostics v_faces = row_count;
    -- Sugestão pendente não sobrevive à revogação: ela viraria confirmação
    -- de um aluno que não autoriza mais.
    update public.photo_faces
       set state = 'unassigned', student_id = null, match_score = null,
           runner_up_student_id = null, runner_up_score = null
     where student_id = p_student
       and state in ('suggested','unassigned');
  else
    -- Aluno expurgado: nada aponta mais para ele. A linha do rosto fica,
    -- sem vetor, sem recorte e sem vínculo — `unassigned` é o estado que a
    -- entrega borra (decisão de 18/09/2026), e `bbox` é o que ela borra.
    update public.photo_faces
       set embedding = null, crop_path = null, student_id = null,
           match_score = null, runner_up_student_id = null, runner_up_score = null,
           state = 'unassigned', reviewed_by = null, reviewed_at = null
     where student_id = p_student;
    get diagnostics v_faces = row_count;
  end if;

  perform public.log_biometric_event(
    v_school, p_student, 'face_purged',
    jsonb_build_object('reason', p_reason, 'references', v_refs, 'faces', v_faces,
                       'keep_confirmed', p_keep_confirmed)
  );
  return jsonb_build_object('references', v_refs, 'faces', v_faces);
end;
$$;
revoke all on function public.purge_student_biometrics(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.purge_student_biometrics(uuid, text, boolean) to service_role;

-- O expurgo diário. Quatro gatilhos (spec §9.4):
--   1. referência vencida            → apaga referência e vetores do aluno
--   2. consentimento revogado        → idem, mantendo o `student_id` confirmado
--   3. aluno na lixeira há > 30 dias → tira o aluno de cena e apaga o cadastro
--   4. evento com retenção vencida   → manda foto e evento para a lixeira e,
--                                       passados 30 dias, apaga de vez
--
-- Biometria não espera a lixeira (ver decisão (a) no cabeçalho). Foto espera.
create or replace function public.purge_expired_biometrics()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student   uuid;
  v_expired   int := 0;
  v_revoked   int := 0;
  v_students  int := 0;
  v_events    int := 0;
  v_photos    int := 0;
  v_hard      int := 0;
  v_cutoff    timestamptz := now() - interval '30 days';
  v_rec       record;
begin
  -- 1. Referência vencida (fim do ano letivo, sem renovação automática).
  for v_student in
    select distinct student_id from public.student_reference_faces
     where retention_until < current_date
  loop
    perform public.purge_student_biometrics(v_student, 'reference_expired', true);
    v_expired := v_expired + 1;
  end loop;

  -- 2. Consentimento de reconhecimento revogado e não reconcedido.
  for v_student in
    select distinct a.student_id
      from public.authorizations a
     where a.scope = 'biometric_sorting'
       and a.revoked_at is not null
       and not public.has_active_authorization(a.student_id, 'biometric_sorting')
       and (
         exists (select 1 from public.student_reference_faces r where r.student_id = a.student_id)
         or exists (
           select 1 from public.photo_faces f
            where f.student_id = a.student_id
              and (f.embedding is not null or f.crop_path is not null
                   or f.state in ('suggested','unassigned'))
         )
       )
  loop
    perform public.purge_student_biometrics(v_student, 'consent_revoked', true);
    v_revoked := v_revoked + 1;
  end loop;

  -- 3. Aluno na lixeira há mais de 30 dias. A biometria sai ANTES do
  --    cadastro: depois do delete, `photo_faces.student_id` viraria nulo por
  --    `on delete set null` e deixaria rosto confirmado sem dono, recorte
  --    órfão no bucket e trilha sem `student_ref`.
  for v_student in
    select id from public.students where deleted_at is not null and deleted_at < v_cutoff
  loop
    perform public.purge_student_biometrics(v_student, 'student_purged', false);
    v_students := v_students + 1;
  end loop;
  delete from public.students where deleted_at is not null and deleted_at < v_cutoff;

  -- 4. Evento com retenção vencida → lixeira (30 dias).
  for v_rec in
    select id, school_id from public.events
     where deleted_at is null and photo_retention_until < current_date
  loop
    update public.photos set deleted_at = now()
     where event_id = v_rec.id and deleted_at is null;
    get diagnostics v_photos = row_count;
    update public.events set deleted_at = now(), status = 'archived' where id = v_rec.id;
    perform public.log_biometric_event(
      v_rec.school_id, null, 'photos_purged',
      jsonb_build_object('event_id', v_rec.id, 'photos', v_photos, 'stage', 'trash')
    );
    v_events := v_events + 1;
  end loop;

  -- 4b. Fotos na lixeira há mais de 30 dias: agora sim, de vez. Os objetos
  --     vão para a fila de expurgo do Storage; `photo_faces` cai por cascade.
  for v_rec in
    select p.id, p.school_id, p.event_id, p.storage_path, p.thumb_path
      from public.photos p
     where p.deleted_at is not null and p.deleted_at < v_cutoff
     limit 5000
  loop
    perform public.enqueue_storage_purge('event-photos', array[v_rec.storage_path],
                                         'photo_expired', v_rec.school_id);
    if v_rec.thumb_path is not null then
      perform public.enqueue_storage_purge('event-thumbs', array[v_rec.thumb_path],
                                           'photo_expired', v_rec.school_id);
    end if;
    perform public.enqueue_storage_purge(
      'event-originals',
      array[v_rec.school_id || '/' || v_rec.event_id || '/' || v_rec.id || '.orig'],
      'photo_expired', v_rec.school_id);
    perform public.enqueue_storage_purge(
      'face-crops',
      (select coalesce(array_agg(crop_path) filter (where crop_path is not null), '{}')
         from public.photo_faces where photo_id = v_rec.id),
      'photo_expired', v_rec.school_id);
    delete from public.photos where id = v_rec.id;
    v_hard := v_hard + 1;
  end loop;

  -- Rede de segurança: rosto confirmado que perdeu o aluno (delete direto no
  -- banco, fora deste caminho) não pode continuar confirmado — ele violaria
  -- o CHECK do item 4 e apareceria em pasta de ninguém.
  update public.photo_faces
     set state = 'unassigned', reviewed_by = null, reviewed_at = null,
         embedding = null, crop_path = null
   where state = 'confirmed' and student_id is null;

  return jsonb_build_object(
    'references_expired', v_expired,
    'consent_revoked', v_revoked,
    'students_purged', v_students,
    'events_trashed', v_events,
    'photos_deleted', v_hard
  );
end;
$$;
revoke all on function public.purge_expired_biometrics() from public, anon, authenticated;
grant execute on function public.purge_expired_biometrics() to service_role;

-- `purge_expired_student_trash()` nasceu na Fase 0 apagando o aluno direto.
-- Depois do M4/M5 isso deixaria referência, vetor e recorte para trás. Ela
-- passa a delegar ao expurgo, que trata a biometria antes do cadastro.
create or replace function public.purge_expired_student_trash()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_cutoff  timestamptz := now() - interval '30 days';
begin
  for v_student in
    select id from public.students where deleted_at is not null and deleted_at < v_cutoff
  loop
    perform public.purge_student_biometrics(v_student, 'student_purged', false);
  end loop;
  delete from public.students where deleted_at is not null and deleted_at < v_cutoff;
end;
$$;
revoke all on function public.purge_expired_student_trash() from public, anon;
grant execute on function public.purge_expired_student_trash() to authenticated, service_role;

-- ============================================================
-- 8. pg_cron: o expurgo roda sozinho, diariamente
-- ============================================================

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'iaschool-purge-biometrics';
exception
  when undefined_table or undefined_function then null;
end;
$$;

-- 03:20 UTC = 00:20 em Brasília: fora do horário de uso da escola.
select cron.schedule(
  'iaschool-purge-biometrics',
  '20 3 * * *',
  $cron$select public.purge_expired_biometrics()$cron$
);
