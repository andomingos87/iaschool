\echo '=== CHECKS M5 — photo_faces, busca vetorial e pasta do aluno ==='

-- Estrutura
do $$
begin
  assert to_regclass('public.photo_faces') is not null, 'photo_faces não existe';
  assert to_regclass('public.face_recognition_settings') is not null, 'face_recognition_settings não existe';
  assert (select relrowsecurity from pg_class where oid = 'public.photo_faces'::regclass),
    'photo_faces sem RLS';
  assert (select count(*) from public.face_recognition_settings) = 1,
    'face_recognition_settings deveria ter exatamente uma linha';
  assert (select tau from public.face_recognition_settings where id = 1) = 0.52::real,
    'tau não é o do spike';
  assert (select margin from public.face_recognition_settings where id = 1) = 0.10::real,
    'margem não é a do spike';
  assert (select min_face_px from public.face_recognition_settings where id = 1) = 60,
    'min_face_px não é o do spike';
  assert (select det_size_event from public.face_recognition_settings where id = 1) = 1600,
    'det_size do evento não é 1600';
  assert (select det_size_reference from public.face_recognition_settings where id = 1) = 640,
    'det_size da referência não é 640';
  assert exists (select 1 from pg_indexes where schemaname='public' and indexname='pf_vec_idx'),
    'índice hnsw de photo_faces ausente';
  assert exists (select 1 from pg_indexes where schemaname='public' and indexname='pf_student_idx'),
    'índice da pasta do aluno ausente';
  assert exists (select 1 from pg_trigger
                  where tgname='photo_faces_check' and tgrelid='public.photo_faces'::regclass),
    'trigger photo_faces_check ausente';
end $$;

