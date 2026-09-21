-- ------------------------------------------------------------
-- IAschool — Fase 3, M5: rostos detectados, atribuição e pasta do aluno
-- Migration: iaschool_fase3_photo_faces_recognition
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §5.3, §7.3, §7.6, §8, §9.3.
-- Backlog: BACKLOG.md → Fase 3 → M5.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. `face_recognition_settings` — linha única com os limiares do spike,
--      para recalibrar no piloto sem deploy.
--   2. `photo_faces` — um rosto detectado. O `embedding` é bloqueado por
--      privilégio de COLUNA, não por RLS: nem token válido com consulta
--      arbitrária extrai o vetor (spec §8).
--   3. Trava D5 no banco: só entra `embedding` de rosto atribuído a aluno com
--      `biometric_sorting` ativo. Rosto sem correspondência guarda bbox,
--      det_score e recorte — nunca vetor.
--   4. `match_reference_faces()` — a busca vetorial, `security definer` e
--      filtrada por escola por dentro (D7), executável só pelo worker.
--   5. `complete_recognize_job()` — conclusão do job `recognize` numa
--      transação só: grava os rostos, conta em `photos.faces_count` e move o
--      evento para `review` quando o último job do lote termina.
--   6. Bucket `face-crops` para os recortes da revisão.
--   7. `student_photos()` — a pasta do aluno como consulta N:N (spec §7.6).
--
-- Não entra: a revisão em si (`confirm_face`, `reject_face`,
-- `confirm_faces_bulk`), `biometric_events` e `purge_expired_biometrics()` —
-- tudo M6. Até lá nada é apagado e nenhum rosto vira `confirmed`.
-- ------------------------------------------------------------

-- ============================================================
-- 1. face_recognition_settings (spec §7.3)
-- ============================================================

-- Linha única. Os valores vêm do spike M0 (31/08/2026), medidos em LFW —
-- adultos. Existem aqui, e não no código do worker, porque o piloto vai
-- recalibrá-los com dado de criança e isso não pode exigir deploy.
create table if not exists public.face_recognition_settings (
  id                 smallint primary key default 1 check (id = 1),
  -- Similaridade mínima para sugerir (spike: 0,52).
  tau                real not null default 0.52,
  -- Distância mínima para o segundo colocado (spike: 0,10). É a margem que
  -- zera o erro grave; sem ela, `tau` teria de subir para 0,62.
  margin             real not null default 0.10,
  -- Abaixo disto o rosto vai para revisão mesmo passando no limiar.
  min_face_px        int  not null default 60,
  -- Descartes da detecção (spec §7.3, passo 1).
  min_det_score      real not null default 0.5,
  min_detect_px      int  not null default 40,
  -- `det_size` é por tipo de trabalho: 1600 na foto de evento, 640 no
  -- retrato de referência. Ampliar retrato perde a detecção (spec §7.4).
  det_size_event     int  not null default 1600,
  det_size_reference int  not null default 640,
  neighbors          int  not null default 5,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);
insert into public.face_recognition_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists face_recognition_settings_touch on public.face_recognition_settings;
create trigger face_recognition_settings_touch
  before update on public.face_recognition_settings
  for each row execute function public.touch_updated_at();

alter table public.face_recognition_settings enable row level security;

-- Leitura para qualquer autenticado: a tela precisa explicar por que um rosto
-- foi para a revisão, e não há nada sensível em três números.
drop policy if exists "face_recognition_settings_select" on public.face_recognition_settings;
create policy "face_recognition_settings_select" on public.face_recognition_settings
  for select to authenticated using (true);

