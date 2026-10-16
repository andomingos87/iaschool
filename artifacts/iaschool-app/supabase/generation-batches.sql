-- Geração em lote: aplicada via MCP local supabase-iaschool em 12/10/2026.
-- Migration iaschool_generation_batches, versão 20261012194454.
-- 16/10/2026: reference_post_id, reference_path e a fonte reference_face.
-- Migration iaschool_generation_batch_reference, versão 20261016192755,
-- aplicada via MCP local supabase-iaschool no projeto jtyyauivokutperouqyh.
-- Dependências: fase1-min-schools-events.sql, fase3-authorizations-reference-faces.sql,
-- setup.sql (generation_usage/generated_posts), fase5-review-media.sql.
-- RPCs do usuário exigem escola ativa e perfil aprovado; dados internos nunca
-- ficam disponíveis por SELECT ao browser. Provider não recebe retry automático.
create table if not exists public.generation_batches (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 prompt text not null check(length(prompt)<=3500 and length(btrim(prompt))>0), created_at timestamptz not null default now(),
 unique(created_by,request_id)
);
create table if not exists public.generation_batch_items (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.generation_batches(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade, source text not null check(source in('profile','event')),
 photo_id text not null, source_snapshot text not null,
 status text not null default 'pending' check(status in('pending','processing','completed','failed','unknown')),
 attempt int not null default 1 check(attempt>0), lease_id uuid, leased_until timestamptz,
 provider_started_at timestamptz, error_code text, art_id uuid references public.generated_posts(id) on delete set null,
 updated_at timestamptz not null default now(), unique(batch_id,student_id)
);
create index if not exists generation_batch_items_ready on public.generation_batch_items(status,leased_until);
create index if not exists generation_batches_owner on public.generation_batches(created_by,school_id,created_at desc);
alter table public.generation_batches add column if not exists reference_post_id uuid;
alter table public.generation_batches add column if not exists reference_path text;
alter table public.generation_batch_items drop constraint if exists generation_batch_items_source_check;
alter table public.generation_batch_items add constraint generation_batch_items_source_check check (source in ('profile','event','reference_face'));
create table if not exists public.generation_batch_retries (
 batch_id uuid not null references public.generation_batches(id) on delete cascade, request_id uuid not null, item_ids uuid[] not null,
 primary key(batch_id,request_id)
);
alter table public.generation_batches enable row level security;
alter table public.generation_batch_items enable row level security;
alter table public.generation_batch_retries enable row level security;
revoke all on public.generation_batches,public.generation_batch_items,public.generation_batch_retries from public,anon,authenticated;
-- Usa o bucket privado generated existente; reserva o namespace de saída
-- dos lotes por policies restritivas de escrita, mantendo leitura existente.

-- Existing generated policies permit school browser writes. Reserve batch
-- output namespace against forged PNGs, replacement and deletion. Service
-- role bypasses Storage RLS; existing SELECT rules remain in effect.
drop policy if exists generation_batches_storage_insert on storage.objects;
create policy generation_batches_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'generated' or name not like '%/generation-batches/%');
drop policy if exists generation_batches_storage_update on storage.objects;
create policy generation_batches_storage_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'generated' or name not like '%/generation-batches/%')
 with check(bucket_id<>'generated' or name not like '%/generation-batches/%');


create or replace function public.generation_batch_manage(p_school uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.schools where id=p_school and deleted_at is null)
 and exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and role in('user','dev','super_admin'))
 and (exists(select 1 from public.school_members where user_id=auth.uid() and school_id=p_school) or public.is_super_admin());
