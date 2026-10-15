-- IAschool S05/S06/S07. Aplicado em 12/10/2026 pelo MCP supabase-iaschool: iaschool_adjustments_delivery_album.
-- Ordem: fase5-delivery-batches.sql, fase5-person-regions.sql,
-- fase5-review-media.sql, depois este arquivo. Não muda o modo de WhatsApp.
-- Rollback operacional: manter envio pausado, revogar acessos e restaurar backup.
alter table public.delivery_batches add column if not exists draft_version int not null default 1;
alter table public.delivery_batches add column if not exists approved_version int;
alter table public.delivery_batches add column if not exists message_fields jsonb not null default '{"eventName":"Evento","callToAction":"Veja as fotos autorizadas no álbum privado.","signature":"Escola"}';
alter table public.delivery_batches add column if not exists approved_mode text;
alter table public.delivery_recipients add column if not exists dispatch_started_at timestamptz;
update public.delivery_recipients set dispatch_started_at=created_at where attempts>0 and dispatch_started_at is null;
alter table public.delivery_items add column if not exists selected boolean not null default true;
alter table public.delivery_items add column if not exists display_order int not null default 0;
alter table public.delivery_render_jobs add column if not exists draft_version int not null default 1;
alter table public.delivery_render_jobs add column if not exists lease_version int not null default 0;
alter table public.delivery_access_sessions add column if not exists approval_version int;

-- Relação completa preservada mesmo quando irmãos compartilham uma foto.
create table if not exists public.delivery_item_students (
 item_id uuid not null references public.delivery_items(id) on delete cascade,
 recipient_student_id uuid not null references public.delivery_recipient_students(id) on delete cascade,
 primary key(item_id,recipient_student_id)
);
create table if not exists public.delivery_approvals (
 recipient_id uuid not null references public.delivery_recipients(id) on delete cascade,
 version int not null, fields jsonb not null, items jsonb not null,
 mode text not null, approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(), primary key(recipient_id,version)
);
create table if not exists public.delivery_album_tokens (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.delivery_recipients(id) on delete cascade,
 approval_version int not null, token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists delivery_album_tokens_recipient_idx on public.delivery_album_tokens(recipient_id);
alter table public.delivery_item_students enable row level security;
alter table public.delivery_approvals enable row level security;
alter table public.delivery_album_tokens enable row level security;
revoke all on public.delivery_item_students,public.delivery_approvals,public.delivery_album_tokens from public,anon,authenticated;
grant all on public.delivery_item_students,public.delivery_approvals,public.delivery_album_tokens to service_role;

-- Migra rascunhos anteriores, sem alterar lotes já transmitidos/aprovados.
insert into public.delivery_item_students(item_id,recipient_student_id)
select first_value(i.id) over(partition by i.recipient_id,i.photo_id order by i.id),i.recipient_student_id
from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
where not exists(select 1 from public.delivery_approvals a where a.recipient_id=r.id)
and not exists(select 1 from public.delivery_recipients x where x.batch_id=r.batch_id and (x.dispatch_started_at is not null or x.status in('sending','accepted','sent','delivered','read','unknown')))
on conflict do nothing;
do $$ declare item record;begin
 for item in select i.*,r.school_id from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
 where not exists(select 1 from public.delivery_approvals a where a.recipient_id=r.id)
 and not exists(select 1 from public.delivery_recipients x where x.batch_id=r.batch_id and (x.dispatch_started_at is not null or x.status in('sending','accepted','sent','delivered','read','unknown')))
 and exists(select 1 from public.delivery_items x where x.recipient_id=i.recipient_id and x.photo_id=i.photo_id and x.id<i.id) loop
 if item.asset_path is not null then perform public.enqueue_storage_purge('delivery-assets',array[item.asset_path,item.thumb_path],'delivery_duplicate',item.school_id);end if;
 delete from public.delivery_items where id=item.id;
 end loop;
end$$;
with ranks as(select i.id,row_number() over(partition by i.recipient_id order by i.created_at,i.id)-1 n
from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
where not exists(select 1 from public.delivery_approvals a where a.recipient_id=r.id))
update public.delivery_items i set display_order=ranks.n from ranks where ranks.id=i.id;
update public.delivery_batches b set item_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected)
where not exists(select 1 from public.delivery_approvals a join public.delivery_recipients r on r.id=a.recipient_id where r.batch_id=b.id);

create or replace function public.delivery_fields_valid(p_fields jsonb) returns boolean
language sql immutable set search_path=public as $$
 select jsonb_typeof(p_fields)='object' and p_fields ?& array['eventName','callToAction','signature']
 and (select count(*) from jsonb_object_keys(p_fields))=3
 and jsonb_typeof(p_fields->'eventName')='string' and length(btrim(p_fields->>'eventName'))>=1 and length(p_fields->>'eventName')<=120
 and jsonb_typeof(p_fields->'callToAction')='string' and length(p_fields->>'callToAction')<=160
 and jsonb_typeof(p_fields->'signature')='string' and length(btrim(p_fields->>'signature'))>=1 and length(p_fields->>'signature')<=80
 and concat(p_fields->>'eventName',p_fields->>'callToAction',p_fields->>'signature') !~* '(https?:|www[.]|javascript:|data:|[[:cntrl:]])';
$$;
revoke all on function public.delivery_fields_valid(jsonb) from public,anon,authenticated;

-- Idempotente: mantém o criador anterior privado para reaproveitar elegibilidade.
do $$ begin
 if to_regprocedure('public.create_delivery_batch_base(uuid,uuid[],text)') is null then
 alter function public.create_delivery_batch(uuid,uuid[],text) rename to create_delivery_batch_base;
 end if;
