\echo '=== CHECKS M6 — revisão, trilha e expurgo ==='

-- Estrutura
do $$
begin
  assert to_regclass('public.biometric_events') is not null, 'biometric_events não existe';
  assert to_regclass('public.storage_purge_queue') is not null, 'storage_purge_queue não existe';
  assert (select relrowsecurity from pg_class where oid = 'public.biometric_events'::regclass),
    'biometric_events sem RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.storage_purge_queue'::regclass),
    'storage_purge_queue sem RLS';

  -- Trilha append-only: lê quem é membro, ninguém escreve, altera ou apaga.
  assert (select count(*) from pg_policies
           where schemaname='public' and tablename='biometric_events') = 1,
    'biometric_events deveria ter só a policy de select';
  assert has_table_privilege('authenticated','public.biometric_events','select'),
    'membro não lê a trilha';
  assert not has_table_privilege('authenticated','public.biometric_events','insert'),
    'cliente insere na trilha — trilha que o cliente escreve é trilha que ele forja';
  assert not has_table_privilege('authenticated','public.biometric_events','update'),
    'cliente altera a trilha';
  assert not has_table_privilege('authenticated','public.biometric_events','delete'),
    'cliente apaga a trilha';
  assert not has_table_privilege('anon','public.biometric_events','select'),
    'anon lê a trilha';

  -- Fila de expurgo do Storage: só o worker.
  assert not has_table_privilege('authenticated','public.storage_purge_queue','select'),
    'cliente lê a fila de expurgo';
  assert has_function_privilege('service_role','public.claim_storage_purge(int,int)','execute'),
    'worker não reivindica expurgo de Storage';
  assert not has_function_privilege('authenticated','public.claim_storage_purge(int,int)','execute'),
    'cliente reivindica expurgo de Storage';

  -- RPCs de revisão: da tela, nunca do worker nem do anônimo.
  assert has_function_privilege('authenticated','public.confirm_face(uuid,uuid)','execute'),
    'a tela não confirma rosto';
  assert has_function_privilege('authenticated','public.confirm_faces_bulk(uuid[],uuid)','execute'),
    'a tela não confirma em lote';
  assert has_function_privilege('authenticated','public.reject_face(uuid,text,text)','execute'),
    'a tela não recusa rosto';
  assert not has_function_privilege('anon','public.confirm_faces_bulk(uuid[],uuid)','execute'),
    'anon confirma em lote';
  assert not has_function_privilege('authenticated','public.purge_expired_biometrics()','execute'),
    'cliente dispara o expurgo';
  assert not has_function_privilege('authenticated','public.purge_student_biometrics(uuid,text,boolean)','execute'),
    'cliente expurga biometria de aluno';

  -- D6/R7 no banco.
  assert exists (select 1 from pg_constraint where conname='photo_faces_confirmed_needs_reviewer'),
    'falta o CHECK que impede confirmado sem revisor';

  -- Limiares da partição em lote (§7.5).
  assert (select bulk_min_sim from public.face_recognition_settings where id=1) = 0.64::real,
    'bulk_min_sim não é 0,64';
  assert (select bulk_min_margin from public.face_recognition_settings where id=1) = 0.15::real,
    'bulk_min_margin não é 0,15';

  -- Expurgo agendado.
  assert exists (select 1 from cron.job where jobname='iaschool-purge-biometrics' and active),
    'o expurgo diário não está agendado no pg_cron';
end $$;

