# Ensaio de migrations (dry-run com rollback)

Sem branching no plano do Supabase, o ensaio roda **na própria base**, dentro
de uma transação que termina em `rollback`. DDL é transacional no Postgres,
então nada persiste — nem tabela, nem policy, nem dado semeado.

Conexão direta (o pooler de transação, porta 6543, não serve para DDL longo):

```bash
set -a; . ./.env.local; set +a
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
DSN="host=db.jtyyauivokutperouqyh.supabase.co port=5432 user=postgres dbname=postgres sslmode=require"
```

## M1 — `fase1-min-schools-events.sql`

Ensaio estrutural (base como está) + checagens:

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/fase1-min-schools-events.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m1-checks.sql \
  -c "rollback;"
```

Ensaio da migração de dados (semeia o modelo antigo, migra, confere, reverte):

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -t -c "begin;" \
  -f artifacts/iaschool-app/supabase/rehearsal/m1-seed.sql \
  -f artifacts/iaschool-app/supabase/fase1-min-schools-events.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m1-checks-data.sql \
  -c "rollback;"
```

Confirme depois que nada ficou:

```bash
psql "$DSN" -Atc "select to_regclass('public.schools') is null"
```

Executado em 20/09/2026 com os dois roteiros passando (ver `BACKLOG.md`, M1).
O `m1-seed.sql` insere direto em `auth.users`; só faz sentido dentro do
`begin … rollback`.

## M3 — `fase2-photo-jobs-worker.sql`

Quando o host direto `db.<ref>.supabase.co` não resolve (rede só IPv4), o
pooler de **sessão** serve para DDL; o de transação (6543) não:

```bash
DSN="host=aws-0-us-east-1.pooler.supabase.com port=5432 user=postgres.jtyyauivokutperouqyh dbname=postgres sslmode=require"
```

Pré-checagem (fora da transação, só leitura): as três funções que a migration
reutiliza precisam existir.

```bash
psql "$DSN" -Atc "select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('touch_updated_at','is_member_of','is_super_admin')"
```

Ensaio estrutural + roundtrip funcional (cria escola/evento/lote/fotos de
ensaio, enfileira, reivindica, conclui, falha 5 vezes, faz retry, testa lease
expirado e a view de lote parado; tudo revertido):

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/fase2-photo-jobs-worker.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m3-checks.sql \
  -c "rollback;"
psql "$DSN" -Atc "select to_regclass('public.photo_jobs') is null"   # t
```

O roundtrip precisa de pelo menos um usuário em `auth.users` (usa o mais
antigo como `created_by`/`uploaded_by`); sem nenhum ele é pulado com aviso.
Dois `NOTICE … does not exist, skipping` dos `drop trigger if exists` são
esperados na primeira execução.

Executado em 21/09/2026: `roundtrip M3 ok`.

## M4 — `fase3-authorizations-reference-faces.sql`

Ensaio estrutural + migração de dados + roundtrip funcional numa tacada só. O
`m4-seed.sql` semeia um aluno no formato da Fase 0 (consentimento como carimbo
em `students.guardian`) para a seção 7 ter o que migrar:

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/rehearsal/m4-seed.sql \
  -f artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m4-checks.sql \
  -c "rollback;"
psql "$DSN" -Atc "select to_regclass('public.authorizations') is null"   # t
```

O roundtrip cobre o que a estrutura sozinha não mostra: autorização com escola
diferente da do aluno é recusada, referência sem `biometric_sorting` ativo é
recusada, dois consentimentos ativos do mesmo escopo colidem no índice único,
revogar libera reconceder (linha nova, histórico inteiro preservado), a
prova é imutável pela API (só `revoked_at` muda, e desrevogar dá erro),
`has_active_authorization` e `student_biometric_readiness` não respondem sobre
escola de que a sessão não é membro, e a referência **não** some ao revogar —
o expurgo é do M6.

Dentro do roundtrip a sessão vira membro comum (`role = 'user'`, vínculo em
`school_members`, claim `request.jwt.claims`): com super admin, `is_super_admin()`
deixaria tudo passar e o isolamento entre escolas não seria testado. O rollback
desfaz o rebaixamento.

Depois da migration aplicada, o mesmo arquivo de checks roda sozinho contra o
banco real (a parte da migração legada é pulada por falta do seed):

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/rehearsal/m4-checks.sql -c "rollback;"
```

Executado em 21/09/2026: `migração legada ok` e `roundtrip M4 ok`, antes e
depois de aplicar.
