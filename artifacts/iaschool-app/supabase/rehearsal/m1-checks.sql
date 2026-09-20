\echo '=== CHECKS pós-migration (dentro da transação) ==='
select 'schools' as t, count(*) from public.schools
union all select 'school_members', count(*) from public.school_members
union all select 'guardians', count(*) from public.guardians
union all select 'students sem school_id', count(*) from public.students where school_id is null
union all select 'students com guardian jsonb e sem primary_guardian_id', count(*) from public.students where guardian is not null and coalesce(guardian->>'whatsapp','')<>'' and primary_guardian_id is null
union all select 'generated_posts sem school_id', count(*) from public.generated_posts where school_id is null
union all select 'reference_posts sem school_id', count(*) from public.reference_posts where school_id is null
union all select 'profiles por role: '||role, count(*) from public.profiles group by role;
\echo '--- escolas migradas (id = uid?)'
select s.id = p.id as id_igual_uid, s.name, m.role from public.schools s join public.profiles p on p.id = s.id join public.school_members m on m.school_id = s.id and m.user_id = p.id;
\echo '--- policies por tabela'
select tablename, count(*) from pg_policies where schemaname='public' and tablename in ('schools','school_members','classes','guardians','events','students','reference_posts','generated_posts','clubs','share_logs') group by 1 order by 1;
\echo '--- storage policies'
select policyname, cmd from pg_policies where schemaname='storage' and policyname like 'iaschool_%' order by 1;
\echo '--- funções'
select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('is_member_of','is_school_admin_of','is_dev','is_super_admin','my_schools','confirm_guardian_code','storage_school_id','ensure_school_on_approval','guardians_protect_verification','is_school_user','my_school_id','list_approved_schools') order by 1;
\echo '--- colunas removidas de profiles'
select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position;
\echo '--- teste do trigger de proteção: update direto não carimba; RPC carimba'
insert into public.schools (id, name) values ('00000000-0000-0000-0000-00000000aaaa','Escola Teste') on conflict do nothing;
insert into public.guardians (id, school_id, name, whatsapp) values ('00000000-0000-0000-0000-00000000bbbb','00000000-0000-0000-0000-00000000aaaa','Resp Teste','+5511900001111');
update public.guardians set whatsapp_verified_at = now() where id='00000000-0000-0000-0000-00000000bbbb';
select 'apos update direto: verified_at = '||coalesce(whatsapp_verified_at::text,'NULL') from public.guardians where id='00000000-0000-0000-0000-00000000bbbb';
select set_config('iaschool.guardian_verification','rpc',true);
update public.guardians set whatsapp_verified_at = now() where id='00000000-0000-0000-0000-00000000bbbb';
select 'apos update com flag rpc: verified_at = '||coalesce(whatsapp_verified_at::text,'NULL') from public.guardians where id='00000000-0000-0000-0000-00000000bbbb';
update public.guardians set whatsapp='+5511900002222' where id='00000000-0000-0000-0000-00000000bbbb';
select 'apos trocar numero: verified_at = '||coalesce(whatsapp_verified_at::text,'NULL') from public.guardians where id='00000000-0000-0000-0000-00000000bbbb';
\echo '--- storage_school_id'
select public.storage_school_id('00000000-0000-0000-0000-00000000aaaa/foto.jpg') as ok, public.storage_school_id('solto.jpg') as nulo;
