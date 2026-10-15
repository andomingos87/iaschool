-- S04/S05 — origem de referência confirmada e revisão da pessoa inteira.
-- Aplicado em 12/10/2026 pelo MCP supabase-iaschool: iaschool_adjustments_review_media.
-- Ordem: fase3-authorizations-reference-faces, fase3-review-audit-purge,
-- fase5-person-regions; depois fase5-adjustments-delivery-album.sql.
alter table public.student_reference_jobs
  add column if not exists source_kind text not null default 'upload' check (source_kind in ('upload','event')),
  add column if not exists source_photo_id uuid references public.photos(id) on delete set null,
  add column if not exists source_face_id uuid references public.photo_faces(id) on delete set null,
  add column if not exists source_bbox jsonb;
alter table public.student_reference_faces
  add column if not exists source_photo_id uuid references public.photos(id) on delete set null,
  add column if not exists source_face_id uuid references public.photo_faces(id) on delete set null;
create unique index if not exists srj_confirmed_origin_unique on public.student_reference_jobs(student_id,source_face_id)
  where source_kind='event' and source_face_id is not null;

-- Esta projeção nunca devolve embedding nem libera sugestões como referências.
create or replace function public.confirmed_reference_photos(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.students where id=p_student_id and deleted_at is null;
  if v_school is null or not (public.is_member_of(v_school) or public.is_super_admin()) then raise exception 'not allowed'; end if;
  if not public.has_active_authorization(p_student_id,'biometric_sorting') then raise exception 'reference requires active authorization'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('photo_id',p.id,'face_id',f.id,'event_id',e.id,
    'event_name',e.name,'event_date',e.event_date,'width',p.width,'height',p.height,'bbox',f.bbox,
    'storage_path',p.storage_path,'already_used',exists(select 1 from public.student_reference_jobs j where j.student_id=p_student_id and j.source_face_id=f.id)
      or exists(select 1 from public.student_reference_faces r where r.student_id=p_student_id and r.source_face_id=f.id)) order by e.event_date desc,p.created_at desc),'[]'::jsonb)
    from public.photo_faces f join public.photos p on p.id=f.photo_id join public.events e on e.id=p.event_id
    where f.student_id=p_student_id and f.state='confirmed' and f.reviewed_by is not null
      and p.school_id=v_school and p.deleted_at is null and e.deleted_at is null
      and p.width>0 and p.height>0 and jsonb_typeof(f.bbox)='object'
      and (f.bbox->>'w')::numeric>0 and (f.bbox->>'h')::numeric>0
      and (f.bbox->>'x')::numeric>=0 and (f.bbox->>'y')::numeric>=0
      and (f.bbox->>'x')::numeric+(f.bbox->>'w')::numeric<=p.width
      and (f.bbox->>'y')::numeric+(f.bbox->>'h')::numeric<=p.height);
end; $$;
revoke all on function public.confirmed_reference_photos(uuid) from public,anon;
grant execute on function public.confirmed_reference_photos(uuid) to authenticated;

-- Origem revalidada no INSERT, inclusive INSERT direto permitido pela RLS antiga.
create or replace function public.reference_event_origin_check()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.source_kind='upload' and (new.source_face_id is not null or new.source_photo_id is not null or new.source_bbox is not null) then raise exception 'upload must not forge event origin'; end if;
  if new.source_kind='event' and new.storage_path<>new.school_id::text||'/'||new.student_id::text||'/'||new.id::text||'.jpg' then raise exception 'event reference storage path is invalid'; end if;
  if new.source_kind='event' and not exists(select 1 from public.photo_faces f join public.photos p on p.id=f.photo_id
    join public.events e on e.id=p.event_id
    where f.id=new.source_face_id and f.photo_id=new.source_photo_id and f.student_id=new.student_id
      and f.school_id=new.school_id and f.state='confirmed' and f.reviewed_by is not null
      and p.deleted_at is null and e.deleted_at is null and f.bbox=new.source_bbox
      and p.width>0 and p.height>0 and (f.bbox->>'x')::numeric>=0 and (f.bbox->>'y')::numeric>=0
      and (f.bbox->>'w')::numeric>0 and (f.bbox->>'h')::numeric>0
      and (f.bbox->>'x')::numeric+(f.bbox->>'w')::numeric<=p.width
      and (f.bbox->>'y')::numeric+(f.bbox->>'h')::numeric<=p.height) then
    raise exception 'confirmed reference origin is invalid';
  end if;
  return new;