-- Privilégio de COLUNA: é isto que esconde o vetor, não a RLS.
do $$
begin
  assert not has_column_privilege('authenticated','public.photo_faces','embedding','select'),
    'authenticated lê a coluna embedding';
  assert not has_column_privilege('anon','public.photo_faces','embedding','select'),
    'anon lê a coluna embedding';
  assert has_column_privilege('authenticated','public.photo_faces','bbox','select'),
    'authenticated não lê bbox';
  assert has_column_privilege('authenticated','public.photo_faces','state','select'),
    'authenticated não lê state';
  assert not has_table_privilege('authenticated','public.photo_faces','insert'),
    'authenticated insere rosto direto';
  assert not has_table_privilege('authenticated','public.photo_faces','update'),
    'authenticated altera rosto direto';
  assert not has_table_privilege('authenticated','public.photo_faces','delete'),
    'authenticated apaga rosto direto';
  assert not has_table_privilege('anon','public.photo_faces','select'),
    'anon lê photo_faces';

  -- Busca vetorial é do worker; cliente nenhum monta consulta de vizinhos.
  assert not has_function_privilege('authenticated',
    'public.match_reference_faces(uuid,extensions.vector,int)','execute'),
    'authenticated executa a busca vetorial';
  assert has_function_privilege('service_role',
    'public.match_reference_faces(uuid,extensions.vector,int)','execute'),
    'service_role não executa a busca vetorial';
  assert not has_function_privilege('authenticated',
    'public.complete_recognize_job(bigint,boolean,jsonb,text,boolean)','execute'),
    'authenticated conclui job de reconhecimento';
  assert has_function_privilege('authenticated','public.student_photos(uuid)','execute'),
    'a tela não consegue abrir a pasta do aluno';
  assert not has_function_privilege('anon','public.student_photos(uuid)','execute'),
    'anon abre a pasta do aluno';

  -- Limiar é do papel `dev` (decisão #5): escola não mexe.
  assert (select count(*) from pg_policies
           where schemaname='public' and tablename='face_recognition_settings' and cmd='UPDATE') = 1,
    'face_recognition_settings deveria ter uma policy de update';
  assert not has_table_privilege('authenticated','public.face_recognition_settings','insert'),
    'authenticated insere linha de configuração';
  assert not has_table_privilege('authenticated','public.face_recognition_settings','delete'),
    'authenticated apaga a configuração';
end $$;

-- Storage
do $$
begin
  assert exists (select 1 from storage.buckets where id='face-crops' and not public),
    'bucket face-crops ausente ou público';
  assert exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects' and policyname='face_crops_select'),
    'policy face_crops_select ausente';
  assert not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects' and policyname='face_crops_insert'),
    'recorte é escrito pelo worker: não pode haver policy de insert';
end $$;

\echo '--- roundtrip do reconhecimento'
do $$
declare
  v_user     uuid;
  v_school   uuid := '00000000-0000-0000-0000-00000000c501';
  v_school2  uuid := '00000000-0000-0000-0000-00000000c5b1';
  v_student  uuid := '00000000-0000-0000-0000-00000000c504';
  v_student2 uuid := '00000000-0000-0000-0000-00000000c5b2';
  v_event    uuid := '00000000-0000-0000-0000-00000000c505';
  v_batch    uuid;
  v_photo    uuid := '00000000-0000-0000-0000-00000000c506';
  v_auth     uuid;
  v_job      bigint;
  v_vec      extensions.vector(512);
  v_far      extensions.vector(512);
  v_res      text;
  v_n        int;
  v_sim      real;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'sem usuário em auth.users; roundtrip M5 pulado';
    return;
  end if;

  insert into public.schools (id, name) values (v_school, 'Escola M5');
  insert into public.schools (id, name) values (v_school2, 'Escola M5 (B)');
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student, v_user, v_school, 'Aluno M5', '+5511911110501', '[]'::jsonb);
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student2, v_user, v_school2, 'Aluno de Outra Escola', '+5511911110502', '[]'::jsonb);

  -- Dois vetores bem distantes: um é a referência do aluno, o outro é um
  -- rosto que não corresponde a ninguém.
  v_vec := ('[1' || repeat(',0', 511) || ']')::extensions.vector(512);
  v_far := ('[' || repeat('0,', 511) || '1]')::extensions.vector(512);

  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_student, 'biometric_sorting', now(), v_user) returning id into v_auth;
  insert into public.student_reference_faces (school_id, student_id, embedding, authorization_id, created_by)
  values (v_school, v_student, v_vec, v_auth, v_user);

  insert into public.events (id, school_id, name, event_date, status, created_by)
  values (v_event, v_school, 'Festa M5', current_date, 'processing', v_user);
  insert into public.batch_jobs (school_id, event_id, kind, status, total, created_by)
  values (v_school, v_event, 'ingest', 'running', 1, v_user) returning id into v_batch;
  insert into public.photos (id, school_id, event_id, batch_id, storage_path, content_hash,
                             original_filename, bytes, status, uploaded_by)
  values (v_photo, v_school, v_event, v_batch, v_school || '/' || v_event || '/' || v_photo || '.jpg',
          repeat('c', 64), 'IMG_M5.jpg', 1000, 'processed', v_user);

  -- 1. Busca vetorial: acha o aluno da escola certa e ignora a outra.
  select sim into v_sim from public.match_reference_faces(v_school, v_vec, 5) limit 1;
  assert v_sim > 0.99, 'a referência idêntica devia dar similaridade ~1, deu ' || coalesce(v_sim::text,'null');
  assert (select count(*) from public.match_reference_faces(v_school2, v_vec, 5)) = 0,
    'busca vetorial vazou referência para outra escola (D7)';

  -- 2. Referência vencida sai da busca.
  update public.student_reference_faces set retention_until = current_date - 1
   where student_id = v_student;
  assert (select count(*) from public.match_reference_faces(v_school, v_vec, 5)) = 0,
    'referência vencida ainda aparece na busca';
  update public.student_reference_faces set retention_until = public.reference_retention_default()
   where student_id = v_student;

  -- 3. D5: vetor sem aluno atribuído é recusado.
  begin
    insert into public.photo_faces (school_id, photo_id, bbox, det_score, embedding)
    values (v_school, v_photo, '{"x":1,"y":1,"w":80,"h":80}'::jsonb, 0.9, v_far);
    raise exception 'ERRO: aceitou embedding sem aluno (D5)';
  exception when check_violation then null;
  end;

  -- 4. D5: vetor de aluno sem consentimento também.
  update public.authorizations set revoked_at = now() where id = v_auth;
  begin
    insert into public.photo_faces (school_id, photo_id, bbox, det_score, student_id, embedding)
    values (v_school, v_photo, '{"x":1,"y":1,"w":80,"h":80}'::jsonb, 0.9, v_student, v_vec);
    raise exception 'ERRO: aceitou embedding de aluno sem biometric_sorting (D5)';
  exception when check_violation then null;
  end;
  -- Sem o vetor, o mesmo rosto entra: bbox e det_score são de todo rosto (§9.3.1).
  insert into public.photo_faces (school_id, photo_id, bbox, det_score, student_id)
  values (v_school, v_photo, '{"x":1,"y":1,"w":80,"h":80}'::jsonb, 0.9, v_student);
  delete from public.photo_faces where photo_id = v_photo;
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_student, 'biometric_sorting', now(), v_user) returning id into v_auth;

  -- 5. Aluno de outra escola não entra num rosto desta.
  begin
    insert into public.photo_faces (school_id, photo_id, bbox, det_score, student_id)
    values (v_school, v_photo, '{"x":1,"y":1,"w":80,"h":80}'::jsonb, 0.9, v_student2);
    raise exception 'ERRO: aceitou aluno de outra escola no rosto';
  exception when check_violation then null;
  end;

  -- 6. Conclusão do job: rostos gravados, contagem na foto, evento em review.
  insert into public.photo_jobs (batch_id, photo_id, kind) values (v_batch, v_photo, 'recognize')
  returning id into v_job;
  perform public.claim_photo_jobs('recognize', 10, 120);
  select public.complete_recognize_job(
    v_job, true,
    jsonb_build_array(
      jsonb_build_object(
        'bbox', jsonb_build_object('x',10,'y',10,'w',120,'h',120),
        'det_score', 0.95, 'quality', 0.8,
        'crop_path', v_school || '/' || v_event || '/face1.jpg',
        'embedding', v_vec::text,
        'student_id', v_student::text,
        'match_score', 0.97,
        'state', 'suggested'),
      jsonb_build_object(
        'bbox', jsonb_build_object('x',300,'y',40,'w',70,'h',70),
        'det_score', 0.72,
        'crop_path', v_school || '/' || v_event || '/face2.jpg',
        'runner_up_student_id', v_student::text,
        'runner_up_score', 0.31,
        'state', 'unassigned')
    ), null) into v_res;
  assert v_res = 'done', 'conclusão devia responder done, veio ' || coalesce(v_res,'null');
  assert (select count(*) from public.photo_faces where photo_id = v_photo) = 2,
    'os dois rostos deviam ter sido gravados';
  assert (select faces_count from public.photos where id = v_photo) = 2,
    'faces_count não foi atualizado';
  assert (select count(*) from public.photo_faces
           where photo_id = v_photo and embedding is not null) = 1,
    'só o rosto atribuído devia guardar vetor (D5)';
  assert (select state from public.photo_faces where photo_id = v_photo and student_id = v_student) = 'suggested',
    'o rosto correspondido devia ficar suggested';
  assert (select status from public.events where id = v_event) = 'review',
    'o evento devia sair de processing para review quando o último recognize terminou';

  -- 6b. Falha permanente derruba o job na primeira tentativa.
  insert into public.photos (id, school_id, event_id, batch_id, storage_path, content_hash,
                             original_filename, bytes, status, uploaded_by)
  values ('00000000-0000-0000-0000-00000000c507', v_school, v_event, v_batch,
          v_school || '/' || v_event || '/quebrada.jpg', repeat('d', 64),
          'QUEBRADA.jpg', 10, 'processed', v_user);
  insert into public.photo_jobs (batch_id, photo_id, kind)
  values (v_batch, '00000000-0000-0000-0000-00000000c507', 'recognize')
  returning id into v_job;
  perform public.claim_photo_jobs('recognize', 10, 120);
  select public.complete_recognize_job(v_job, false, null, 'arquivo não é uma imagem legível', true)
    into v_res;
  assert v_res = 'failed', 'falha permanente devia derrubar o job na 1ª tentativa, veio ' || coalesce(v_res,'null');
  assert (select attempts from public.photo_jobs where id = v_job) = 1,
    'falha permanente não devia gastar as 5 tentativas';

  -- 7. Concluir de novo é noop e não duplica rosto.
  select id into v_job from public.photo_jobs
   where photo_id = v_photo and kind = 'recognize';
  select public.complete_recognize_job(v_job, true, '[]'::jsonb, null) into v_res;
  assert v_res = 'noop', 'job concluído devia responder noop';
  assert (select count(*) from public.photo_faces where photo_id = v_photo) = 2,
    'conclusão repetida mexeu nos rostos';

  -- A partir daqui a sessão é membro comum da escola A (mesma razão do m4-checks).
  update public.profiles set approval_status = 'approved', role = 'user' where id = v_user;
  insert into public.school_members (school_id, user_id, role)
  values (v_school, v_user, 'school_admin') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- 8. Pasta do aluno: só `confirmed` entra.
  assert (select count(*) from public.student_photos(v_student)) = 0,
    'sugestão não pode aparecer na pasta do aluno (D6)';
  update public.photo_faces set state = 'confirmed', reviewed_by = v_user, reviewed_at = now()
   where photo_id = v_photo and student_id = v_student;
  assert (select count(*) from public.student_photos(v_student)) = 1,
    'a foto confirmada devia aparecer na pasta do aluno';
  assert (select photo_id from public.student_photos(v_student) limit 1) = v_photo,
    'a pasta trouxe a foto errada';

  -- 9. Aluno de escola de que não sou membro: a RPC recusa.
  begin
    perform public.student_photos(v_student2);
    raise exception 'ERRO: pasta respondeu para aluno de outro tenant';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'roundtrip M5 ok';
end $$;
