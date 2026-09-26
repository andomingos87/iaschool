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

## M4b — fila do rosto de referência (seção 8 do mesmo arquivo)

`iaschool_fase3_reference_face_jobs` acrescenta `student_reference_jobs` e as
RPCs de fila. Mesmo roteiro, com o arquivo de checks próprio:

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m4b-checks.sql \
  -c "rollback;"
psql "$DSN" -Atc "select to_regclass('public.student_reference_jobs') is null"   # t
```

O roundtrip cobre: enfileirar sem `biometric_sorting` ativo é recusado; job com
autorização de outro aluno é recusado; `claim` dá lease e conta a tentativa, e
não reivindica duas vezes; concluir sem embedding é erro (a referência não
existe sem vetor); a conclusão boa cria a linha em `student_reference_faces`
com o caminho e a autorização vindos do job; concluir de novo é `noop`; cinco
falhas derrubam o job e `retry_student_reference_job` zera as tentativas; retry
de escola de que a sessão não é membro é recusado; e
`delete_student_reference_face` devolve o caminho do objeto para o cliente
apagar no bucket.

Executado em 21/09/2026, antes e depois de aplicar: `roundtrip M4b ok`.

## M5 — `fase3-face-recognition.sql`

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/fase3-face-recognition.sql \
  -f artifacts/iaschool-app/supabase/rehearsal/m5-checks.sql \
  -c "rollback;"
psql "$DSN" -Atc "select to_regclass('public.photo_faces') is null"   # t
```

O roundtrip cobre: a busca vetorial acha o aluno da própria escola e devolve
vazio para outra (D7); referência vencida sai da comparação; embedding sem
aluno atribuído é recusado, e com aluno sem `biometric_sorting` também (D5);
o mesmo rosto entra **sem** o vetor, porque bbox e det_score são de todo rosto
detectado (§9.3.1); aluno de outra escola não entra num rosto desta;
`complete_recognize_job` grava os rostos, atualiza `faces_count`, move o
evento de `processing` para `review` e responde `noop` na segunda chamada;
falha permanente derruba o job na primeira tentativa; e `student_photos` só
mostra `confirmed` e recusa aluno de outro tenant.

As checagens de privilégio conferem o que a RLS **não** faz: `authenticated`
não tem `select` na coluna `embedding`, nem insert/update/delete na tabela,
nem execute em `match_reference_faces`.

Executado em 21/09/2026: `roundtrip M5 ok`, antes e depois de aplicar.

## M6 — `fase3-review-audit-purge.sql`

O M6 foi aplicado antes do ensaio (5 migrations, ver `SUPABASE.md`), então
`m6-checks.sql` é **roundtrip funcional contra o schema já aplicado**, dentro
de `begin … rollback`:

```bash
psql "$DSN" -v ON_ERROR_STOP=1 -q -c "begin;" \
  -f artifacts/iaschool-app/supabase/rehearsal/m6-checks.sql \
  -c "rollback;"
psql "$DSN" -Atc "select count(*) from public.biometric_events"   # 0
```

Cobre, na revisão: o CHECK recusa `confirmed` sem revisor mesmo por acesso
direto (D6/R7); a tela vê os pendentes do próprio evento com nome do aluno e
a partição por confiança pronta, e é recusada no evento de outra escola; um
lote com rosto de outra escola ou com id inexistente **não confirma nenhum**;
o lote bom confirma, grava `reviewed_by`/`reviewed_at` em cada linha e cria
**uma** linha em `biometric_events` com os `face_ids`; a segunda chamada é
no-op e não grava trilha; a pasta do aluno enche só com o confirmado;
"adulto / equipe" apaga recorte e vetor, mantém `bbox`/`det_score` e enfileira
o objeto para expurgo; o evento vira `ready` quando não sobra pendência; e
confirmar sem `biometric_sorting` ativo é recusado.

Cobre, no expurgo: referência vencida some e a foto confirmada **mantém** o
`student_id` (só o vetor sai); aluno na lixeira há mais de 30 dias é apagado
depois de a biometria sair, o rosto dele volta a `unassigned` com `bbox`
intacto, e a trilha continua legível pelo `student_ref` (`MAT-GONE`) com a FK
nula; evento vencido manda foto para a lixeira, e só 30 dias depois a foto é
apagada com foto, miniatura e original enfileirados no Storage;
`claim_storage_purge`/`complete_storage_purge` tiram da fila.

A sessão de tela é simulada com `set_config('request.jwt.claims', …, true)`.
Atenção: isso é local à **transação**, não ao bloco `DO` — o segundo bloco
precisa limpar o claim para voltar a agir como `service_role`/`postgres`.

Executado em 21/09/2026: `=== M6 OK ===`, com o banco intacto depois do
rollback.