end; $$;
revoke all on function public.reference_event_origin_check() from public,anon,authenticated;
drop trigger if exists reference_event_origin_check on public.student_reference_jobs;
create trigger reference_event_origin_check before insert on public.student_reference_jobs for each row execute function public.reference_event_origin_check();

create or replace function public.enqueue_confirmed_event_reference(p_student_id uuid,p_face_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_student public.students%rowtype; v_face public.photo_faces%rowtype; v_auth uuid; v_job uuid; v_new uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into v_student from public.students where id=p_student_id and deleted_at is null;
  if not found or not (public.is_member_of(v_student.school_id) or public.is_super_admin()) then raise exception 'not allowed'; end if;
  -- Serializa duas escolhas iguais e remoção/novo cadastro do mesmo aluno.
  perform 1 from public.students where id=p_student_id for update;
  select * into v_face from public.photo_faces where id=p_face_id and student_id=p_student_id and state='confirmed' and reviewed_by is not null for share;
  if not found then raise exception 'confirmed reference origin is invalid'; end if;
  select id into v_auth from public.authorizations where student_id=p_student_id and scope='biometric_sorting'
    and granted_at is not null and revoked_at is null order by granted_at desc limit 1;
  if v_auth is null then raise exception 'reference requires active authorization'; end if;
  select id into v_job from public.student_reference_jobs where student_id=p_student_id and source_face_id=p_face_id;
  if v_job is not null then return jsonb_build_object('id',v_job,'duplicate',true); end if;
  if exists(select 1 from public.student_reference_faces where student_id=p_student_id and source_face_id=p_face_id) then
    return jsonb_build_object('id',p_face_id,'duplicate',true);
  end if;
  insert into public.student_reference_jobs(id,school_id,student_id,authorization_id,storage_path,created_by,
    source_kind,source_photo_id,source_face_id,source_bbox)
  values(v_new,v_student.school_id,p_student_id,v_auth,v_student.school_id::text||'/'||p_student_id::text||'/'||v_new::text||'.jpg',auth.uid(),
    'event',v_face.photo_id,p_face_id,v_face.bbox);
  return jsonb_build_object('id',v_new,'duplicate',false);
end; $$;
revoke all on function public.enqueue_confirmed_event_reference(uuid,uuid) from public,anon;
grant execute on function public.enqueue_confirmed_event_reference(uuid,uuid) to authenticated;

-- Worker consulta imediatamente antes do download/processamento. A conclusão
-- repete a conferência para cobrir revogação/revisão durante o processamento.
create or replace function public.reference_event_source(p_job_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('storage_path',p.storage_path,'bbox',f.bbox,'photo_id',p.id,'face_id',f.id)
 from public.student_reference_jobs j join public.photo_faces f on f.id=j.source_face_id
 join public.photos p on p.id=j.source_photo_id join public.events e on e.id=p.event_id
 join public.authorizations a on a.id=j.authorization_id
 where j.id=p_job_id and j.source_kind='event' and j.status='leased'
   and f.photo_id=p.id and f.student_id=j.student_id and f.school_id=j.school_id
   and f.state='confirmed' and f.reviewed_by is not null and f.bbox=j.source_bbox
   and p.deleted_at is null and e.deleted_at is null and p.school_id=j.school_id
   and a.student_id=j.student_id and a.scope='biometric_sorting' and a.granted_at is not null and a.revoked_at is null;
$$;
revoke all on function public.reference_event_source(uuid) from public,anon,authenticated;
grant execute on function public.reference_event_source(uuid) to service_role;

create or replace function public.complete_student_reference_job(p_job_id uuid,p_ok boolean,
 p_embedding extensions.vector(512) default null,p_quality real default null,p_error text default null,p_permanent boolean default false)
returns text language plpgsql security definer set search_path=public as $$
declare v_job public.student_reference_jobs%rowtype; v_face uuid;
begin
 select * into v_job from public.student_reference_jobs where id=p_job_id for update;
 if not found then return 'missing'; end if;
 if v_job.status<>'leased' then return 'noop'; end if;
 if p_ok then
   perform 1 from public.authorizations where id=v_job.authorization_id for share;
   if v_job.source_kind='event' then
     perform 1 from public.photo_faces where id=v_job.source_face_id for share;
     perform 1 from public.photos where id=v_job.source_photo_id for share;
   end if;
   if p_embedding is null then raise exception 'embedding is required when the job succeeds'; end if;
   if not exists(select 1 from public.authorizations a where a.id=v_job.authorization_id and a.student_id=v_job.student_id
      and a.scope='biometric_sorting' and a.granted_at is not null and a.revoked_at is null)
      or (v_job.source_kind='event' and public.reference_event_source(p_job_id) is null) then
     update public.student_reference_jobs set status='failed',leased_until=null,last_error='autorização ou rosto confirmado não está mais válido' where id=p_job_id;
     return 'revoked';
   end if;
   insert into public.student_reference_faces(school_id,student_id,embedding,source_photo_path,quality,authorization_id,created_by,source_photo_id,source_face_id)
     values(v_job.school_id,v_job.student_id,p_embedding,v_job.storage_path,p_quality,v_job.authorization_id,v_job.created_by,v_job.source_photo_id,v_job.source_face_id) returning id into v_face;
   update public.student_reference_jobs set status='done',leased_until=null,last_error=null,reference_face_id=v_face where id=p_job_id;
   return 'done';
 end if;
 if p_permanent or v_job.attempts>=5 then
   update public.student_reference_jobs set status='failed',leased_until=null,last_error=left(p_error,2000) where id=p_job_id; return 'failed';
 end if;
 update public.student_reference_jobs set status='queued',leased_until=null,last_error=left(p_error,2000) where id=p_job_id; return 'requeued';
end; $$;
revoke all on function public.complete_student_reference_job(uuid,boolean,extensions.vector,real,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_student_reference_job(uuid,boolean,extensions.vector,real,text,boolean) to service_role;

-- Remover referência processada libera a origem para nova escolha. O cliente
-- já apaga seu recorte student-refs; nunca toca no original do evento.
create or replace function public.delete_student_reference_face(p_face_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_face public.student_reference_faces%rowtype;
begin
 select * into v_face from public.student_reference_faces where id=p_face_id for update;
 if not found then return null; end if;
 if not (public.is_member_of(v_face.school_id) or public.is_super_admin()) then raise exception 'not allowed'; end if;
 delete from public.student_reference_jobs where reference_face_id=p_face_id;
 delete from public.student_reference_faces where id=p_face_id;
 return v_face.source_photo_path;
end; $$;
revoke all on function public.delete_student_reference_face(uuid) from public,anon;
grant execute on function public.delete_student_reference_face(uuid) to authenticated;

alter table public.photos
 add column if not exists regions_reviewed_version int,
 add column if not exists all_people_reviewed boolean not null default false,
 add column if not exists regions_reviewed_width int,
 add column if not exists regions_reviewed_height int,
 add column if not exists regions_reviewed_by uuid references auth.users(id) on delete set null,
 add column if not exists regions_reviewed_at timestamptz;

-- Toda alteração direta antiga perde a atestação. Salvar revisão completa
-- só atesta DEPOIS das mutações/versionamento, na mesma transação.
create or replace function public.photo_person_regions_bump_version()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform set_config('iaschool.photos_rpc','rpc',true);
 update public.photos set regions_version=regions_version+1,all_people_reviewed=false,
   regions_reviewed_version=null,regions_reviewed_by=null,regions_reviewed_at=null
 where id=coalesce(new.photo_id,old.photo_id);
 return null;
end; $$;
revoke all on function public.photo_person_regions_bump_version() from public,anon,authenticated;

create or replace function public.person_region_points_valid(p_shape text,p_points jsonb,p_width int,p_height int)
returns boolean language plpgsql immutable set search_path=public as $$
declare v_point jsonb; x numeric; y numeric; w numeric; h numeric; v_area numeric:=0; i int; j int; n int;
 a jsonb; b jsonb; c jsonb; d jsonb; o1 numeric; o2 numeric; o3 numeric; o4 numeric;
begin
 if p_width<=0 or p_height<=0 or p_points is null or jsonb_typeof(p_points)<>'array' then return false; end if;
 if p_shape='rect' then
   if jsonb_array_length(p_points)<>4 then return false; end if;
   for v_point in select * from jsonb_array_elements(p_points) loop if jsonb_typeof(v_point)<>'number' then return false; end if; end loop;
   x:=(p_points->>0)::numeric;y:=(p_points->>1)::numeric;w:=(p_points->>2)::numeric;h:=(p_points->>3)::numeric;
   return x>=0 and y>=0 and w>=1 and h>=1 and x+w<=p_width and y+h<=p_height;
 end if;
 n:=jsonb_array_length(p_points);
 if p_shape<>'polygon' or n<3 or n>100 then return false; end if;
 for v_point in select * from jsonb_array_elements(p_points) loop
   if jsonb_typeof(v_point)<>'array' or jsonb_array_length(v_point)<>2
     or jsonb_typeof(v_point->0)<>'number' or jsonb_typeof(v_point->1)<>'number' then return false; end if;
   x:=(v_point->>0)::numeric;y:=(v_point->>1)::numeric;
   if x<0 or y<0 or x>p_width or y>p_height then return false; end if;
 end loop;
 for i in 0..n-1 loop
   a:=p_points->i;b:=p_points->((i+1)%n);
   if a=b then return false; end if;
   v_area:=v_area+(a->>0)::numeric*(b->>1)::numeric-(b->>0)::numeric*(a->>1)::numeric;
   for j in i+1..n-1 loop
     if j=i+1 or (i=0 and j=n-1) then continue; end if;
     c:=p_points->j;d:=p_points->((j+1)%n);
     o1:=((b->>0)::numeric-(a->>0)::numeric)*((c->>1)::numeric-(a->>1)::numeric)-((b->>1)::numeric-(a->>1)::numeric)*((c->>0)::numeric-(a->>0)::numeric);
     o2:=((b->>0)::numeric-(a->>0)::numeric)*((d->>1)::numeric-(a->>1)::numeric)-((b->>1)::numeric-(a->>1)::numeric)*((d->>0)::numeric-(a->>0)::numeric);
     o3:=((d->>0)::numeric-(c->>0)::numeric)*((a->>1)::numeric-(c->>1)::numeric)-((d->>1)::numeric-(c->>1)::numeric)*((a->>0)::numeric-(c->>0)::numeric);
     o4:=((d->>0)::numeric-(c->>0)::numeric)*((b->>1)::numeric-(c->>1)::numeric)-((d->>1)::numeric-(c->>1)::numeric)*((b->>0)::numeric-(c->>0)::numeric);
     if o1*o2<=0 and o3*o4<=0 and greatest(least((a->>0)::numeric,(b->>0)::numeric),least((c->>0)::numeric,(d->>0)::numeric))<=least(greatest((a->>0)::numeric,(b->>0)::numeric),greatest((c->>0)::numeric,(d->>0)::numeric))
       and greatest(least((a->>1)::numeric,(b->>1)::numeric),least((c->>1)::numeric,(d->>1)::numeric))<=least(greatest((a->>1)::numeric,(b->>1)::numeric),greatest((c->>1)::numeric,(d->>1)::numeric)) then return false; end if;
   end loop;
 end loop;
 return abs(v_area)>=2;
exception when others then return false;
end; $$;
revoke all on function public.person_region_points_valid(text,jsonb,int,int) from public,anon,authenticated;

-- Região da pessoa vinculada precisa conter ao menos o rosto detectado.
-- A atestação humana ainda é necessária para corpo/cabelo/partes não detectadas.
create or replace function public.person_region_contains_face(p_shape text,p_points jsonb,p_bbox jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare x numeric:=(p_bbox->>'x')::numeric; y numeric:=(p_bbox->>'y')::numeric;
 w numeric:=(p_bbox->>'w')::numeric; h numeric:=(p_bbox->>'h')::numeric;
 corners jsonb; point jsonb; a jsonb; b jsonb; c jsonb; d jsonb;
 ax numeric;ay numeric;bx numeric;v_by numeric;cx numeric;cy numeric;dx numeric;dy numeric;
 inside boolean;on_edge boolean;o1 numeric;o2 numeric;o3 numeric;o4 numeric;i int;j int;n int;
begin
 if x is null or y is null or w is null or h is null or w<=0 or h<=0 then return false; end if;
 if p_shape='rect' then return (p_points->>0)::numeric<=x and (p_points->>1)::numeric<=y
  and (p_points->>0)::numeric+(p_points->>2)::numeric>=x+w and (p_points->>1)::numeric+(p_points->>3)::numeric>=y+h; end if;
 if p_shape<>'polygon' then return false; end if;
 n:=jsonb_array_length(p_points);if n<3 then return false;end if;
 corners:=jsonb_build_array(jsonb_build_array(x,y),jsonb_build_array(x+w,y),jsonb_build_array(x+w,y+h),jsonb_build_array(x,y+h));
 for point in select * from jsonb_array_elements(corners) loop
   cx:=(point->>0)::numeric;cy:=(point->>1)::numeric;inside:=false;on_edge:=false;
   for i in 0..n-1 loop
     a:=p_points->i;b:=p_points->((i+1)%n);
     ax:=(a->>0)::numeric;ay:=(a->>1)::numeric;bx:=(b->>0)::numeric;v_by:=(b->>1)::numeric;
     if (bx-ax)*(cy-ay)-(v_by-ay)*(cx-ax)=0 and cx between least(ax,bx) and greatest(ax,bx) and cy between least(ay,v_by) and greatest(ay,v_by) then on_edge:=true;exit;end if;
     if (ay>cy)<>(v_by>cy) then if cx<(bx-ax)*(cy-ay)/(v_by-ay)+ax then inside:=not inside;end if;end if;
   end loop;
   if not inside and not on_edge then return false;end if;
 end loop;
 for i in 0..n-1 loop
   a:=p_points->i;b:=p_points->((i+1)%n);
   ax:=(a->>0)::numeric;ay:=(a->>1)::numeric;bx:=(b->>0)::numeric;v_by:=(b->>1)::numeric;
   if ax>x and ax<x+w and ay>y and ay<y+h then return false;end if;
   for j in 0..3 loop
     c:=corners->j;d:=corners->((j+1)%4);
     cx:=(c->>0)::numeric;cy:=(c->>1)::numeric;dx:=(d->>0)::numeric;dy:=(d->>1)::numeric;
     o1:=(bx-ax)*(cy-ay)-(v_by-ay)*(cx-ax);o2:=(bx-ax)*(dy-ay)-(v_by-ay)*(dx-ax);
     o3:=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);o4:=(dx-cx)*(v_by-cy)-(dy-cy)*(bx-cx);
     if o1*o2<0 and o3*o4<0 then return false;end if;
   end loop;
 end loop;
 return true;
exception when others then return false;
end; $$;
revoke all on function public.person_region_contains_face(text,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.photo_person_review(p_photo_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p public.photos%rowtype;
begin
 select * into p from public.photos where id=p_photo_id and deleted_at is null;
 if not found or not (public.is_member_of(p.school_id) or public.is_super_admin()) then raise exception 'not allowed'; end if;
 return jsonb_build_object('photo_id',p.id,'regions_version',p.regions_version,'reviewed_version',p.regions_reviewed_version,
   'all_people_reviewed',p.all_people_reviewed,'width',p.width,'height',p.height,'storage_path',p.storage_path,
   'regions',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'face_id',r.face_id,'student_id',r.student_id,'kind',r.kind,'shape',r.shape,'points',r.points) order by r.created_at,r.id),'[]'::jsonb) from public.photo_person_regions r where r.photo_id=p.id),
   'faces',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'student_id',f.student_id,'student_name',s.name,'state',f.state,'bbox',f.bbox) order by f.id),'[]'::jsonb) from public.photo_faces f left join public.students s on s.id=f.student_id where f.photo_id=p.id));
