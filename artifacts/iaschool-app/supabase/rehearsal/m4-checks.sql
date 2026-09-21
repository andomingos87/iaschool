\echo '=== CHECKS M4 (dentro da transação) ==='

-- Estrutura
do $$
begin
  assert exists (select 1 from pg_extension where extname = 'vector'), 'extensão vector não instalada';
  assert to_regclass('public.authorizations') is not null, 'authorizations não existe';
  assert to_regclass('public.student_reference_faces') is not null, 'student_reference_faces não existe';
  assert (select relrowsecurity from pg_class where oid = 'public.authorizations'::regclass), 'authorizations sem RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.student_reference_faces'::regclass), 'student_reference_faces sem RLS';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='student_reference_faces') = 0,
    'student_reference_faces não pode ter policy';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='authorizations' and cmd='DELETE') = 0,
    'authorizations não pode ter policy de delete';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='authorizations') = 3,
    'authorizations deveria ter 3 policies (select, insert, update)';
  assert exists (select 1 from pg_indexes where schemaname='public' and indexname='authorizations_active_idx'),
    'índice único parcial authorizations_active_idx ausente';
  assert exists (select 1 from pg_indexes where schemaname='public' and indexname='srf_vec_idx'), 'índice hnsw ausente';
  assert exists (select 1 from pg_views where schemaname='public' and viewname='v_biometric_consent'), 'view v_biometric_consent ausente';
  assert (select 'security_invoker=true' = any(reloptions) from pg_class where oid='public.v_biometric_consent'::regclass),
    'v_biometric_consent sem security_invoker';
  assert exists (select 1 from pg_trigger where tgname='authorizations_check_school' and tgrelid='public.authorizations'::regclass),
    'trigger authorizations_check_school ausente';
  assert exists (select 1 from pg_trigger where tgname='authorizations_restrict_client_update' and tgrelid='public.authorizations'::regclass),
    'trigger authorizations_restrict_client_update ausente';
  assert exists (select 1 from pg_trigger where tgname='student_reference_faces_check' and tgrelid='public.student_reference_faces'::regclass),
    'trigger student_reference_faces_check ausente';
end $$;

-- Grants e privilégios
do $$
begin
  assert not has_table_privilege('authenticated','public.student_reference_faces','select'), 'authenticated lê student_reference_faces';
  assert not has_table_privilege('anon','public.student_reference_faces','select'), 'anon lê student_reference_faces';
  assert not has_table_privilege('authenticated','public.authorizations','delete'), 'authenticated apaga authorizations';
  assert has_table_privilege('authenticated','public.authorizations','select'), 'authenticated não lê authorizations';
  assert has_function_privilege('authenticated','public.has_active_authorization(uuid,text)','execute'), 'authenticated não executa has_active_authorization';
  assert has_function_privilege('authenticated','public.list_student_reference_faces(uuid)','execute'), 'authenticated não executa list_student_reference_faces';
  assert has_function_privilege('authenticated','public.student_biometric_readiness(uuid)','execute'), 'authenticated não executa student_biometric_readiness';
  assert not has_function_privilege('anon','public.list_student_reference_faces(uuid)','execute'), 'anon executa list_student_reference_faces';
  -- A RPC de leitura não pode devolver embedding em hipótese alguma.
  assert not exists (
    select 1 from information_schema.parameters
     where specific_schema='public'
       and specific_name like 'list_student_reference_faces%'
       and parameter_name = 'embedding'
  ), 'list_student_reference_faces expõe embedding';
end $$;

-- Storage
do $$
begin
  assert exists (select 1 from storage.buckets where id='student-refs' and not public), 'bucket student-refs ausente ou público';
  assert exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='student_refs_insert'), 'policy student_refs_insert ausente';
  assert exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='student_refs_select'), 'policy student_refs_select ausente';
  assert exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='student_refs_delete'), 'policy student_refs_delete ausente';
  assert public.storage_student_id('00000000-0000-0000-0000-00000000a401/00000000-0000-0000-0000-00000000a404/x.jpg')
         = '00000000-0000-0000-0000-00000000a404'::uuid, 'storage_student_id não lê o 2º segmento';
  assert public.storage_student_id('sem/uuid/x.jpg') is null, 'storage_student_id devia devolver null';
end $$;

-- Migração do consentimento legado (depende do m4-seed.sql)
do $$
declare
  v_student uuid := '00000000-0000-0000-0000-00000000a402';
  v_row     public.authorizations%rowtype;