\echo '--- roundtrip da revisão'
do $$
declare
  v_user     uuid := '00000000-0000-0000-0000-0000000060a1';
  v_school   uuid := '00000000-0000-0000-0000-000000006001';
  v_schoolB  uuid := '00000000-0000-0000-0000-0000000060b1';
  v_student  uuid := '00000000-0000-0000-0000-000000006002';
  v_student2 uuid := '00000000-0000-0000-0000-000000006003';
  v_studentB uuid := '00000000-0000-0000-0000-0000000060b2';
  v_event    uuid := '00000000-0000-0000-0000-000000006004';
  v_eventB   uuid := '00000000-0000-0000-0000-0000000060b4';
  v_photo1   uuid := '00000000-0000-0000-0000-000000006005';
  v_photo2   uuid := '00000000-0000-0000-0000-000000006006';
  v_photoB   uuid := '00000000-0000-0000-0000-0000000060b5';
  v_auth     uuid;
  v_vec      extensions.vector(512);
  v_f1       uuid;
  v_f2       uuid;
  v_f3       uuid;
  v_fB       uuid;
  v_n        int;
  v_crop     text;
  v_rec      record;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'revisor-m6@teste.local', 'x', now(), '{}', '{}', now(), now());

  insert into public.profiles (id, email, name, role, approval_status)
  values (v_user, 'revisor-m6@teste.local', 'Revisor M6', 'user', 'approved');

  insert into public.schools (id, name) values (v_school, 'Escola M6'), (v_schoolB, 'Escola M6 (B)');
  insert into public.school_members (school_id, user_id, role)
  values (v_school, v_user, 'school_admin');

  insert into public.students (id, owner_id, school_id, name, whatsapp, photos, enrollment_number)
  values (v_student,  v_user, v_school,  'Aluno M6',   '+5511911116001', '[]'::jsonb, 'MAT-6001'),
         (v_student2, v_user, v_school,  'Aluno M6 2', '+5511911116002', '[]'::jsonb, null),
         (v_studentB, v_user, v_schoolB, 'Aluno de B', '+5511911116003', '[]'::jsonb, 'MAT-B');

  v_vec := ('[1' || repeat(',0', 511) || ']')::extensions.vector(512);

  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_student, 'biometric_sorting', now(), v_user) returning id into v_auth;
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_schoolB, v_studentB, 'biometric_sorting', now(), v_user);

  -- A trilha do consentimento nasce de trigger, sem ninguém chamar nada.
  assert (select count(*) from public.biometric_events
           where student_id = v_student and kind = 'consent_granted') = 1,
    'o aceite não virou linha na trilha';
  assert (select student_ref from public.biometric_events
           where student_id = v_student and kind = 'consent_granted') = 'MAT-6001',
    'a trilha devia gravar a matrícula do momento do fato';

  insert into public.events (id, school_id, name, event_date, status, created_by)
  values (v_event,  v_school,  'Festa M6',   current_date, 'review', v_user),
         (v_eventB, v_schoolB, 'Festa M6 B', current_date, 'review', v_user);
  insert into public.photos (id, school_id, event_id, storage_path, content_hash,
                             original_filename, bytes, status, uploaded_by)
  values (v_photo1, v_school, v_event, v_school || '/' || v_event || '/' || v_photo1 || '.jpg',
          repeat('6', 64), 'IMG_1.jpg', 1000, 'processed', v_user),
         (v_photo2, v_school, v_event, v_school || '/' || v_event || '/' || v_photo2 || '.jpg',
          repeat('7', 64), 'IMG_2.jpg', 1000, 'processed', v_user),
         (v_photoB, v_schoolB, v_eventB, v_schoolB || '/' || v_eventB || '/' || v_photoB || '.jpg',
          repeat('8', 64), 'IMG_B.jpg', 1000, 'processed', v_user);

  -- Dois rostos sugeridos do mesmo aluno (um alto, um "precisa de atenção"),
  -- um rosto sem correspondência e um rosto da outra escola.
  insert into public.photo_faces (school_id, photo_id, bbox, crop_path, det_score, embedding,
                                  student_id, match_score, runner_up_student_id, runner_up_score, state)
  values (v_school, v_photo1, '{"x":10,"y":10,"w":120,"h":120}'::jsonb,
          v_school || '/' || v_event || '/' || v_photo1 || '-0.jpg', 0.95, v_vec,
          v_student, 0.91, v_student2, 0.20, 'suggested')
  returning id into v_f1;
  insert into public.photo_faces (school_id, photo_id, bbox, crop_path, det_score, embedding,
                                  student_id, match_score, runner_up_student_id, runner_up_score, state)
  values (v_school, v_photo2, '{"x":40,"y":10,"w":90,"h":90}'::jsonb,
          v_school || '/' || v_event || '/' || v_photo2 || '-0.jpg', 0.80, v_vec,
          v_student, 0.55, v_student2, 0.50, 'suggested')
  returning id into v_f2;
  insert into public.photo_faces (school_id, photo_id, bbox, crop_path, det_score, state)
  values (v_school, v_photo2, '{"x":300,"y":40,"w":70,"h":70}'::jsonb,
          v_school || '/' || v_event || '/' || v_photo2 || '-1.jpg', 0.70, 'unassigned')
  returning id into v_f3;
  insert into public.photo_faces (school_id, photo_id, bbox, det_score, state)
  values (v_schoolB, v_photoB, '{"x":1,"y":1,"w":50,"h":50}'::jsonb, 0.9, 'unassigned')
  returning id into v_fB;

  -- 1. O CHECK da D6: confirmado sem revisor é recusado até no acesso direto.
  begin
    update public.photo_faces set state = 'confirmed' where id = v_f1;
    raise exception 'ERRO: aceitou confirmado sem reviewed_by (D6/R7)';
  exception when check_violation then null;
  end;

  -- A partir daqui a sessão é a de um membro da escola A.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  assert auth.uid() = v_user, 'sessão simulada não pegou';

  -- 2. Leitura da tela: a partição por confiança vem pronta do banco.
  assert (select count(*) from public.event_review_faces(v_event)) = 3,
    'a tela devia ver 3 rostos pendentes';
  assert (select high_confidence from public.event_review_faces(v_event) where face_id = v_f1),
    'o rosto de 0,91 com margem 0,71 devia nascer marcado';
  assert not (select high_confidence from public.event_review_faces(v_event) where face_id = v_f2),
    'o rosto de 0,55 com margem 0,05 devia nascer desmarcado';
  assert (select student_name from public.event_review_faces(v_event) where face_id = v_f1) = 'Aluno M6',
    'a tela precisa do nome do aluno sugerido';
  -- 3. Evento de outra escola é recusado, não devolvido vazio.
  begin
    perform public.event_review_faces(v_eventB);
    raise exception 'ERRO: leu a revisão de outra escola';
  exception when insufficient_privilege then null;
  end;

  -- 4. Lote com um rosto de outra escola: não confirma nenhum (§7.5).
  begin
    perform public.confirm_faces_bulk(array[v_f1, v_fB], v_student);
    raise exception 'ERRO: confirmou lote com rosto de outra escola';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.photo_faces where state = 'confirmed') = 0,
    'o lote reprovado não podia ter confirmado nada';

  -- 5. Lote com um id inexistente: idem.
  begin
    perform public.confirm_faces_bulk(array[v_f1, gen_random_uuid()], v_student);
    raise exception 'ERRO: confirmou lote com rosto inexistente';
  exception when foreign_key_violation then null;
  end;
  assert (select count(*) from public.photo_faces where state = 'confirmed') = 0,
    'o lote reprovado não podia ter confirmado nada';

  -- 6. O lote legítimo: dois rostos, um ato humano, uma linha na trilha.
  v_n := public.confirm_faces_bulk(array[v_f1, v_f2], v_student);
  assert v_n = 2, 'o lote devia confirmar 2, confirmou ' || v_n;
  assert (select count(*) from public.photo_faces
           where id in (v_f1, v_f2) and state = 'confirmed'
             and reviewed_by = v_user and reviewed_at is not null) = 2,
    'nenhuma linha confirmada pode ficar sem revisor, nem vinda de lote (D6)';
  assert (select count(*) from public.biometric_events
           where kind = 'face_confirmed' and student_id = v_student) = 1,
    'o lote devia gravar exatamente uma linha na trilha';
  assert (select (detail->>'count')::int from public.biometric_events
           where kind = 'face_confirmed' and student_id = v_student) = 2,
    'a linha do lote devia contar os 2 rostos';
  assert (select jsonb_array_length(detail->'face_ids') from public.biometric_events
           where kind = 'face_confirmed' and student_id = v_student) = 2,
    'a linha do lote devia listar os face_ids';

  -- 7. Segundo revisor no mesmo aluno: não confirma de novo nem perde face.
  v_n := public.confirm_faces_bulk(array[v_f1, v_f2], v_student);
  assert v_n = 0, 'a segunda confirmação devia ser no-op, veio ' || v_n;
  assert (select count(*) from public.biometric_events
           where kind = 'face_confirmed' and student_id = v_student) = 1,
    'no-op não pode gravar linha na trilha';

  -- 8. Pasta do aluno: só confirmado, uma linha por foto.
  assert (select count(*) from public.student_photos(v_student)) = 2,
    'a pasta do aluno devia ter as 2 fotos confirmadas';

  -- 9. "Adulto / equipe": vetor e recorte somem, bbox e det_score ficam.
  v_crop := public.reject_face(v_f3, 'adult_or_staff', 'professora');
  assert v_crop is not null, 'a RPC devia devolver o caminho do recorte';
  select * into v_rec from public.photo_faces where id = v_f3;
  assert v_rec.state = 'adult_or_staff', 'estado errado depois da recusa';
  assert v_rec.crop_path is null and v_rec.embedding is null,
    'recorte e vetor deviam sumir na hora';
  assert v_rec.bbox is not null and v_rec.det_score is not null,
    'bbox e det_score precisam sobreviver: sem eles não há o que desfocar (§9.3.1)';
  assert exists (select 1 from public.storage_purge_queue
                  where bucket = 'face-crops' and path = v_crop),
    'o recorte devia entrar na fila de expurgo do Storage';
  assert (select count(*) from public.biometric_events where kind = 'face_purged') = 1,
    'a recusa devia virar linha na trilha';

  -- 10. Sem rosto pendente, o evento sai de `review`.
  assert (select status from public.events where id = v_event) = 'ready',
    'o evento devia virar ready quando a revisão acabou';

  -- 11. Confirmar exige consentimento ativo.
  insert into public.photo_faces (school_id, photo_id, bbox, det_score, state)
  values (v_school, v_photo1, '{"x":5,"y":5,"w":60,"h":60}'::jsonb, 0.8, 'unassigned');
  update public.authorizations set revoked_at = now() where id = v_auth;
  begin
    perform public.confirm_face(
      (select id from public.photo_faces where photo_id = v_photo1 and state = 'unassigned'),
      v_student);
    raise exception 'ERRO: confirmou rosto de aluno sem biometric_sorting ativo';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.biometric_events
           where kind = 'consent_revoked' and student_id = v_student) = 1,
    'a revogação devia virar linha na trilha';