end; $$;
revoke all on function public.photo_person_review(uuid) from public,anon;
grant execute on function public.photo_person_review(uuid) to authenticated;

create or replace function public.save_photo_person_review(p_photo_id uuid,p_expected_version int,p_width int,p_height int,p_regions jsonb,p_all_people_reviewed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.photos%rowtype; r jsonb; v_kind text; v_face uuid; v_student uuid; v_version int;
begin
 if auth.uid() is null then raise exception 'not allowed'; end if;
 select * into p from public.photos where id=p_photo_id and deleted_at is null for update;
 if not found or not (public.is_member_of(p.school_id) or public.is_super_admin()) then raise exception 'not allowed'; end if;
 perform set_config('iaschool.photos_rpc','rpc',true);
 if p.regions_version<>p_expected_version then raise exception 'review version changed'; end if;
 if p_width is distinct from p.width or p_height is distinct from p.height or p_width<=0 or p_height<=0 then raise exception 'photo dimensions changed'; end if;
 if p_regions is null or jsonb_typeof(p_regions)<>'array' or jsonb_array_length(p_regions)>100 then raise exception 'invalid person regions'; end if;
 for r in select * from jsonb_array_elements(p_regions) loop
   v_kind:=r->>'kind';v_face:=nullif(r->>'face_id','')::uuid;v_student:=nullif(r->>'student_id','')::uuid;
   if v_kind not in ('protected_unknown','other_child','own_child','adult_or_staff') or v_kind is null
     or not public.person_region_points_valid(r->>'shape',r->'points',p_width,p_height) then raise exception 'invalid person region'; end if;
   if v_face is not null and not exists(select 1 from public.photo_faces f where f.id=v_face and f.photo_id=p.id and f.school_id=p.school_id) then raise exception 'invalid face origin'; end if;
   if v_face is not null and not exists(select 1 from public.photo_faces f where f.id=v_face and public.person_region_contains_face(r->>'shape',r->'points',f.bbox)) then raise exception 'person region must contain linked face'; end if;
   if v_student is not null and not exists(select 1 from public.students s where s.id=v_student and s.school_id=p.school_id and s.deleted_at is null) then raise exception 'invalid student'; end if;
   if v_kind='own_child' and (v_face is null or v_student is null or not exists(select 1 from public.photo_faces f where f.id=v_face and f.student_id=v_student and f.state='confirmed' and f.reviewed_by is not null)) then raise exception 'child must be confirmed'; end if;
   if v_kind='other_child' and v_student is not null and (v_face is null or not exists(select 1 from public.photo_faces f where f.id=v_face and f.student_id=v_student and f.state='confirmed' and f.reviewed_by is not null)) then raise exception 'identified child must be confirmed'; end if;
   if v_kind in ('protected_unknown','adult_or_staff') and v_student is not null then raise exception 'classification must not identify a student'; end if;
   if v_kind='adult_or_staff' and v_face is not null and not exists(select 1 from public.photo_faces f where f.id=v_face and f.state='adult_or_staff' and f.reviewed_by is not null) then raise exception 'adult classification requires face review'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_regions) elem where nullif(elem->>'face_id','') is not null)
    <> (select count(distinct elem->>'face_id') from jsonb_array_elements(p_regions) elem where nullif(elem->>'face_id','') is not null) then raise exception 'face must have one person region'; end if;
 if p_all_people_reviewed and exists(select 1 from public.photo_faces f where f.photo_id=p.id and not exists(select 1 from jsonb_array_elements(p_regions) elem where elem->>'face_id'=f.id::text)) then raise exception 'every detected person must be reviewed'; end if;
 delete from public.photo_person_regions where photo_id=p.id;
 for r in select * from jsonb_array_elements(p_regions) loop
   insert into public.photo_person_regions(school_id,photo_id,face_id,student_id,kind,shape,points,reviewed_by,reviewed_at)
   values(p.school_id,p.id,nullif(r->>'face_id','')::uuid,nullif(r->>'student_id','')::uuid,r->>'kind',r->>'shape',r->'points',auth.uid(),now());
 end loop;
 -- Mesmo zero regiões muda a versão: a atestação de ausência de pessoas é nova.
 update public.photos set regions_version=regions_version+1,all_people_reviewed=coalesce(p_all_people_reviewed,false),
   regions_reviewed_version=case when p_all_people_reviewed then regions_version+1 else null end,
   regions_reviewed_width=p_width,regions_reviewed_height=p_height,
   regions_reviewed_by=case when p_all_people_reviewed then auth.uid() else null end,
   regions_reviewed_at=case when p_all_people_reviewed then now() else null end where id=p.id returning regions_version into v_version;
 return public.photo_person_review(p.id);
