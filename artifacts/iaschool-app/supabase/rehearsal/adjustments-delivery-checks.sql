-- Teste funcional SOMENTE no Postgres isolado local do lote, nunca produção.
-- Base do fixture usa os nomes/colunas do SQL de referência; pgvector não é exercitado.
-- Tudo é sintético; nenhuma rede/provedor externo; transação termina em rollback.
begin;
do $$ begin if current_setting('port')<>'55441' or inet_server_addr() is not null then raise exception 'local fixture required on port 55441';end if;end$$;
do $$
declare
 u uuid:=gen_random_uuid(); school uuid:=gen_random_uuid(); other_school uuid:=gen_random_uuid();
 guardian uuid:=gen_random_uuid(); aluno_a uuid:=gen_random_uuid();aluno_b uuid:=gen_random_uuid();
 evento uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();unsafe_photo uuid:=gen_random_uuid();face_a uuid:=gen_random_uuid();face_b uuid:=gen_random_uuid();
 batch uuid;recipient uuid;item uuid;job bigint;ver int;rv int;result jsonb;mid uuid;
 token_a text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);token_b text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);token_c text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);sess_a text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);sess_c text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
 expiry timestamptz;
begin
 insert into auth.users(id)values(u);
 insert into public.schools(id,name)values(school,'Escola teste'),(other_school,'Outra escola');
 insert into public.school_members(school_id,user_id,role)values(school,u,'school_admin');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.guardians(id,school_id,whatsapp,whatsapp_verified_at,name)values(guardian,school,'+5511999999999',now(),'Responsável teste');
 insert into public.students(id,school_id,primary_guardian_id,name)values(aluno_a,school,guardian,'Aluno A'),(aluno_b,school,guardian,'Aluno B');
 insert into public.events(id,school_id,name)values(evento,school,'Evento teste');
 insert into public.authorizations(school_id,student_id,guardian_id,scope,granted_at,evidence)
 values(school,aluno_a,guardian,'delivery_whatsapp',now(),'{"source":"guardian_link"}'),(school,aluno_b,guardian,'delivery_whatsapp',now(),'{"source":"guardian_link"}');
 insert into public.photos(id,school_id,event_id,storage_path,width,height)values(photo,school,evento,'synthetic.jpg',200,150);
 insert into public.photo_faces(id,school_id,photo_id,student_id,state,bbox,reviewed_by,reviewed_at)
 values(face_a,school,photo,aluno_a,'confirmed','{"x":10,"y":10,"w":20,"h":20}',u,now()),
 (face_b,school,photo,aluno_b,'confirmed','{"x":80,"y":10,"w":20,"h":20}',u,now());
 select regions_version into rv from public.photos where id=photo;
 result:=public.save_photo_person_review(photo,rv,200,150,jsonb_build_array(
 jsonb_build_object('face_id',face_a,'student_id',aluno_a,'kind','own_child','shape','rect','points',jsonb_build_array(5,5,50,100)),
 jsonb_build_object('face_id',face_b,'student_id',aluno_b,'kind','own_child','shape','rect','points',jsonb_build_array(75,5,50,100))),true);
 -- Foto confirmada, mas sem proteção conferida: pode ser retirada do conjunto.
 insert into public.photos(id,school_id,event_id,storage_path,width,height)values(unsafe_photo,school,evento,'unsafe-synthetic.jpg',200,150);
 insert into public.photo_faces(school_id,photo_id,student_id,state,bbox,reviewed_by,reviewed_at)values(school,unsafe_photo,aluno_a,'confirmed','{"x":10,"y":10,"w":20,"h":20}',u,now());
 batch:=public.create_delivery_batch(evento,array[guardian],'v1');
 select id into recipient from public.delivery_recipients where batch_id=batch;
 select id into item from public.delivery_items where recipient_id=recipient and photo_id=photo;
 if (select count(*) from public.delivery_items where recipient_id=recipient and photo_id=photo)<>1 then raise exception 'siblings duplicated';end if;
 if (select count(*) from public.delivery_item_students where item_id=item)<>2 then raise exception 'siblings relation lost';end if;
 result:=public.delivery_draft_detail(batch);
 ver:=(result->'batch'->>'version')::int;
 begin perform public.save_delivery_draft(batch,null,'{"eventName":"Teste","callToAction":"","signature":"Escola"}',null);raise exception 'missing version/selection accepted';exception when others then if sqlerrm='missing version/selection accepted' then raise;end if;end;
 begin perform public.save_delivery_draft(batch,ver,'{"eventName":"Teste","callToAction":"","signature":"Escola"}',jsonb_build_array(jsonb_build_object('recipientId',recipient)));raise exception 'missing photos accepted';exception when others then if sqlerrm='missing photos accepted' then raise;end if;end;

 -- A foto problemática continua no evento e no histórico, mas sai do álbum.
 update public.delivery_items set render_status='failed' where recipient_id=recipient and photo_id=unsafe_photo;
 update public.delivery_render_jobs set status='failed',attempts=5,last_error='render_revisao_pendente'
 where item_id in(select id from public.delivery_items where recipient_id=recipient and photo_id=unsafe_photo);

 result:=public.save_delivery_draft(batch,ver,'{"eventName":"Teste","callToAction":"","signature":"Escola"}',jsonb_build_array(jsonb_build_object('recipientId',recipient,'photoIds',jsonb_build_array(photo))));
 ver:=(result->>'version')::int;
 if (select item_count from public.delivery_batches where id=batch)<>1 then raise exception 'selection count mismatch';end if;
 if (select failed_count from public.delivery_batches where id=batch)<>0 then raise exception 'excluded failure blocked album';end if;
 if not exists(select 1 from public.delivery_items where recipient_id=recipient and photo_id=unsafe_photo and not selected and render_status='failed') then raise exception 'excluded photo lost history';end if;
 if not exists(select 1 from public.photos where id=unsafe_photo) then raise exception 'removing from album deleted original';end if;
 if public.delivery_fields_valid(jsonb_build_object('eventName',E'Evento\nX','callToAction','','signature','Escola')) then raise exception 'control character accepted';end if;
 if public.delivery_fields_valid('{"eventName":"Teste","callToAction":"https://arbitrary.test","signature":"Escola"}') then raise exception 'arbitrary URL accepted';end if;
 begin
 perform public.save_delivery_draft(batch,ver-1,'{"eventName":"Teste","callToAction":"","signature":"Escola"}','[]');
 raise exception 'stale draft accepted';exception when others then if sqlerrm='stale draft accepted' then raise;end if;end;
 insert into public.whatsapp_controlled_settings(school_id,enabled,kill_switch,daily_limit)values(school,true,false,40);
 insert into public.whatsapp_controlled_allowlist(school_id,phone_e164)values(school,'+5511999999999');
 select id into job from public.claim_delivery_render_jobs(1,60)where batch_id=batch;
 result:=public.delivery_render_contexts(array[job,999999999]);
 if not(result ? job::text) or result ? '999999999' then raise exception 'batch render context scope';end if;
 result:=public.delivery_render_context(job);rv:=(result->'review'->>'regionsVersion')::int;
 if (result->'review'->>'allPeopleReviewed')::boolean is not true then raise exception 'missing revision';end if;
 -- Falha depois de subir um ativo agenda expurgo; lease novo nunca reaproveita o caminho antigo.
 if public.complete_delivery_render_job(job,false,'render_indisponivel',school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a1.jpg',
 school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a1.webp',null,null,null,rv,ver,1)<>'requeued' then raise exception 'partial retry failed';end if;
 if (select count(*) from public.storage_purge_queue where reason='partial_delivery_render')<>2 then raise exception 'partial upload not purged';end if;
 perform public.claim_delivery_render_jobs(1,60);
 if (select lease_version from public.delivery_render_jobs where id=job)<>2 then raise exception 'lease generation not monotonic';end if;
 if public.complete_delivery_render_job(job,true,null,school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a1.jpg',
 school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a1.webp',repeat('1',64),200,150,rv,ver,1)<>'noop' then raise exception 'stale attempt completed';end if;
 if (select status from public.delivery_render_jobs where id=job)<>'leased' then raise exception 'stale attempt overwrote lease';end if;
 if public.complete_delivery_render_job(job,true,null,school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a2.jpg',
 school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-r'||rv||'-a2.webp',repeat('1',64),200,150,rv,ver,2)<>'done' then raise exception 'render not done';end if;
 update public.school_members set role='teacher' where school_id=school and user_id=u;
 begin perform public.approve_delivery_batch(batch);raise exception 'teacher approved';exception when others then if sqlerrm='teacher approved' then raise;end if;end;
 update public.school_members set role='school_admin' where school_id=school and user_id=u;
 if exists(select 1 from public.claim_delivery_render_jobs(100,60)) then raise exception 'unselected unsafe photo claimed';end if;
 result:=public.approve_delivery_batch(batch);
 if (result->>'approved')::int<>1 then raise exception 'approval mismatch';end if;
 result:=public.reserve_delivery_dispatch(recipient,token_a,'test',u,false,'controlled_zapi');mid:=(result->>'messageId')::uuid;
 if public.delivery_dispatch_gate(mid) is not true then raise exception 'gate failed';end if;
 perform public.complete_whatsapp_send(mid,'accepted','synthetic-'||mid::text,'request-'||mid::text);
 if (select status from public.delivery_recipients where id=recipient)<>'accepted' then raise exception '2xx is not accepted';end if;
 perform public.record_whatsapp_provider_status('synthetic-'||mid::text,'failed','5511999999999','test',now());
 perform public.record_whatsapp_provider_status('synthetic-'||mid::text,'failed','5511999999999','test',now());
 perform public.record_whatsapp_provider_status('synthetic-'||mid::text,'sent','5511999999999','test',now());
 if (select count(*) from public.delivery_events where recipient_id=recipient and event_type='provider_failed')<>1 then raise exception 'duplicate/out-of-order webhook';end if;
 begin perform public.save_delivery_draft(batch,ver,'{"eventName":"Changed","callToAction":"","signature":"Escola"}',jsonb_build_array(jsonb_build_object('recipientId',recipient,'photoIds',jsonb_build_array(photo))));raise exception 'transmitted failed draft mutated';exception when others then if sqlerrm='transmitted failed draft mutated' then raise;end if;end;
 begin perform public.cancel_delivery_batch(batch);raise exception 'transmitted failed batch canceled';exception when others then if sqlerrm='transmitted failed batch canceled' then raise;end if;end;
 begin perform public.retry_failed_delivery_render_jobs(batch);raise exception 'transmitted failed batch retried';exception when others then if sqlerrm='transmitted failed batch retried' then raise;end if;end;
 update public.whatsapp_controlled_settings set daily_limit=1 where school_id=school;
 begin perform public.reserve_whatsapp_send(guardian,'delivery_ready','test');raise exception 'daily limit bypass';exception when others then if sqlerrm='daily limit bypass' then raise;end if;end;
 update public.whatsapp_controlled_settings set daily_limit=40,kill_switch=true where school_id=school;
 begin perform public.reserve_whatsapp_send(guardian,'delivery_ready','test');raise exception 'kill switch bypass';exception when others then if sqlerrm='kill switch bypass' then raise;end if;end;
 update public.whatsapp_controlled_settings set kill_switch=false where school_id=school;
 delete from public.whatsapp_controlled_allowlist where school_id=school;
 begin perform public.reserve_whatsapp_send(guardian,'delivery_ready','test');raise exception 'allowlist bypass';exception when others then if sqlerrm='allowlist bypass' then raise;end if;end;
 insert into public.whatsapp_controlled_allowlist(school_id,phone_e164)values(school,'+5511999999999');

 result:=public.consume_delivery_album_token(token_a,sess_a);if result->>'ok'<>'true' then raise exception 'consume failed';end if;
 result:=public.consume_delivery_album_token(token_a,sess_c);if result->>'ok'<>'true' or result->>'error'='used' then raise exception 'reusable link refused';end if;
 select expires_at into expiry from public.delivery_access_sessions where session_hash=sess_a;
 result:=public.delivery_album_session(sess_a);
 if jsonb_array_length(result->'items')<>1 then raise exception 'album mismatch';end if;
 declare
  evento2 uuid:=gen_random_uuid(); photo2 uuid:=gen_random_uuid(); face2 uuid:=gen_random_uuid();
  batch2 uuid; recipient2 uuid; item2 uuid; job2 bigint; ver2 int; rv2 int; lease2 int;
  other_guardian uuid:=gen_random_uuid(); other_aluno uuid:=gen_random_uuid(); other_event uuid:=gen_random_uuid();
  other_photo uuid:=gen_random_uuid(); other_face uuid:=gen_random_uuid(); other_batch uuid; other_recipient uuid; other_item uuid;
  other_job bigint; other_ver int; other_rv int; other_lease int; names text;
 begin
  insert into public.events(id,school_id,name) values(evento2,school,'Festa dois');
  insert into public.photos(id,school_id,event_id,storage_path,width,height) values(photo2,school,evento2,'synthetic-2.jpg',200,150);
  insert into public.photo_faces(id,school_id,photo_id,student_id,state,bbox,reviewed_by,reviewed_at)
   values(face2,school,photo2,aluno_a,'confirmed','{"x":10,"y":10,"w":20,"h":20}',u,now());
  select regions_version into rv2 from public.photos where id=photo2;
  perform public.save_photo_person_review(photo2,rv2,200,150,jsonb_build_array(jsonb_build_object('face_id',face2,'student_id',aluno_a,'kind','own_child','shape','rect','points',jsonb_build_array(5,5,50,100))),true);
  batch2:=public.create_delivery_batch(evento2,array[guardian],'v1');
  select id into recipient2 from public.delivery_recipients where batch_id=batch2;
  select id into item2 from public.delivery_items where recipient_id=recipient2 and photo_id=photo2;
  select id into job2 from public.claim_delivery_render_jobs(1,60) where batch_id=batch2;
  result:=public.delivery_render_context(job2);
  rv2:=(result->'review'->>'regionsVersion')::int; ver2:=(result->>'draftVersion')::int;
  select lease_version into lease2 from public.delivery_render_jobs where id=job2;
  if public.complete_delivery_render_job(job2,true,null,school||'/'||batch2||'/'||recipient2||'/'||item2||'/v'||ver2||'-r'||rv2||'-a'||lease2||'.jpg',
   school||'/'||batch2||'/'||recipient2||'/'||item2||'/v'||ver2||'-r'||rv2||'-a'||lease2||'.webp',repeat('2',64),200,150,rv2,ver2,lease2)<>'done' then raise exception 'event2 render failed'; end if;
  result:=public.approve_delivery_batch(batch2);
  if (result->>'approved')::int<>1 then raise exception 'event2 approval failed'; end if;
  insert into public.guardians(id,school_id,whatsapp,whatsapp_verified_at,name) values(other_guardian,school,'+5511988887777',now(),'Outra família');
  insert into public.students(id,school_id,primary_guardian_id,name) values(other_aluno,school,other_guardian,'Aluno de outra família');
  insert into public.events(id,school_id,name) values(other_event,school,'Evento de outra família');
  insert into public.authorizations(school_id,student_id,guardian_id,scope,granted_at,evidence)
   values(school,other_aluno,other_guardian,'delivery_whatsapp',now(),'{"source":"guardian_link"}');
  insert into public.photos(id,school_id,event_id,storage_path,width,height) values(other_photo,school,other_event,'other-family.jpg',200,150);
  insert into public.photo_faces(id,school_id,photo_id,student_id,state,bbox,reviewed_by,reviewed_at)
   values(other_face,school,other_photo,other_aluno,'confirmed','{"x":10,"y":10,"w":20,"h":20}',u,now());
  select regions_version into other_rv from public.photos where id=other_photo;
  perform public.save_photo_person_review(other_photo,other_rv,200,150,jsonb_build_array(jsonb_build_object('face_id',other_face,'student_id',other_aluno,'kind','own_child','shape','rect','points',jsonb_build_array(5,5,50,100))),true);
  other_batch:=public.create_delivery_batch(other_event,array[other_guardian],'v1');
  select id into other_recipient from public.delivery_recipients where batch_id=other_batch;
  select id into other_item from public.delivery_items where recipient_id=other_recipient and photo_id=other_photo;
  select id into other_job from public.claim_delivery_render_jobs(1,60) where batch_id=other_batch;
  result:=public.delivery_render_context(other_job);
  other_rv:=(result->'review'->>'regionsVersion')::int; other_ver:=(result->>'draftVersion')::int;
  select lease_version into other_lease from public.delivery_render_jobs where id=other_job;
  if public.complete_delivery_render_job(other_job,true,null,school||'/'||other_batch||'/'||other_recipient||'/'||other_item||'/v'||other_ver||'-r'||other_rv||'-a'||other_lease||'.jpg',
   school||'/'||other_batch||'/'||other_recipient||'/'||other_item||'/v'||other_ver||'-r'||other_rv||'-a'||other_lease||'.webp',repeat('3',64),200,150,other_rv,other_ver,other_lease)<>'done' then raise exception 'other family render failed'; end if;
  result:=public.approve_delivery_batch(other_batch);
  if (result->>'approved')::int<>1 then raise exception 'other family approval failed'; end if;
  result:=public.delivery_album_session(sess_a);
  if jsonb_array_length(result->'items')<>2 then raise exception 'two events missing'; end if;
  select string_agg(distinct x->>'eventName','|') into names from jsonb_array_elements(result->'items') x;
  if names is distinct from 'Festa dois|Teste' and names is distinct from 'Teste|Festa dois' then raise exception 'event names missing'; end if;
  if result::text like '%'||other_item::text||'%' then raise exception 'other family leaked'; end if;
  result:=public.delivery_album_session(sess_a,other_item);
  if result->>'error'<>'unavailable' then raise exception 'other family photo accepted'; end if;
  raise exception using errcode='P0004',message='two_events_checked';
 exception when sqlstate 'P0004' then null;
 end;
 result:=public.delivery_album_session(sess_a);
 if jsonb_array_length(result->'items')<>1 then raise exception 'two event fixture leaked'; end if;
 update public.students set primary_guardian_id=null where id=aluno_a;
 result:=public.delivery_album_session(sess_a);if result->>'error'<>'authorization_revoked' then raise exception 'null guardian retained access';end if;
 update public.students set primary_guardian_id=guardian where id=aluno_a;
 begin
 delete from public.delivery_items where id=item;
 result:=public.delivery_album_session(sess_a);if not(result ? 'error') then raise exception 'missing approved item retained access';end if;
 raise exception using errcode='P0002',message='restore_fixture';
 exception when no_data_found then null;
 end;

 result:=public.delivery_album_session(sess_a,gen_random_uuid());if result->>'error'<>'unavailable' then raise exception 'cross photo accepted';end if;
 update public.delivery_recipients set updated_at=now()-interval '2 minutes' where id=recipient;
 -- touch trigger resets clock; disable only this test clock adjustment.
 alter table public.delivery_recipients disable trigger delivery_recipients_touch_updated_at;
 update public.delivery_recipients set updated_at=now()-interval '2 minutes' where id=recipient;
 alter table public.delivery_recipients enable trigger delivery_recipients_touch_updated_at;
 result:=public.reserve_delivery_dispatch(recipient,token_b,'test',u,true,'controlled_zapi');mid:=(result->>'messageId')::uuid;
 perform public.complete_whatsapp_send(mid,'accepted','synthetic-'||mid::text,'request-'||mid::text);
 alter table public.delivery_recipients disable trigger delivery_recipients_touch_updated_at;
 update public.delivery_recipients set updated_at=now()-interval '2 minutes' where id=recipient;
 alter table public.delivery_recipients enable trigger delivery_recipients_touch_updated_at;
 result:=public.reserve_delivery_dispatch(recipient,token_c,'test',u,true,'controlled_zapi');mid:=(result->>'messageId')::uuid;
 update public.whatsapp_messages set status='unknown' where id=mid;
 begin perform public.reserve_delivery_dispatch(recipient,repeat('f',64),'test',u,true,'controlled_zapi');raise exception 'unknown retried';exception when others then if sqlerrm='unknown retried' then raise;end if;end;
 result:=public.consume_delivery_album_token(token_b,repeat('9',64));if result->>'error'<>'revoked' then raise exception 'old unused link alive';end if;
 result:=public.consume_delivery_album_token(token_c,sess_c);if result->>'ok'<>'true' then raise exception 'new token unavailable';end if;
 if (select expires_at from public.delivery_access_sessions where session_hash=sess_a)<>expiry then raise exception 'session renewed';end if;
 result:=public.revoke_delivery_album(recipient);
 result:=public.delivery_album_session(sess_a);if result->>'error'<>'revoked' then raise exception 'session survived revoke';end if;
 result:=public.delivery_album_session(sess_c);if result->>'error'<>'revoked' then raise exception 'new session survived revoke';end if;
 if public.delivery_dispatch_gate(mid) then raise exception 'revoked dispatch gate open';end if;
 if has_function_privilege('anon','public.consume_delivery_album_token(text,text)','execute') or has_table_privilege('anon','public.delivery_album_tokens','select') then raise exception 'anonymous privilege leak';end if;
 raise notice 'S05/S06/S07 roundtrip local: dedup, snapshot, permission, render, consume, resend, revoke, uncertainty and scope OK';
end$$;
rollback;
