-- Aplicada pelo MCP local supabase-iaschool em 13/10/2026: iaschool_delivery_original_photos (20261013113430).
-- Fotos nítidas nas entregas. SQL de referência e migration local, 13/10/2026.
-- Aplicar depois de fase5-adjustments-delivery-album.sql. Não altera WhatsApp.
-- Itens aprovados/enviados mantêm sua política/snapshot; rascunhos antigos só
-- passam a fotos nítidas mediante o botão de atualizar, nunca por claim automático.
do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='delivery_items' and column_name='render_policy') then
  alter table public.delivery_items add column render_policy text not null default 'protected_regions_v1'
   check(render_policy in('protected_regions_v1','original_v1'));
  -- Invalida inclusive um lease antigo, sem baixar ou reprocessar fotografia.
  update public.delivery_render_jobs j set status='failed',attempts=5,leased_until=null,
   lease_version=j.lease_version+1,last_error='render_atualizacao_necessaria'
  from public.delivery_items i,public.delivery_recipients r,public.delivery_batches b
  where i.id=j.item_id and r.id=i.recipient_id and b.id=r.batch_id
   and b.approved_version is null and b.status in('preparing','awaiting_review')
   and not exists(select 1 from public.delivery_approvals a join public.delivery_recipients ar on ar.id=a.recipient_id where ar.batch_id=b.id)
   and not exists(select 1 from public.delivery_recipients x where x.batch_id=b.id and (x.dispatch_started_at is not null or x.status in('sending','accepted','sent','delivered','read','unknown')));
  update public.delivery_items i set render_status='failed',preview_reviewed_at=null,preview_reviewed_by=null
   from public.delivery_render_jobs j where j.item_id=i.id and j.last_error='render_atualizacao_necessaria';
  update public.delivery_batches b set status='preparing',
   rendered_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected and i.render_status='done'),
   failed_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected and i.render_status='failed')
   where exists(select 1 from public.delivery_render_jobs j where j.batch_id=b.id and j.last_error='render_atualizacao_necessaria');
  update public.delivery_recipients r set status='preparing',last_error='render_atualizacao_necessaria'
   where exists(select 1 from public.delivery_items i join public.delivery_render_jobs j on j.item_id=i.id where i.recipient_id=r.id and i.selected and j.last_error='render_atualizacao_necessaria');
 end if;
end $$;
alter table public.delivery_items alter column render_policy set default 'original_v1';

-- Autorização, vínculo e escopo continuam necessários, inclusive antes do download.
create or replace function public.delivery_original_source_current(p_item_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.delivery_items i
 join public.delivery_recipients r on r.id=i.recipient_id
 join public.delivery_batches b on b.id=r.batch_id
 join public.photos p on p.id=i.photo_id
 join public.events e on e.id=r.event_id
 join public.schools sc on sc.id=r.school_id
 join public.guardians g on g.id=r.guardian_id
 where i.id=p_item_id and i.selected and b.status<>'canceled' and r.status not in('revoked','canceled','expired')
 and p.deleted_at is null and e.deleted_at is null and sc.deleted_at is null and g.deleted_at is null
 and b.school_id=r.school_id and b.event_id=r.event_id and p.school_id=r.school_id and p.event_id=r.event_id and e.school_id=r.school_id and g.school_id=r.school_id
 and g.whatsapp=r.target_whatsapp and g.whatsapp_verified_at=r.verified_at_snapshot
 and exists(select 1 from public.delivery_recipient_students rs where rs.recipient_id=r.id)
 and not exists(select 1 from public.delivery_recipient_students rs join public.students s on s.id=rs.student_id join public.authorizations a on a.id=rs.authorization_id
 where rs.recipient_id=r.id and (s.deleted_at is not null or s.school_id<>r.school_id or s.primary_guardian_id is distinct from r.guardian_id
 or a.revoked_at is not null or a.granted_at is null or a.student_id is distinct from rs.student_id or a.guardian_id is distinct from r.guardian_id
 or a.school_id is distinct from r.school_id or a.scope<>'delivery_whatsapp' or a.evidence->>'source' is distinct from 'guardian_link'))
 and exists(select 1 from public.photo_faces f join public.delivery_recipient_students rs on rs.student_id=f.student_id
 where f.photo_id=p.id and f.school_id=r.school_id and f.state='confirmed' and rs.recipient_id=r.id));