end; $$;
revoke all on function public.save_photo_person_review(uuid,int,int,int,jsonb,boolean) from public,anon;
grant execute on function public.save_photo_person_review(uuid,int,int,int,jsonb,boolean) to authenticated;

-- A foto pode mudar por revisão humana ou novo reconhecimento. Qualquer nova
-- pessoa/caixa/classificação exige conferir a foto completa outra vez.
create or replace function public.invalidate_review_media_from_face()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_photo uuid; v_face uuid; v_paths text[]; v_school uuid;
begin
 if tg_op='UPDATE' and new.student_id is not distinct from old.student_id and new.state is not distinct from old.state
   and new.bbox is not distinct from old.bbox and new.reviewed_by is not distinct from old.reviewed_by then return new; end if;
 v_photo:=case when tg_op='DELETE' then old.photo_id else new.photo_id end;
 v_face:=case when tg_op='DELETE' then old.id else new.id end;
 v_school:=case when tg_op='DELETE' then old.school_id else new.school_id end;
 perform set_config('iaschool.photos_rpc','rpc',true);
 update public.photos set regions_version=regions_version+1,all_people_reviewed=false,
   regions_reviewed_version=null,regions_reviewed_by=null,regions_reviewed_at=null where id=v_photo;
 if tg_op<>'INSERT' then
   select coalesce(array_agg(source_photo_path) filter(where source_photo_path is not null),'{}') into v_paths
     from public.student_reference_faces where source_face_id=v_face;
   perform public.enqueue_storage_purge('student-refs',v_paths,'confirmed_origin_changed',v_school);
   delete from public.student_reference_faces where source_face_id=v_face;
   select coalesce(array_agg(storage_path),'{}') into v_paths from public.student_reference_jobs where source_face_id=v_face;
   perform public.enqueue_storage_purge('student-refs',v_paths,'confirmed_origin_changed',v_school);
   delete from public.student_reference_jobs where source_face_id=v_face;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.invalidate_review_media_from_face() from public,anon,authenticated;
