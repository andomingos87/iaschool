\echo '=== CHECKS da migração de dados ==='
select 'schools: '||string_agg(s.name||' id=uid:'||(s.id=p.id)::text||' logo:'||coalesce(s.logo->>'url','-')||' cores:'||s.colors::text, ' | ' order by s.name) from public.schools s join public.profiles p on p.id=s.id;
select 'members: '||string_agg(p.name||'→'||m.role, ', ') from public.school_members m join public.profiles p on p.id=m.user_id;
select 'roles: '||string_agg(name||'='||role||'/'||approval_status, ', ' order by name) from public.profiles;
select 'guardians: '||string_agg(name||' '||whatsapp||' verif='||coalesce(whatsapp_verified_at::text,'NULL'), ' | ' order by whatsapp) from public.guardians;
select 'students: '||string_agg(s.name||'→'||coalesce(g.whatsapp,'SEM')||' school='||coalesce(s.school_id::text,'NULL'), ' | ' order by s.name) from public.students s left join public.guardians g on g.id=s.primary_guardian_id;
select 'posts com school_id: '||count(school_id)||'/'||count(*) from public.generated_posts;
select 'refs: escola='||count(school_id)||' globais='||count(*)-count(school_id) from public.reference_posts;
\echo '--- trigger de aprovação: pendente aprovada ganha escola + vínculo'
update public.profiles set approval_status='approved' where id='33333333-3333-3333-3333-333333333333';
select 'aprovada: escola='||(select name from public.schools where id='33333333-3333-3333-3333-333333333333')||' role='||(select role from public.school_members where user_id='33333333-3333-3333-3333-333333333333');
\echo '--- handle_new_user novo: signup_role=school cria user pendente; student é ignorado'
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nova@teste.local','x',now(),'{}','{"signup_role":"school","signup_name":"Nova","signup_school_name":"Escola Nova"}',now(),now()),
 ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aluno2@teste.local','x',now(),'{}','{"signup_role":"student","signup_name":"Aluno 2"}',now(),now());
select 'signup school → '||coalesce((select role||'/'||approval_status from public.profiles where id='55555555-5555-5555-5555-555555555555'),'SEM PERFIL')||'; signup student → '||coalesce((select role from public.profiles where id='66666666-6666-6666-6666-666666666666'),'SEM PERFIL (correto)');
\echo '--- RLS como escola A (set role authenticated + claims)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select 'escola A vê students: '||count(*)||' (esperado 3)' from public.students;
select 'escola A vê guardians: '||count(*)||' (esperado 1)' from public.guardians;
select 'escola A vê schools: '||count(*)||' (esperado 1)' from public.schools;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select 'escola B vê students: '||count(*)||' (esperado 1)' from public.students;
select 'escola B vê posts: '||count(*)||' (esperado 0)' from public.generated_posts;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select 'ex-aluno vê students: '||count(*)||' (esperado 0)' from public.students;
reset role;