$$;
revoke all on function public.delivery_original_source_current(uuid) from public,anon,authenticated;
grant execute on function public.delivery_original_source_current(uuid) to service_role;

-- Contexto antigo fica privado para os álbuns legados ainda protegidos.
do $$ begin
 if to_regprocedure('public.delivery_render_context_protected(bigint)') is null then
  alter function public.delivery_render_context(bigint) rename to delivery_render_context_protected;
 end if;
 if to_regprocedure('public.complete_delivery_render_job_protected(bigint,boolean,text,text,text,text,integer,integer,integer,integer,integer)') is null then
  alter function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int) rename to complete_delivery_render_job_protected;
 end if;
end $$;
revoke all on function public.delivery_render_context_protected(bigint) from public,anon,authenticated,service_role;
revoke all on function public.complete_delivery_render_job_protected(bigint,boolean,text,text,text,text,int,int,int,int,int) from public,anon,authenticated,service_role;

create or replace function public.delivery_render_context(p_job_id bigint) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare item public.delivery_items%rowtype;
begin
 select i.* into item from public.delivery_items i join public.delivery_render_jobs j on j.item_id=i.id where j.id=p_job_id;
 if item.render_policy='protected_regions_v1' then
  return public.delivery_render_context_protected(p_job_id)||jsonb_build_object('renderPolicy','protected_regions_v1');
 end if;
 if item.id is null or public.delivery_original_source_current(item.id) is not true then return null; end if;
 return (select jsonb_build_object('itemId',i.id,'batchId',b.id,'schoolId',b.school_id,'eventId',b.event_id,'recipientId',r.id,
 'photoPath',p.storage_path,'draftVersion',b.draft_version,'renderPolicy',i.render_policy)
 from public.delivery_render_jobs j join public.delivery_items i on i.id=j.item_id join public.delivery_recipients r on r.id=i.recipient_id
 join public.delivery_batches b on b.id=r.batch_id join public.photos p on p.id=i.photo_id
 where j.id=p_job_id and j.status='leased' and b.status='preparing' and i.selected);
end $$;
revoke all on function public.delivery_render_context(bigint) from public,anon,authenticated;
grant execute on function public.delivery_render_context(bigint) to service_role;

-- Política faz parte da assinatura e do caminho; worker antigo não conclui original.
create or replace function public.complete_delivery_render_job(p_job_id bigint,p_ok boolean,p_error text default null,
 p_asset_path text default null,p_thumb_path text default null,p_asset_hash text default null,p_width int default null,p_height int default null,
 p_regions_version int default null,p_draft_version int default null,p_lease_version int default null,p_render_policy text default null) returns text
language plpgsql security definer set search_path=public as $$
declare j public.delivery_render_jobs%rowtype; i public.delivery_items%rowtype; b public.delivery_batches%rowtype;
 p public.photos%rowtype; result text; owned_paths boolean; prefix text;