drop trigger if exists invalidate_review_media_from_face on public.photo_faces;
create trigger invalidate_review_media_from_face before insert or update or delete on public.photo_faces
 for each row execute function public.invalidate_review_media_from_face();

create or replace function public.invalidate_review_media_from_photo()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_paths text[];
begin
 if new.width is distinct from old.width or new.height is distinct from old.height or new.storage_path is distinct from old.storage_path
   or (new.deleted_at is not null and old.deleted_at is null) then
   new.regions_version:=old.regions_version+1;new.all_people_reviewed:=false;
   new.regions_reviewed_version:=null;new.regions_reviewed_by:=null;new.regions_reviewed_at:=null;
   select coalesce(array_agg(source_photo_path) filter(where source_photo_path is not null),'{}') into v_paths
     from public.student_reference_faces where source_photo_id=old.id;
   perform public.enqueue_storage_purge('student-refs',v_paths,'event_origin_changed',old.school_id);
   delete from public.student_reference_faces where source_photo_id=old.id;
   select coalesce(array_agg(storage_path),'{}') into v_paths from public.student_reference_jobs where source_photo_id=old.id;
   perform public.enqueue_storage_purge('student-refs',v_paths,'event_origin_changed',old.school_id);
   delete from public.student_reference_jobs where source_photo_id=old.id;
 end if;
 return new;
