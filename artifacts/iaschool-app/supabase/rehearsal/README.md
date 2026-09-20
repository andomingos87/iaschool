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
