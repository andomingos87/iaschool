-- ============================================================
-- Provisionar conta de super admin
-- Rode este bloco NO SQL EDITOR do Supabase, APÓS rodar setup.sql.
-- Substitua os valores abaixo pelos dados reais do administrador.
-- ============================================================

-- PASSO 1: Crie o usuário no painel.
--   Authentication → Users → "Add user"
--   E-mail: <email do super admin>
--   Senha: (a senha combinada)
--   ✔ Auto confirm user (marque esta opção)
--
-- PASSO 2: Substitua '<email do super admin>' e '<nome do admin>' abaixo
--          e execute este script no SQL Editor.

DO $$
DECLARE
  v_admin_email text := '<email do super admin>';  -- substitua aqui
  v_admin_name  text := '<nome do admin>';           -- substitua aqui
  v_user_id uuid;
BEGIN
  -- Busca o usuário pelo e-mail (evita precisar copiar o UUID manualmente).
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE email = v_admin_email
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado. Crie-o primeiro em Authentication → Users.';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, approval_status)
  VALUES (
    v_user_id,
    v_admin_email,
    v_admin_name,
    'super_admin',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE
    SET role            = 'super_admin',
        approval_status = 'approved',
        name            = EXCLUDED.name;

  RAISE NOTICE 'Super admin provisionado: %', v_user_id;
END $$;
