\echo '=== CHECKS M3 (dentro da transação) ==='

-- Estrutura
do $$
begin
  assert to_regclass('public.photo_jobs') is not null, 'photo_jobs não existe';
  assert (select relrowsecurity from pg_class where oid = 'public.photo_jobs'::regclass), 'photo_jobs sem RLS';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='photo_jobs') = 0, 'photo_jobs não pode ter policy';
  assert exists (select 1 from information_schema.columns where table_schema='public' and table_name='photos' and column_name='batch_id'), 'photos.batch_id ausente';
  assert exists (select 1 from information_schema.columns where table_schema='public' and table_name='batch_jobs' and column_name='upload_finished_at'), 'batch_jobs.upload_finished_at ausente';
  assert exists (select 1 from information_schema.columns where table_schema='public' and table_name='batch_jobs' and column_name='updated_at'), 'batch_jobs.updated_at ausente';
  assert exists (select 1 from pg_trigger where tgname='photos_enqueue_ingest' and tgrelid='public.photos'::regclass), 'trigger photos_enqueue_ingest ausente';
  assert exists (select 1 from pg_trigger where tgname='batch_jobs_touch_updated_at' and tgrelid='public.batch_jobs'::regclass), 'trigger batch_jobs_touch_updated_at ausente';
  assert exists (select 1 from pg_views where schemaname='public' and viewname='stalled_batch_jobs'), 'view stalled_batch_jobs ausente';
  assert (select 'security_invoker=true' = any(reloptions) from pg_class where oid='public.stalled_batch_jobs'::regclass), 'view sem security_invoker';
end $$;

-- Grants
do $$
begin
  assert not has_function_privilege('authenticated','public.claim_photo_jobs(text,int,int)','execute'), 'authenticated executa claim_photo_jobs';
  assert not has_function_privilege('anon','public.claim_photo_jobs(text,int,int)','execute'), 'anon executa claim_photo_jobs';
  assert has_function_privilege('service_role','public.claim_photo_jobs(text,int,int)','execute'), 'service_role não executa claim_photo_jobs';
  assert not has_function_privilege('authenticated','public.complete_photo_job(bigint,boolean,text,int,int,text,timestamptz)','execute'), 'authenticated executa complete_photo_job';
  assert has_function_privilege('service_role','public.complete_photo_job(bigint,boolean,text,int,int,text,timestamptz)','execute'), 'service_role não executa complete_photo_job';
  assert has_function_privilege('authenticated','public.finish_batch_upload(uuid,int,boolean)','execute'), 'authenticated não executa finish_batch_upload';
  assert has_function_privilege('authenticated','public.retry_failed_photo_jobs(uuid)','execute'), 'authenticated não executa retry_failed_photo_jobs';
  assert not has_function_privilege('authenticated','public.batch_jobs_try_close(uuid)','execute'), 'authenticated executa batch_jobs_try_close';
  assert not has_table_privilege('authenticated','public.photo_jobs','select'), 'authenticated lê photo_jobs';
  assert has_table_privilege('authenticated','public.stalled_batch_jobs','select'), 'authenticated não lê stalled_batch_jobs';
end $$;