end $$;
revoke all on function public.create_delivery_batch_base(uuid,uuid[],text) from public,anon,authenticated;
create or replace function public.create_delivery_batch(p_event_id uuid,p_guardian_ids uuid[],p_terms_version text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if exists(select 1 from public.delivery_recipients where event_id=p_event_id and guardian_id=any(p_guardian_ids) and dispatch_started_at is not null and status not in('revoked','canceled','expired')) then raise exception 'delivery_already_transmitted_use_resend';end if;
 v_id:=public.create_delivery_batch_base(p_event_id,p_guardian_ids,p_terms_version);
 if exists(select 1 from public.delivery_recipient_students rs join public.delivery_recipients r on r.id=rs.recipient_id join public.authorizations a on a.id=rs.authorization_id
 where r.batch_id=v_id and (a.student_id is distinct from rs.student_id or a.guardian_id is distinct from r.guardian_id or a.school_id is distinct from r.school_id)) then raise exception 'authorization_guardian_mismatch';end if;
 insert into public.delivery_item_students(item_id,recipient_student_id)
 select first_value(i.id) over(partition by i.recipient_id,i.photo_id order by i.id),i.recipient_student_id
 from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=v_id on conflict do nothing;
 delete from public.delivery_items i using public.delivery_recipients r
 where r.id=i.recipient_id and r.batch_id=v_id and exists(
 select 1 from public.delivery_items x where x.recipient_id=i.recipient_id and x.photo_id=i.photo_id and x.id<i.id);
 with ranks as(select i.id,row_number() over(partition by i.recipient_id order by i.created_at,i.id)-1 n
 from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=v_id)
 update public.delivery_items i set display_order=ranks.n from ranks where ranks.id=i.id;
 update public.delivery_batches b set message_fields=jsonb_build_object('eventName',left(e.name,120),
 'callToAction','Veja as fotos autorizadas no álbum privado.','signature',left(s.name,80)),
 item_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=v_id)
 from public.events e,public.schools s where b.id=v_id and e.id=b.event_id and s.id=b.school_id;
 return v_id;
end $$;
revoke all on function public.create_delivery_batch(uuid,uuid[],text) from public,anon;
grant execute on function public.create_delivery_batch(uuid,uuid[],text) to authenticated;

create or replace function public.delivery_draft_detail(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b public.delivery_batches%rowtype;
begin
 select * into b from public.delivery_batches where id=p_batch_id;
 if not found or auth.uid() is null or not public.is_member_of(b.school_id) then raise exception 'not allowed'; end if;
 return jsonb_build_object('batch',jsonb_build_object('id',b.id,'eventId',b.event_id,'status',b.status,
 'version',b.draft_version,'approvedVersion',b.approved_version,'fields',b.message_fields),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'guardianName',g.name,
 'phoneMasked',public.mask_phone_e164(r.target_whatsapp),'status',r.status,'blockedReason',case when r.last_error in ('number_unverified','authorization_revoked','render_incomplete','unsafe_or_expired_asset','empty_album','approval_required','worker_version_required','render_indisponivel','provider_timeout_or_network_error','provider_response_missing_id','provider_response_invalid','provider_result_unknown','delivery_gate_closed','guardian_phone_changed') then r.last_error when r.last_error is not null then 'render_indisponivel' else null end,'updatedAt',r.updated_at,
 'students',(select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name)
 from public.delivery_recipient_students rs join public.students s on s.id=rs.student_id where rs.recipient_id=r.id),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'photoId',i.photo_id,'order',i.display_order,'selected',i.selected,
 'renderStatus',i.render_status) order by i.display_order,i.id),'[]'::jsonb) from public.delivery_items i where i.recipient_id=r.id)) order by g.name)
 from public.delivery_recipients r join public.guardians g on g.id=r.guardian_id where r.batch_id=b.id),'[]'::jsonb));
end $$;
revoke all on function public.delivery_draft_detail(uuid) from public,anon;
grant execute on function public.delivery_draft_detail(uuid) to authenticated;