$$;
-- Canonical source lookup; a stored snapshot is compared again before provider
-- and completion. Invalid DOB is fail-closed, including impossible dates.
create or replace function public.generation_batch_source(p_student uuid,p_source text,p_photo text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare s public.students%rowtype; birth date; path text; photo uuid;
begin
 select * into s from public.students where id=p_student and deleted_at is null;
 if not found then return null; end if;
 begin
  if s.birth_date is null or s.birth_date !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  birth:=s.birth_date::date;
 exception when others then return null; end;
 if birth>current_date or birth<current_date-interval '120 years' then return null; end if;
 if birth>current_date-interval '18 years' and not exists(select 1 from public.guardians g where g.id=s.primary_guardian_id and g.school_id=s.school_id and g.deleted_at is null and nullif(btrim(g.name),'') is not null and nullif(btrim(g.whatsapp),'') is not null) then return null; end if;
 if not exists(select 1 from public.authorizations a where a.student_id=s.id and a.school_id=s.school_id and a.scope='biometric_sorting' and a.granted_at is not null and a.revoked_at is null and (birth<=current_date-interval '18 years' or a.guardian_id is not distinct from s.primary_guardian_id)) then return null; end if;
 if p_source='profile' then
  if jsonb_typeof(s.photos)<>'array' then return null; end if;
  select item->>'path' into path from jsonb_array_elements(s.photos) item where item->>'id'=p_photo limit 1;
  if path is null or path not like 'students/'||s.school_id::text||'/%' or path ~ '(^|/)\.\.(/|$)' or path ~ '[?#]' then return null; end if;
 elsif p_source='event' then
  begin photo:=p_photo::uuid; exception when others then return null; end;
  select p.storage_path into path from public.photos p join public.events e on e.id=p.event_id
   where p.id=photo and p.school_id=s.school_id and e.school_id=s.school_id and p.deleted_at is null and e.deleted_at is null
   and p.all_people_reviewed and p.regions_reviewed_version=p.regions_version and p.regions_reviewed_by is not null and p.regions_reviewed_at is not null
   and p.width=p.regions_reviewed_width and p.height=p.regions_reviewed_height and p.width>0 and p.height>0
   and (select count(*) from public.photo_faces f where f.photo_id=p.id)=1
   and exists(select 1 from public.photo_faces f where f.photo_id=p.id and f.student_id=s.id and f.school_id=s.school_id and f.state='confirmed' and f.reviewed_by is not null)
   and (select count(*) from public.photo_person_regions r where r.photo_id=p.id)=1
   and exists(select 1 from public.photo_person_regions r join public.photo_faces f on f.id=r.face_id where r.photo_id=p.id and r.kind='own_child' and r.student_id=s.id and r.school_id=s.school_id and r.reviewed_by is not null and r.reviewed_at is not null and f.photo_id=p.id and f.student_id=s.id);
 elsif p_source='reference_face' then
  begin photo:=p_photo::uuid; exception when others then return null; end;
  select f.source_photo_path into path from public.student_reference_faces f
   where f.id=photo and f.student_id=s.id and f.school_id=s.school_id and f.retention_until>=current_date
   and f.source_photo_path like s.school_id::text||'/'||s.id::text||'/%'
   and f.source_photo_path !~ '(^|/)\.\.(/|$)' and f.source_photo_path !~ '[?#]';
  if path is null or not exists(select 1 from storage.objects o where o.bucket_id='student-refs' and o.name=path) then return null; end if;
  return jsonb_build_object('student_id',s.id,'school_id',s.school_id,'source_path',path);
 else return null; end if;
 if path is null or (p_source='event' and not exists(select 1 from public.photos p where p.id=photo and path like s.school_id::text||'/'||p.event_id::text||'/%')) or path ~ '(^|/)\.\.(/|$)' or path ~ '[?#]' then return null; end if;
 -- Cadastro sem objeto no Storage não conta como foto disponível.
 if not exists(select 1 from storage.objects o where
  o.bucket_id=case when p_source='profile' then 'students' else 'event-photos' end
  and o.name=case when p_source='profile' then substring(path from length('students/')+1) else path end
 ) then return null; end if;
 return jsonb_build_object('student_id',s.id,'school_id',s.school_id,'source_path',path);
end; $$;

create or replace function public.generation_batch_eligibility(p_school_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 if not public.generation_batch_manage(p_school_id) then raise exception 'forbidden'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('studentId',s.id,'photoId',s.photos->0->>'id') order by s.name,s.id),'[]'::jsonb) into result
 from public.students s where s.school_id=p_school_id and public.generation_batch_source(s.id,'profile',s.photos->0->>'id') is not null;
 return jsonb_build_object('students',result,'remainingQuota',greatest(0,50-coalesce((select count from public.generation_usage where user_id=auth.uid() and day=(now() at time zone 'UTC')::date),0)));
