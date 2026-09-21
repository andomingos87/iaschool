-- ------------------------------------------------------------
-- IAschool — Fase 2, M3: fila `photo_jobs`, RPCs de progresso e ingest-worker
-- Migrations: iaschool_fase2_photo_jobs_queue (seções 1 a 4) e
-- iaschool_fase2_batch_progress_rpcs (seções 5 e 6).
--
-- Spec: docs/spec-upload-massa-reconhecimento-facial.md §5.2, §7.2, §8, §11.
-- Backlog: BACKLOG.md → Fase 2 → M3.
--
-- Aplicar via `apply_migration` do MCP (nunca pelo SQL Editor). Este arquivo
-- é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. `photo_jobs` — fila em tabela (D2), RLS ligada e SEM policy: só o
--      `service_role` (worker) e as RPCs `security definer` a alcançam.
--   2. `photos.batch_id` + trigger `after insert` que enfileira `ingest`.
--   3. `batch_jobs.upload_finished_at` e `updated_at` — o lote só fecha quando
--      o upload terminou E todos os jobs de ingest acabaram.
--   4. `claim_photo_jobs` — reserva com `for update skip locked` (spec §5.2).
--   5. RPCs: `finish_batch_upload` (cliente), `complete_photo_job` (worker),
--      `retry_failed_photo_jobs` (cliente) e a interna `batch_jobs_try_close`.
--      O trigger `photos_restrict_client_update` passa a respeitar a flag
--      transacional `iaschool.photos_rpc`, que só RPC definer consegue setar.
--   6. `stalled_batch_jobs` — view `security_invoker` para o alerta de lote
--      parado há mais de 10 min (spec §11); o worker devolve 503 no /health.
--
-- Não entra: `photos` e `photo_jobs` no Realtime (`batch_jobs` já está desde
-- o M2 e é a única fonte de progresso assinada pelo app). Consumidor de
-- `recognize` é do M5; até lá os jobs ficam `queued` sem custo.
-- ------------------------------------------------------------

-- ============================================================
-- 1. photo_jobs
-- ============================================================