end; $$;
revoke all on function public.invalidate_review_media_from_photo() from public,anon,authenticated;
drop trigger if exists invalidate_review_media_from_photo on public.photos;
drop trigger if exists zz_invalidate_review_media_from_photo on public.photos;
create trigger zz_invalidate_review_media_from_photo before update on public.photos for each row execute function public.invalidate_review_media_from_photo();

-- Expurgo/remove preserva a deduplicação enquanto existir uma referência,
-- mas não deixa o job 'done' bloquear recadastro após retenção/revogação.
create or replace function public.review_media_reference_deleted()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 delete from public.student_reference_jobs where reference_face_id=old.id;
 return old;
end; $$;
revoke all on function public.review_media_reference_deleted() from public,anon,authenticated;
drop trigger if exists review_media_reference_deleted on public.student_reference_faces;
create trigger review_media_reference_deleted before delete on public.student_reference_faces for each row execute function public.review_media_reference_deleted();

create or replace function public.review_media_job_deleted()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.enqueue_storage_purge('student-refs',array[old.storage_path],'reference_job_removed',old.school_id);
 return old;
end; $$;
revoke all on function public.review_media_job_deleted() from public,anon,authenticated;
drop trigger if exists review_media_job_deleted on public.student_reference_jobs;
create trigger review_media_job_deleted before delete on public.student_reference_jobs for each row execute function public.review_media_job_deleted();