end; $$;

create or replace function public.generation_batch_photo_choices(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s public.students%rowtype;
begin
 select * into s from public.students where id=p_student_id and deleted_at is null;
 if not found or not public.generation_batch_manage(s.school_id) then raise exception 'forbidden'; end if;
 return jsonb_build_object('schoolId',s.school_id,'photos',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'source',x.source,'path',public.generation_batch_source(s.id,x.source,x.id)->>'source_path','eventId',case when x.source='event' then (select event_id from public.photos where id=x.id::uuid) end,'eventName',case when x.source='event' then (select e.name from public.events e join public.photos p on p.event_id=e.id where p.id=x.id::uuid) end) order by x.source,x.id) from (
 select item->>'id' id,'profile'::text source from jsonb_array_elements(s.photos)item union all select p.id::text,'event' from public.photos p where p.school_id=s.school_id union all select f.id::text,'reference_face' from public.student_reference_faces f where f.student_id=s.id and f.school_id=s.school_id and f.retention_until>=current_date
 )x where public.generation_batch_source(s.id,x.source,x.id) is not null),'[]'::jsonb));
end; $$;

create or replace function public.generation_batch_detail(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b public.generation_batches%rowtype; items jsonb; state text;
begin
 select * into b from public.generation_batches where id=p_batch_id;
 if not found or b.created_by<>auth.uid() or not public.generation_batch_manage(b.school_id) then raise exception 'forbidden'; end if;
 select jsonb_agg(jsonb_build_object('id',i.id,'studentId',i.student_id,'name',s.name,'source',i.source,'photoId',i.photo_id,'photo',jsonb_build_object('source',i.source,'id',i.photo_id),'resultPath',case when i.status='completed' and i.art_id is not null and exists(select 1 from public.generated_posts a where a.id=i.art_id and a.deleted_at is null) and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png') and public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path'=i.source_snapshot then b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png' else null end,'status',i.status,'attempt',i.attempt,'errorCode',i.error_code,'error',i.error_code,'artId',case when i.art_id is not null and exists(select 1 from public.generated_posts a where a.id=i.art_id and a.deleted_at is null) and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png') and public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path'=i.source_snapshot then i.art_id end,'postId',case when i.art_id is not null and exists(select 1 from public.generated_posts a where a.id=i.art_id and a.deleted_at is null) and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png') and public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path'=i.source_snapshot then i.art_id end) order by s.name,i.id),
 case when bool_or(i.status='processing') then 'processing' when bool_or(i.status='pending') then 'pending'
 when bool_and(i.status='completed') then 'completed' when bool_or(i.status='completed') then 'partial' else 'failed' end into items,state
 from public.generation_batch_items i join public.students s on s.id=i.student_id where i.batch_id=b.id;
 return jsonb_build_object('id',b.id,'schoolId',b.school_id,'prompt',b.prompt,'createdAt',b.created_at,'status',state,'total',(select count(*) from public.generation_batch_items where batch_id=b.id),'completed',(select count(*) from public.generation_batch_items where batch_id=b.id and status='completed'),'failed',(select count(*) from public.generation_batch_items where batch_id=b.id and status in('failed','unknown')),'items',coalesce(items,'[]'::jsonb));
end; $$;
create or replace function public.generation_batches_for_school(p_school_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.generation_batch_manage(p_school_id) then raise exception 'forbidden'; end if;
 return jsonb_build_object('batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'schoolId',b.school_id,'createdAt',b.created_at,'status',summary.status,'total',summary.total,'completed',summary.completed,'failed',summary.failed) order by b.created_at desc)
 from (select id,school_id,created_at from public.generation_batches where school_id=p_school_id and created_by=auth.uid() order by created_at desc limit 100)b cross join lateral (
 select count(*) total,count(*) filter(where status='completed') completed,count(*) filter(where status in('failed','unknown')) failed,
 case when bool_or(status='processing') then 'processing' when bool_or(status='pending') then 'pending' when bool_and(status='completed') then 'completed' when bool_or(status='completed') then 'partial' else 'failed' end status
 from public.generation_batch_items where batch_id=b.id)summary),'[]'::jsonb));
end; $$;