begin
 select * into j from public.delivery_render_jobs where id=p_job_id;
 if j.id is null then return 'missing'; end if;
 select * into i from public.delivery_items where id=j.item_id;
 if i.render_policy='protected_regions_v1' then
  if p_render_policy is not null and p_render_policy<>'protected_regions_v1' then return 'noop';end if;
  return public.complete_delivery_render_job_protected(p_job_id,p_ok,p_error,p_asset_path,p_thumb_path,p_asset_hash,p_width,p_height,p_regions_version,p_draft_version,p_lease_version);
 end if;
 select * into b from public.delivery_batches where id=j.batch_id for update;
 select * into j from public.delivery_render_jobs where id=p_job_id for update;
 select * into i from public.delivery_items where id=j.item_id for update;
 prefix:=b.school_id::text||'/'||b.id::text||'/'||i.recipient_id::text||'/'||i.id::text||'/v'||p_draft_version::text||'-original_v1-a'||p_lease_version::text;
 owned_paths:=p_asset_path=prefix||'.jpg' and p_thumb_path=prefix||'.webp';
 if p_lease_version is distinct from j.lease_version or j.status<>'leased' or b.status<>'preparing' or not i.selected then
  if owned_paths and (i.asset_path is distinct from p_asset_path or i.thumb_path is distinct from p_thumb_path) then
   perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'stale_delivery_attempt',b.school_id);
  end if;
  return 'noop';
 end if;
 if p_ok and p_render_policy is distinct from 'original_v1' then
  update public.delivery_render_jobs set attempts=5 where id=j.id;
  p_ok:=false;p_error:='worker_version_required';
 end if;
 if p_ok and p_draft_version is distinct from b.draft_version then
  if owned_paths then perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'stale_delivery_render',b.school_id);end if;
  update public.delivery_render_jobs set status='queued',leased_until=null,draft_version=b.draft_version where id=j.id;
  return 'requeued';
 end if;
 select * into p from public.photos where id=i.photo_id;
 if p_ok and public.delivery_original_source_current(i.id) is not true then
  update public.delivery_render_jobs set attempts=5 where id=j.id;
  p_ok:=false;p_error:='render_origem_indisponivel';
 end if;
 if p_ok and (owned_paths is not true or p_asset_hash is null or p_asset_hash !~ '^[0-9a-f]{64}$'
  or p_width is null or p_height is null or p.width is null or p.height is null or p_width<=0 or p_height<=0
  or p_width<>p.width or p_height<>p.height) then raise exception 'invalid_render';end if;
 if not p_ok and owned_paths then perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'partial_delivery_render',b.school_id);end if;
 result:=public.complete_delivery_render_job_base(p_job_id,p_ok,p_error,p_asset_path,p_thumb_path,p_asset_hash,p_width,p_height);
 if result='done' then update public.delivery_items set rendered_regions_version=null,assets_purged_at=null where id=i.id;end if;
 update public.delivery_batches set rendered_count=(select count(*) from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status='done'),
 failed_count=(select count(*) from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status='failed'),
 status=case when not exists(select 1 from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status<>'done') then 'awaiting_review' else 'preparing' end where id=b.id;
 update public.delivery_recipients dr set status='ready',last_error=null where dr.batch_id=b.id and dr.status not in('revoked','canceled','expired') and exists(select 1 from public.delivery_items di where di.recipient_id=dr.id and di.selected)
 and not exists(select 1 from public.delivery_items di where di.recipient_id=dr.id and di.selected and di.render_status<>'done');
 return result;
end $$;
revoke all on function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int,text) from public,anon,authenticated;
grant execute on function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int,text) to service_role;

create or replace function public.delivery_recipient_gate(p_recipient_id uuid,p_approved boolean default true) returns text
language plpgsql stable security definer set search_path=public as $$
declare r public.delivery_recipients%rowtype; b public.delivery_batches%rowtype;
begin
 select * into r from public.delivery_recipients where id=p_recipient_id;
 select * into b from public.delivery_batches where id=r.batch_id;
 if r.id is null or not exists(select 1 from public.events e join public.schools sc on sc.id=e.school_id where e.id=r.event_id and e.school_id=r.school_id and e.deleted_at is null and sc.deleted_at is null) or b.status='canceled' or r.status in('revoked','canceled','expired') then return 'revoked'; end if;
 if not exists(select 1 from public.guardians g where g.id=r.guardian_id and g.school_id=r.school_id and g.deleted_at is null
 and g.whatsapp=r.target_whatsapp and g.whatsapp_verified_at=r.verified_at_snapshot) then return 'number_unverified'; end if;
 if exists(select 1 from public.delivery_recipient_students rs join public.students s on s.id=rs.student_id join public.authorizations a on a.id=rs.authorization_id
 where rs.recipient_id=r.id and (s.deleted_at is not null or s.school_id<>r.school_id or s.primary_guardian_id is distinct from r.guardian_id or a.revoked_at is not null or a.granted_at is null or a.student_id is distinct from rs.student_id or a.guardian_id is distinct from r.guardian_id or a.school_id is distinct from r.school_id or a.scope<>'delivery_whatsapp' or a.evidence->>'source' is distinct from 'guardian_link')) then return 'authorization_revoked'; end if;
 if p_approved and (b.approved_version is null or b.approved_version<>b.draft_version or not exists(select 1 from public.delivery_approvals where recipient_id=r.id and version=b.approved_version)) then return 'approval_required'; end if;
 if p_approved and exists(select 1 from public.delivery_approvals ap where ap.recipient_id=r.id and ap.version=b.approved_version and
 (jsonb_array_length(ap.items)<>(select count(*) from public.delivery_items di where di.recipient_id=r.id and di.selected)
 or exists(select 1 from jsonb_array_elements(ap.items) asset where not exists(select 1 from public.delivery_items di join public.photos ph on ph.id=di.photo_id
 where di.id=(asset->>'id')::uuid and di.recipient_id=r.id and di.selected and di.render_status='done'
 and di.photo_id=(asset->>'photoId')::uuid and di.asset_hash=asset->>'assetHash' and di.asset_path=asset->>'assetPath' and di.thumb_path=asset->>'thumbPath'
 and di.render_policy=coalesce(asset->>'renderPolicy','protected_regions_v1')
 and (di.render_policy='original_v1' or di.rendered_regions_version=(asset->>'regionsVersion')::int) and di.display_order=(asset->>'order')::int and di.retention_until=(asset->>'retentionUntil')::timestamptz
 and di.assets_purged_at is null and ph.deleted_at is null and ph.event_id=r.event_id and ph.school_id=r.school_id)))) then return 'approval_required';end if;
 if not exists(select 1 from public.delivery_items where recipient_id=r.id and selected) then return 'empty_album'; end if;
 if exists(select 1 from public.delivery_items i join public.photos p on p.id=i.photo_id where i.recipient_id=r.id and i.selected and
 (i.render_status<>'done' or i.asset_path is null or i.thumb_path is null or i.assets_purged_at is not null or i.retention_until<=now() or i.retention_until is null
 or p.deleted_at is not null or p.event_id<>r.event_id or p.school_id<>r.school_id
 or (i.render_policy='protected_regions_v1' and (not p.all_people_reviewed or p.regions_reviewed_version is distinct from p.regions_version or i.rendered_regions_version is distinct from p.regions_version))
 or (i.render_policy='original_v1' and (public.delivery_original_source_current(i.id) is not true or i.image_width is distinct from p.width or i.image_height is distinct from p.height or i.image_width is null or i.image_height is null))
 or not exists(select 1 from public.photo_faces f join public.delivery_recipient_students rs on rs.student_id=f.student_id
 where f.photo_id=p.id and f.state='confirmed' and rs.recipient_id=r.id))) then return 'unsafe_or_expired_asset'; end if;
 return null;
