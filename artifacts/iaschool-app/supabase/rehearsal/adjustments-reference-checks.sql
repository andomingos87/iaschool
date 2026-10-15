-- S04: somente PostgreSQL isolado do runner, material sintético, rollback.
-- Usa guards de autorização/origem reais. Não exercita pgvector/modelos/Storage.
begin;
do $$begin if current_setting('port')<>'55441' or inet_server_addr() is not null then raise exception 'local fixture required';end if;end$$;
do $$
declare
 u uuid:=gen_random_uuid();v_school uuid:=gen_random_uuid();v_other uuid:=gen_random_uuid();
 aluno uuid:=gen_random_uuid();outro uuid:=gen_random_uuid();evento uuid:=gen_random_uuid();foto uuid:=gen_random_uuid();face uuid:=gen_random_uuid();suggestion uuid:=gen_random_uuid();
 authid uuid:=gen_random_uuid();job uuid;ref uuid;result jsonb; v_vector extensions.vector:=array_fill(0.1::real,array[512]);
begin
 insert into auth.users(id)values(u);
 insert into public.schools(id,name)values(v_school,'Escola referência'),(v_other,'Escola isolada');
 insert into public.school_members(school_id,user_id,role)values(v_school,u,'school_admin');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.students(id,school_id,name)values(aluno,v_school,'Aluno sintético'),(outro,v_other,'Outro aluno sintético');
 insert into public.events(id,school_id,name,event_date)values(evento,v_school,'Evento sintético',current_date);
 insert into public.photos(id,school_id,event_id,storage_path,width,height)values(foto,v_school,evento,v_school||'/'||evento||'/synthetic.jpg',200,150);
 insert into public.photo_faces(id,school_id,photo_id,student_id,state,bbox,reviewed_by,reviewed_at)values
 (face,v_school,foto,aluno,'confirmed','{"x":10,"y":10,"w":30,"h":30}',u,now()),
 (suggestion,v_school,foto,aluno,'suggested','{"x":100,"y":10,"w":30,"h":30}',null,null);
 begin perform public.confirmed_reference_photos(aluno);raise exception 'no authorization accepted';exception when others then if sqlerrm='no authorization accepted' then raise;end if;end;
 insert into public.authorizations(id,school_id,student_id,scope,granted_at)values(authid,v_school,aluno,'biometric_sorting',now());
 result:=public.confirmed_reference_photos(aluno);
 if jsonb_array_length(result)<>1 or result->0->>'face_id'<>face::text or result::text like '%embedding%' then raise exception 'unsafe candidates projection';end if;
 begin perform public.confirmed_reference_photos(outro);raise exception 'other school accepted';exception when others then if sqlerrm='other school accepted' then raise;end if;end;
 begin perform public.enqueue_confirmed_event_reference(aluno,suggestion);raise exception 'suggestion accepted';exception when others then if sqlerrm='suggestion accepted' then raise;end if;end;
 result:=public.enqueue_confirmed_event_reference(aluno,face);job:=(result->>'id')::uuid;
 if (result->>'duplicate')::boolean then raise exception 'first enqueue duplicate';end if;
 result:=public.enqueue_confirmed_event_reference(aluno,face);
 if (result->>'id')::uuid<>job or not (result->>'duplicate')::boolean or (select count(*) from public.student_reference_jobs where student_id=aluno)<>1 then raise exception 'origin duplicate';end if;
 if exists(select 1 from public.student_reference_faces where student_id=aluno) then raise exception 'coverage grew before processing';end if;
 if exists(select 1 from public.student_reference_jobs where id=job and (source_photo_id<>foto or source_face_id<>face or authorization_id<>authid)) then raise exception 'origin lost';end if;
 perform public.claim_student_reference_jobs(1,60);
 result:=public.reference_event_source(job);
 if result->>'storage_path'<>v_school||'/'||evento||'/synthetic.jpg' or result->'bbox'<>'{"x":10,"y":10,"w":30,"h":30}'::jsonb then raise exception 'wrong confirmed crop';end if;
 if public.complete_student_reference_job(job,true,v_vector,0.9)<>'done' then raise exception 'reference completion failed';end if;
 result:=public.confirmed_reference_photos(aluno);
 if (result->0->>'already_used')::boolean is not true then raise exception 'processed duplicate not marked';end if;
 select id into ref from public.student_reference_faces where student_id=aluno;
 if not exists(select 1 from public.student_reference_faces where id=ref and source_photo_id=foto and source_face_id=face and authorization_id=authid and source_photo_path=v_school||'/'||aluno||'/'||job||'.jpg' and retention_until=public.reference_retention_default()) then raise exception 'reference provenance/retention lost';end if;
 perform public.delete_student_reference_face(ref);
 if exists(select 1 from public.student_reference_jobs where id=job) or not exists(select 1 from public.storage_purge_queue where path=v_school||'/'||aluno||'/'||job||'.jpg') then raise exception 'reference removal left origin/file';end if;
 result:=public.confirmed_reference_photos(aluno);if (result->0->>'already_used')::boolean then raise exception 'removed origin still used';end if;
 result:=public.enqueue_confirmed_event_reference(aluno,face);job:=(result->>'id')::uuid;perform public.claim_student_reference_jobs(1,60);
 update public.authorizations set revoked_at=now() where id=authid;
 if public.reference_event_source(job) is not null then raise exception 'revoked source remains';end if;
 if public.complete_student_reference_job(job,true,v_vector,0.9)<>'revoked' or exists(select 1 from public.student_reference_faces where student_id=aluno) then raise exception 'revoked embedding persisted';end if;
 begin perform public.enqueue_confirmed_event_reference(aluno,face);raise exception 'revoked enqueue';exception when others then if sqlerrm='revoked enqueue' then raise;end if;end;
 -- Nova autorização e recadastro após cancelamento; revisão de origem invalida derivado.
 delete from public.student_reference_jobs where id=job;
 authid:=gen_random_uuid();insert into public.authorizations(id,school_id,student_id,scope,granted_at)values(authid,v_school,aluno,'biometric_sorting',now());
 result:=public.enqueue_confirmed_event_reference(aluno,face);job:=(result->>'id')::uuid;perform public.claim_student_reference_jobs(1,60);
 if public.complete_student_reference_job(job,true,v_vector,0.9)<>'done' then raise exception 'new reference failed';end if;
 update public.photo_faces set state='unassigned',student_id=null,reviewed_by=null where id=face;
 if exists(select 1 from public.student_reference_faces where source_face_id=face) or exists(select 1 from public.student_reference_jobs where source_face_id=face) then raise exception 'changed face retained reference';end if;
 begin
 insert into public.student_reference_jobs(school_id,student_id,authorization_id,storage_path,created_by,source_kind,source_face_id,source_photo_id,source_bbox)
 values(v_school,aluno,authid,v_school||'/'||aluno||'/forged.jpg',u,'upload',suggestion,foto,'{"x":1,"y":1,"w":1,"h":1}');
 raise exception 'upload forged event origin';exception when others then if sqlerrm='upload forged event origin' then raise;end if;end;
 if has_function_privilege('anon','public.confirmed_reference_photos(uuid)','execute') or has_function_privilege('authenticated','public.reference_event_source(uuid)','execute')
 or has_function_privilege('anon','public.enqueue_confirmed_event_reference(uuid,uuid)','execute') or has_table_privilege('authenticated','public.student_reference_faces','select') then raise exception 'reference privilege leak';end if;
 raise notice 'S04 SQL local: origem, grupo, confirmação, autorização, isolamento, duplicação, retenção, remoção e revisão passaram';
end$$;
rollback;