end $$;

\echo '--- roundtrip do expurgo'
do $$
declare
  v_user    uuid := '00000000-0000-0000-0000-0000000061a1';
  v_school  uuid := '00000000-0000-0000-0000-000000006101';
  v_stKeep  uuid := '00000000-0000-0000-0000-000000006102';  -- referência vencida
  v_stGone  uuid := '00000000-0000-0000-0000-000000006103';  -- aluno expurgado
  v_event   uuid := '00000000-0000-0000-0000-000000006104';
  v_evOld   uuid := '00000000-0000-0000-0000-000000006105';
  v_photo   uuid := '00000000-0000-0000-0000-000000006106';
  v_phOld   uuid := '00000000-0000-0000-0000-000000006107';
  v_auth1   uuid;
  v_auth2   uuid;
  v_vec     extensions.vector(512);
  v_face1   uuid;
  v_face2   uuid;
  v_res     jsonb;
  v_ref     text;
begin
  -- Volta para a conexão direta: o expurgo é do `pg_cron`/`service_role`,
  -- não de sessão de tela. (A sessão simulada do bloco anterior sobrevive à
  -- saída do DO — `set_config(..., true)` é local à transação, não ao bloco.)
  perform set_config('request.jwt.claims', '', true);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'expurgo-m6@teste.local', 'x', now(), '{}', '{}', now(), now());
  insert into public.profiles (id, email, name, role, approval_status)
  values (v_user, 'expurgo-m6@teste.local', 'Revisor expurgo M6', 'user', 'approved');
  insert into public.schools (id, name) values (v_school, 'Escola M6 expurgo');
  insert into public.school_members (school_id, user_id, role) values (v_school, v_user, 'school_admin');
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos, enrollment_number)
  values (v_stKeep, v_user, v_school, 'Aluno Retido',   '+5511911116101', '[]'::jsonb, 'MAT-KEEP'),
         (v_stGone, v_user, v_school, 'Aluno Expurgado','+5511911116102', '[]'::jsonb, 'MAT-GONE');

  v_vec := ('[1' || repeat(',0', 511) || ']')::extensions.vector(512);
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_stKeep, 'biometric_sorting', now(), v_user) returning id into v_auth1;
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_stGone, 'biometric_sorting', now(), v_user) returning id into v_auth2;

  insert into public.student_reference_faces (school_id, student_id, embedding, source_photo_path,
                                              authorization_id, retention_until, created_by)
  values (v_school, v_stKeep, v_vec, v_school || '/' || v_stKeep || '/ref.jpg',
          v_auth1, current_date - 1, v_user);
  insert into public.student_reference_faces (school_id, student_id, embedding, source_photo_path,
                                              authorization_id, created_by)
  values (v_school, v_stGone, v_vec, v_school || '/' || v_stGone || '/ref.jpg', v_auth2, v_user);
  assert (select count(*) from public.biometric_events where kind='reference_created') = 2,
    'cadastrar referência devia virar linha na trilha';

  insert into public.events (id, school_id, name, event_date, status, photo_retention_until, created_by)
  values (v_event, v_school, 'Festa vigente', current_date, 'ready', current_date + 365, v_user),
         (v_evOld,  v_school, 'Festa vencida', current_date - 800, 'ready', current_date - 1, v_user);
  insert into public.photos (id, school_id, event_id, storage_path, thumb_path, content_hash,
                             original_filename, bytes, status, uploaded_by)
  values (v_photo, v_school, v_event, v_school || '/' || v_event || '/' || v_photo || '.jpg',
          v_school || '/' || v_event || '/' || v_photo || '.webp',
          repeat('a', 64), 'IMG.jpg', 1000, 'processed', v_user),
         (v_phOld, v_school, v_evOld, v_school || '/' || v_evOld || '/' || v_phOld || '.jpg',
          v_school || '/' || v_evOld || '/' || v_phOld || '.webp',
          repeat('b', 64), 'IMG_OLD.jpg', 1000, 'processed', v_user);

  -- Rosto confirmado dos dois alunos (revisor humano, como manda a D6).
  insert into public.photo_faces (school_id, photo_id, bbox, crop_path, det_score, embedding,
                                  student_id, match_score, state, reviewed_by, reviewed_at)
  values (v_school, v_photo, '{"x":1,"y":1,"w":80,"h":80}'::jsonb,
          v_school || '/' || v_event || '/c1.jpg', 0.9, v_vec, v_stKeep, 0.9,
          'confirmed', v_user, now())
  returning id into v_face1;
  insert into public.photo_faces (school_id, photo_id, bbox, crop_path, det_score, embedding,
                                  student_id, match_score, state, reviewed_by, reviewed_at)
  values (v_school, v_photo, '{"x":200,"y":1,"w":80,"h":80}'::jsonb,
          v_school || '/' || v_event || '/c2.jpg', 0.9, v_vec, v_stGone, 0.9,
          'confirmed', v_user, now())
  returning id into v_face2;

  -- Aluno 2 na lixeira há 40 dias: o expurgo tem de levá-lo.
  update public.students set deleted_at = now() - interval '40 days' where id = v_stGone;

  v_res := public.purge_expired_biometrics();

  -- 1. Referência vencida: some a biometria, fica a foto do aluno.
  assert (select count(*) from public.student_reference_faces where student_id = v_stKeep) = 0,
    'referência vencida devia ter sido apagada';
  assert (select state from public.photo_faces where id = v_face1) = 'confirmed'
     and (select student_id from public.photo_faces where id = v_face1) = v_stKeep,
    'vencer a referência não pode tirar a foto já confirmada do aluno';
  assert (select embedding from public.photo_faces where id = v_face1) is null,
    'o vetor do rosto devia sumir junto com a referência';
  assert exists (select 1 from public.storage_purge_queue
                  where bucket = 'student-refs' and path like '%' || v_stKeep || '%'),
    'o arquivo da referência devia entrar na fila de expurgo do Storage';

  -- 2. Aluno expurgado: nada aponta para ele, e a trilha continua legível.
  assert (select count(*) from public.students where id = v_stGone) = 0,
    'o aluno da lixeira devia ter sido apagado';
  assert (select state from public.photo_faces where id = v_face2) = 'unassigned',
    'o rosto do aluno expurgado devia voltar a unassigned (sai borrado na entrega)';
  assert (select student_id from public.photo_faces where id = v_face2) is null,
    'o rosto do aluno expurgado não pode manter vínculo';
  assert (select bbox from public.photo_faces where id = v_face2) is not null,
    'bbox tem de sobreviver ao expurgo do aluno (§9.3.1)';
  select student_ref into v_ref from public.biometric_events
   where kind = 'face_purged' and detail->>'reason' = 'student_purged' limit 1;
  assert v_ref = 'MAT-GONE',
    'a trilha do aluno expurgado devia continuar legível pela matrícula, veio ' || coalesce(v_ref,'null');
  assert (select student_id from public.biometric_events
           where kind='face_purged' and detail->>'reason'='student_purged' limit 1) is null,
    'a FK do aluno expurgado devia ter virado nula';

  -- 3. Evento vencido: foto vai para a lixeira, não some direto.
  assert (select deleted_at from public.events where id = v_evOld) is not null,
    'evento vencido devia ir para a lixeira';
  assert (select deleted_at from public.photos where id = v_phOld) is not null,
    'foto de evento vencido devia ir para a lixeira';
  assert (select count(*) from public.storage_purge_queue
           where path like '%' || v_phOld || '%') = 0,
    'foto recém-mandada para a lixeira não pode ir para o expurgo do Storage ainda';

  -- 4. Passados 30 dias na lixeira, aí sim some — com os objetos enfileirados.
  update public.photos set deleted_at = now() - interval '31 days' where id = v_phOld;
  v_res := public.purge_expired_biometrics();
  assert (select count(*) from public.photos where id = v_phOld) = 0,
    'foto na lixeira há mais de 30 dias devia ter sido apagada';
  assert (select count(*) from public.storage_purge_queue
           where path like '%' || v_phOld || '%') >= 3,
    'a foto, a miniatura e o original deviam entrar na fila de expurgo do Storage';

  -- 5. A fila de expurgo é do worker: claim/complete tiram da fila.
  assert (select count(*) from public.claim_storage_purge(100, 60)) > 0,
    'o worker não conseguiu reivindicar nada na fila de expurgo';
  assert (select count(*) from public.storage_purge_queue where status = 'leased') > 0,
    'reivindicar devia marcar leased';
  perform public.complete_storage_purge(
    array(select id from public.storage_purge_queue where status = 'leased'), true, null);
  assert (select count(*) from public.storage_purge_queue where status = 'leased') = 0,
    'concluir devia tirar da fila';
end $$;

\echo '=== M6 OK ==='