end $$;
revoke all on function public.delivery_recipient_gate(uuid,boolean) from public,anon,authenticated;
grant execute on function public.delivery_recipient_gate(uuid,boolean) to service_role;

create or replace function public.approve_delivery_batch(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.delivery_batches%rowtype; r record; reason text; n int:=0; mode text;
begin
 select * into b from public.delivery_batches where id=p_batch_id for update;
 if auth.uid() is null or not exists(select 1 from public.school_members where school_id=b.school_id and user_id=auth.uid() and role in('school_admin','school_staff')) then raise exception 'not allowed'; end if;
 if b.status<>'awaiting_review' or public.delivery_fields_valid(b.message_fields) is not true then raise exception 'preview_required'; end if;
 select case when enabled and not kill_switch then 'controlled_zapi' else 'paused' end into mode from public.whatsapp_controlled_settings where school_id=b.school_id;
 mode:=coalesce(mode,'paused');
 for r in select id from public.delivery_recipients where batch_id=b.id order by id for update loop
 reason:=public.delivery_recipient_gate(r.id,false);
 if reason is not null then raise exception 'recipient_blocked:%',reason; end if;
 insert into public.delivery_approvals(recipient_id,version,fields,items,mode,approved_by)
 select r.id,b.draft_version,b.message_fields,jsonb_agg(jsonb_build_object('id',i.id,'photoId',i.photo_id,'order',i.display_order,
 'renderPolicy',i.render_policy,'assetPath',i.asset_path,'thumbPath',i.thumb_path,'assetHash',i.asset_hash,'regionsVersion',i.rendered_regions_version,
 'width',i.image_width,'height',i.image_height,'retentionUntil',i.retention_until,
 'studentIds',(select jsonb_agg(rs.student_id) from public.delivery_item_students its join public.delivery_recipient_students rs on rs.id=its.recipient_student_id where its.item_id=i.id)) order by i.display_order,i.id),mode,auth.uid()
 from public.delivery_items i where i.recipient_id=r.id and i.selected;
 n:=n+1;
 end loop;
 update public.delivery_items i set preview_reviewed_by=auth.uid(),preview_reviewed_at=now() from public.delivery_recipients rp where rp.id=i.recipient_id and rp.batch_id=b.id and i.selected;
 update public.delivery_recipients set status='queued',last_error=null where batch_id=b.id;
 update public.delivery_batches set approved_version=draft_version,approved_mode=mode,status='queued',approved_by=auth.uid(),approved_at=now() where id=b.id;
 insert into public.delivery_events(school_id,batch_id,event_type,detail,created_by) values(b.school_id,b.id,'batch_approved',jsonb_build_object('version',b.draft_version,'approved',n),auth.uid());
 return jsonb_build_object('approved',n,'blocked',0);
end $$;
revoke all on function public.approve_delivery_batch(uuid) from public,anon;
grant execute on function public.approve_delivery_batch(uuid) to authenticated;

create or replace function public.delivery_draft_detail(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b public.delivery_batches%rowtype;
begin
 select * into b from public.delivery_batches where id=p_batch_id;
 if not found or auth.uid() is null or not public.is_member_of(b.school_id) then raise exception 'not allowed'; end if;
 return jsonb_build_object('batch',jsonb_build_object('id',b.id,'eventId',b.event_id,'status',b.status,
 'version',b.draft_version,'approvedVersion',b.approved_version,'fields',b.message_fields),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'guardianName',g.name,
 'phoneMasked',public.mask_phone_e164(r.target_whatsapp),'status',r.status,'blockedReason',case when r.last_error in ('render_atualizacao_necessaria','number_unverified','authorization_revoked','render_incomplete','unsafe_or_expired_asset','empty_album','approval_required','worker_version_required','render_indisponivel','provider_timeout_or_network_error','provider_response_missing_id','provider_response_invalid','provider_result_unknown','delivery_gate_closed','guardian_phone_changed') then r.last_error when r.last_error is not null then 'render_indisponivel' else null end,'updatedAt',r.updated_at,
 'students',(select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name)
 from public.delivery_recipient_students rs join public.students s on s.id=rs.student_id where rs.recipient_id=r.id),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'photoId',i.photo_id,'order',i.display_order,'selected',i.selected,
 'renderStatus',i.render_status) order by i.display_order,i.id),'[]'::jsonb) from public.delivery_items i where i.recipient_id=r.id)) order by g.name)
 from public.delivery_recipients r join public.guardians g on g.id=r.guardian_id where r.batch_id=b.id),'[]'::jsonb));