-- Modelo da escola ativa. Modelo global (school_id nulo) não serve para o lote.
create or replace function public.generation_batch_reference(p_school uuid,p_reference uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare path text; object_name text;
begin
 if p_school is null or p_reference is null then return null; end if;
 select r.image->>'path' into path from public.reference_posts r where r.id=p_reference and r.school_id=p_school;
 if path is null or path not like 'references/'||p_school::text||'/%' or path ~ '(^|/)\.\.(/|$)' or path ~ '[?#]' then return null; end if;
 object_name:=substring(path from length('references/')+1);
 if object_name is null or object_name='' or not exists(select 1 from storage.objects o where o.bucket_id='references' and o.name=object_name) then return null; end if;
 return path;
end; $$;

drop function if exists public.create_generation_batch(uuid,uuid,text,jsonb);
create or replace function public.create_generation_batch(p_school_id uuid,p_request_id uuid,p_prompt text,p_students jsonb,p_reference_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare batch uuid; entry jsonb; source jsonb; n int; used int; ref_path text;
begin
 if not public.generation_batch_manage(p_school_id) then raise exception 'forbidden'; end if;
 if p_request_id is null or p_prompt is null or (length(p_prompt)>3500 or length(btrim(p_prompt))=0) or p_students is null or jsonb_typeof(p_students)<>'array' or p_reference_id is null then raise exception 'invalid_input'; end if;
 ref_path:=public.generation_batch_reference(p_school_id,p_reference_id);
 if ref_path is null then raise exception 'reference_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 select id into batch from public.generation_batches where created_by=auth.uid() and request_id=p_request_id;
 if batch is not null then
  if not exists(select 1 from public.generation_batches where id=batch and school_id=p_school_id and prompt=p_prompt and reference_post_id=p_reference_id) then raise exception 'request_conflict'; end if;
  if (select jsonb_agg(jsonb_build_object('studentId',j.student_id,'source',j.source,'photoId',j.photo_id) order by j.student_id) from public.generation_batch_items j where j.batch_id=batch)
   is distinct from (select jsonb_agg(value order by (value->>'studentId')::uuid) from jsonb_array_elements(p_students)) then raise exception 'request_conflict'; end if;
  return public.generation_batch_detail(batch);
 end if;
 n:=jsonb_array_length(p_students);
 if n not between 1 and 50 or (select count(distinct value->>'studentId') from jsonb_array_elements(p_students))<>n then raise exception 'invalid_input'; end if;
 insert into public.generation_batches(school_id,created_by,request_id,prompt,reference_post_id,reference_path) values(p_school_id,auth.uid(),p_request_id,p_prompt,p_reference_id,ref_path) returning id into batch;
 for entry in select value from jsonb_array_elements(p_students) loop
  source:=public.generation_batch_source((entry->>'studentId')::uuid,entry->>'source',entry->>'photoId');
  if source is null or (source->>'school_id')::uuid<>p_school_id then raise exception 'student_ineligible'; end if;
  insert into public.generation_batch_items(batch_id,student_id,source,photo_id,source_snapshot) values(batch,(entry->>'studentId')::uuid,entry->>'source',entry->>'photoId',source->>'source_path');
 end loop;
 insert into public.generation_usage as gu(user_id,day,count) values(auth.uid(),(now() at time zone 'UTC')::date,n)
 on conflict(user_id,day) do update set count=gu.count+n,updated_at=now() where gu.count+n<=50 returning count into used;
 if used is null then raise exception 'quota_exceeded'; end if;
 return public.generation_batch_detail(batch);
end; $$;

create or replace function public.retry_generation_batch(p_batch_id uuid,p_request_id uuid,p_item_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.generation_batches%rowtype; n int; selected int:=0; used int; i public.generation_batch_items%rowtype;
begin
 select * into b from public.generation_batches where id=p_batch_id for update;
 if not found or b.created_by<>auth.uid() or not public.generation_batch_manage(b.school_id) then raise exception 'forbidden'; end if;
 if p_request_id is null or p_item_ids is null or cardinality(p_item_ids) not between 1 and 50 or (select count(distinct x) from unnest(p_item_ids)x)<>cardinality(p_item_ids) then raise exception 'invalid_input'; end if;
 insert into public.generation_batch_retries values(p_batch_id,p_request_id,array(select unnest(p_item_ids) order by 1)) on conflict do nothing;
 if not found then
  if (select item_ids from public.generation_batch_retries where batch_id=p_batch_id and request_id=p_request_id) is distinct from array(select unnest(p_item_ids) order by 1) then raise exception 'request_conflict'; end if;
  return public.generation_batch_detail(p_batch_id);
 end if;
 n:=0;
 for i in select * from public.generation_batch_items where batch_id=p_batch_id and status in('failed','unknown') and id=any(p_item_ids) order by id for update loop
  if public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path' is distinct from i.source_snapshot then raise exception 'student_ineligible'; end if;
  selected:=selected+1;
  if not exists(select 1 from storage.objects where bucket_id='generated' and name=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png' and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=storage.objects.name)) then n:=n+1; end if;
 end loop;
 if selected<>cardinality(p_item_ids) then raise exception 'retry_not_allowed'; end if;
 if n>0 then
  insert into public.generation_usage as gu(user_id,day,count) values(auth.uid(),(now() at time zone 'UTC')::date,n)
  on conflict(user_id,day) do update set count=gu.count+n,updated_at=now() where gu.count+n<=50 returning count into used;
  if used is null then raise exception 'quota_exceeded'; end if;
 end if;
 -- Persisted PNG: recover same attempt without consuming another provider call.
 update public.generation_batch_items j set status='pending',lease_id=null,leased_until=null,error_code=null,updated_at=now()
 where batch_id=p_batch_id and status in('failed','unknown') and id=any(p_item_ids)
 and exists(select 1 from storage.objects where bucket_id='generated' and name=b.school_id::text||'/generation-batches/'||b.id::text||'/'||j.id::text||'/'||j.attempt::text||'.png' and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=storage.objects.name));
 update public.generation_batch_items set status='pending',attempt=attempt+1,lease_id=null,leased_until=null,provider_started_at=null,error_code=null,updated_at=now()
 where batch_id=p_batch_id and status in('failed','unknown') and id=any(p_item_ids);
 return public.generation_batch_detail(p_batch_id);
end; $$;

create or replace function public.claim_generation_batch_items(p_limit int,p_lease_seconds int) returns setof public.generation_batch_items
language plpgsql security definer set search_path=public as $$
begin
 if p_limit is null or p_lease_seconds is null or p_limit not between 1 and 10 or p_lease_seconds not between 30 and 600 then raise exception 'invalid_input'; end if;
 -- Reconcile late writes and deleted parents. Bounded sweep; no valid
 -- current batch artifact is removed. Missing school may use nullable audit FK.
 insert into public.storage_purge_queue(bucket,path,reason,school_id)
 select 'generated',o.name,'generation_orphan_reconciliation',b.school_id
 from storage.objects o left join public.generation_batch_items i on i.id::text=split_part(o.name,'/',4)
 left join public.generation_batches b on b.id=i.batch_id and b.id::text=split_part(o.name,'/',3) and b.school_id::text=split_part(o.name,'/',1)
 where o.bucket_id='generated' and split_part(o.name,'/',2)='generation-batches'
 and (b.id is null or i.id is null
      or o.name<>b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png'
      or public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path' is distinct from i.source_snapshot
      or (i.status='completed' and i.art_id is null))
 and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=o.name)
 order by o.name limit 100 on conflict(bucket,path) do nothing;
 -- Expired provider attempts may recover existing deterministic Storage result.
 -- begin refuses a second provider call, even under a renewed lease.
 return query with ready as(select id from public.generation_batch_items where status='pending' or (status='processing' and leased_until<now() ) order by updated_at,id limit p_limit for update skip locked)
 update public.generation_batch_items i set status='processing',lease_id=gen_random_uuid(),leased_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() from ready r where i.id=r.id returning i.*;
end; $$;
create or replace function public.generation_batch_item_context(p_item_id uuid,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare i public.generation_batch_items%rowtype; b public.generation_batches%rowtype; source jsonb;
begin
 select * into i from public.generation_batch_items where id=p_item_id and status='processing' and lease_id=p_lease_id and leased_until>now() for update;
 if not found then return null; end if;
 select * into b from public.generation_batches where id=i.batch_id;
 -- Lock rows revalidated here so concurrent deletion/revocation cannot pass completion.
 perform 1 from public.students where id=i.student_id for share;
 perform 1 from public.authorizations where student_id=i.student_id for share;
 perform 1 from public.guardians where id=(select primary_guardian_id from public.students where id=i.student_id) for share;
 perform 1 from public.schools where id=b.school_id for share;
 perform 1 from public.profiles where id=b.created_by for share;
 perform 1 from public.school_members where user_id=b.created_by and school_id=b.school_id for share;
 if not exists(select 1 from public.schools where id=b.school_id and deleted_at is null) or not exists(select 1 from public.profiles where id=b.created_by and approval_status='approved' and role in('user','dev','super_admin') and (role in('dev','super_admin') or exists(select 1 from public.school_members where user_id=b.created_by and school_id=b.school_id))) then
  update public.generation_batch_items set status='failed',error_code='authorization_changed',leased_until=null,lease_id=null,updated_at=now() where id=i.id;
  perform public.enqueue_storage_purge('generated',array[b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png'],'generation_authorization_changed',b.school_id);
  return null;
 end if;
 if i.source='event' then
  perform 1 from public.photos where id=i.photo_id::uuid for share;
  perform 1 from public.photo_faces where photo_id=i.photo_id::uuid for share;
  perform 1 from public.events where id=(select event_id from public.photos where id=i.photo_id::uuid) for share;
 end if;
 if i.source='reference_face' then
  begin
   perform 1 from public.student_reference_faces where id=i.photo_id::uuid and student_id=i.student_id and school_id=b.school_id for share;
  exception when others then
   update public.generation_batch_items set status='failed',error_code='authorization_changed',leased_until=null,lease_id=null,updated_at=now() where id=i.id;
   return null;
  end;
 end if;
 source:=public.generation_batch_source(i.student_id,i.source,i.photo_id);
 if source->>'source_path' is distinct from i.source_snapshot then
  update public.generation_batch_items set status='failed',error_code='authorization_changed',leased_until=null,lease_id=null,updated_at=now() where id=i.id;
  perform public.enqueue_storage_purge('generated',array[b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png'],'generation_authorization_changed',b.school_id);
  return null;
 end if;
 if b.reference_path is null
  or b.reference_path not like 'references/'||b.school_id::text||'/%'
  or b.reference_path ~ '(^|/)\.\.(/|$)'
  or b.reference_path ~ '[?#]'
  or not exists(select 1 from storage.objects o where o.bucket_id='references' and o.name=substring(b.reference_path from length('references/')+1)) then
  update public.generation_batch_items set status='failed',error_code='reference_unavailable',leased_until=null,lease_id=null,updated_at=now() where id=i.id;
  return null;
 end if;
 return source||jsonb_build_object('prompt',b.prompt,'source',i.source,'batch_id',b.id,'attempt',i.attempt,'provider_started',i.provider_started_at is not null,'result_path',b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png','reference_path',b.reference_path);
end; $$;
create or replace function public.begin_generation_batch_item(p_item_id uuid,p_lease_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if public.generation_batch_item_context(p_item_id,p_lease_id) is null then return false; end if;
 update public.generation_batch_items set provider_started_at=now() where id=p_item_id and lease_id=p_lease_id and status='processing' and provider_started_at is null and leased_until>now();
 return found;
end; $$;
create or replace function public.fail_generation_batch_item(p_item_id uuid,p_lease_id uuid,p_error_code text,p_unknown boolean) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,80}$' then raise exception 'invalid_input'; end if;
 update public.generation_batch_items set status=case when p_unknown then 'unknown' else 'failed' end,error_code=p_error_code,lease_id=null,leased_until=null,updated_at=now() where id=p_item_id and lease_id=p_lease_id and status='processing' and leased_until>now();
 return found;
end; $$;
create or replace function public.complete_generation_batch_item(p_item_id uuid,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare context jsonb; i public.generation_batch_items%rowtype; b public.generation_batches%rowtype; art uuid;
begin
 select * into i from public.generation_batch_items where id=p_item_id for update;
 if i.status='completed' and i.lease_id=p_lease_id then return jsonb_build_object('status','completed','art_id',i.art_id); end if;
 context:=public.generation_batch_item_context(p_item_id,p_lease_id);
 if context is null or i.provider_started_at is null then return jsonb_build_object('status','unavailable'); end if;
 if not exists(select 1 from storage.objects where bucket_id='generated' and name=context->>'result_path') then return jsonb_build_object('status','missing_result'); end if;
 select * into b from public.generation_batches where id=i.batch_id;
 insert into public.generated_posts(owner_id,school_id,student_id,image_url,details) values(b.created_by,b.school_id,i.student_id,'/storage/v1/object/public/generated/'||(context->>'result_path'),jsonb_build_object('mode','photo_prompt','batchId',b.id,'itemId',i.id,'bucket','generated','model','gpt-image-2.5-flare','size','1024x1024','prompt',b.prompt,'images','[]'::jsonb)) returning id into art;
 update public.generation_batch_items set status='completed',art_id=art,leased_until=null,updated_at=now() where id=i.id;
 return jsonb_build_object('status','completed','art_id',art);
end; $$;

-- Late writer cleanup cannot remove a same-attempt artifact recovered by
-- another lease. Only superseded attempts or currently revoked sources purge.
create or replace function public.discard_generation_batch_asset(p_item_id uuid,p_result_path text) returns boolean
language plpgsql security definer set search_path=public as $$
declare i public.generation_batch_items%rowtype; b public.generation_batches%rowtype; prefix text; suffix text;
begin
 select * into i from public.generation_batch_items where id=p_item_id for update;
 if not found then return false; end if;
 select * into b from public.generation_batches where id=i.batch_id;
 prefix:=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/';
 if p_result_path is null or left(p_result_path,length(prefix))<>prefix then return false; end if;
 suffix:=substring(p_result_path from length(prefix)+1);
 if suffix !~ '^[1-9][0-9]{0,8}\.png$' then return false; end if;
 if suffix=i.attempt::text||'.png' and public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path'=i.source_snapshot then return false; end if;
 perform public.enqueue_storage_purge('generated',array[p_result_path],'generation_superseded_attempt',b.school_id);
 return true;
end; $$;

-- These boolean wrappers disclose no source path or student information.
-- SECURITY DEFINER avoids recursive generated_posts RLS; scope stays inside.
create or replace function public.generation_batch_asset_visible(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(exists(
  select 1 from public.generation_batch_items i
  join public.generation_batches b on b.id=i.batch_id
  join public.generated_posts a on a.id=i.art_id
  where i.id::text=split_part(p_path,'/',4) and i.status='completed' and a.school_id=b.school_id and a.student_id=i.student_id
   and public.generation_batch_manage(b.school_id)
   and p_path=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png'
   and public.generation_batch_source(i.student_id,i.source,i.photo_id)->>'source_path'=i.source_snapshot
   and not exists(select 1 from public.storage_purge_queue q where q.bucket='generated' and q.path=p_path)
 ),false);
$$;
create or replace function public.generation_batch_post_visible(p_post_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select
  case when a.details->>'batchId' is null and not exists(select 1 from public.generation_batch_items where art_id=a.id) then true
  else exists(select 1 from public.generation_batch_items i join public.generation_batches b on b.id=i.batch_id
   where i.art_id=a.id and public.generation_batch_asset_visible(b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png')) end
 from public.generated_posts a where a.id=p_post_id),false);
$$;
drop policy if exists generation_batches_posts_select on public.generated_posts;
create policy generation_batches_posts_select on public.generated_posts as restrictive for select to authenticated
 using(public.generation_batch_post_visible(id));
drop policy if exists generation_batches_storage_select on storage.objects;
create policy generation_batches_storage_select on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'generated' or name not like '%/generation-batches/%' or public.generation_batch_asset_visible(name));

-- Trash removal is the existing gallery flow: only a linked, archived art
-- may be deleted by an approved member. Active reserved assets stay immutable.
create or replace function public.generation_batch_trash_asset(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(exists(select 1 from public.generation_batch_items i join public.generation_batches b on b.id=i.batch_id
 join public.generated_posts a on a.id=i.art_id
 where i.id::text=split_part(p_path,'/',4) and a.deleted_at is not null and a.school_id=b.school_id and a.student_id=i.student_id
 and public.generation_batch_manage(b.school_id)
 and p_path=b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png'),false);
$$;
drop policy if exists generation_batches_storage_delete on storage.objects;
create policy generation_batches_storage_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'generated' or name not like '%/generation-batches/%' or public.generation_batch_trash_asset(name));

-- Revocation blocks new SELECT/signing through the guards above. Physical
-- deletion is asynchronous through the existing purge worker, not instant.
create or replace function public.generation_batches_authorization_revoked() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.scope='biometric_sorting' then
  insert into public.storage_purge_queue(bucket,path,reason,school_id)
   select 'generated',b.school_id::text||'/generation-batches/'||b.id::text||'/'||i.id::text||'/'||i.attempt::text||'.png',
    'generation_authorization_revoked',b.school_id
   from public.generation_batch_items i join public.generation_batches b on b.id=i.batch_id
   where i.student_id=new.student_id and b.school_id=new.school_id
   on conflict(bucket,path) do nothing;
 end if;
 return new;
end; $$;
drop trigger if exists generation_batches_authorization_revoked on public.authorizations;
create trigger generation_batches_authorization_revoked after update of revoked_at on public.authorizations
 for each row when(new.revoked_at is not null and old.revoked_at is distinct from new.revoked_at)
 execute function public.generation_batches_authorization_revoked();

-- Keep batch origin and TTL marker immutable through direct REST updates.
-- The existing gallery may still archive/restore via deleted_at. Legacy posts
-- have no item.art_id link and retain their existing update behavior.
create or replace function public.generation_batch_art_immutable() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.generation_batch_items where art_id=old.id)
 and (new.id is distinct from old.id
      or new.details is distinct from old.details
      or new.image_url is distinct from old.image_url
      or new.student_id is distinct from old.student_id
      or new.owner_id is distinct from old.owner_id
      or new.school_id is distinct from old.school_id) then
  raise exception 'batch_art_immutable';
 end if;
 return new;
end; $$;
drop trigger if exists generation_batch_art_immutable on public.generated_posts;
create trigger generation_batch_art_immutable before update on public.generated_posts
 for each row execute function public.generation_batch_art_immutable();
create unique index if not exists generation_batch_items_art_idx on public.generation_batch_items(art_id) where art_id is not null;
create index if not exists generation_batch_items_student_idx on public.generation_batch_items(student_id);
create index if not exists generation_batch_items_text_id_idx on public.generation_batch_items((id::text));

-- Every helper is explicitly closed, including functions only other RPCs call.
revoke all on function public.generation_batch_art_immutable(),public.generation_batch_trash_asset(text),public.generation_batch_asset_visible(text),public.generation_batch_post_visible(uuid),public.generation_batches_authorization_revoked(),public.discard_generation_batch_asset(uuid,text),public.generation_batch_photo_choices(uuid),public.generation_batch_manage(uuid),public.generation_batch_source(uuid,text,text),public.generation_batch_reference(uuid,uuid),public.generation_batch_eligibility(uuid),public.generation_batch_detail(uuid),public.generation_batches_for_school(uuid),public.create_generation_batch(uuid,uuid,text,jsonb,uuid),public.retry_generation_batch(uuid,uuid,uuid[]),public.claim_generation_batch_items(int,int),public.generation_batch_item_context(uuid,uuid),public.begin_generation_batch_item(uuid,uuid),public.fail_generation_batch_item(uuid,uuid,text,boolean),public.complete_generation_batch_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.generation_batch_photo_choices(uuid),public.generation_batch_eligibility(uuid),public.generation_batch_detail(uuid),public.generation_batches_for_school(uuid),public.create_generation_batch(uuid,uuid,text,jsonb,uuid),public.retry_generation_batch(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.discard_generation_batch_asset(uuid,text),public.claim_generation_batch_items(int,int),public.generation_batch_item_context(uuid,uuid),public.begin_generation_batch_item(uuid,uuid),public.fail_generation_batch_item(uuid,uuid,text,boolean),public.complete_generation_batch_item(uuid,uuid) to service_role;

grant execute on function public.generation_batch_trash_asset(text),public.generation_batch_asset_visible(text),public.generation_batch_post_visible(uuid) to authenticated,service_role;