create or replace function public.save_delivery_draft(p_batch_id uuid,p_expected_version int,p_fields jsonb,p_selection jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.delivery_batches%rowtype; sel jsonb; pid jsonb; n int; rid uuid;
begin
 select * into b from public.delivery_batches where id=p_batch_id for update;
 if not found or auth.uid() is null or not public.is_member_of(b.school_id) then raise exception 'not allowed'; end if;
 if b.draft_version is distinct from p_expected_version then raise exception 'draft_version_conflict'; end if;
 if b.status='canceled' or exists(select 1 from public.delivery_recipients
 where batch_id=b.id and (dispatch_started_at is not null or status in('sending','accepted','sent','delivered','read','unknown'))) then raise exception 'already_transmitted'; end if;
 if public.delivery_fields_valid(p_fields) is not true or jsonb_typeof(p_selection) is distinct from 'array' then raise exception 'invalid_draft'; end if;
 if jsonb_array_length(p_selection)<>(select count(*) from public.delivery_recipients where batch_id=b.id) then raise exception 'invalid_recipients'; end if;
 if (select count(distinct x->>'recipientId') from jsonb_array_elements(p_selection)x)<>jsonb_array_length(p_selection) then raise exception 'duplicate_recipient'; end if;
 for sel in select * from jsonb_array_elements(p_selection) loop
 rid:=(sel->>'recipientId')::uuid;
 if not exists(select 1 from public.delivery_recipients where id=rid and batch_id=b.id) or jsonb_typeof(sel->'photoIds') is distinct from 'array' then raise exception 'invalid_selection'; end if;
 if (select count(distinct x) from jsonb_array_elements_text(sel->'photoIds')x)<>jsonb_array_length(sel->'photoIds') then raise exception 'duplicate_photo'; end if;
 update public.delivery_items set selected=false where recipient_id=rid;
 n:=0;
 for pid in select * from jsonb_array_elements(sel->'photoIds') loop
 update public.delivery_items set selected=true,display_order=n where recipient_id=rid and photo_id=(pid#>>'{}')::uuid;
 if not found then raise exception 'photo_outside_recipient'; end if;
 n:=n+1;
 end loop;
 end loop;
 update public.delivery_batches set draft_version=draft_version+1,message_fields=p_fields,approved_version=null,
 approved_by=null,approved_at=null,status=case when exists(select 1 from public.delivery_render_jobs j join public.delivery_items i on i.id=j.item_id where j.batch_id=b.id and i.selected and j.status in('queued','leased','failed')) then 'preparing' else 'awaiting_review' end,
 item_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected),
 rendered_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected and i.render_status='done'),
 failed_count=(select count(*) from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=b.id and i.selected and i.render_status='failed')
 where id=b.id;
 update public.delivery_recipients set status=case when exists(select 1 from public.delivery_items where recipient_id=public.delivery_recipients.id and selected and render_status<>'done') then 'preparing' else 'ready' end where batch_id=b.id;
 -- Texo/ordem não exigem novo render, mas jobs em andamento concluem sob nova versão.
 update public.delivery_render_jobs set draft_version=b.draft_version+1,status=case when status='leased' then 'queued' else status end,leased_until=null where batch_id=b.id and status in('queued','leased');
 return jsonb_build_object('version',b.draft_version+1);
end $$;
revoke all on function public.save_delivery_draft(uuid,int,jsonb,jsonb) from public,anon;
grant execute on function public.save_delivery_draft(uuid,int,jsonb,jsonb) to authenticated;

