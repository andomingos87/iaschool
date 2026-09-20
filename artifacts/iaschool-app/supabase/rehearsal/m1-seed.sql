\echo '=== SEED sintético pré-migration (mesma transação) ==='
-- Duas escolas no modelo antigo (school_user aprovadas), uma pendente, um aluno com conta.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','escola-a@teste.local','x',now(),'{}','{"signup_role":"school_user","signup_name":"Escola A","signup_school_name":"Escola A"}',now(),now()),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','escola-b@teste.local','x',now(),'{}','{"signup_role":"school_user","signup_name":"Escola B","signup_school_name":"Escola B"}',now(),now()),
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pendente@teste.local','x',now(),'{}','{"signup_role":"school_user","signup_name":"Escola Pendente","signup_school_name":"Escola Pendente"}',now(),now()),
 ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aluno@teste.local','x',now(),'{}','{"signup_role":"student","signup_name":"Aluno Conta","signup_school_id":"11111111-1111-1111-1111-111111111111","signup_age_bracket":"adolescente"}',now(),now());
update public.profiles set approval_status='approved' where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
-- Identidade visual da escola A (duas clubs: a mais recente deve vencer).
insert into public.clubs (owner_id, name, logo, colors, updated_at) values
 ('11111111-1111-1111-1111-111111111111','Antiga','{"url":"old"}','["#000000"]', now() - interval '1 day'),
 ('11111111-1111-1111-1111-111111111111','Nova','{"url":"new"}','["#2563eb","#be123c"]', now());
-- Alunos: dois irmãos com o mesmo responsável (formatos diferentes do número), um com verificação, um com número inválido, um da escola B.
insert into public.students (id, owner_id, name, whatsapp, guardian) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Irmão 1','+5511911110001','{"name":"Mãe","whatsapp":"5511988887777","relationship":"mãe","whatsappVerifiedAt":"2026-09-01T10:00:00Z","consentAt":"2026-09-01T10:00:00Z"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Irmão 2','+5511911110002','{"name":"Mãe","whatsapp":"+55 (11) 98888-7777","relationship":"mãe"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Sem número válido','+5511911110003','{"name":"Pai","whatsapp":"123"}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','Aluno B','+5511911110004','{"name":"Avó","whatsapp":"5511977776666"}');
update public.profiles set student_record_id='aaaaaaaa-0000-0000-0000-000000000001', approval_status='approved' where id='44444444-4444-4444-4444-444444444444';
insert into public.generated_posts (owner_id, student_id, image_url) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','https://x/a.png');
insert into public.reference_posts (owner_id, image, uploaded_by) values ('11111111-1111-1111-1111-111111111111','{"url":"r"}','11111111-1111-1111-1111-111111111111');
-- Referência global do super_admin (owner sem escola): school_id deve ficar nulo.
insert into public.reference_posts (owner_id, image, uploaded_by) select id, '{"url":"g"}', id from public.profiles where role='super_admin' limit 1;
select 'seed: profiles='||(select count(*) from profiles)||' students='||(select count(*) from students)||' clubs='||(select count(*) from clubs);
