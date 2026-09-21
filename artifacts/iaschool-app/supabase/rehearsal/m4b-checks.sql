\echo '=== CHECKS M4b — fila do rosto de referência (dentro da transação) ==='

-- Estrutura
do $$
begin
  assert to_regclass('public.student_reference_jobs') is not null, 'student_reference_jobs não existe';
  assert (select relrowsecurity from pg_class where oid = 'public.student_reference_jobs'::regclass),
    'student_reference_jobs sem RLS';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='student_reference_jobs') = 3,
    'student_reference_jobs deveria ter 3 policies (select, insert, delete)';
  assert (select count(*) from pg_policies
           where schemaname='public' and tablename='student_reference_jobs' and cmd='UPDATE') = 0,
    'o estado do job é do worker: não pode haver policy de update';
  assert exists (select 1 from pg_trigger
                  where tgname='student_reference_jobs_check'
                    and tgrelid='public.student_reference_jobs'::regclass),
    'trigger student_reference_jobs_check ausente';
  assert exists (select 1 from pg_trigger
                  where tgname='student_reference_jobs_touch'
                    and tgrelid='public.student_reference_jobs'::regclass),
    'trigger student_reference_jobs_touch ausente';
  assert exists (select 1 from pg_indexes where schemaname='public' and indexname='srj_claim_idx'),
    'índice parcial srj_claim_idx ausente';
end $$;

-- Grants: a fila é da escola, o motor é do worker.
do $$
begin
  assert has_table_privilege('authenticated','public.student_reference_jobs','select'),
    'authenticated não lê a própria fila';
  assert has_table_privilege('authenticated','public.student_reference_jobs','insert'),
    'authenticated não enfileira';
  assert has_table_privilege('authenticated','public.student_reference_jobs','delete'),
    'authenticated não consegue desistir de um job';
  assert not has_table_privilege('authenticated','public.student_reference_jobs','update'),
    'authenticated pode alterar o estado do job';
  assert not has_table_privilege('anon','public.student_reference_jobs','select'),
    'anon lê a fila';
  assert not has_function_privilege('authenticated','public.claim_student_reference_jobs(int,int)','execute'),
    'authenticated reivindica job do worker';
  assert not has_function_privilege(
    'authenticated',
    'public.complete_student_reference_job(uuid,boolean,extensions.vector,real,text)',
    'execute'), 'authenticated grava embedding';
  assert has_function_privilege('service_role','public.claim_student_reference_jobs(int,int)','execute'),
    'service_role não reivindica';
  assert has_function_privilege('authenticated','public.retry_student_reference_job(uuid)','execute'),
    'a tela não consegue tentar de novo';
  assert has_function_privilege('authenticated','public.delete_student_reference_face(uuid)','execute'),
    'a tela não consegue remover uma referência';
  assert not has_function_privilege('anon','public.delete_student_reference_face(uuid)','execute'),
    'anon remove referência';
end $$;

