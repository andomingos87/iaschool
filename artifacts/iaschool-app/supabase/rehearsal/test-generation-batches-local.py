"""PostgreSQL descartável: lote/cota/lease/revogação; sem rede/credenciais do produto."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
import tempfile
ROOT = Path(__file__).resolve().parents[1]
BIN = Path('/opt/homebrew/opt/postgresql@16/bin')
env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','SUPABASE')) and k!='DATABASE_URL'}
def run(args):
 r=subprocess.run(args,env=env,text=True,capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
with tempfile.TemporaryDirectory(prefix='iaschool-generation-sql-') as tmp:
 base=Path(tmp);data=base/'data';started=False
 try:
  run([str(BIN/'initdb'),'-D',str(data),'-A','trust','--no-locale','-E','UTF8'])
  run([str(BIN/'pg_ctl'),'-D',str(data),'-l',str(base/'log'),'-o',f'-k {base} -p 55442 -h ""','start']);started=True
  cmd=[str(BIN/'psql'),'-h',str(base),'-p','55442','-d','postgres','-v','ON_ERROR_STOP=1','-At']
  def sql(s):return run(cmd+['-c',s])
  fixture=(ROOT/'rehearsal/local-adjustments-fixture.sql').read_text()
  sql(fixture)
  sql("""create table public.profiles(id uuid primary key,approval_status text,role text);
   alter table public.students add column birth_date text,add column photos jsonb;
   alter table public.photos add column regions_version int default 1,add column regions_reviewed_version int default 1,add column all_people_reviewed boolean default true,
    add column regions_reviewed_by uuid,add column regions_reviewed_at timestamptz,add column regions_reviewed_width int,add column regions_reviewed_height int;
   create table public.photo_person_regions(id uuid primary key,photo_id uuid,school_id uuid,student_id uuid,face_id uuid,kind text,reviewed_by uuid,reviewed_at timestamptz);
   create table public.generated_posts(id uuid primary key default gen_random_uuid(),owner_id uuid,school_id uuid,student_id uuid,image_url text,details jsonb,deleted_at timestamptz);
   create table storage.objects(bucket_id text,name text);
   create extension pgcrypto with schema extensions;
  """)
  sql((ROOT/'generation-quota.sql').read_text())
  migration=(ROOT/'generation-batches.sql').read_text();sql(migration);sql(migration)
  # Permissive existing school policy cannot bypass reserved batch namespace.
  sql("alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;create policy fixture_school_storage_all on storage.objects for all to authenticated using(true) with check(true)")
  try:sql("set role authenticated;insert into storage.objects values('generated','school/generation-batches/forged.png')");raise AssertionError('forged batch asset accepted')
  except RuntimeError as e:assert 'row-level security' in str(e)
  sql("set role authenticated;insert into storage.objects values('generated','school/manual.png')")
  try:sql("set role authenticated;update storage.objects set name='school/generation-batches/forged.png' where name='school/manual.png'");raise AssertionError('forged batch rename accepted')
  except RuntimeError as e:assert 'row-level security' in str(e)
  sql("insert into storage.objects values('generated','school/generation-batches/real.png');set role authenticated;delete from storage.objects where name='school/generation-batches/real.png'")
  assert sql("select count(*) from storage.objects where name='school/generation-batches/real.png'")=='1'

  u='00000000-0000-0000-0000-000000000001';school='00000000-0000-0000-0000-000000000002';student='00000000-0000-0000-0000-000000000003';req='00000000-0000-0000-0000-000000000004'
  sql(f"""insert into auth.users values('{u}'); insert into public.profiles values('{u}','approved','user');
    insert into public.schools(id,name)values('{school}','Escola sintética');insert into public.school_members values('{school}','{u}','school_admin');
    insert into public.students(id,school_id,name,birth_date,photos)values('{student}','{school}','Adulto sintético','1990-01-01','[{{"id":"profile-a","path":"students/{school}/a.jpg"}}]');
    insert into public.authorizations(school_id,student_id,scope,granted_at)values('{school}','{student}','biometric_sorting',now());""")
  sql(f"insert into storage.objects values('students','{school}/a.jpg'),('students','{school}/b.jpg')")
  auth=f"select set_config('request.jwt.claim.sub','{u}',false);"
  def user(s):return sql(auth+s).splitlines()[-1]
  import json
  payload=f"'[{{\"studentId\":\"{student}\",\"source\":\"profile\",\"photoId\":\"profile-a\"}}]'::jsonb"
  create=f"select public.create_generation_batch('{school}','{req}','Arte sintética',{payload});"
  with concurrent.futures.ThreadPoolExecutor(2) as pool:r=list(pool.map(user,[create,create]))
  batch=json.loads(r[0]);assert batch['id']==json.loads(r[1])['id'];assert sql('select sum(count) from public.generation_usage')=='1'
  assert len(json.loads(user(f"select public.generation_batch_eligibility('{school}')"))['students'])==1
  sql(f"delete from storage.objects where bucket_id='students' and name='{school}/a.jpg'")
  assert json.loads(user(f"select public.generation_batch_eligibility('{school}')"))['students']==[]
  sql(f"insert into storage.objects values('students','{school}/a.jpg')")
  try:user(create.replace('Arte sintética',' '*3501));raise AssertionError('oversize whitespace prompt accepted')
  except RuntimeError as e:assert 'invalid_input' in str(e)
  assert sql('select sum(count) from public.generation_usage')=='1'
  # Real SQL DTO contract, not a mock, plus alternative profile choice.
  choices=json.loads(user(f"select public.generation_batch_photo_choices('{student}')"));assert choices['schoolId']==school
  assert {'id','source','path','eventId','eventName'}<=choices['photos'][0].keys()
  assert {'id','schoolId','prompt','total','completed','failed','items'}<=batch.keys()
  assert {'id','studentId','status','photo','resultPath'}<=batch['items'][0].keys()
  assert batch['items'][0]['photo']=={'source':'profile','id':'profile-a'}
  sql(f"update public.students set photos=photos||'[{{\"id\":\"profile-b\",\"path\":\"students/{school}/b.jpg\"}}]'::jsonb where id='{student}'")
  choices=json.loads(user(f"select public.generation_batch_photo_choices('{student}')"));assert len(choices['photos'])==2
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-b') is not null")=='t'
  sql(f"update public.profiles set role='student' where id='{u}'")
  try:user(f"select public.generation_batch_eligibility('{school}')");raise AssertionError('legacy student accepted')
  except RuntimeError as e:assert 'forbidden' in str(e)
  sql(f"update public.profiles set role='user' where id='{u}';update public.school_members set role='teacher' where user_id='{u}'")
  assert len(json.loads(user(f"select public.generation_batch_eligibility('{school}')"))['students'])==1
  sql(f"update public.school_members set role='school_admin' where user_id='{u}'")
  item=sql('select id from public.claim_generation_batch_items(1,60)');lease=sql(f"select lease_id from public.generation_batch_items where id='{item}'")
  context=json.loads(sql(f"select public.generation_batch_item_context('{item}','{lease}')"));assert context['provider_started'] is False
  assert sql(f"select public.begin_generation_batch_item('{item}','{lease}')")=='t'
  assert sql(f"select public.begin_generation_batch_item('{item}','{lease}')")=='f'
  sql(f"update public.generation_batch_items set leased_until=now()-interval '1 second' where id='{item}'")
  sql('select id from public.claim_generation_batch_items(1,60)');newlease=sql(f"select lease_id from public.generation_batch_items where id='{item}'");assert newlease!=lease
  assert sql(f"select public.begin_generation_batch_item('{item}','{newlease}')")=='f'
  assert sql(f"select public.fail_generation_batch_item('{item}','{lease}','stale',false)")=='f'
  sql(f"insert into storage.objects values('generated','{context['result_path']}')")
  assert json.loads(sql(f"select public.complete_generation_batch_item('{item}','{newlease}')"))['status']=='completed'
  assert json.loads(sql(f"select public.complete_generation_batch_item('{item}','{newlease}')"))['status']=='completed'
  assert sql('select count(*) from public.generated_posts')=='1'
  details=json.loads(sql('select details from public.generated_posts limit 1'));assert details['images']==[] and details['prompt']=='Arte sintética' and details['model']=='gpt-image-2.5-flare' and details['size']=='1024x1024'

  # Real authenticated SELECT policies preserve legacy and protect batch outputs.
  sql("alter table public.generated_posts enable row level security;grant select,update on public.generated_posts to authenticated;create policy fixture_posts_all on public.generated_posts for all to authenticated using(true) with check(true)")
  def browser(statement,actor=u):return sql(f"select set_config('request.jwt.claim.sub','{actor}',false);set role authenticated;"+statement).splitlines()[-1]
  art=sql(f"select art_id from public.generation_batch_items where id='{item}'")
  assert browser(f"select count(*) from public.generated_posts where id='{art}'")=='1'
  assert browser(f"select count(*) from storage.objects where bucket_id='generated' and name='{context['result_path']}'")=='1'
  sql(f"update public.generated_posts set deleted_at=now() where id='{art}'")
  archived=json.loads(user(f"select public.generation_batch_detail('{batch['id']}')"));assert archived['items'][0]['resultPath'] is None and archived['items'][0]['postId'] is None
  assert browser(f"select count(*) from storage.objects where name='{context['result_path']}'")=='1'
  assert sql(f"select public.generation_batch_trash_asset('{context['result_path']}')")=='f'
  assert browser(f"select public.generation_batch_trash_asset('{context['result_path']}')")=='t'
  browser(f"delete from storage.objects where name='{context['result_path']}'");assert sql(f"select count(*) from storage.objects where name='{context['result_path']}'")=='0'
  sql(f"insert into storage.objects values('generated','{context['result_path']}')")
  sql(f"update public.generated_posts set deleted_at=null where id='{art}'")

  stranger='00000000-0000-0000-0000-000000000017'
  sql(f"insert into auth.users values('{stranger}');insert into public.profiles values('{stranger}','approved','user')")
  assert browser(f"select count(*) from public.generated_posts where id='{art}'",stranger)=='0'
  assert browser(f"select count(*) from storage.objects where name='{context['result_path']}'",stranger)=='0'
  # Direct REST cannot erase the batch marker and extend signed URL TTL.
  try:browser(f"update public.generated_posts set details=null where id='{art}'");raise AssertionError('batch marker removed')
  except RuntimeError as e:assert 'batch_art_immutable' in str(e)
  legacy=sql(f"insert into public.generated_posts(owner_id,school_id,student_id,image_url)values('{u}','{school}','{student}','legacy') returning id").splitlines()[0]
  assert browser(f"select count(*) from public.generated_posts where id='{legacy}'")=='1'
  browser(f"update public.generated_posts set details='{{\"legacyMutable\":true}}' where id='{legacy}'")
  assert sql(f"select details->>'legacyMutable' from public.generated_posts where id='{legacy}'")=='true'

  # Revocation and changed profile must stop a queued item before provider.
  req2='00000000-0000-0000-0000-000000000005';user(create.replace(req,req2));item2=sql('select id from public.claim_generation_batch_items(1,60)');lease2=sql(f"select lease_id from public.generation_batch_items where id='{item2}'")
  sql('update public.authorizations set revoked_at=now()');assert sql(f"select public.begin_generation_batch_item('{item2}','{lease2}')")=='f'
  assert browser(f"select count(*) from public.generated_posts where id='{art}'")=='0'
  assert browser(f"select count(*) from storage.objects where name='{context['result_path']}'")=='0'
  assert browser(f"select count(*) from public.generated_posts where id='{legacy}'")=='1'
  assert sql(f"select count(*) from public.storage_purge_queue where path='{context['result_path']}'")=='1'
  # A late upload after the purge queue row was consumed is found on polling.
  sql(f"delete from public.storage_purge_queue where path='{context['result_path']}'")
  sql('select id from public.claim_generation_batch_items(1,60)')
  assert sql(f"select count(*) from public.storage_purge_queue where path='{context['result_path']}' and reason='generation_orphan_reconciliation'")=='1'

  assert json.loads(user(f"select public.generation_batch_eligibility('{school}')"))['students']==[]
  revoked_detail=json.loads(user(f"select public.generation_batch_detail('{batch['id']}')"));assert revoked_detail['items'][0]['resultPath'] is None and revoked_detail['items'][0]['postId'] is None
  assert int(sql("select count(*) from public.storage_purge_queue where reason in('generation_authorization_changed','generation_authorization_revoked','generation_orphan_reconciliation')"))>=2
  sql('update public.authorizations set revoked_at=null');sql(f"update public.students set photos='[]' where id='{student}'");assert sql(f"select public.begin_generation_batch_item('{item2}','{lease2}')")=='f'
  # Failed manual retry consumes quota once; unknown is ineligible.
  sql(f"update public.students set photos='[{{\"id\":\"profile-a\",\"path\":\"students/{school}/a.jpg\"}}]' where id='{student}'")
  sql(f"update public.generation_batch_items set status='failed' where id='{item2}'")
  retry=f"select public.retry_generation_batch((select batch_id from public.generation_batch_items where id='{item2}'),'{req2}',array['{item2}']::uuid[])"
  user(retry);user(retry);assert sql('select sum(count) from public.generation_usage')=='3'
  assert sql("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('generation_batch_source','claim_generation_batch_items','begin_generation_batch_item','complete_generation_batch_item','generation_batch_art_immutable','generation_batches_authorization_revoked')")=='t'
  # Event choices require an attested solo image; group/unreviewed are blocked.
  event='00000000-0000-0000-0000-000000000007';photo='00000000-0000-0000-0000-000000000008';face='00000000-0000-0000-0000-000000000009'
  sql(f"""insert into public.events(id,school_id,name)values('{event}','{school}','Evento sintético');
   insert into public.photos(id,school_id,event_id,storage_path,width,height,regions_reviewed_by,regions_reviewed_at,regions_reviewed_width,regions_reviewed_height)values('{photo}','{school}','{event}','{school}/{event}/{photo}.jpg',30,40,'{u}',now(),30,40);
   insert into public.photo_faces(id,school_id,photo_id,student_id,state,reviewed_by)values('{face}','{school}','{photo}','{student}','confirmed','{u}');
   insert into public.photo_person_regions values(gen_random_uuid(),'{photo}','{school}','{student}','{face}','own_child','{u}',now());""")
  sql(f"insert into storage.objects values('event-photos','{school}/{event}/{photo}.jpg')")
  assert sql(f"select public.generation_batch_source('{student}','event','{photo}') is not null")=='t'
  choices=json.loads(user(f"select public.generation_batch_photo_choices('{student}')"));event_choice=next(x for x in choices['photos'] if x['source']=='event');assert event_choice['eventId']==event and event_choice['eventName']=='Evento sintético'
  sql(f"insert into public.photo_faces(school_id,photo_id,state)values('{school}','{photo}','unassigned')")
  assert sql(f"select public.generation_batch_source('{student}','event','{photo}') is null")=='t'
  sql(f"delete from public.photo_faces where photo_id='{photo}' and id<>'{face}';update public.photos set all_people_reviewed=false where id='{photo}'")
  assert sql(f"select public.generation_batch_source('{student}','event','{photo}') is null")=='t'
  # DOB and required responsible are enforced independently of legacy flags.
  sql(f"update public.students set birth_date='2015-01-01' where id='{student}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is null")=='t'
  sql(f"update public.students set birth_date='1990-02-30' where id='{student}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is null")=='t'
  sql(f"update public.students set birth_date='1990-01-01' where id='{student}'")
  # Unknown may be retried only by explicit manual request, consuming new quota.
  sql('select id from public.claim_generation_batch_items(1,60)');lease2=sql(f"select lease_id from public.generation_batch_items where id='{item2}'")
  sql(f"select public.begin_generation_batch_item('{item2}','{lease2}')")
  sql(f"select public.fail_generation_batch_item('{item2}','{lease2}','provider_unknown',true)")
  user(retry.replace(req2,'00000000-0000-0000-0000-000000000010'));assert sql('select sum(count) from public.generation_usage')=='4'
  # Stored result retry keeps attempt and quota while recovering persistence.
  sql('select id from public.claim_generation_batch_items(1,60)');lease2=sql(f"select lease_id from public.generation_batch_items where id='{item2}'")
  sql(f"select public.begin_generation_batch_item('{item2}','{lease2}')")
  recovered=json.loads(sql(f"select public.generation_batch_item_context('{item2}','{lease2}')"))
  sql(f"insert into storage.objects values('generated','{recovered['result_path']}')")
  sql(f"select public.fail_generation_batch_item('{item2}','{lease2}','persistence_failed',false)")
  user(retry.replace(req2,'00000000-0000-0000-0000-000000000013'))
  assert sql('select sum(count) from public.generation_usage')=='4'
  assert sql(f"select attempt from public.generation_batch_items where id='{item2}'")==str(recovered['attempt'])
  assert sql(f"select provider_started_at is not null from public.generation_batch_items where id='{item2}'")=='t'
  summaries=json.loads(user(f"select public.generation_batches_for_school('{school}')"));assert all('items' not in summary for summary in summaries['batches'])
  assert sql(f"select public.discard_generation_batch_asset('{item2}','{recovered['result_path']}')")=='f'
  assert sql(f"select public.discard_generation_batch_asset('{item2}','{school}/generation-batches/{json.loads(user(retry))['id']}/{item2}/999.png')")=='t'
  try:user(retry.replace(f"array['{item2}']",f"array['{item}']"));raise AssertionError('request id reused differently')
  except RuntimeError as e:assert 'request_conflict' in str(e)
  guardian='00000000-0000-0000-0000-000000000014'
  sql(f"insert into public.guardians(id,school_id)values('{guardian}','{school}');update public.students set birth_date='2015-01-01',primary_guardian_id='{guardian}' where id='{student}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is null")=='t'
  sql(f"update public.guardians set name='Responsável sintético',whatsapp='+5511999999999' where id='{guardian}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is null")=='t'
  sql(f"update public.authorizations set guardian_id='{guardian}' where student_id='{student}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is not null")=='t'
  sql(f"update public.students set birth_date='1990-01-01',primary_guardian_id=null,photos=jsonb_set(photos,'{{0,path}}','\"students/foreign/a.jpg\"') where id='{student}'")
  assert sql(f"select public.generation_batch_source('{student}','profile','profile-a') is null")=='t'
  sql(f"update public.students set photos=jsonb_set(photos,'{{0,path}}','\"students/{school}/a.jpg\"') where id='{student}'")
  # Access cannot cross tenant or user.
  try:user(f"select public.generation_batch_eligibility('{event}')");raise AssertionError('foreign school accepted')
  except RuntimeError as e:assert 'forbidden' in str(e)
  # Two independent requests compete for the last quota slot atomically.
  sql('update public.generation_usage set count=49')
  def attempt(request):
   try:return user(create.replace(req,request))
   except RuntimeError as e:return str(e)
  with concurrent.futures.ThreadPoolExecutor(2) as pool:
   outcomes=list(pool.map(attempt,['00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012']))
  assert sum('quota_exceeded' in x for x in outcomes)==1
  assert sql('select sum(count) from public.generation_usage')=='50'
  # Create and manual retry share the same atomic quota row.
  sql(f"delete from storage.objects where name='{recovered['result_path']}';update public.generation_batch_items set status='failed' where id='{item2}';update public.generation_usage set count=49")
  competing_retry=retry.replace(req2,'00000000-0000-0000-0000-000000000015')
  competing_create=create.replace(req,'00000000-0000-0000-0000-000000000016')
  def user_outcome(statement):
   try:return user(statement)
   except RuntimeError as e:return str(e)
  with concurrent.futures.ThreadPoolExecutor(2) as pool:outcomes=list(pool.map(user_outcome,[competing_retry,competing_create]))
  assert sum('quota_exceeded' in x for x in outcomes)==1
  assert sql('select sum(count) from public.generation_usage')=='50'
  batch_count=sql('select count(*) from public.generation_batches')
  # All-or-nothing quota exhaustion: no extra batch or reservation.
  sql('update public.generation_usage set count=50')
  try:user(create.replace(req,'00000000-0000-0000-0000-000000000006'));raise AssertionError('quota accepted')
  except RuntimeError as e:assert 'quota_exceeded' in str(e)
  assert sql('select count(*) from public.generation_batches')==batch_count;assert sql('select sum(count) from public.generation_usage')=='50'
  # Existing gallery hard-delete and student purge remain possible; orphan
  # recovery enqueues their reserved assets without reopening access.
  sql(f"delete from public.generated_posts where id='{art}'")
  assert sql(f"select art_id is null from public.generation_batch_items where id='{item}'")=='t'
  removed=json.loads(user(f"select public.generation_batch_detail('{batch['id']}')"));assert removed['items'][0]['resultPath'] is None
  sql(f"delete from public.storage_purge_queue where path='{context['result_path']}'")
  sql('select id from public.claim_generation_batch_items(1,60)')
  assert sql(f"select count(*) from public.storage_purge_queue where path='{context['result_path']}'")=='1'
  sql(f"delete from public.students where id='{student}';delete from public.storage_purge_queue where path='{context['result_path']}'")
  assert sql('select count(*) from public.generation_batch_items')=='0'
  sql('select id from public.claim_generation_batch_items(1,60)')
  assert sql(f"select count(*) from public.storage_purge_queue where path='{context['result_path']}'")=='1'
  print('SQL lote local: DDL idempotente, criação concorrente/cota, leases, recuperação sem provider repetido, arte única, revogação, foto alterada, retry manual e ACL passaram.')
 finally:
  if started:run([str(BIN/'pg_ctl'),'-D',str(data),'-m','immediate','stop'])
