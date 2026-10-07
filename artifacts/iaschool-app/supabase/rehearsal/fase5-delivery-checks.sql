-- ------------------------------------------------------------
-- IAschool — ensaio do W3 (lote de entrega, derivados e prévia)
-- Material: docs/spec-whatsapp-api-oficial-entrega-fotos.md §15.3.
-- Migration: iaschool_fase5_delivery_batches.
--
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: não deixa
-- dado no projeto. Uso (após a migration aplicada):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f fase5-delivery-checks.sql
-- qualquer erro de assert aborta com a mensagem.
-- ------------------------------------------------------------

begin;

do $$
declare
  v_school   uuid := 'f5000000-0000-0000-0000-000000000001';
  v_admin    uuid := 'f5000000-0000-0000-0000-0000000000a1';
  v_teacher  uuid := 'f5000000-0000-0000-0000-0000000000a2';
  v_outsider uuid := 'f5000000-0000-0000-0000-0000000000a3';
  v_gok      uuid := 'f5000000-0000-0000-0000-0000000000b1';
  v_gunv     uuid := 'f5000000-0000-0000-0000-0000000000b2';
  v_gnoc     uuid := 'f5000000-0000-0000-0000-0000000000b3';
  v_gpend    uuid := 'f5000000-0000-0000-0000-0000000000b4';
  v_sok      uuid := 'f5000000-0000-0000-0000-0000000000c1';
  v_sunv     uuid := 'f5000000-0000-0000-0000-0000000000c2';
  v_snoc     uuid := 'f5000000-0000-0000-0000-0000000000c3';
  v_spend    uuid := 'f5000000-0000-0000-0000-0000000000c4';
  v_snog     uuid := 'f5000000-0000-0000-0000-0000000000c5';
  v_event    uuid := 'f5000000-0000-0000-0000-0000000000d1';
  v_p1 uuid := 'f5000000-0000-0000-0000-0000000000e1';
  v_p2 uuid := 'f5000000-0000-0000-0000-0000000000e2';
  v_p3 uuid := 'f5000000-0000-0000-0000-0000000000e3';
  v_p4 uuid := 'f5000000-0000-0000-0000-0000000000e4';
  v_pf       jsonb;
  v_rec      jsonb;
  v_batch    uuid;
  v_batch2   uuid;
  v_batch3   uuid;
  v_batch4   uuid;
  v_row      public.delivery_batches%rowtype;
  v_recip    public.delivery_recipients%rowtype;
  v_jobs     bigint[];
  v_job      bigint;
  v_res      jsonb;
  v_n        int;
  v_i        int;