begin
  if not exists (select 1 from public.students where id = v_student) then
    raise notice 'aluno do seed ausente; checagem da migração legada pulada';
    return;
  end if;
  select * into v_row from public.authorizations where student_id = v_student;
  assert v_row.id is not null, 'consentimento legado não virou linha em authorizations';
  assert v_row.scope = 'internal_use', 'consentimento legado deveria virar internal_use, veio ' || v_row.scope;
  assert v_row.granted_at = '2026-09-01T10:00:00Z'::timestamptz, 'granted_at não veio do jsonb';
  assert v_row.guardian_id = '00000000-0000-0000-0000-00000000a403'::uuid, 'guardian_id não foi preenchido';
  assert v_row.evidence->>'source' = 'students.guardian.consentAt', 'evidence.source ausente';
  assert (select count(*) from public.authorizations where student_id = v_student) = 1,
    'a migração legada não pode criar mais de um escopo';
  assert not exists (
    select 1 from public.authorizations where student_id = '00000000-0000-0000-0000-00000000a405'
  ), 'aluno sem consentimento legado ganhou autorização';
  -- Nenhum escopo biométrico é inferido do booleano antigo.
  assert not public.has_active_authorization(v_student, 'biometric_sorting'),
    'migração legada não pode conceder biometric_sorting';
  raise notice 'migração legada ok';
end $$;