create table if not exists public.photo_jobs (
  id           bigint generated always as identity primary key,
  batch_id     uuid not null references public.batch_jobs (id) on delete cascade,
  photo_id     uuid not null references public.photos (id) on delete cascade,
  kind         text not null check (kind in ('ingest','recognize')),
  status       text not null default 'queued'
               check (status in ('queued','leased','done','failed')),
  attempts     int  not null default 0,
  leased_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index if not exists photo_jobs_claim_idx
  on public.photo_jobs (kind, status, id) where status in ('queued','leased');
create index if not exists photo_jobs_batch_idx
  on public.photo_jobs (batch_id, kind, status);
create index if not exists photo_jobs_photo_idx
  on public.photo_jobs (photo_id);

-- RLS ligada e sem policy: igual a guardian_verification_codes e generation_logs.
alter table public.photo_jobs enable row level security;
revoke all on table public.photo_jobs from public, anon, authenticated;

-- ============================================================
-- 2. photos.batch_id + trigger de enfileiramento
-- ============================================================

-- Nullable por um ciclo: o cliente do M2 não manda batch_id e continua
-- inserindo; a foto fica `pending` sem job (backfill opcional em
-- backfill-pending-photos-m3.sql).
alter table public.photos
  add column if not exists batch_id uuid references public.batch_jobs (id) on delete set null;
create index if not exists photos_batch_idx
  on public.photos (batch_id) where batch_id is not null;

create or replace function public.photos_enqueue_ingest()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_batch public.batch_jobs%rowtype;
begin
  if new.batch_id is null then
    return new;
  end if;
  select * into v_batch from public.batch_jobs where id = new.batch_id;
  if not found
     or v_batch.school_id <> new.school_id
     or v_batch.event_id is distinct from new.event_id then
    raise exception 'photo batch_id must belong to the same school and event'
      using errcode = '23514';
  end if;
  if v_batch.status not in ('queued','running') then
    raise exception 'batch % is %, cannot add photos', new.batch_id, v_batch.status
      using errcode = '23514';
  end if;
  insert into public.photo_jobs (batch_id, photo_id, kind)
  values (new.batch_id, new.id, 'ingest');
  return new;
end;
$$;
revoke all on function public.photos_enqueue_ingest() from public, anon, authenticated;

drop trigger if exists photos_enqueue_ingest on public.photos;
create trigger photos_enqueue_ingest
  after insert on public.photos
  for each row execute function public.photos_enqueue_ingest();

-- ============================================================
-- 3. batch_jobs: fim do upload e updated_at
-- ============================================================

alter table public.batch_jobs
  add column if not exists upload_finished_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- touch_updated_at() é do M1 (fase1-min-schools-events.sql).
drop trigger if exists batch_jobs_touch_updated_at on public.batch_jobs;
create trigger batch_jobs_touch_updated_at
  before update on public.batch_jobs
  for each row execute function public.touch_updated_at();

-- Lotes do M2 já fechados pelo cliente: upload terminou quando o lote fechou.
update public.batch_jobs
   set upload_finished_at = coalesce(upload_finished_at, finished_at),
       updated_at         = coalesce(finished_at, created_at)
 where status in ('done','failed','cancelled')
   and (upload_finished_at is null or updated_at = created_at);

-- ============================================================
-- 4. claim_photo_jobs (spec §5.2, literal)
-- ============================================================

create or replace function public.claim_photo_jobs(
  p_kind text, p_limit int, p_lease_seconds int
) returns setof public.photo_jobs
language sql security definer set search_path = public as $$
  with c as (
    select id from public.photo_jobs
    where kind = p_kind
      and (status = 'queued' or (status = 'leased' and leased_until < now()))
      and attempts < 5
    order by id
    limit p_limit
    for update skip locked
  )
  update public.photo_jobs j
     set status = 'leased',
         attempts = j.attempts + 1,
         leased_until = now() + make_interval(secs => p_lease_seconds)
    from c where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_photo_jobs(text,int,int) from public, anon, authenticated;
grant execute on function public.claim_photo_jobs(text,int,int) to service_role;

-- ============================================================
-- 5. RPCs de progresso
-- ============================================================

-- 5.1 O trigger do M2 zera qualquer coluna além de deleted_at quando o
-- chamador é `authenticated` — inclusive dentro de RPC security definer
-- (auth.role() não muda). RPCs que precisam escrever em photos setam a flag
-- transacional `iaschool.photos_rpc`, mesmo padrão de
-- guardians_protect_verification (M1). Cliente via PostgREST não seta.
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
revoke all on function public.photos_restrict_client_update() from public, anon, authenticated;

-- 5.2 Fecha o lote se o upload terminou e todos os jobs ingest acabaram.
create or replace function public.batch_jobs_try_close(p_batch_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v public.batch_jobs%rowtype;
begin
  select * into v from public.batch_jobs where id = p_batch_id for update;
  if not found or v.status <> 'running' or v.upload_finished_at is null then
    return false;
  end if;
  if v.processed + v.failed < v.total then
    return false;
  end if;
  update public.batch_jobs
     set status = case when v.failed > 0 then 'failed' else 'done' end,
         finished_at = now()
   where id = p_batch_id;
  return true;
end;
$$;
revoke all on function public.batch_jobs_try_close(uuid) from public, anon, authenticated;

-- 5.3 Cliente: o upload acabou. `total` é contado no servidor (o cliente pode
-- morrer entre o último insert e esta chamada); p_total só gera warning.
create or replace function public.finish_batch_upload(
  p_batch_id uuid, p_total int default null, p_cancelled boolean default false
) returns public.batch_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_batch  public.batch_jobs%rowtype;
  v_total  int;
  v_photos int;
begin
  select * into v_batch from public.batch_jobs where id = p_batch_id for update;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;
  if not (public.is_super_admin()
          or auth.role() = 'service_role'
          or (public.is_member_of(v_batch.school_id) and v_batch.created_by = auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_batch.upload_finished_at is not null then
    return v_batch;                                   -- idempotente
  end if;

  select count(*) into v_total
    from public.photo_jobs where batch_id = p_batch_id and kind = 'ingest';
  if p_total is not null and p_total <> v_total then
    raise warning 'finish_batch_upload %: client total % <> server total %',
      p_batch_id, p_total, v_total;
  end if;

  update public.batch_jobs
     set upload_finished_at = now(),
         total = v_total,
         status = case when p_cancelled then 'cancelled' else status end
   where id = p_batch_id;

  if v_batch.event_id is not null then
    select count(*) into v_photos
      from public.photos where event_id = v_batch.event_id and deleted_at is null;
    if p_cancelled and v_total = 0 and v_photos = 0 then
      update public.events set status = 'draft'
       where id = v_batch.event_id and status = 'uploading';
    else
      update public.events set status = 'processing'
       where id = v_batch.event_id and status = 'uploading';
    end if;
  end if;

  if not p_cancelled then
    perform public.batch_jobs_try_close(p_batch_id);
  end if;
  select * into v_batch from public.batch_jobs where id = p_batch_id;
  return v_batch;
end;
$$;
revoke all on function public.finish_batch_upload(uuid,int,boolean) from public, anon;
grant execute on function public.finish_batch_upload(uuid,int,boolean) to authenticated, service_role;

-- 5.4 Worker: conclusão de um job reivindicado.
-- Devolve 'done' | 'failed' | 'requeued' | 'noop' | 'missing'.
-- Só age sobre job `leased`: se o lease expirou e outro worker já fechou,
-- devolve 'noop' e nada é contado duas vezes.
create or replace function public.complete_photo_job(
  p_job_id     bigint,
  p_ok         boolean,
  p_error      text        default null,
  p_width      int         default null,
  p_height     int         default null,
  p_thumb_path text        default null,
  p_taken_at   timestamptz default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job    public.photo_jobs%rowtype;
  v_result text;
  v_error  text := left(p_error, 2000);
begin
  select * into v_job from public.photo_jobs where id = p_job_id for update;
  if not found then
    return 'missing';
  end if;
  if v_job.status <> 'leased' then
    return 'noop';
  end if;

  perform set_config('iaschool.photos_rpc', 'rpc', true);

  if p_ok then
    update public.photo_jobs
       set status = 'done', leased_until = null, last_error = null
     where id = p_job_id;
    if v_job.kind = 'ingest' then
      update public.photos
         set status     = 'processed',
             error      = null,
             width      = coalesce(p_width, width),
             height     = coalesce(p_height, height),
             thumb_path = coalesce(p_thumb_path, thumb_path),
             -- o cliente manda taken_at no insert; o EXIF do worker só preenche vazio
             taken_at   = coalesce(taken_at, p_taken_at)
       where id = v_job.photo_id;
      insert into public.photo_jobs (batch_id, photo_id, kind)
      values (v_job.batch_id, v_job.photo_id, 'recognize');
      update public.batch_jobs set processed = processed + 1 where id = v_job.batch_id;
    end if;
    v_result := 'done';

  elsif v_job.attempts >= 5 then
    update public.photo_jobs
       set status = 'failed', leased_until = null, last_error = v_error
     where id = p_job_id;
    if v_job.kind = 'ingest' then
      update public.photos set status = 'failed', error = v_error where id = v_job.photo_id;
      update public.batch_jobs set failed = failed + 1 where id = v_job.batch_id;
    end if;
    v_result := 'failed';

  else
    update public.photo_jobs
       set status = 'queued', leased_until = null, last_error = v_error
     where id = p_job_id;
    v_result := 'requeued';
  end if;

  if v_job.kind = 'ingest' and v_result in ('done','failed') then
    perform public.batch_jobs_try_close(v_job.batch_id);
  end if;
  return v_result;
end;
$$;
revoke all on function public.complete_photo_job(bigint,boolean,text,int,int,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_photo_job(bigint,boolean,text,int,int,text,timestamptz)
  to service_role;

-- 5.5 Cliente: "N fotos não processadas — tentar de novo" (spec §5.2).
create or replace function public.retry_failed_photo_jobs(p_event_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_n      int;
begin
  select school_id into v_school from public.events where id = p_event_id;
  if v_school is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if not (public.is_member_of(v_school) or public.is_super_admin()
          or auth.role() = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform set_config('iaschool.photos_rpc', 'rpc', true);

  with retried as (
    update public.photo_jobs j
       set status = 'queued', attempts = 0, leased_until = null, last_error = null
      from public.photos p
     where p.id = j.photo_id and p.event_id = p_event_id and p.deleted_at is null
       and j.kind = 'ingest' and j.status = 'failed'
    returning j.photo_id, j.batch_id
  ), ph as (
    update public.photos set status = 'pending', error = null
     where id in (select photo_id from retried)
    returning id
  ), per_batch as (
    select batch_id, count(*)::int as n from retried group by batch_id
  ), b as (
    update public.batch_jobs bj
       set failed = greatest(bj.failed - per_batch.n, 0),
           status = 'running',
           finished_at = null
      from per_batch where bj.id = per_batch.batch_id
    returning bj.id
  )
  select count(*) into v_n from retried;

  if v_n > 0 then
    update public.events set status = 'processing'
     where id = p_event_id and status <> 'uploading';
  end if;
  return v_n;
end;
$$;
revoke all on function public.retry_failed_photo_jobs(uuid) from public, anon;
grant execute on function public.retry_failed_photo_jobs(uuid) to authenticated, service_role;

-- ============================================================
-- 6. Alerta de lote parado (spec §11)
-- ============================================================

-- authenticated não lê photo_jobs; a contagem de pendentes passa por esta
-- função definer, que só responde para membro da escola (ou service_role).
create or replace function public.batch_pending_jobs(p_batch_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select case
    when auth.role() = 'service_role'
      or exists (select 1 from public.batch_jobs b
                  where b.id = p_batch_id
                    and (public.is_member_of(b.school_id) or public.is_super_admin()))
    then (select count(*)::int from public.photo_jobs
           where batch_id = p_batch_id and kind = 'ingest' and status in ('queued','leased'))
    else 0 end;
$$;
revoke all on function public.batch_pending_jobs(uuid) from public, anon;
grant execute on function public.batch_pending_jobs(uuid) to authenticated, service_role;

-- security_invoker: herda a RLS de batch_jobs (membro só vê a própria escola).
-- O worker devolve 503 apenas quando pending_jobs > 0: lote abandonado pelo
-- cliente (0 pendentes) não pode derrubar a máquina da Fly em loop.
create or replace view public.stalled_batch_jobs
  with (security_invoker = true) as
select b.id, b.school_id, b.event_id, b.status, b.total, b.processed, b.failed,
       b.upload_finished_at, b.updated_at,
       now() - b.updated_at            as stalled_for,
       public.batch_pending_jobs(b.id) as pending_jobs
  from public.batch_jobs b
 where b.status = 'running'
   and b.updated_at < now() - interval '10 minutes';
revoke all on public.stalled_batch_jobs from public, anon;
grant select on public.stalled_batch_jobs to authenticated, service_role;
