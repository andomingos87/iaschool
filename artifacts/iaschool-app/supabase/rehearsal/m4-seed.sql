-- Semeia o modelo ANTES da migration do M4, para ensaiar a migração de dados
-- (`students.guardian->>'consentAt'` → `authorizations`, seção 7).
-- Escreve direto em tabelas com RLS; só faz sentido dentro de `begin … rollback`.

\echo '=== SEED M4 (pré-migration) ==='

do $$
declare
  v_user     uuid;
  v_school   uuid := '00000000-0000-0000-0000-00000000a401';
  v_student  uuid := '00000000-0000-0000-0000-00000000a402';
  v_guardian uuid := '00000000-0000-0000-0000-00000000a403';
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'sem usuário em auth.users; seed do M4 pulado';
    return;
  end if;

  insert into public.schools (id, name) values (v_school, 'Escola Ensaio M4');

  insert into public.guardians (id, school_id, name, whatsapp, relationship)
  values (v_guardian, v_school, 'Mãe do Ensaio', '+5511911110042', 'mãe');

  -- Aluno no formato da Fase 0: consentimento como carimbo no jsonb.
  insert into public.students (
    id, owner_id, school_id, primary_guardian_id, name, whatsapp, photos, guardian
  )
  values (
    v_student, v_user, v_school, v_guardian, 'Aluno Legado', '+5511911110043', '[]'::jsonb,
    jsonb_build_object(
      'name', 'Mãe do Ensaio',
      'whatsapp', '5511911110042',
      'relationship', 'mãe',
      'whatsappVerifiedAt', '2026-09-01T10:00:00Z',
      'consentAt', '2026-09-01T10:00:00Z',
      'consentRegisteredBy', 'Secretaria'
    )
  );

  -- Aluno sem consentimento legado: não pode ganhar linha em authorizations.
  insert into public.students (id, owner_id, school_id, name, whatsapp, photos)
  values ('00000000-0000-0000-0000-00000000a405', v_user, v_school,
          'Aluno Sem Consentimento', '+5511911110044', '[]'::jsonb);

  raise notice 'seed M4 ok';
end $$;