begin
  -- ----------------------------------------------------------
  -- Semente mínima (transacional)
  -- ----------------------------------------------------------
  insert into auth.users (id) values (v_admin), (v_teacher), (v_outsider);
  insert into public.schools (id, name) values (v_school, 'Escola do Ensaio W3');
  insert into public.school_members (school_id, user_id, role) values
    (v_school, v_admin, 'school_admin'),
    (v_school, v_teacher, 'teacher');
  insert into public.profiles (id, email, name, role, approval_status) values
    (v_admin, 'f5-admin@ensaio.local', 'Admin do Ensaio', 'user', 'approved'),
    (v_teacher, 'f5-teacher@ensaio.local', 'Professora do Ensaio', 'user', 'approved'),
    (v_outsider, 'f5-outsider@ensaio.local', 'De Fora', 'user', 'approved')
  on conflict (id) do nothing;

  insert into public.guardians (id, school_id, name, whatsapp, whatsapp_verified_at) values
    (v_gok,   v_school, 'Mãe Apta',       '+5511900000001', now()),
    (v_gunv,  v_school, 'Pai Não Verificado', '+5511900000002', null),
    (v_gnoc,  v_school, 'Mãe Sem Aceite','+5511900000003', now()),
    (v_gpend, v_school, 'Pai Revisão',    '+5511900000004', now());

  insert into public.students (id, school_id, name, whatsapp, owner_id, primary_guardian_id) values
    (v_sok,   v_school, 'Aluno Apto',       '+5511910000001', v_admin, v_gok),
    (v_sunv,  v_school, 'Aluno Não Verif',  '+5511910000002', v_admin, v_gunv),
    (v_snoc,  v_school, 'Aluno Sem Aceite', '+5511910000003', v_admin, v_gnoc),
    (v_spend, v_school, 'Aluno Revisão',    '+5511910000004', v_admin, v_gpend),
    (v_snog,  v_school, 'Aluno Sem Resp',   '+5511910000005', v_admin, null);

  insert into public.events (id, school_id, name, event_date, created_by) values
    (v_event, v_school, 'Festa do Ensaio', '2026-05-01', v_admin);
  insert into public.photos
    (id, school_id, event_id, storage_path, content_hash, original_filename, bytes, uploaded_by) values
    (v_p1, v_school, v_event, 'x/1.jpg', repeat('1', 64), '1.jpg', 100, v_admin),
    (v_p2, v_school, v_event, 'x/2.jpg', repeat('2', 64), '2.jpg', 100, v_admin),
    (v_p3, v_school, v_event, 'x/3.jpg', repeat('3', 64), '3.jpg', 100, v_admin),
    (v_p4, v_school, v_event, 'x/4.jpg', repeat('4', 64), '4.jpg', 100, v_admin);

  insert into public.photo_faces (id, school_id, photo_id, bbox, det_score, state, student_id, reviewed_by, reviewed_at) values
    ('f5000000-0000-0000-0000-0000000000f1', v_school, v_p1, '{"x":10,"y":10,"w":100,"h":100}', 0.99, 'confirmed', v_sok, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f2', v_school, v_p2, '{"x":10,"y":10,"w":100,"h":100}', 0.99, 'confirmed', v_sok, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f3', v_school, v_p3, '{"x":10,"y":10,"w":100,"h":100}', 0.99, 'confirmed', v_sunv, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f4', v_school, v_p1, '{"x":300,"y":10,"w":100,"h":100}', 0.99, 'confirmed', v_snoc, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f5', v_school, v_p1, '{"x":10,"y":300,"w":100,"h":100}', 0.99, 'confirmed', v_spend, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f6', v_school, v_p4, '{"x":10,"y":10,"w":100,"h":100}', 0.99, 'suggested', v_spend, null, null),
    ('f5000000-0000-0000-0000-0000000000f7', v_school, v_p2, '{"x":300,"y":300,"w":100,"h":100}', 0.99, 'confirmed', v_snog, v_admin, now()),
    ('f5000000-0000-0000-0000-0000000000f8', v_school, v_p4, '{"x":300,"y":300,"w":100,"h":100}', 0.99, 'unassigned', null, null, null);

  insert into public.authorizations (id, school_id, student_id, scope, granted_at, evidence, guardian_id) values
    ('f5000000-0000-0000-0000-0000000000a4', v_school, v_sok,  'delivery_whatsapp', now(),
     jsonb_build_object('source','guardian_link','termsVersion','delivery_whatsapp.v1','acceptedAt', now()), v_gok),
    ('f5000000-0000-0000-0000-0000000000a5', v_school, v_sunv, 'delivery_whatsapp', now(),
     jsonb_build_object('source','guardian_link','termsVersion','delivery_whatsapp.v1','acceptedAt', now()), v_gunv),
    ('f5000000-0000-0000-0000-0000000000a6', v_school, v_spend,'delivery_whatsapp', now(),
     jsonb_build_object('source','guardian_link','termsVersion','delivery_whatsapp.v1','acceptedAt', now()), v_gpend);

  -- ----------------------------------------------------------
  -- 1. Preflight
  -- ----------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  v_pf := public.delivery_preflight(v_event);

  assert jsonb_array_length(v_pf->'recipients') = 5, 'preflight: esperava 5 destinatários';
  assert (v_pf->>'unassigned_pending_faces')::int = 1, 'preflight: rosto sem atribuição';

  select r into v_rec from jsonb_array_elements(v_pf->'recipients') r
   where (r->>'guardian_id')::uuid = v_gok;
  assert (v_rec->>'eligible')::boolean, 'preflight: gok deveria ser apto';
  assert v_rec->>'blocked_reason' is null, 'preflight: gok sem motivo';

  select r into v_rec from jsonb_array_elements(v_pf->'recipients') r
   where (r->>'guardian_id')::uuid = v_gunv;
  assert v_rec->>'blocked_reason' = 'numero_nao_verificado', 'preflight: gunv';

  select r into v_rec from jsonb_array_elements(v_pf->'recipients') r
   where (r->>'guardian_id')::uuid = v_gnoc;
  assert v_rec->>'blocked_reason' = 'sem_consentimento', 'preflight: gnoc';

  select r into v_rec from jsonb_array_elements(v_pf->'recipients') r
   where (r->>'guardian_id')::uuid = v_gpend;
  assert v_rec->>'blocked_reason' = 'revisao_pendente', 'preflight: gpend';

  select r into v_rec from jsonb_array_elements(v_pf->'recipients') r
   where r->>'guardian_id' is null;
  assert v_rec->>'blocked_reason' = 'sem_responsavel', 'preflight: sem responsável';

  -- Professor lê; usuário de fora não.
  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_teacher::text)::text, true);
  perform public.delivery_preflight(v_event);
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider::text)::text, true);
  begin
    perform public.delivery_preflight(v_event);
    raise exception 'preflight deveria bloquear usuário de outra escola';
  exception when others then
    if sqlerrm not ilike '%not allowed%' then raise; end if;
  end;

  -- ----------------------------------------------------------
  -- 2. Criar lote apto (congelamento)
  -- ----------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  -- Destinatário inelegível é recusado (antes de existir lote ativo).
  begin
    perform public.create_delivery_batch(v_event, array[v_gunv], 'delivery_whatsapp.v1');
    raise exception 'deveria recusar destinatário inelegível';
  exception when others then
    if sqlerrm not ilike '%verificado%' and sqlerrm not ilike '%elegível%' then raise; end if;
  end;

  v_batch := public.create_delivery_batch(v_event, array[v_gok], 'delivery_whatsapp.v1');

  select * into v_row from public.delivery_batches where id = v_batch;
  assert v_row.status = 'preparing', 'lote deveria nascer preparing';
  assert v_row.recipient_count = 1 and v_row.item_count = 2, 'contadores do lote';

  select * into v_recip from public.delivery_recipients where batch_id = v_batch;
  assert v_recip.status = 'preparing' and v_recip.target_whatsapp = '+5511900000001', 'destinatário congelado';

  select count(*) into v_n from public.delivery_render_jobs where batch_id = v_batch;
  assert v_n = 2, 'fila de render deveria ter 2 jobs';

  -- Um lote ativo por evento.
  begin
    perform public.create_delivery_batch(v_event, array[v_gok], 'delivery_whatsapp.v1');
    raise exception 'deveria recusar segundo lote ativo';
  exception when others then
    if sqlerrm not ilike '%lote ativo%' then raise; end if;
  end;

  -- ----------------------------------------------------------
  -- 3. Render: claim e conclusão
  -- ----------------------------------------------------------
  select array_agg(j.id order by j.id) into v_jobs from public.claim_delivery_render_jobs(10, 120) j;
  assert array_length(v_jobs, 1) = 2, 'claim deveria pegar 2 jobs';
  select count(*) into v_n from public.claim_delivery_render_jobs(10, 120);
  assert v_n = 0, 'claim não deveria repetir job leaseado';

  perform public.complete_delivery_render_job(
    v_jobs[1], true, null, 'x/a1.jpg', 'x/a1.webp', 'hash-a1', 100, 100);
  select * into v_row from public.delivery_batches where id = v_batch;
  assert v_row.rendered_count = 1 and v_row.status = 'preparing', 'contador após 1º render';

  perform public.complete_delivery_render_job(
    v_jobs[2], true, null, 'x/a2.jpg', 'x/a2.webp', 'hash-a2', 100, 100);
  select * into v_row from public.delivery_batches where id = v_batch;
  assert v_row.status = 'awaiting_review', 'lote deveria ir para awaiting_review';
  select * into v_recip from public.delivery_recipients where batch_id = v_batch;
  assert v_recip.status = 'ready', 'destinatário deveria ficar ready';
  select count(*) into v_n from public.delivery_items i
    join public.delivery_recipients r on r.id = i.recipient_id
   where r.batch_id = v_batch and i.render_status = 'done' and i.retention_until > now();
  assert v_n = 2, 'itens sem prazo de expurgo';

  -- ----------------------------------------------------------
  -- 4. Aprovação por papel
  -- ----------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_teacher::text)::text, true);
  begin
    perform public.approve_delivery_batch(v_batch);
    raise exception 'professor não deveria aprovar';
  exception when others then
    if sqlerrm not ilike '%administração%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  v_res := public.approve_delivery_batch(v_batch);
  assert (v_res->>'approved')::int = 1, 'aprovação deveria liberar 1 destinatário';
  select * into v_row from public.delivery_batches where id = v_batch;
  assert v_row.status = 'queued' and v_row.approved_by = v_admin, 'lote aprovado';
  select count(*) into v_n from public.delivery_items i
    join public.delivery_recipients r on r.id = i.recipient_id
   where r.batch_id = v_batch and i.preview_reviewed_by = v_admin;
  assert v_n = 2, 'revisão da prévia deveria carimbar os itens';

  -- ----------------------------------------------------------
  -- 5. Cancelamento antes de transmitir
  -- ----------------------------------------------------------
  v_res := public.cancel_delivery_batch(v_batch);
  assert (v_res->>'canceled_recipients')::int = 1, 'cancelamento do destinatário';
  select * into v_row from public.delivery_batches where id = v_batch;
  assert v_row.status = 'canceled', 'lote cancelado';
  select count(*) into v_n from public.storage_purge_queue
   where bucket = 'delivery-assets' and reason = 'delivery_batch_canceled';
  assert v_n = 4, '4 objetos do lote cancelado deveriam ir para o expurgo';

  -- ----------------------------------------------------------
  -- 6. Falha de render, retry e expiração
  -- ----------------------------------------------------------
  v_batch2 := public.create_delivery_batch(v_event, array[v_gok], 'delivery_whatsapp.v1');
  for v_i in 1..5 loop
    select array_agg(j.id order by j.id) into v_jobs
      from public.claim_delivery_render_jobs(10, 120) j where j.batch_id = v_batch2;
    perform public.complete_delivery_render_job(v_jobs[1], false, 'erro sintético');
    perform public.complete_delivery_render_job(v_jobs[2], false, 'erro sintético');
  end loop;
  select * into v_row from public.delivery_batches where id = v_batch2;
  assert v_row.status = 'preparing' and v_row.failed_count = 2, 'lote com falha fica preparando';
  select count(*) into v_n from public.delivery_render_jobs where batch_id = v_batch2 and status = 'failed';
  assert v_n = 2, 'jobs deveriam falhar na 5ª tentativa';

  v_n := public.retry_failed_delivery_render_jobs(v_batch2);
  assert v_n = 2, 'retry deveria devolver 2 jobs à fila';

  -- Expiração: vence o prazo e o expurgo é enfileirado.
  select array_agg(j.id order by j.id) into v_jobs from public.claim_delivery_render_jobs(10, 120) j
   where j.batch_id = v_batch2;
  perform public.complete_delivery_render_job(v_jobs[1], true, null, 'x/b1.jpg', 'x/b1.webp', 'h-b1', 10, 10);
  perform public.complete_delivery_render_job(v_jobs[2], true, null, 'x/b2.jpg', 'x/b2.webp', 'h-b2', 10, 10);
  update public.delivery_items i
     set retention_until = now() - interval '1 hour'
    from public.delivery_recipients r
   where r.id = i.recipient_id and r.batch_id = v_batch2;
  v_n := public.enqueue_expired_delivery_assets();
  assert v_n = 4, 'expiração deveria enfileirar 4 objetos (2 itens × 2)';
  select count(*) into v_n from public.delivery_items i
    join public.delivery_recipients r on r.id = i.recipient_id
   where r.batch_id = v_batch2 and i.assets_purged_at is null;
  assert v_n = 0, 'itens expirados deveriam ficar com assets_purged_at';

  perform public.cancel_delivery_batch(v_batch2);

  -- ----------------------------------------------------------
  -- 7. Projeções, máscara e grants
  -- ----------------------------------------------------------
  assert public.mask_phone_e164('+5511987654321') = '+55 11 9****-4321', 'máscara do telefone';
  v_res := public.delivery_batches_for_event(v_event);
  assert jsonb_array_length(v_res) = 2, 'dois lotes listados no evento';

  v_res := public.delivery_batch_detail(v_batch);
  assert (v_res->'batch'->>'status') = 'canceled', 'detalhe do lote cancelado';
  assert (v_res->'recipients'->0->>'phone_masked') = '+55 11 9****-0001'
         or public.mask_phone_e164('+5511900000001') = (v_res->'recipients'->0->>'phone_masked'),
         'detalhe mascara o telefone';

  assert has_function_privilege('authenticated', 'public.delivery_preflight(uuid)', 'execute'),
    'authenticated precisa chamar o preflight';
  assert not has_function_privilege('anon', 'public.delivery_preflight(uuid)', 'execute'),
    'anon não pode chamar o preflight';
  assert not has_function_privilege('authenticated', 'public.claim_delivery_render_jobs(integer,integer)', 'execute'),
    'authenticated não pode reivindicar render';
  assert not has_function_privilege('authenticated', 'public.complete_delivery_render_job(bigint,boolean,text,text,text,text,integer,integer)', 'execute'),
    'authenticated não pode concluir render';

  if to_regclass('pg_publication_tables') is not null then
    assert exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and tablename = 'delivery_batches'),
      'delivery_batches deveria estar no Realtime';
  end if;

  raise notice 'ENSAIO W3 OK';
end $$;

select 'ENSAIO W3 OK' as ensaio_w3;

rollback;