\echo '--- roundtrip funcional (como postgres; auth.role() é nulo → passa pelo trigger de update)'
do $$
declare
  v_user     uuid;
  v_school   uuid := '00000000-0000-0000-0000-00000000a401';
  v_school2  uuid := '00000000-0000-0000-0000-00000000a4b1';
  v_student  uuid := '00000000-0000-0000-0000-00000000a404';
  v_student2 uuid := '00000000-0000-0000-0000-00000000a4b2';
  v_auth     uuid;
  v_auth2    uuid;
  v_vec      extensions.vector(512);
  v_res      text;
  v_n        int;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'sem usuário em auth.users; roundtrip pulado';
    return;
  end if;

  if not exists (select 1 from public.schools where id = v_school) then
    insert into public.schools (id, name) values (v_school, 'Escola Ensaio M4');
  end if;
  insert into public.schools (id, name) values (v_school2, 'Escola Ensaio M4 (B)');
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student, v_user, v_school, 'Aluno Roundtrip', '+5511911110045', '[]'::jsonb);
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values (v_student2, v_user, v_school2, 'Aluno de Outra Escola', '+5511911110046', '[]'::jsonb);

  v_vec := ('[' || array_to_string(array(select 0.1::real from generate_series(1,512)), ',') || ']')::extensions.vector(512);

  -- 1. Aluno de uma escola não entra sob outra.
  begin
    insert into public.authorizations (school_id, student_id, scope, created_by)
    values (v_school2, v_student, 'biometric_sorting', v_user);
    raise exception 'ERRO: aceitou autorização com escola divergente do aluno';
  exception when check_violation then null;
  end;

  -- 2. Autorização registrada, ainda sem aceite (granted_at nulo).
  insert into public.authorizations (school_id, student_id, scope, created_by)
  values (v_school, v_student, 'biometric_sorting', v_user)
  returning id into v_auth;
  assert not public.has_active_authorization(v_student, 'biometric_sorting'),
    'autorização sem granted_at não pode contar como ativa';

  -- 3. Sem consentimento ativo, não há rosto de referência.
  begin
    insert into public.student_reference_faces (school_id, student_id, embedding, authorization_id, created_by)
    values (v_school, v_student, v_vec, v_auth, v_user);
    raise exception 'ERRO: aceitou referência sem biometric_sorting ativo';
  exception when check_violation then null;
  end;

  -- 4. Aceite colhido.
  update public.authorizations set granted_at = now(), evidence = jsonb_build_object('terms_version','ensaio')
   where id = v_auth;
  assert public.has_active_authorization(v_student, 'biometric_sorting'), 'consentimento ativo não reconhecido';
  assert exists (select 1 from public.v_biometric_consent where student_id = v_student), 'v_biometric_consent não enxerga o aceite';

  -- 5. Duas linhas ativas do mesmo escopo, não.
  begin
    insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
    values (v_school, v_student, 'biometric_sorting', now(), v_user);
    raise exception 'ERRO: aceitou dois biometric_sorting ativos';
  exception when unique_violation then null;
  end;

  -- 6. Agora a referência entra.
  insert into public.student_reference_faces (school_id, student_id, embedding, authorization_id, created_by, quality)
  values (v_school, v_student, v_vec, v_auth, v_user, 0.9);
  assert (select retention_until from public.student_reference_faces where student_id = v_student)
         = make_date(extract(year from current_date)::int, 12, 31), 'retention_until não é o fim do ano corrente';

  -- 7. Referência não pode se apoiar na autorização de outro aluno.
  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school2, v_student2, 'biometric_sorting', now(), v_user) returning id into v_auth2;
  begin
    insert into public.student_reference_faces (school_id, student_id, embedding, authorization_id, created_by)
    values (v_school, v_student, v_vec, v_auth2, v_user);
    raise exception 'ERRO: aceitou referência apoiada na autorização de outro aluno';
  exception when check_violation then null;
  end;

  -- A partir daqui a sessão é de um membro da escola: é o que faz as RPCs
  -- (`is_member_of`) e o trigger de imutabilidade (`auth.role()`) valerem.
  -- `role = 'user'` de propósito: com super admin, `is_super_admin()` deixaria
  -- passar tudo e o isolamento entre escolas não seria testado. O rollback desfaz.
  update public.profiles set approval_status = 'approved', role = 'user' where id = v_user;
  insert into public.school_members (school_id, user_id, role)
  values (v_school, v_user, 'school_admin')
  on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- 8. Prontidão: 1 referência = cobertura baixa.
  select reference_count into v_n from public.student_biometric_readiness(v_school) where student_id = v_student;
  assert v_n = 1, 'readiness não contou a referência';
  assert (select low_coverage from public.student_biometric_readiness(v_school) where student_id = v_student),
    'uma referência devia marcar cobertura baixa';
  assert (select has_consent from public.student_biometric_readiness(v_school) where student_id = v_student),
    'readiness não viu o consentimento';
  assert (select count(*) from public.student_biometric_readiness(v_school)) =
         (select count(*) from public.students where school_id = v_school and deleted_at is null),
    'readiness devia trazer uma linha por aluno ativo da escola';

  -- 8b. A RPC de leitura devolve a referência sem o vetor.
  assert (select count(*) from public.list_student_reference_faces(v_student)) = 1,
    'list_student_reference_faces não achou a referência';

  -- 8c-1. Consentimento de aluno de outra escola não vaza nem como booleano.
  assert not public.has_active_authorization(v_student2, 'biometric_sorting'),
    'has_active_authorization respondeu sobre aluno de outro tenant';

  -- 8c. Escola de que não sou membro: a RPC recusa.
  begin
    perform public.student_biometric_readiness(v_school2);
    raise exception 'ERRO: readiness respondeu para escola de outro tenant';
  exception when insufficient_privilege then null;
  end;

  -- 8d. A prova é congelada: pela API só `revoked_at` muda.
  update public.authorizations set evidence = jsonb_build_object('terms_version','adulterado'),
         granted_at = '2020-01-01T00:00:00Z'::timestamptz
   where id = v_auth;
  select evidence->>'terms_version' into v_res from public.authorizations where id = v_auth;
  assert v_res = 'ensaio', 'evidence foi sobrescrita pelo cliente';
  assert (select granted_at from public.authorizations where id = v_auth) > '2026-01-01T00:00:00Z'::timestamptz,
    'granted_at foi sobrescrito pelo cliente';

  -- 9. Revogar derruba o consentimento e libera um aceite novo.
  update public.authorizations set revoked_at = now() where id = v_auth;
  assert not public.has_active_authorization(v_student, 'biometric_sorting'), 'revogação não surtiu efeito';

  -- 9b. Desrevogar, não.
  begin
    update public.authorizations set revoked_at = null where id = v_auth;
    raise exception 'ERRO: aceitou desrevogar uma autorização';
  exception when check_violation then null;
  end;

  insert into public.authorizations (school_id, student_id, scope, granted_at, created_by)
  values (v_school, v_student, 'biometric_sorting', now(), v_user);
  assert public.has_active_authorization(v_student, 'biometric_sorting'), 'reconceder depois de revogar falhou';
  assert (select count(*) from public.authorizations where student_id = v_student and scope = 'biometric_sorting') = 2,
    'o histórico das duas linhas devia permanecer';

  -- 10. A referência antiga continua de pé: expurgo é do M6, não da revogação.
  assert (select count(*) from public.student_reference_faces where student_id = v_student) = 1,
    'a referência sumiu sozinha — o expurgo é do M6';

  perform set_config('request.jwt.claims', '', true);
  raise notice 'roundtrip M4 ok';
end $$;
