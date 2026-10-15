-- SOMENTE PostgreSQL descartável: fotografias, usuários e autorizações sintéticos.
begin;
do $$ begin if current_setting('port')<>'55441' or inet_server_addr() is not null then raise exception 'local fixture required';end if;end$$;
do $$
declare
 batch uuid; recipient uuid; uid uuid; school uuid; other_school uuid; photo uuid; bad_photo uuid; item uuid; bad_item uuid;
 job bigint; lease int; ver int; fields jsonb; value jsonb; asset_prefix text; old_items jsonb; authid uuid; saved_granted timestamptz;
begin
 select batch_id,approved_items into batch,old_items from public._fixture_original_delivery_migration;
 if old_items is distinct from (select jsonb_agg(to_jsonb(a) order by recipient_id,version) from public.delivery_approvals a) then raise exception 'migration changed approved snapshot';end if;
 if exists(select 1 from public.claim_delivery_render_jobs(100,60)) then raise exception 'migration automatically queued existing photos';end if;
 if not exists(select 1 from public.delivery_render_jobs where batch_id=batch and status='failed' and last_error='render_atualizacao_necessaria') then raise exception 'legacy draft not stopped';end if;
 select created_by,school_id,draft_version,message_fields into uid,school,ver,fields from public.delivery_batches where id=batch;
 select id into other_school from public.schools where id<>school limit 1;
 select id into recipient from public.delivery_recipients where batch_id=batch;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if public.delivery_draft_detail(batch)->'recipients'->0->>'blockedReason'<>'render_atualizacao_necessaria' then raise exception 'missing refresh reason';end if;
 select i.id,i.photo_id into item,photo from public.delivery_items i join public.photos p on p.id=i.photo_id where i.recipient_id=recipient and not p.all_people_reviewed limit 1;
 select i.id,i.photo_id into bad_item,bad_photo from public.delivery_items i where i.recipient_id=recipient and i.id<>item limit 1;
 -- A atualização só começa por ação explícita e não exige regiões na foto.
 if public.retry_failed_delivery_render_jobs(batch)<>2 then raise exception 'explicit refresh did not queue photos';end if;
 if exists(select 1 from public.delivery_items where recipient_id=recipient and render_policy<>'original_v1') then raise exception 'refresh did not pin original policy';end if;
 perform public.claim_delivery_render_jobs(100,60);
 select id,lease_version into job,lease from public.delivery_render_jobs where item_id=item;
 value:=public.delivery_render_context(job);
 if value->>'renderPolicy'<>'original_v1' or value ? 'review' then raise exception 'original requires manual review';end if;
 if public.delivery_original_source_current(item) is not true then raise exception 'eligible original blocked';end if;
 -- Alterar escola da foto nunca produz um contexto para outra escola.
 update public.photos set school_id=other_school where id=photo;
 if public.delivery_render_context(job) is not null then raise exception 'cross tenant context leaked';end if;
 update public.photos set school_id=school where id=photo;
 -- Autorização retirada depois do claim impede baixar e concluir.
 select authorization_id into authid from public.delivery_recipient_students where recipient_id=recipient limit 1;
 update public.authorizations set revoked_at=now() where id=authid;
 if public.delivery_render_context(job) is not null then raise exception 'revoked context leaked';end if;
 update public.authorizations set revoked_at=null where id=authid;
 -- Worker antigo (sem política) é recusado, inclusive se declarar sucesso.
 asset_prefix:=school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-original_v1-a'||lease;
 if public.complete_delivery_render_job(job,true,null,asset_prefix||'.jpg',asset_prefix||'.webp',repeat('1',64),200,150,null,ver,lease)<>'failed' then raise exception 'old worker completed original';end if;
 if (select last_error from public.delivery_render_jobs where id=job)<>'worker_version_required' then raise exception 'old worker reason absent';end if;
 perform public.retry_failed_delivery_render_jobs(batch);
 perform public.claim_delivery_render_jobs(100,60);
 select lease_version into lease from public.delivery_render_jobs where id=job;
 asset_prefix:=school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-original_v1-a'||lease;
 -- Mesmo após download/upload, revogação impede conclusão e expurga tentativa.
 begin
  update public.authorizations set revoked_at=now() where id=authid;
  if public.complete_delivery_render_job(job,true,null,asset_prefix||'.jpg',asset_prefix||'.webp',repeat('1',64),200,150,null,ver,lease,'original_v1')<>'failed' then raise exception 'revoked source completed';end if;
  if (select render_status from public.delivery_items where id=item)='done' then raise exception 'revoked item published';end if;
  if not exists(select 1 from public.storage_purge_queue where public.storage_purge_queue.path=asset_prefix||'.jpg') then raise exception 'revoked asset not purged';end if;
  raise exception using errcode='P0002',message='restore_fixture';
 exception when no_data_found then null;
 end;
 -- Dimensões vêm da foto orientada pelo ingest, nunca das regiões manuais.
 begin
 perform public.complete_delivery_render_job(job,true,null,asset_prefix||'.jpg',asset_prefix||'.webp',repeat('1',64),201,150,null,ver,lease,'original_v1');
 raise exception 'wrong dimensions accepted';exception when others then if sqlerrm='wrong dimensions accepted' then raise;end if;end;
 -- Lease perdido não pode gravar nem mudar a tentativa atual.
 if public.complete_delivery_render_job(job,true,null,replace(asset_prefix,'-a'||lease,'-a'||(lease-1))||'.jpg',replace(asset_prefix,'-a'||lease,'-a'||(lease-1))||'.webp',repeat('1',64),200,150,null,ver,lease-1,'original_v1')<>'noop' then raise exception 'stale lease completed';end if;
 if (select status from public.delivery_render_jobs where id=job)<>'leased' then raise exception 'stale lease changed job';end if;
 -- Versão de rascunho antiga produz expurgo e nova fila, sem aceitar o arquivo.
 if public.complete_delivery_render_job(job,true,null,replace(asset_prefix,'/v'||ver,'/v'||(ver-1))||'.jpg',replace(asset_prefix,'/v'||ver,'/v'||(ver-1))||'.webp',repeat('1',64),200,150,null,ver-1,lease,'original_v1')<>'requeued' then raise exception 'stale draft completed';end if;
 perform public.claim_delivery_render_jobs(100,60);
 select lease_version into lease from public.delivery_render_jobs where id=job;
 asset_prefix:=school||'/'||batch||'/'||recipient||'/'||item||'/v'||ver||'-original_v1-a'||lease;
 -- Outra foto falha definitivamente, sem impedir sucesso independente desta.
 update public.delivery_render_jobs set attempts=5 where item_id=bad_item;
 if public.complete_delivery_render_job((select id from public.delivery_render_jobs where item_id=bad_item),false,'render_imagem_invalida',null,null,null,null,null,null,ver,(select lease_version from public.delivery_render_jobs where item_id=bad_item),'original_v1')<>'failed' then raise exception 'bad photo did not fail separately';end if;
 if public.complete_delivery_render_job(job,true,null,asset_prefix||'.jpg',asset_prefix||'.webp',repeat('1',64),200,150,null,ver,lease,'original_v1')<>'done' then raise exception 'sharp photo not done';end if;
 if (select all_people_reviewed from public.photos where id=photo) then raise exception 'fixture unexpectedly reviewed';end if;
 if (select rendered_regions_version from public.delivery_items where id=item) is not null then raise exception 'original incorrectly claims regions';end if;
 -- Retirar somente a foto defeituosa permite aprovar as demais.
 value:=public.save_delivery_draft(batch,ver,fields,jsonb_build_array(jsonb_build_object('recipientId',recipient,'photoIds',jsonb_build_array(photo))));
 ver:=(value->>'version')::int;
 if (select failed_count from public.delivery_batches where id=batch)<>0 or (select status from public.delivery_batches where id=batch)<>'awaiting_review' then raise exception 'excluded failure blocked batch';end if;
 if public.delivery_batch_detail(batch)->'recipients'->0->>'items_total'<>'1' or public.delivery_batch_detail(batch)->'recipients'->0->>'items_failed'<>'0' then raise exception 'recipient counts include excluded photos';end if;
 if public.retry_failed_delivery_render_jobs(batch)<>0 then raise exception 'excluded failure retried';end if;
 if not exists(select 1 from public.photos where id=bad_photo) then raise exception 'excluded original deleted';end if;
 -- Edição de regiões não invalida original já preparado.
 update public.photos set regions_version=regions_version+1 where id=photo;
 if (select draft_version from public.delivery_batches where id=batch)<>ver or (select render_status from public.delivery_items where id=item)<>'done' then raise exception 'manual region edit invalidated original';end if;
 if public.delivery_recipient_gate(recipient,false) is not null then raise exception 'original gate blocked';end if;
 perform public.approve_delivery_batch(batch);
 if (select items->0->>'renderPolicy' from public.delivery_approvals where recipient_id=recipient and version=ver)<>'original_v1' then raise exception 'approval missed policy';end if;
 if public.delivery_recipient_gate(recipient,true) is not null then raise exception 'approved original blocked';end if;
 update public.delivery_items set render_policy='protected_regions_v1' where id=item;
 if public.delivery_recipient_gate(recipient,true)<>'approval_required' then raise exception 'policy changed after approval';end if;
 update public.delivery_items set render_policy='original_v1' where id=item;
 update public.authorizations set revoked_at=now() where id=authid;
 if public.delivery_recipient_gate(recipient,true)<>'authorization_revoked' then raise exception 'revoked original still allowed';end if;
 update public.authorizations set revoked_at=null where id=authid;
 if has_function_privilege('service_role','public.complete_delivery_render_job_protected(bigint,boolean,text,text,text,text,int,int,int,int,int)','execute') then raise exception 'old worker alias publicly executable';end if;
 if has_function_privilege('anon','public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int,text)','execute') or has_function_privilege('authenticated','public.delivery_original_source_current(uuid)','execute') then raise exception 'private function granted';end if;
 raise notice 'Fotos nítidas: migration manual, legado, autorização, tenant, worker antigo, dimensões, CAS, seleção e snapshot OK';
end$$;
rollback;