-- Guard comum: chamado ao aprovar, emitir link, consumir e assinar.
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
 and di.rendered_regions_version=(asset->>'regionsVersion')::int and di.display_order=(asset->>'order')::int and di.retention_until=(asset->>'retentionUntil')::timestamptz
 and di.assets_purged_at is null and ph.deleted_at is null and ph.event_id=r.event_id and ph.school_id=r.school_id)))) then return 'approval_required';end if;
 if not exists(select 1 from public.delivery_items where recipient_id=r.id and selected) then return 'empty_album'; end if;
 if exists(select 1 from public.delivery_items i join public.photos p on p.id=i.photo_id where i.recipient_id=r.id and i.selected and
 (i.render_status<>'done' or i.asset_path is null or i.thumb_path is null or i.assets_purged_at is not null or i.retention_until<=now() or i.retention_until is null
 or p.deleted_at is not null or p.event_id<>r.event_id or p.school_id<>r.school_id or not p.all_people_reviewed or p.regions_reviewed_version is distinct from p.regions_version
 or i.rendered_regions_version is distinct from p.regions_version
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
 'assetPath',i.asset_path,'thumbPath',i.thumb_path,'assetHash',i.asset_hash,'regionsVersion',i.rendered_regions_version,
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

-- Dados internos de render obtidos no mesmo snapshot e revalidados na conclusão.
create or replace function public.delivery_render_context(p_job_id bigint) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 return (select jsonb_build_object('itemId',i.id,'batchId',b.id,'schoolId',b.school_id,'eventId',b.event_id,'recipientId',r.id,
 'photoPath',p.storage_path,'draftVersion',b.draft_version,'review',jsonb_build_object('regionsVersion',p.regions_version,
 'reviewedVersion',p.regions_reviewed_version,'allPeopleReviewed',p.all_people_reviewed,'width',p.regions_reviewed_width,'height',p.regions_reviewed_height,
 'detectedFaceIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.photo_faces where photo_id=p.id),
 'authorizedStudentIds',(select jsonb_agg(rs.student_id) from public.delivery_recipient_students rs join public.authorizations a on a.id=rs.authorization_id
 join public.students s on s.id=rs.student_id where rs.recipient_id=r.id and a.revoked_at is null and a.granted_at is not null and a.student_id=rs.student_id and a.guardian_id=r.guardian_id and a.school_id=r.school_id and a.scope='delivery_whatsapp' and a.evidence->>'source'='guardian_link' and s.primary_guardian_id=r.guardian_id and s.school_id=r.school_id and s.deleted_at is null),
 'regions',(select coalesce(jsonb_agg(jsonb_build_object('kind',reg.kind,'studentId',reg.student_id,'faceId',reg.face_id,'shape',reg.shape,'points',reg.points,'reviewedBy',reg.reviewed_by,'reviewedAt',reg.reviewed_at)),'[]'::jsonb) from public.photo_person_regions reg where reg.photo_id=p.id)))
 from public.delivery_render_jobs j join public.delivery_items i on i.id=j.item_id join public.delivery_recipients r on r.id=i.recipient_id
 join public.delivery_batches b on b.id=r.batch_id join public.photos p on p.id=i.photo_id where j.id=p_job_id and j.status='leased' and b.status='preparing');
end $$;
revoke all on function public.delivery_render_context(bigint) from public,anon,authenticated;
grant execute on function public.delivery_render_context(bigint) to service_role;

-- O endpoint antigo não aceita versões: permanece privado e falha fechado.
do $$ begin
 if to_regprocedure('public.complete_delivery_render_job_base(bigint,boolean,text,text,text,text,integer,integer)') is null then
 alter function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,integer,integer) rename to complete_delivery_render_job_base;
 end if;
end $$;
revoke all on function public.complete_delivery_render_job_base(bigint,boolean,text,text,text,text,int,int) from public,anon,authenticated,service_role;
drop function if exists public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int);
create or replace function public.complete_delivery_render_job(p_job_id bigint,p_ok boolean,p_error text default null,p_asset_path text default null,p_thumb_path text default null,p_asset_hash text default null,p_width int default null,p_height int default null,p_regions_version int default null,p_draft_version int default null,p_lease_version int default null) returns text
language plpgsql security definer set search_path=public as $$
declare j public.delivery_render_jobs%rowtype; i public.delivery_items%rowtype; b public.delivery_batches%rowtype; p public.photos%rowtype; result text; owned_paths boolean;
begin
 select * into j from public.delivery_render_jobs where id=p_job_id;
 if j.id is null then return 'missing'; end if;
 select * into i from public.delivery_items where id=j.item_id;
 select * into p from public.photos where id=i.photo_id for update;
 select * into b from public.delivery_batches where id=j.batch_id for update;
 select * into j from public.delivery_render_jobs where id=p_job_id for update;
 owned_paths:=p_asset_path is not null and p_thumb_path is not null and p_asset_path = b.school_id::text||'/'||b.id::text||'/'||i.recipient_id::text||'/'||i.id::text||'/v'||p_draft_version::text||'-r'||p_regions_version::text||'-a'||p_lease_version::text||'.jpg'
 and p_thumb_path = b.school_id::text||'/'||b.id::text||'/'||i.recipient_id::text||'/'||i.id::text||'/v'||p_draft_version::text||'-r'||p_regions_version::text||'-a'||p_lease_version::text||'.webp';
 if p_lease_version is not null and p_lease_version is distinct from j.lease_version then
 if owned_paths then perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'stale_delivery_attempt',b.school_id);end if;
 return 'noop';end if;
 if j.status<>'leased' or b.status<>'preparing' then
 if owned_paths and p_draft_version is distinct from b.draft_version then
 perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'stale_delivery_render',b.school_id);
 end if;
 return 'noop'; end if;
 if not p_ok and owned_paths then perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'partial_delivery_render',b.school_id);end if;
 if p_ok and (p_regions_version is null or p_draft_version is null or p_lease_version is null) then
 update public.delivery_render_jobs set attempts=5 where id=j.id;
 return public.complete_delivery_render_job_base(p_job_id,false,'worker_version_required',null,null,null,null,null);
 end if;
 if p_ok and (p_regions_version is null or p_draft_version is distinct from b.draft_version or p_regions_version<>p.regions_version
 or p.regions_reviewed_version is distinct from p.regions_version or not p.all_people_reviewed or p.deleted_at is not null) then
 if owned_paths then perform public.enqueue_storage_purge('delivery-assets',array[p_asset_path,p_thumb_path],'stale_delivery_render',b.school_id); end if;
 update public.delivery_render_jobs set status='queued',leased_until=null,draft_version=b.draft_version where id=j.id;
 return 'requeued'; end if;
 if p_ok and (owned_paths is not true or p_asset_hash is null or p_width is null or p_height is null or p_asset_hash !~ '^[0-9a-f]{64}$' or p_width<>p.regions_reviewed_width or p_height<>p.regions_reviewed_height) then raise exception 'invalid_render'; end if;
 result:=public.complete_delivery_render_job_base(p_job_id,p_ok,p_error,p_asset_path,p_thumb_path,p_asset_hash,p_width,p_height);
 if result='done' then update public.delivery_items set rendered_regions_version=p_regions_version where id=i.id; end if;
 update public.delivery_batches set rendered_count=(select count(*) from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status='done'),
 failed_count=(select count(*) from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status='failed'),
 status=case when not exists(select 1 from public.delivery_items di join public.delivery_recipients dr on dr.id=di.recipient_id where dr.batch_id=b.id and di.selected and di.render_status<>'done') then 'awaiting_review' else 'preparing' end where id=b.id;
 update public.delivery_recipients dr set status='ready' where dr.batch_id=b.id and not exists(select 1 from public.delivery_items di where di.recipient_id=dr.id and di.selected and di.render_status<>'done');
 return result;
end $$;
revoke all on function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int) from public,anon,authenticated;
grant execute on function public.complete_delivery_render_job(bigint,boolean,text,text,text,text,int,int,int,int,int) to service_role;

