"""Ensaio de S04/S05/S06/S07 num PostgreSQL descartável, SEM credenciais/rede externa.
Requer binários PostgreSQL locais; roda SQL funcional e duas conexões concorrentes.
O vetor é um domínio de fixture: não verifica extensão/algoritmo de reconhecimento.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PG_BIN = Path('/opt/homebrew/opt/postgresql@16/bin')
PORT = '55441'

def binary(name):
    candidate = PG_BIN / name
    return str(candidate) if candidate.exists() else shutil.which(name) or name

def run(args, **kwargs):
    out = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if out.returncode:
        raise RuntimeError(out.stderr)
    return out.stdout.strip()

with tempfile.TemporaryDirectory(prefix='iaschool-local-sql-') as temporary:
    base = Path(temporary)
    data = base / 'data'
    # Nunca herda URL/senha do produto nem lê arquivo .env.
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'SUPABASE')) and k != 'DATABASE_URL'}
    started = False
    try:
        run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '-E', 'UTF8'], env=env)
        run([binary('pg_ctl'), '-D', str(data), '-l', str(base / 'server.log'), '-o', f'-k {base} -p {PORT} -h ""', 'start'], env=env)
        started = True
        psql = [binary('psql'), '-h', str(base), '-p', PORT, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        def sql(text):
            return run(psql + ['-At', '-c', text], env=env)
        fixture = ROOT / 'rehearsal/local-adjustments-fixture.sql'
        # Somente a tipagem pgvector é substituída no fixture; produto não muda.
        review = base / 'review.sql'
        review.write_text((ROOT / 'fase5-review-media.sql').read_text().replace('extensions.vector(512)', 'extensions.vector'))
        open_link = ROOT / 'fase5-album-open-link.sql'
        paths = [fixture, ROOT / 'fase5-delivery-batches.sql', ROOT / 'fase5-person-regions.sql', review,
                 ROOT / 'fase5-adjustments-delivery-album.sql', open_link, ROOT / 'rehearsal/adjustments-reference-checks.sql', ROOT / 'rehearsal/adjustments-delivery-checks.sql']
        command = psql + ['-q']
        for path in paths:
            command += ['-f', str(path)]
        run(command, env=env)
        # Repetir DDL prova idempotência. O fixture e o roundtrip são exclusivos locais.
        run(psql + ['-q', '-f', str(ROOT / 'fase5-adjustments-delivery-album.sql')], env=env)
        run(psql + ['-q', '-f', str(ROOT / 'fase5-album-open-link.sql')], env=env)
        setup = base / 'setup.sql'
        setup.write_text((ROOT / 'rehearsal/adjustments-delivery-checks.sql').read_text().replace('rollback;', 'commit;'))
        run(psql + ['-q', '-f', str(setup)], env=env)
        recipient, batch, user = sql('select r.id,b.id,b.created_by from public.delivery_recipients r join public.delivery_batches b on b.id=r.batch_id limit 1').split('|')
        sql(f"update public.delivery_recipients set status='accepted' where id='{recipient}';insert into public.delivery_album_tokens(recipient_id,approval_version,token_hash,expires_at,created_by)values('{recipient}',(select approved_version from public.delivery_batches where id='{batch}'),repeat('2',64),now()+interval '24 hours','{user}')")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(sql, [f"select public.consume_delivery_album_token(repeat('2',64),repeat('{value}',64))" for value in ['3','4']]))
        results = [json.loads(value) for value in results]
        assert sum(value.get('ok') is True for value in results) == 2
        assert sum(value.get('error') == 'used' for value in results) == 0
        assert sql("select count(*) from public.delivery_access_sessions where session_hash in(repeat('3',64),repeat('4',64))") == '2'
        sql(f"insert into public.delivery_album_tokens(recipient_id,approval_version,token_hash,expires_at,created_by)values('{recipient}',(select approved_version from public.delivery_batches where id='{batch}'),repeat('5',64),now()+interval '24 hours','{user}')")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            operations = [pool.submit(sql, "select public.consume_delivery_album_token(repeat('5',64),repeat('6',64))"),
                          pool.submit(sql, f"begin;select set_config('request.jwt.claim.sub','{user}',true);select public.revoke_delivery_album('{recipient}');commit;")]
            for operation in operations:
                operation.result()
        assert json.loads(sql("select public.delivery_album_session(repeat('6',64))")).get('error') in ['revoked','unavailable']
        assert sql(f"select count(*) from public.delivery_access_sessions where recipient_id='{recipient}' and revoked_at is null") == '0'
        run(psql + ['-q', '-f', str(ROOT / 'rehearsal/original-delivery-migration-setup.sql')], env=env)
        run(psql + ['-q', '-f', str(ROOT / 'delivery-original-photos.sql')], env=env)
        run(psql + ['-q', '-f', str(ROOT / 'delivery-original-photos.sql')], env=env)
        run(psql + ['-q', '-f', str(ROOT / 'rehearsal/original-delivery-checks.sql')], env=env)
        print('SQL local S04–S07 + fotos nítidas: roundtrip, migração sem reprocessamento, consentimento, tenant, CAS, seleção, snapshot, link reutilizável e revogação passaram.')
    finally:
        if started:
            run([binary('pg_ctl'), '-D', str(data), '-m', 'immediate', 'stop'], env=env)