\echo '--- roundtrip da fila'
do $$
declare
  v_user     uuid;
  v_school   uuid := '00000000-0000-0000-0000-00000000b401';
  v_school2  uuid := '00000000-0000-0000-0000-00000000b4b1';
  v_student  uuid := '00000000-0000-0000-0000-00000000b404';
  v_student2 uuid := '00000000-0000-0000-0000-00000000b4b2';
  v_auth     uuid;
  v_job      uuid;
  v_job2     uuid;
  v_vec      extensions.vector(512);
  v_res      text;
  v_path     text;
  v_n        int;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'sem usuário em auth.users; roundtrip da fila pulado';
    return;
  end if;

  insert into public.schools (id, name) values (v_school, 'Escola Fila M4');
  insert into public.schools (id, name) values (v_school2, 'Escola Fila M4 (B)');
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student, v_user, v_school, 'Aluno da Fila', '+5511911110091', '[]'::jsonb);
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student2, v_user, v_school2, 'Aluno de Outra Escola', '+5511911110092', '[]'::jsonb);

  v_vec := ('[' || array_to_string(array(select 0.1::real from generate_series(1,512)), ',') || ']')::extensions.vector(512);

  -- 1. Sem consentimento ativo não entra job (mesma trava da tabela de rostos).
  insert into public.authorizations (school_id, student_id, scope, created_by)
  values (v_school, v_student, 'biometric_sorting', v_user)
  returning id into v_auth;
  begin
    insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
    values (v_school, v_student, v_auth, v_school || '/' || v_student || '/j1.jpg', v_user);
    raise exception 'ERRO: enfileirou sem biometric_sorting ativo';
  exception when check_violation then null;
  end;

  -- 2. Com o aceite colhido, entra.
  update public.authorizations set granted_at = now() where id = v_auth;
  insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
  values (v_school, v_student, v_auth, v_school || '/' || v_student || '/j1.jpg', v_user)
  returning id into v_job;
  assert (select status from public.student_reference_jobs where id = v_job) = 'queued',
    'job novo devia nascer queued';

  -- 3. Job não se apoia na autorização de outro aluno.
  begin
    insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
    values (v_school2, v_student2, v_auth, v_school2 || '/' || v_student2 || '/j1.jpg', v_user);
    raise exception 'ERRO: enfileirou com autorização de outro aluno';
  exception when check_violation then null;
  end;

  -- 4. Reivindicar dá lease e conta a tentativa.
  perform public.claim_student_reference_jobs(10, 120);
  assert (select status from public.student_reference_jobs where id = v_job) = 'leased', 'claim não deu lease';
  assert (select attempts from public.student_reference_jobs where id = v_job) = 1, 'claim não contou a tentativa';
  select count(*) into v_n from public.claim_student_reference_jobs(10, 120);
  assert v_n = 0, 'job com lease vivo foi reivindicado de novo';

  -- 5. Concluir sem vetor é erro: a referência não existe sem embedding.
  begin
    perform public.complete_student_reference_job(v_job, true, null, 0.9, null);
    raise exception 'ERRO: aceitou concluir sem embedding';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- 6. Conclusão boa: nasce a linha em student_reference_faces.
  select public.complete_student_reference_job(v_job, true, v_vec, 0.87, null) into v_res;
  assert v_res = 'done', 'conclusão devia responder done, veio ' || coalesce(v_res, 'null');
  assert (select count(*) from public.student_reference_faces where student_id = v_student) = 1,
    'a conclusão não gravou a referência';
  assert (select source_photo_path from public.student_reference_faces where student_id = v_student)
         = v_school || '/' || v_student || '/j1.jpg', 'source_photo_path não veio do job';
  assert (select authorization_id from public.student_reference_faces where student_id = v_student) = v_auth,
    'authorization_id não veio do job';
  assert (select reference_face_id from public.student_reference_jobs where id = v_job) is not null,
    'o job não apontou para a referência criada';

  -- 7. Concluir de novo não duplica.
  select public.complete_student_reference_job(v_job, true, v_vec, 0.87, null) into v_res;
  assert v_res = 'noop', 'job já concluído devia responder noop';
  assert (select count(*) from public.student_reference_faces where student_id = v_student) = 1,
    'conclusão repetida duplicou a referência';

  -- 8. Cinco falhas derrubam o job; o retry zera as tentativas.
  insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
  values (v_school, v_student, v_auth, v_school || '/' || v_student || '/j2.jpg', v_user)
  returning id into v_job2;
  for v_n in 1..5 loop
    perform public.claim_student_reference_jobs(10, 120);
    select public.complete_student_reference_job(v_job2, false, null, null, 'sem rosto na foto') into v_res;
  end loop;
  assert v_res = 'failed', 'o 5º erro devia derrubar o job, veio ' || coalesce(v_res, 'null');
  assert (select last_error from public.student_reference_jobs where id = v_job2) = 'sem rosto na foto',
    'last_error não foi registrado';

  -- A partir daqui a sessão é membro comum da escola A (mesma razão do m4-checks).
  update public.profiles set approval_status = 'approved', role = 'user' where id = v_user;
  insert into public.school_members (school_id, user_id, role)
  values (v_school, v_user, 'school_admin') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  assert public.retry_student_reference_job(v_job2), 'retry devia devolver true';
  assert (select status from public.student_reference_jobs where id = v_job2) = 'queued', 'retry não reenfileirou';
  assert (select attempts from public.student_reference_jobs where id = v_job2) = 0, 'retry não zerou as tentativas';
  assert not public.retry_student_reference_job(v_job), 'retry de job concluído devia devolver false';

  -- 9. Job de escola de que não sou membro: nem retry nem remoção.
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school2, v_student2, 'biometric_sorting', now(), v_user);
  insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
  select v_school2, v_student2, a.id, v_school2 || '/' || v_student2 || '/j9.jpg', v_user
    from public.authorizations a
   where a.student_id = v_student2 and a.revoked_at is null
  returning id into v_job2;
  update public.student_reference_jobs set status = 'failed' where id = v_job2;
  begin
    perform public.retry_student_reference_job(v_job2);
    raise exception 'ERRO: retry respondeu para escola de outro tenant';
  exception when insufficient_privilege then null;
  end;

  -- 9b. Consentimento revogado entre o envio e o processamento: o job morre
  -- como 'revoked', não fica preso em 'leased' estourando no trigger.
  perform set_config('request.jwt.claims', '', true);
  insert into public.student_reference_jobs (school_id, student_id, authorization_id, storage_path, created_by)
  values (v_school, v_student, v_auth, v_school || '/' || v_student || '/j3.jpg', v_user)
  returning id into v_job2;
  perform public.claim_student_reference_jobs(10, 120);
  update public.authorizations set revoked_at = now() where id = v_auth;
  select public.complete_student_reference_job(v_job2, true, v_vec, 0.9, null) into v_res;
  assert v_res = 'revoked', 'job com consentimento revogado devia responder revoked, veio ' || coalesce(v_res, 'null');
  assert (select status from public.student_reference_jobs where id = v_job2) = 'failed',
    'job com consentimento revogado devia ficar failed';
  assert (select count(*) from public.student_reference_faces where student_id = v_student) = 1,
    'não pode nascer referência sob consentimento revogado';
  -- Reconcede para o passo 10 (que remove a referência já existente).
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_student, 'biometric_sorting', now(), v_user);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- 10. Remover a referência pela RPC devolve o caminho do arquivo.
  select public.delete_student_reference_face(id) into v_path
    from public.student_reference_faces where student_id = v_student;
  assert v_path = v_school || '/' || v_student || '/j1.jpg', 'a RPC não devolveu o caminho do objeto';
  assert (select count(*) from public.student_reference_faces where student_id = v_student) = 0,
    'a referência não foi removida';
  assert public.delete_student_reference_face('00000000-0000-0000-0000-0000000000ff') is null,
    'remover referência inexistente devia devolver null';

  perform set_config('request.jwt.claims', '', true);
  raise notice 'roundtrip M4b ok';
end $$;