-- Session/token lifecycle serialized by recipient, always batch then recipient.
create or replace function public.consume_delivery_album_token(p_token_hash text,p_session_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.delivery_album_tokens%rowtype; r public.delivery_recipients%rowtype; b public.delivery_batches%rowtype; sid uuid; reason text;
begin
 if p_session_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','unavailable'); end if;
 select * into t from public.delivery_album_tokens where token_hash=p_token_hash;
 select * into r from public.delivery_recipients where id=t.recipient_id;
 select * into b from public.delivery_batches where id=r.batch_id for update;
 perform 1 from public.delivery_recipients where id=r.id for update;
 select * into t from public.delivery_album_tokens where token_hash=p_token_hash for update;
 if t.id is null then return jsonb_build_object('error','unavailable'); end if;
 if t.revoked_at is not null then return jsonb_build_object('error','revoked'); end if;
 if t.used_at is not null then return jsonb_build_object('error','used'); end if;
 if t.expires_at<=now() then return jsonb_build_object('error','expired'); end if;
 reason:=public.delivery_recipient_gate(r.id,true);
 if reason is not null or t.approval_version<>b.approved_version then return jsonb_build_object('error',coalesce(reason,'unavailable')); end if;
 insert into public.delivery_access_sessions(recipient_id,session_hash,expires_at,approval_version) values(r.id,p_session_hash,now()+interval '24 hours',t.approval_version) returning id into sid;
 update public.delivery_album_tokens set used_at=now() where id=t.id;
 insert into public.delivery_events(school_id,batch_id,recipient_id,event_type,detail) values(r.school_id,r.batch_id,r.id,'access_opened',jsonb_build_object('version',t.approval_version));
 return jsonb_build_object('ok',true,'expiresAt',now()+interval '24 hours');
end $$;
revoke all on function public.consume_delivery_album_token(text,text) from public,anon,authenticated;
grant execute on function public.consume_delivery_album_token(text,text) to service_role;

create or replace function public.delivery_album_session(p_session_hash text,p_item_id uuid default null,p_download boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.delivery_access_sessions%rowtype; r public.delivery_recipients%rowtype; a public.delivery_approvals%rowtype; reason text; items jsonb;
begin
 select * into s from public.delivery_access_sessions where session_hash=p_session_hash;
 if s.id is null then return jsonb_build_object('error','unavailable'); end if;
 select * into r from public.delivery_recipients where id=s.recipient_id;
 perform 1 from public.delivery_batches where id=r.batch_id for update;
 perform 1 from public.delivery_recipients where id=r.id for update;
 select * into s from public.delivery_access_sessions where id=s.id;
 if s.revoked_at is not null then return jsonb_build_object('error','revoked'); end if;
 if s.expires_at<=now() then return jsonb_build_object('error','expired'); end if;
 if s.approval_version is distinct from (select approved_version from public.delivery_batches where id=r.batch_id) then return jsonb_build_object('error','approval_required');end if;
 reason:=public.delivery_recipient_gate(r.id,true);
 if reason is not null then return jsonb_build_object('error',reason); end if;
 select * into a from public.delivery_approvals where recipient_id=r.id and version=s.approval_version;
 if a.recipient_id is null then return jsonb_build_object('error','unavailable'); end if;
 select jsonb_agg(x order by (x->>'order')::int) into items from jsonb_array_elements(a.items)x where p_item_id is null or (x->>'id')::uuid=p_item_id;
 if items is null then return jsonb_build_object('error','unavailable'); end if;
 if exists(select 1 from jsonb_array_elements(items)x join public.delivery_items i on i.id=(x->>'id')::uuid where i.asset_hash is distinct from x->>'assetHash' or i.asset_path is distinct from x->>'assetPath') then return jsonb_build_object('error','unavailable'); end if;
 update public.delivery_access_sessions set last_accessed_at=now() where id=s.id;
 if p_download and p_item_id is not null then insert into public.delivery_events(school_id,batch_id,recipient_id,item_id,event_type,detail) values(r.school_id,r.batch_id,r.id,p_item_id,'photo_downloaded',jsonb_build_object('phase','url_issued')); end if;
 return jsonb_build_object('fields',a.fields,'items',items,'sessionExpiresAt',s.expires_at,'version',s.approval_version);
end $$;
revoke all on function public.delivery_album_session(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.delivery_album_session(text,uuid,boolean) to service_role;

create or replace function public.revoke_delivery_album(p_recipient_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.delivery_recipients%rowtype;
begin
 select * into r from public.delivery_recipients where id=p_recipient_id;
 perform 1 from public.delivery_batches where id=r.batch_id for update;
 perform 1 from public.delivery_recipients where id=r.id for update;
 if auth.uid() is null or not exists(select 1 from public.school_members where school_id=r.school_id and user_id=auth.uid() and role in('school_admin','school_staff')) then raise exception 'not allowed'; end if;
 update public.delivery_album_tokens set revoked_at=coalesce(revoked_at,now()) where recipient_id=r.id;
 update public.delivery_access_sessions set revoked_at=coalesce(revoked_at,now()) where recipient_id=r.id;
 update public.delivery_recipients set status='revoked' where id=r.id;
 if r.status<>'revoked' then insert into public.delivery_events(school_id,batch_id,recipient_id,event_type,created_by) values(r.school_id,r.batch_id,r.id,'access_revoked',auth.uid()); end if;
 return jsonb_build_object('ok',true,'status','revoked');
end $$;
revoke all on function public.revoke_delivery_album(uuid) from public,anon;
grant execute on function public.revoke_delivery_album(uuid) to authenticated;

create or replace function public.reserve_delivery_dispatch(p_recipient_id uuid,p_token_hash text,p_instance_id text,p_user_id uuid,p_resend boolean,p_mode text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.delivery_recipients%rowtype; b public.delivery_batches%rowtype; reason text; mid uuid; exp timestamptz;
begin
 select * into r from public.delivery_recipients where id=p_recipient_id;
 select * into b from public.delivery_batches where id=r.batch_id for update;
 select * into r from public.delivery_recipients where id=r.id for update;
 if not exists(select 1 from public.school_members where school_id=r.school_id and user_id=p_user_id and role in('school_admin','school_staff')) then raise exception 'not allowed'; end if;
 reason:=public.delivery_recipient_gate(r.id,true);
 if reason is not null then raise exception 'recipient_blocked:%',reason; end if;
 if p_mode is distinct from 'controlled_zapi' or b.approved_mode is distinct from p_mode then raise exception 'mode_changed_approval_required'; end if;
 if r.status in('sending','unknown') or (r.status='failed' and exists(select 1 from public.whatsapp_messages where id=r.current_whatsapp_message_id and status in('unknown','reserved'))) then raise exception 'uncertain_result_no_retry'; end if;
 if p_resend then
 if r.status not in('accepted','sent','delivered','read','failed') then raise exception 'not_resendable'; end if;
 if r.updated_at>now()-interval '60 seconds' then raise exception 'cooldown'; end if;
 elsif r.status not in('queued','failed') then raise exception 'already_dispatched'; end if;
 if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token'; end if;
 mid:=public.reserve_whatsapp_send(r.guardian_id,'delivery_ready',p_instance_id);
 update public.whatsapp_messages set template_version='delivery_ready.v2' where id=mid;
 -- Novo link invalida os links ainda não consumidos. Sessões não são tocadas.
 update public.delivery_album_tokens set revoked_at=now() where recipient_id=r.id and used_at is null and revoked_at is null;
 select least(now()+interval '24 hours',min(retention_until)) into exp from public.delivery_items where recipient_id=r.id and selected;
 insert into public.delivery_album_tokens(recipient_id,approval_version,token_hash,expires_at,created_by) values(r.id,b.approved_version,p_token_hash,exp,p_user_id);
 update public.delivery_recipients set status='sending',current_whatsapp_message_id=mid,attempts=attempts+1,last_error=null where id=r.id;
 update public.delivery_batches set status='processing' where id=b.id;
 return jsonb_build_object('messageId',mid,'phone',r.target_whatsapp,'fields',b.message_fields,'expiresAt',exp);
end $$;
revoke all on function public.reserve_delivery_dispatch(uuid,text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.reserve_delivery_dispatch(uuid,text,text,uuid,boolean,text) to service_role;

create or replace function public.delivery_dispatch_gate(p_message_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare r public.delivery_recipients%rowtype; permitted boolean;
begin
 select * into r from public.delivery_recipients where current_whatsapp_message_id=p_message_id;
 perform 1 from public.delivery_batches where id=r.batch_id for update;
 select * into r from public.delivery_recipients where id=r.id for update;
 permitted:=r.status='sending' and public.delivery_recipient_gate(r.id,true) is null
 and exists(select 1 from public.whatsapp_messages where id=p_message_id and status='reserved')
 and exists(select 1 from public.whatsapp_controlled_settings where school_id=r.school_id and enabled and not kill_switch)
 and exists(select 1 from public.whatsapp_controlled_allowlist where school_id=r.school_id and phone_e164=r.target_whatsapp);
 if permitted then update public.delivery_recipients set dispatch_started_at=coalesce(dispatch_started_at,now()) where id=r.id;end if;
 return permitted;
end $$;
revoke all on function public.delivery_dispatch_gate(uuid) from public,anon,authenticated;
grant execute on function public.delivery_dispatch_gate(uuid) to service_role;

create or replace function public.delivery_whatsapp_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.delivery_recipients%rowtype; et text;
begin
 if new.status=old.status or new.status='reserved' then return new; end if;
 select * into r from public.delivery_recipients where current_whatsapp_message_id=new.id;
 if not found then return new; end if;
 -- Mesma ordem da reserva/reemissão: lote, destinatário. Callback antigo não
 -- sobrescreve o resultado de uma nova mensagem depois de aguardar o lock.
 perform 1 from public.delivery_batches where id=r.batch_id for update;
 select * into r from public.delivery_recipients where current_whatsapp_message_id=new.id for update;
 if not found then return new;end if;
 update public.delivery_recipients set status=new.status,last_error=new.error_code where id=r.id and current_whatsapp_message_id=new.id and status not in('revoked','canceled','expired');
 et:=case when new.status='unknown' then 'provider_failed' else 'provider_'||new.status end;
 insert into public.delivery_events(school_id,batch_id,recipient_id,event_type,detail) values(r.school_id,r.batch_id,r.id,et,jsonb_build_object('status',new.status,'message_id',new.id));
 update public.delivery_batches set status=case when exists(select 1 from public.delivery_recipients where batch_id=r.batch_id and status in('queued','sending')) then 'processing'
 when exists(select 1 from public.delivery_recipients where batch_id=r.batch_id and status in('failed','unknown','blocked')) then 'completed_with_errors' else 'completed' end,
 finished_at=case when not exists(select 1 from public.delivery_recipients where batch_id=r.batch_id and status in('queued','sending')) then now() else null end where id=r.batch_id;
 return new;
end $$;
revoke all on function public.delivery_whatsapp_status() from public,anon,authenticated;
drop trigger if exists delivery_whatsapp_status on public.whatsapp_messages;
create trigger delivery_whatsapp_status after update of status on public.whatsapp_messages for each row execute function public.delivery_whatsapp_status();

create or replace function public.audit_delivery_zip(p_session_hash text,p_item_ids uuid[]) returns boolean
language plpgsql security definer set search_path=public as $$
declare result jsonb; s public.delivery_access_sessions%rowtype; r public.delivery_recipients%rowtype;
begin
 result:=public.delivery_album_session(p_session_hash);
 if result ? 'error' or array_length(p_item_ids,1) is null or exists(select 1 from unnest(p_item_ids)id where not exists(select 1 from jsonb_array_elements(result->'items')x where (x->>'id')::uuid=id)) then return false; end if;
 select * into s from public.delivery_access_sessions where session_hash=p_session_hash;
 select * into r from public.delivery_recipients where id=s.recipient_id;
 insert into public.delivery_events(school_id,batch_id,recipient_id,event_type,detail) values(r.school_id,r.batch_id,r.id,'zip_downloaded',jsonb_build_object('count',cardinality(p_item_ids),'phase','assembled','source','client_reported'));
 return true;
end $$;
revoke all on function public.audit_delivery_zip(text,uuid[]) from public,anon,authenticated;
grant execute on function public.audit_delivery_zip(text,uuid[]) to service_role;

-- Revisa máscara antes de transmitir: invalida ativo e requer nova prévia.
-- Se a mensagem já saiu, snapshot permanece imutável e o gate bloqueia acesso.
create or replace function public.delivery_regions_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare bid uuid; paths text[];
begin
 for bid in select distinct r.batch_id from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id
 where i.photo_id=new.id and not exists(select 1 from public.delivery_recipients x where x.batch_id=r.batch_id and (x.dispatch_started_at is not null or x.status in('sending','accepted','sent','delivered','read','unknown'))) order by r.batch_id loop
 perform 1 from public.delivery_batches where id=bid for update;
 select array_agg(path) into paths from (select i.asset_path path from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=bid and i.photo_id=new.id and i.asset_path is not null union select i.thumb_path from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=bid and i.photo_id=new.id and i.thumb_path is not null) retired;
 if cardinality(paths)>0 then perform public.enqueue_storage_purge('delivery-assets',paths,'delivery_review_changed',new.school_id);end if;
 update public.delivery_items i set render_status='queued',preview_reviewed_at=null,preview_reviewed_by=null from public.delivery_recipients r where r.id=i.recipient_id and r.batch_id=bid and i.photo_id=new.id;
 update public.delivery_render_jobs j set status='queued',attempts=0,leased_until=null from public.delivery_items i where i.id=j.item_id and i.photo_id=new.id and j.batch_id=bid;
 update public.delivery_batches set draft_version=draft_version+1,status='preparing',approved_version=null,approved_by=null,approved_at=null where id=bid and status<>'canceled';
 update public.delivery_recipients set status='preparing' where batch_id=bid and status<>'canceled';
 end loop;
 return new;
end $$;
revoke all on function public.delivery_regions_changed() from public,anon,authenticated;
drop trigger if exists delivery_regions_changed on public.photos;
create trigger delivery_regions_changed after update of regions_version,all_people_reviewed on public.photos for each row
 when (old.regions_version is distinct from new.regions_version or old.all_people_reviewed is distinct from new.all_people_reviewed) execute function public.delivery_regions_changed();

-- Navegador com sessão de outro álbum não captura o novo link da família.
create or replace function public.delivery_album_token_session(p_token_hash text,p_session_hash text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.delivery_album_tokens t join public.delivery_access_sessions s
 on s.recipient_id=t.recipient_id and s.approval_version=t.approval_version
 where t.token_hash=p_token_hash and s.session_hash=p_session_hash and s.revoked_at is null and s.expires_at>now());
$$;
revoke all on function public.delivery_album_token_session(text,text) from public,anon,authenticated;
grant execute on function public.delivery_album_token_session(text,text) to service_role;

-- Projeção antiga mantida compatível, com motivo sanitizado.
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
        'last_error', case when r.last_error in ('number_unverified','authorization_revoked','render_incomplete','unsafe_or_expired_asset','empty_album','approval_required','worker_version_required','render_indisponivel','provider_timeout_or_network_error','provider_response_missing_id','provider_response_invalid','provider_result_unknown','delivery_gate_closed','guardian_phone_changed') then r.last_error when r.last_error is not null then 'render_indisponivel' else null end,
        'students', (
          select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
            from public.delivery_recipient_students rs
            join public.students s on s.id = rs.student_id
           where rs.recipient_id = r.id),
        'items_total', (select count(*) from public.delivery_items i where i.recipient_id = r.id),
        'items_rendered', (select count(*) from public.delivery_items i
                            where i.recipient_id = r.id and i.render_status = 'done'),
        'items_failed', (select count(*) from public.delivery_items i
                          where i.recipient_id = r.id and i.render_status = 'failed')
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


-- Cancelamento não transforma transmissão incerta em operação repetível.
create or replace function public.cancel_delivery_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_batch   public.delivery_batches%rowtype;
  v_role    text;
  v_paths   text[];
  v_jobs    int;
  v_recips  int;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'batch not found'; end if;
  if not public.is_member_of(v_batch.school_id) then raise exception 'not allowed';end if;
  select role into v_role from public.school_members
   where school_id = v_batch.school_id and user_id = v_uid;

  if v_batch.created_by <> v_uid
     and (v_role is null or v_role not in ('school_admin','school_staff')) then
    raise exception 'sem permissão para cancelar este lote';
  end if;
  if v_batch.status in ('canceled','completed','completed_with_errors') then
    raise exception 'lote já encerrado';
  end if;
  -- Depois de transmitido não há cancelamento (spec §15.4); no W3 nenhum
  -- destinatário chega a esses estados.
  if exists (
    select 1 from public.delivery_recipients
     where batch_id = p_batch_id
       and (dispatch_started_at is not null or status in ('sending','accepted','sent','delivered','read','unknown'))
  ) then
    raise exception 'não é possível cancelar após o início do envio';
  end if;

  update public.delivery_render_jobs
     set status = 'failed', leased_until = null, last_error = 'batch_canceled'
   where batch_id = p_batch_id and status in ('queued','leased');
  get diagnostics v_jobs = row_count;

  select array_agg(path) into v_paths
    from (
      select asset_path as path from public.delivery_items i
        join public.delivery_recipients r on r.id = i.recipient_id
       where r.batch_id = p_batch_id and i.asset_path is not null
      union
      select thumb_path from public.delivery_items i
        join public.delivery_recipients r on r.id = i.recipient_id
       where r.batch_id = p_batch_id and i.thumb_path is not null
    ) paths;

  if v_paths is not null and array_length(v_paths, 1) > 0 then
    perform public.enqueue_storage_purge('delivery-assets', v_paths, 'delivery_batch_canceled', v_batch.school_id);
    update public.delivery_items i
       set assets_purged_at = now()
      from public.delivery_recipients r
     where r.id = i.recipient_id and r.batch_id = p_batch_id
       and (i.asset_path is not null or i.thumb_path is not null);
  end if;

  update public.delivery_recipients
     set status = 'canceled'
   where batch_id = p_batch_id
     and status in ('preparing','awaiting_review','ready','queued');
  get diagnostics v_recips = row_count;

  update public.delivery_batches
     set status = 'canceled', canceled_at = now(), canceled_by = v_uid
   where id = p_batch_id;

  insert into public.delivery_events (school_id, batch_id, event_type, detail, created_by)
  values (v_batch.school_id, p_batch_id, 'batch_canceled',
          jsonb_build_object('recipients', v_recips, 'render_jobs', v_jobs), v_uid);

  return jsonb_build_object('canceled_recipients', v_recips, 'canceled_jobs', v_jobs);
end;
$$;
revoke all on function public.cancel_delivery_batch(uuid) from public, anon;
grant execute on function public.cancel_delivery_batch(uuid) to authenticated, service_role;


-- Retry de render não ressuscita lote cancelado/transmitido.
create or replace function public.retry_failed_delivery_render_jobs(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch public.delivery_batches%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id;
  if not found then raise exception 'batch not found'; end if;
  if not public.is_member_of(v_batch.school_id) then raise exception 'not allowed'; end if;
  if v_batch.status='canceled' or exists(select 1 from public.delivery_recipients where batch_id=p_batch_id and (dispatch_started_at is not null or status in('sending','accepted','sent','delivered','read','unknown'))) then raise exception 'not_retryable';end if;

  update public.delivery_render_jobs
     set status = 'queued', attempts = 0, leased_until = null, last_error = null
   where batch_id = p_batch_id and status = 'failed';
  get diagnostics v_count = row_count;

  update public.delivery_items i
     set render_status = 'queued'
    from public.delivery_recipients r
   where r.id = i.recipient_id
     and r.batch_id = p_batch_id
     and i.render_status = 'failed';

  if v_count > 0 then
    update public.delivery_batches set status = case when exists(select 1 from public.delivery_items i join public.delivery_recipients r on r.id=i.recipient_id where r.batch_id=p_batch_id and i.selected and i.render_status<>'done') then 'preparing' else 'awaiting_review' end where id = p_batch_id;
  end if;
  return v_count;
end;
$$;
revoke all on function public.retry_failed_delivery_render_jobs(uuid) from public, anon;
grant execute on function public.retry_failed_delivery_render_jobs(uuid) to authenticated, service_role;


-- A fila trabalha somente no conjunto selecionado do rascunho.
create or replace function public.claim_delivery_render_jobs(p_limit int,p_lease_seconds int)
returns setof public.delivery_render_jobs language sql security definer set search_path=public as $$
 with candidates as(select j.id,b.draft_version from public.delivery_render_jobs j
 join public.delivery_batches b on b.id=j.batch_id join public.delivery_items i on i.id=j.item_id
 where (j.status='queued' or (j.status='leased' and j.leased_until<now())) and j.attempts<5 and b.status='preparing' and i.selected
 order by j.id limit greatest(0,least(p_limit,100)) for update of j skip locked)
 update public.delivery_render_jobs j set status='leased',attempts=j.attempts+1,lease_version=j.lease_version+1,leased_until=now()+make_interval(secs=>greatest(1,least(p_lease_seconds,600))),draft_version=c.draft_version
 from candidates c where c.id=j.id returning j.*;
$$;
revoke all on function public.claim_delivery_render_jobs(int,int) from public,anon,authenticated;
grant execute on function public.claim_delivery_render_jobs(int,int) to service_role;

-- FK/cascata remove metadados, mas não o objeto físico do Storage.
create or replace function public.delivery_item_delete_assets() returns trigger
language plpgsql security definer set search_path=public as $$
declare school uuid;
begin
 select school_id into school from public.delivery_recipients where id=old.recipient_id;
 if old.asset_path is not null or old.thumb_path is not null then
 perform public.enqueue_storage_purge('delivery-assets',array[old.asset_path,old.thumb_path],'delivery_item_deleted',school);
 end if;
 return old;
end $$;
revoke all on function public.delivery_item_delete_assets() from public,anon,authenticated;
drop trigger if exists delivery_item_delete_assets on public.delivery_items;
create trigger delivery_item_delete_assets before delete on public.delivery_items for each row execute function public.delivery_item_delete_assets();

-- Um único roundtrip do worker por lote de claims, com snapshot coerente.
create or replace function public.delivery_render_contexts(p_job_ids bigint[]) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(id::text,context),'{}'::jsonb) from
 (select id,public.delivery_render_context(id) context from public.delivery_render_jobs
 where id=any(p_job_ids) order by id limit 100) rows where context is not null;
$$;
revoke all on function public.delivery_render_contexts(bigint[]) from public,anon,authenticated;
grant execute on function public.delivery_render_contexts(bigint[]) to service_role;