end $$;
revoke all on function public.delivery_draft_detail(uuid) from public,anon;
grant execute on function public.delivery_draft_detail(uuid) to authenticated;

create or replace function public.delivery_batch_detail(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batch public.delivery_batches%rowtype;
  v_result jsonb;
begin
  select * into v_batch from public.delivery_batches where id = p_batch_id;
  if not found then raise exception 'batch not found'; end if;
  if not (public.is_member_of(v_batch.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'event_id', v_batch.event_id,
      'status', v_batch.status,
      'terms_version', v_batch.terms_version,
      'recipient_count', v_batch.recipient_count,
      'item_count', v_batch.item_count,
      'rendered_count', v_batch.rendered_count,
      'failed_count', v_batch.failed_count,
      'created_at', v_batch.created_at,
      'approved_at', v_batch.approved_at,
      'canceled_at', v_batch.canceled_at),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'guardian_name', g.name,
        'phone_masked', public.mask_phone_e164(r.target_whatsapp),
        'status', r.status,
        'last_error', case when r.last_error in ('render_atualizacao_necessaria','number_unverified','authorization_revoked','render_incomplete','unsafe_or_expired_asset','empty_album','approval_required','worker_version_required','render_indisponivel','provider_timeout_or_network_error','provider_response_missing_id','provider_response_invalid','provider_result_unknown','delivery_gate_closed','guardian_phone_changed') then r.last_error when r.last_error is not null then 'render_indisponivel' else null end,
        'students', (
          select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
            from public.delivery_recipient_students rs
            join public.students s on s.id = rs.student_id
           where rs.recipient_id = r.id),
        'items_total', (select count(*) from public.delivery_items i where i.recipient_id = r.id and i.selected),
        'items_rendered', (select count(*) from public.delivery_items i
                            where i.recipient_id = r.id and i.selected and i.render_status = 'done'),
        'items_failed', (select count(*) from public.delivery_items i
                          where i.recipient_id = r.id and i.selected and i.render_status = 'failed')
      ) order by g.name)
        from public.delivery_recipients r
        join public.guardians g on g.id = r.guardian_id
       where r.batch_id = p_batch_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.delivery_batch_detail(uuid) from public, anon;
grant execute on function public.delivery_batch_detail(uuid) to authenticated, service_role;

