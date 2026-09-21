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