\echo '--- roundtrip funcional (como postgres; auth.role() é nulo → passa pelo trigger de update)'
do $$
declare
  v_user   uuid;
  v_school uuid := '00000000-0000-0000-0000-00000000c0de';
  v_event  uuid := '00000000-0000-0000-0000-00000000e0e0';
  v_batch  uuid;
  v_photo1 uuid := '00000000-0000-0000-0000-00000000f001';
  v_photo2 uuid := '00000000-0000-0000-0000-00000000f002';
  v_job    public.photo_jobs%rowtype;
  v_res    text;
  v_b      public.batch_jobs%rowtype;
  i        int;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'sem usuário em auth.users; roundtrip pulado';
    return;
  end if;

  insert into public.schools (id, name) values (v_school, 'Escola Ensaio M3');
  insert into public.events (id, school_id, name, event_date, status, created_by)
  values (v_event, v_school, 'Evento Ensaio', current_date, 'uploading', v_user);
  insert into public.batch_jobs (school_id, event_id, kind, status, total, created_by)
  values (v_school, v_event, 'ingest', 'running', 2, v_user) returning id into v_batch;

  insert into public.photos (id, school_id, event_id, batch_id, storage_path, content_hash, original_filename, bytes, uploaded_by)
  values (v_photo1, v_school, v_event, v_batch, v_school||'/'||v_event||'/'||v_photo1||'.jpg', repeat('a',64), 'a.jpg', 10, v_user),
         (v_photo2, v_school, v_event, v_batch, v_school||'/'||v_event||'/'||v_photo2||'.jpg', repeat('b',64), 'b.jpg', 10, v_user);
  assert (select count(*) from public.photo_jobs where batch_id = v_batch and kind='ingest' and status='queued') = 2, 'trigger não criou 2 jobs';

  -- fim do upload: total contado no servidor, evento → processing
  v_b := public.finish_batch_upload(v_batch, 2, false);
  assert v_b.total = 2 and v_b.upload_finished_at is not null and v_b.status = 'running', 'finish_batch_upload errado';
  assert (select status from public.events where id = v_event) = 'processing', 'evento não foi para processing';

  -- claim + ok
  select * into v_job from public.claim_photo_jobs('ingest', 1, 120) limit 1;
  assert v_job.status = 'leased' and v_job.attempts = 1, 'claim não reservou';
  v_res := public.complete_photo_job(v_job.id, true, null, 1600, 1200, 'x/y/z.webp', '2026-03-14T18:09:26Z');
  assert v_res = 'done', 'complete ok devolveu '||v_res;
  assert (select status from public.photos where id = v_job.photo_id) = 'processed', 'foto não processed';
  assert (select thumb_path from public.photos where id = v_job.photo_id) = 'x/y/z.webp', 'thumb_path não gravado';
  assert exists (select 1 from public.photo_jobs where photo_id = v_job.photo_id and kind='recognize'), 'recognize não enfileirado';
  assert (select processed from public.batch_jobs where id = v_batch) = 1, 'processed não incrementou';
  v_res := public.complete_photo_job(v_job.id, true);
  assert v_res = 'noop', 'segunda conclusão devia ser noop';

  -- claim + 5 falhas → failed e lote fecha como failed
  for i in 1..5 loop
    select * into v_job from public.claim_photo_jobs('ingest', 1, 120) limit 1;
    assert v_job.id is not null, 'claim vazio na tentativa '||i;
    v_res := public.complete_photo_job(v_job.id, false, 'erro simulado '||i);
  end loop;
  assert v_res = 'failed', 'quinta falha devia ser failed, foi '||v_res;
  assert (select status from public.photos where id = v_job.photo_id) = 'failed', 'foto não failed';
  assert (select error from public.photos where id = v_job.photo_id) = 'erro simulado 5', 'error não gravado';
  select * into v_b from public.batch_jobs where id = v_batch;
  assert v_b.failed = 1 and v_b.status = 'failed' and v_b.finished_at is not null, 'lote não fechou como failed';
  -- now() é constante na transação: só dá para checar que o trigger existe e escreveu.
  assert v_b.updated_at is not null and v_b.updated_at >= v_b.created_at, 'updated_at não andou';
  assert (select count(*) from public.claim_photo_jobs('ingest', 10, 120)) = 0, 'ainda há job reivindicável';

  -- retry
  assert public.retry_failed_photo_jobs(v_event) = 1, 'retry não devolveu 1';
  assert (select status from public.photos where id = v_job.photo_id) = 'pending', 'foto não voltou a pending';
  select * into v_b from public.batch_jobs where id = v_batch;
  assert v_b.failed = 0 and v_b.status = 'running' and v_b.finished_at is null, 'lote não reabriu';
  assert (select attempts from public.photo_jobs where id = v_job.id) = 0, 'attempts não zerou';

  -- lease expirado é reclamado
  update public.photo_jobs set status='leased', attempts=1, leased_until = now() - interval '1 second' where id = v_job.id;
  select * into v_job from public.claim_photo_jobs('ingest', 1, 120) limit 1;
  assert v_job.id is not null and v_job.attempts = 2, 'lease expirado não foi reclamado';

  -- lote parado (o trigger de updated_at reescreveria now(); desligado só no ensaio,
  -- o rollback devolve tudo)
  alter table public.batch_jobs disable trigger batch_jobs_touch_updated_at;
  update public.batch_jobs set updated_at = now() - interval '11 minutes' where id = v_batch;
  alter table public.batch_jobs enable trigger batch_jobs_touch_updated_at;
  assert (select count(*) from public.stalled_batch_jobs where id = v_batch) = 1, 'stalled_batch_jobs não listou o lote';
  -- como postgres (sem JWT) pending_jobs é 0; simulando o JWT do service_role ele conta
  assert (select pending_jobs from public.stalled_batch_jobs where id = v_batch) = 0, 'pending_jobs devia ser 0 sem JWT';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert (select pending_jobs from public.stalled_batch_jobs where id = v_batch) = 1, 'pending_jobs devia ser 1 como service_role';
  perform set_config('request.jwt.claims', '', true);

  -- foto de outro lote/evento recusada
  begin
    insert into public.photos (school_id, event_id, batch_id, storage_path, content_hash, original_filename, bytes, uploaded_by)
    values (v_school, v_event, gen_random_uuid(), 'p', repeat('c',64), 'c.jpg', 1, v_user);
    raise exception 'batch_id inexistente devia falhar';
  exception when check_violation or foreign_key_violation then null;
  end;

  raise notice 'roundtrip M3 ok';
end $$;