create or replace function public.delivery_regions_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare bid uuid; paths text[];
begin
 for bid in select distinct r.batch_id from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
 where i.render_policy='protected_regions_v1' and i.photo_id=new.id
 and not exists(select 1 from public.delivery_render_jobs frozen where frozen.batch_id=r.batch_id and frozen.last_error='render_atualizacao_necessaria')
 and not exists(select 1 from public.delivery_recipients x where x.batch_id=r.batch_id and (x.dispatch_started_at is not null or x.status in('sending','accepted','sent','delivered','read','unknown'))) order by r.batch_id loop
 perform 1 from public.delivery_batches where id=bid for update;
 select array_agg(path) into paths from (select i.asset_path path from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=bid and i.render_policy='protected_regions_v1' and i.photo_id=new.id and i.asset_path is not null union select i.thumb_path from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=bid and i.render_policy='protected_regions_v1' and i.photo_id=new.id and i.thumb_path is not null) retired;
 if cardinality(paths)>0 then perform public.enqueue_storage_purge('delivery-assets',paths,'delivery_review_changed',new.school_id);end if;
 update public.delivery_items i set render_status='queued',preview_reviewed_at=null,preview_reviewed_by=null from public.delivery_recipients r where r.id=i.recipient_id and r.batch_id=bid and i.render_policy='protected_regions_v1' and i.photo_id=new.id;
 update public.delivery_render_jobs j set status='queued',attempts=0,leased_until=null from public.delivery_items i where i.id=j.item_id and i.render_policy='protected_regions_v1' and i.photo_id=new.id and j.batch_id=bid;
 update public.delivery_batches set draft_version=draft_version+1,status='preparing',approved_version=null,approved_by=null,approved_at=null where id=bid and status<>'canceled';
 update public.delivery_recipients set status='preparing' where batch_id=bid and status<>'canceled';
 end loop;
 return new;
end $$;
revoke all on function public.delivery_regions_changed() from public,anon,authenticated;
drop trigger if exists delivery_regions_changed on public.photos;
create trigger delivery_regions_changed after update of regions_version,all_people_reviewed on public.photos for each row
 when (old.regions_version is distinct from new.regions_version or old.all_people_reviewed is distinct from new.all_people_reviewed) execute function public.delivery_regions_changed();

-- Atualização/retry explícito: somente fotos selecionadas, sem apagar originais.
create or replace function public.retry_failed_delivery_render_jobs(p_batch_id uuid) returns int
language plpgsql security definer set search_path=public as $$
declare b public.delivery_batches%rowtype; n int; item record;
begin
 select * into b from public.delivery_batches where id=p_batch_id for update;
 if b.id is null or auth.uid() is null or not public.is_member_of(b.school_id) then raise exception 'not allowed';end if;
 if b.status='canceled' or b.approved_version is not null or exists(select 1 from public.delivery_recipients where batch_id=b.id and (dispatch_started_at is not null or status in('sending','accepted','sent','delivered','read','unknown'))) then raise exception 'not_retryable';end if;
 for item in select i.* from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
 join public.delivery_render_jobs j on j.item_id=i.id where r.batch_id=b.id and i.selected and j.status='failed' loop
  if item.asset_path is not null or item.thumb_path is not null then
   perform public.enqueue_storage_purge('delivery-assets',array[item.asset_path,item.thumb_path],'delivery_original_refresh',b.school_id);
  end if;
  update public.delivery_items set render_policy='original_v1',render_status='queued',asset_path=null,thumb_path=null,asset_hash=null,
   image_width=null,image_height=null,rendered_regions_version=null,assets_purged_at=null,retention_until=null,preview_reviewed_at=null,preview_reviewed_by=null where id=item.id;
 end loop;
 update public.delivery_render_jobs j set status='queued',attempts=0,leased_until=null,last_error=null,draft_version=b.draft_version
 from public.delivery_items i where i.id=j.item_id and j.batch_id=b.id and i.selected and j.status='failed';
 get diagnostics n=row_count;
 if n>0 then
  update public.delivery_batches set status='preparing',failed_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected and i.render_status='failed') where id=b.id;
  update public.delivery_recipients r set status='preparing',last_error=null where r.batch_id=b.id and r.status not in('revoked','canceled','expired')
   and exists(select 1 from public.delivery_items i where i.recipient_id=r.id and i.selected and i.render_status='queued');
 end if;
 return n;
end $$;
revoke all on function public.retry_failed_delivery_render_jobs(uuid) from public,anon;
grant execute on function public.retry_failed_delivery_render_jobs(uuid) to authenticated,service_role;