-- Escrita só do papel `dev` (decisão #5 de 16/09/2026): mexer no limiar muda
-- quantos rostos de criança o sistema atribui sozinho. Não é ajuste de escola
-- nem de operação do produto.
drop policy if exists "face_recognition_settings_update" on public.face_recognition_settings;
create policy "face_recognition_settings_update" on public.face_recognition_settings
  for update to authenticated using (public.is_dev()) with check (public.is_dev());

revoke insert, delete on table public.face_recognition_settings from anon, authenticated;
revoke all on table public.face_recognition_settings from anon;

-- ============================================================
-- 2. photo_faces (spec §5.3)
-- ============================================================

create table if not exists public.photo_faces (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete cascade,
  photo_id             uuid not null references public.photos (id) on delete cascade,
  -- bbox e det_score são de TODO rosto detectado e sobrevivem ao expurgo do
  -- recorte e do vetor (spec §9.3.1): sem saber onde está o rosto, não há o
  -- que desfocar na entrega, e redescobrir isso depois significa rodar o
  -- worker de novo sobre um acervo fechado.
  bbox                 jsonb not null,
  crop_path            text,
  det_score            real not null,
  quality              real,
  -- Nulo quando o rosto não corresponde a aluno consentido (D5).
  embedding            extensions.vector(512),
  student_id           uuid references public.students (id) on delete set null,
  match_score          real,
  runner_up_student_id uuid references public.students (id) on delete set null,
  runner_up_score      real,
  state                text not null default 'unassigned'
                       check (state in ('unassigned','suggested','confirmed','rejected',
                                       'not_a_student',     -- criança de fora: BORRA na entrega
                                       'adult_or_staff')),  -- adulto: vai nítido (§9.3.1)
  reviewed_by          uuid references auth.users (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists pf_vec_idx on public.photo_faces
  using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index if not exists pf_review_idx  on public.photo_faces (school_id, state, created_at);
create index if not exists pf_student_idx on public.photo_faces (student_id) where state = 'confirmed';
create index if not exists pf_photo_idx   on public.photo_faces (photo_id);

-- D5 e isolamento de tenant no banco, não no worker.
create or replace function public.photo_faces_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_photo_school uuid;
begin
  select school_id into v_photo_school from public.photos where id = new.photo_id;
  if v_photo_school is null or v_photo_school <> new.school_id then
    raise exception 'photo_faces school_id must match photo school_id'
      using errcode = '23514';
  end if;
  if new.student_id is not null then
    if not exists (
      select 1 from public.students s
       where s.id = new.student_id and s.school_id = new.school_id
    ) then
      raise exception 'photo_faces student must belong to the same school'
        using errcode = '23514';
    end if;
  end if;
  -- O vetor de um rosto só persiste sob consentimento do aluno a quem ele foi
  -- atribuído. Rosto sem correspondência guarda bbox e recorte; o embedding
  -- dele existiu em memória, pelo tempo da comparação, e morre ali (spec §9.3).
  if new.embedding is not null then
    if new.student_id is null then
      raise exception 'photo_faces embedding requires an assigned student (D5)'
        using errcode = '23514';
    end if;
    if not public.has_active_authorization(new.student_id, 'biometric_sorting') then
      raise exception 'photo_faces embedding requires active biometric_sorting (D5)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.photo_faces_check() from public, anon, authenticated;

drop trigger if exists photo_faces_check on public.photo_faces;
create trigger photo_faces_check
  before insert or update on public.photo_faces
  for each row execute function public.photo_faces_check();

alter table public.photo_faces enable row level security;

drop policy if exists "photo_faces_select" on public.photo_faces;
create policy "photo_faces_select" on public.photo_faces
  for select to authenticated
  using (public.is_member_of(school_id) or public.is_super_admin());

-- O embedding é bloqueado por privilégio de COLUNA (spec §8). A RLS diz quais
-- LINHAS o membro enxerga; é o grant abaixo que diz quais COLUNAS — e o vetor
-- não está entre elas. Escrita e exclusão só por RPC ou `service_role`.
revoke all on table public.photo_faces from anon, authenticated;
grant select (id, school_id, photo_id, bbox, crop_path, det_score, quality,
              student_id, match_score, runner_up_student_id, runner_up_score,
              state, reviewed_by, reviewed_at, created_at)
  on public.photo_faces to authenticated;

-- ============================================================
-- 3. Busca vetorial isolada por escola (D7)
-- ============================================================

-- O filtro por escola vive DENTRO da função: o worker não tem como esquecê-lo
-- e não recebe um `where` para montar. Executável só pelo `service_role` —
-- busca vetorial na mão de cliente é inferência de identidade.
create or replace function public.match_reference_faces(
  p_school    uuid,
  p_embedding extensions.vector(512),
  p_limit     int default 5
)
returns table (student_id uuid, sim real)
language sql stable security definer set search_path = public as $$
  -- `<=>` mora no schema `extensions`, e o search_path desta função é fixo
  -- em `public` de propósito (migration iaschool_fase1_fix_function_search_path).
  -- Qualificar o operador é o jeito de ter as duas coisas.
  select r.student_id,
         (1 - (r.embedding operator(extensions.<=>) p_embedding))::real as sim
    from public.student_reference_faces r
   where r.school_id = p_school
     -- Referência vencida não compara: o rosto da criança mudou (spec §9.4).
     and r.retention_until >= current_date
   order by r.embedding operator(extensions.<=>) p_embedding
   limit greatest(coalesce(p_limit, 5), 1);
$$;
revoke all on function public.match_reference_faces(uuid, extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_reference_faces(uuid, extensions.vector, int)
  to service_role;

-- ============================================================
-- 4. Conclusão do job `recognize` (spec §7.3, passos 5 e 6)
-- ============================================================

-- Numa transação só: grava os rostos, conta em `photos.faces_count` e, quando
-- o último `recognize` do lote termina, move o evento para `review`. Duas
-- chamadas separadas deixariam foto com rosto e job na fila, ou o contrário.
--
-- `p_faces` é um array de objetos:
--   {bbox:{x,y,w,h}, det_score, quality, crop_path, embedding (texto do vetor
--    ou nulo), student_id, match_score, runner_up_student_id, runner_up_score,
--    state}
--
-- `p_permanent` existe porque nem toda falha melhora com retentativa: arquivo
-- que não é imagem não vira imagem na quinta tentativa, e o lote fica preso
-- esperando cinco leases de 5 minutos. Erro de rede continua sendo requeued.
--
-- Devolve 'done' | 'failed' | 'requeued' | 'noop' | 'missing'.
--
-- Mesmo motivo do drop na fila de referência: o parâmetro novo mudaria a
-- assinatura e criaria sobrecarga.
drop function if exists public.complete_recognize_job(bigint, boolean, jsonb, text);
create or replace function public.complete_recognize_job(
  p_job_id    bigint,
  p_ok        boolean,
  p_faces     jsonb   default null,
  p_error     text    default null,
  p_permanent boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job     public.photo_jobs%rowtype;
  v_photo   public.photos%rowtype;
  v_error   text := left(p_error, 2000);
  v_face    jsonb;
  v_count   int := 0;
  v_event   uuid;
  v_pending int;
begin
  select * into v_job from public.photo_jobs where id = p_job_id for update;
  if not found then
    return 'missing';
  end if;
  if v_job.kind <> 'recognize' then
    raise exception 'complete_recognize_job only handles recognize jobs'
      using errcode = '22023';
  end if;
  if v_job.status <> 'leased' then
    return 'noop';
  end if;

  if not p_ok then
    if p_permanent or v_job.attempts >= 5 then
      update public.photo_jobs
         set status = 'failed', leased_until = null, last_error = v_error
       where id = p_job_id;
      return 'failed';
    end if;
    update public.photo_jobs
       set status = 'queued', leased_until = null, last_error = v_error
     where id = p_job_id;
    return 'requeued';
  end if;

  select * into v_photo from public.photos where id = v_job.photo_id;
  if v_photo.id is null then
    update public.photo_jobs
       set status = 'failed', leased_until = null, last_error = 'foto inexistente'
     where id = p_job_id;
    return 'failed';
  end if;

  -- Reprocessar um lote não pode duplicar rosto: a foto recomeça do zero.
  delete from public.photo_faces where photo_id = v_photo.id;

  for v_face in select * from jsonb_array_elements(coalesce(p_faces, '[]'::jsonb)) loop
    insert into public.photo_faces (
      school_id, photo_id, bbox, crop_path, det_score, quality, embedding,
      student_id, match_score, runner_up_student_id, runner_up_score, state
    ) values (
      v_photo.school_id,
      v_photo.id,
      v_face->'bbox',
      nullif(v_face->>'crop_path', ''),
      (v_face->>'det_score')::real,
      (v_face->>'quality')::real,
      nullif(v_face->>'embedding', '')::extensions.vector(512),
      nullif(v_face->>'student_id', '')::uuid,
      (v_face->>'match_score')::real,
      nullif(v_face->>'runner_up_student_id', '')::uuid,
      (v_face->>'runner_up_score')::real,
      coalesce(nullif(v_face->>'state', ''), 'unassigned')
    );
    v_count := v_count + 1;
  end loop;

  perform set_config('iaschool.photos_rpc', 'rpc', true);
  update public.photos set faces_count = v_count where id = v_photo.id;

  update public.photo_jobs
     set status = 'done', leased_until = null, last_error = null
   where id = p_job_id;

  -- Evento em `processing` desde o fim do upload (M3). Ele sai daqui quando o
  -- último `recognize` do lote termina — é o que o M3 deixou em aberto.
  if v_job.batch_id is not null then
    select count(*) into v_pending
      from public.photo_jobs
     where batch_id = v_job.batch_id
       and kind = 'recognize'
       and status in ('queued','leased');
    if v_pending = 0 then
      select event_id into v_event from public.batch_jobs where id = v_job.batch_id;
      if v_event is not null then
        update public.events set status = 'review'
         where id = v_event and status = 'processing';
      end if;
    end if;
  end if;

  return 'done';
end;
$$;
revoke all on function public.complete_recognize_job(bigint, boolean, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_recognize_job(bigint, boolean, jsonb, text, boolean)
  to service_role;

-- ============================================================
-- 5. Storage: bucket face-crops (spec §6)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('face-crops', 'face-crops', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: {school_id}/{event_id}/{face_id}.jpg. Quem escreve é o worker
-- (`service_role`, que não passa por policy); o membro lê para revisar e
-- apaga no expurgo do M6.
drop policy if exists "face_crops_select" on storage.objects;
create policy "face_crops_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'face-crops'
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

drop policy if exists "face_crops_delete" on storage.objects;
create policy "face_crops_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'face-crops'
    and (public.is_member_of(public.storage_school_id(name)) or public.is_super_admin())
  );

-- ============================================================
-- 6. Pasta do aluno (spec §7.6, R6)
-- ============================================================

-- Consulta, não cópia: uma foto com 5 crianças confirmadas aparece nas 5
-- pastas, com um único arquivo no Storage. Só `confirmed` sai daqui —
-- sugestão nenhuma chega a download ou envio (D6).
create or replace function public.student_photos(p_student uuid)
returns table (
  photo_id     uuid,
  event_id     uuid,
  storage_path text,
  thumb_path   text,
  taken_at     timestamptz,
  created_at   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then
    return;
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.event_id, p.storage_path, p.thumb_path, p.taken_at, p.created_at
      from public.photo_faces f
      join public.photos p on p.id = f.photo_id
     where f.student_id = p_student
       and f.state = 'confirmed'
       and p.deleted_at is null
     group by p.id, p.event_id, p.storage_path, p.thumb_path, p.taken_at, p.created_at
     order by p.taken_at nulls last, p.created_at;
end;
$$;
revoke all on function public.student_photos(uuid) from public, anon;
grant execute on function public.student_photos(uuid) to authenticated;
