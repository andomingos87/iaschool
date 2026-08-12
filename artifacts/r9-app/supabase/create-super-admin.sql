-- ============================================================
-- Provisionar conta de super admin
-- Rode este bloco NO SQL EDITOR do Supabase, APÓS rodar setup.sql.
-- Substitua o UUID abaixo pelo UUID real do usuário criado no painel.
-- ============================================================

-- PASSO 1: Crie o usuário no painel.
--   Authentication → Users → "Add user"
--   E-mail: iasport@andersondomingos.com.br
--   Senha: (a senha combinada)
--   ✔ Auto confirm user (marque esta opção)
--
-- PASSO 2: Copie o UUID exibido na lista de usuários e cole abaixo.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Busca o usuário pelo e-mail (evita precisar copiar o UUID manualmente).
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE email = 'iasport@andersondomingos.com.br'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado. Crie-o primeiro em Authentication → Users.';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, approval_status)
  VALUES (
    v_user_id,
    'iasport@andersondomingos.com.br',
    'IAsport Admin',
    'super_admin',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE
    SET role            = 'super_admin',
        approval_status = 'approved',
        name            = EXCLUDED.name;

  RAISE NOTICE 'Super admin provisionado: %', v_user_id;
END $$;
