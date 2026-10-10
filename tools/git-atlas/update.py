#!/usr/bin/env python3
"""Read-only Git snapshot. No fetch or Git mutations.

A manual run also reads open GitHub pull requests with gh. Hooks do not.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit, urlunsplit

HERE = Path(__file__).resolve().parent
TZ = dt.timezone(dt.timedelta(hours=-3))


def now():
    return dt.datetime.now(TZ).isoformat()


def git_env():
    # Hooks export repository/index context. Never carry it into another worktree.
    env = {k: v for k, v in os.environ.items() if k not in {
        'GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
        'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_IMPLICIT_WORK_TREE', 'GIT_SHALLOW_FILE',
    }}
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', LC_ALL='C')
    return env


class Git:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def __call__(self, *args, optional=False, timeout=20):
        result = subprocess.run(
            ['git', '-c', 'core.quotePath=false', '-C', str(self.root), *args],
            env=git_env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout,
        )
        if result.returncode and not optional:
            # Do not echo stderr: transport errors can contain credentials/URLs.
            raise RuntimeError('Falha na consulta Git: ' + args[0])
        return result.stdout.decode('utf-8', errors='replace') if not result.returncode else ''

    def sha(self, ref):
        if not ref:
            return ''
        return self('rev-parse', '--verify', ref + '^{commit}', optional=True).strip()

    def comparison(self, base, tip):
        if not base or not tip:
            return None, None
        result = self('rev-list', '--left-right', '--count', base + '...' + tip, optional=True).split()
        return (int(result[1]), int(result[0])) if len(result) == 2 else (None, None)

    def commits(self, *args):
        raw = self('log', '--format=%H%x00%P%x00%cI%x00%s', *args, optional=True)
        return [dict(zip(('sha', 'parents', 'date', 'subject'), line.split('\0', 3)))
                for line in raw.splitlines() if line.count('\0') == 3]


def sanitize_url(value):
    if '://' not in value:
        return value
    parts = urlsplit(value)
    # Drop userinfo, query strings and fragments; these may carry credentials.
    return urlunsplit((parts.scheme, parts.netloc.rsplit('@', 1)[-1], parts.path, '', ''))


def changed_files(git):
    raw = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0')
    files, i = [], 0
    while i < len(raw) and raw[i]:
        entry = raw[i]
        item = {'index': entry[0], 'worktree': entry[1], 'path': entry[3:]}
        if entry[0] in 'RC' or entry[1] in 'RC':
            i += 1
            item['originalPath'] = raw[i]
        path = git.root / item['path']
        try:
            item['bytes'] = path.lstat().st_size
        except OSError:
            item['bytes'] = None
        files.append(item)
        i += 1
    return files


def read_refs(git, prefix):
    raw = git('for-each-ref', '--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(subject)', prefix)
    return [dict(zip(('ref', 'sha', 'upstream', 'date', 'subject'), line.split('\0', 4)))
            for line in raw.splitlines() if line.count('\0') == 4]


def empty_pull_requests():
    return {'queriedAt': None, 'error': None, 'items': []}


def check_conclusion(rollup):
    conclusion = rollup.get('conclusion')
    raw = conclusion or rollup.get('state') or rollup.get('status') or ''
    mapped = {
        'SUCCESS': 'sucesso', 'FAILURE': 'falha', 'ERROR': 'falha', 'TIMED_OUT': 'falha',
        'STARTUP_FAILURE': 'falha', 'CANCELLED': 'cancelado', 'SKIPPED': 'ignorado',
        'NEUTRAL': 'neutro', 'PENDING': 'pendente', 'QUEUED': 'pendente',
        'IN_PROGRESS': 'pendente', 'EXPECTED': 'pendente', 'STALE': 'pendente',
        'ACTION_REQUIRED': 'pendente',
    }
    return mapped.get(str(raw).upper(), 'outro' if raw else 'pendente')


def normalize_pull_requests(payload):
    items = []
    for pr in payload if isinstance(payload, list) else []:
        if not isinstance(pr, dict) or not isinstance(pr.get('number'), int):
            continue
        author = pr.get('author') if isinstance(pr.get('author'), dict) else {}
        checks = []
        for rollup in pr.get('statusCheckRollup') or []:
            if isinstance(rollup, dict):
                checks.append({
                    'name': str(rollup.get('name') or rollup.get('context') or 'check')[:120],
                    'conclusion': check_conclusion(rollup),
                })
        items.append({
            'number': pr['number'],
            'title': str(pr.get('title') or '')[:300],
            'draft': bool(pr.get('isDraft')),
            'url': sanitize_url(str(pr.get('url') or '')),
            'branch': str(pr.get('headRefName') or '')[:200],
            'author': str(author.get('login') or '')[:80],
            'updatedAt': pr.get('updatedAt') if isinstance(pr.get('updatedAt'), str) else None,
            'checks': checks[:40],
        })
    items.sort(key=lambda item: (item['draft'], -item['number']))
    return items[:40]


def query_pull_requests(root, remote_url):
    if 'github.com' not in (remote_url or ''):
        return {'queriedAt': None, 'error': 'A origin não é github.com.', 'items': []}
    command = [
        'gh', 'pr', 'list', '--state', 'open', '--limit', '40',
        '--json', 'number,title,isDraft,url,headRefName,author,statusCheckRollup,updatedAt',
    ]
    try:
        result = subprocess.run(
            command, cwd=root, env=git_env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=20, check=False,
        )
    except FileNotFoundError:
        return {'queriedAt': now(), 'error': 'O comando gh não está instalado.', 'items': []}
    except subprocess.TimeoutExpired:
        return {'queriedAt': now(), 'error': 'A consulta de PRs expirou.', 'items': []}
    except OSError:
        return {'queriedAt': now(), 'error': 'Não foi possível executar o gh.', 'items': []}
    if result.returncode:
        return {'queriedAt': now(), 'error': 'Não foi possível listar os PRs. Confira gh auth status.', 'items': []}
    try:
        payload = json.loads(result.stdout.decode('utf-8', errors='replace'))
    except json.JSONDecodeError:
        return {'queriedAt': now(), 'error': 'Resposta inválida do gh.', 'items': []}
    return {'queriedAt': now(), 'error': None, 'items': normalize_pull_requests(payload)}


def pull_requests_for(root, remote_url, previous, trigger):
    if trigger != 'manual':
        saved = (previous or {}).get('pullRequests')
        return saved if isinstance(saved, dict) and isinstance(saved.get('items'), list) else empty_pull_requests()
    return query_pull_requests(root, remote_url)


def build_cleanup(branches, worktrees, stashes, files, local_only, current, default, root, has_origin_refs):
    in_use = {current, default}
    root_path = Path(root).resolve()
    for tree in worktrees:
        if tree.get('exists') and str(tree.get('branch') or '').startswith('refs/heads/'):
            in_use.add(tree['branch'].removeprefix('refs/heads/'))
    branch_rows = []
    for branch in branches:
        if branch['name'] in in_use:
            continue
        if branch.get('ahead') == 0:
            branch_rows.append({
                'name': branch['name'], 'action': 'candidata',
                'reason': 'Sem commits exclusivos em relação a %s, e nenhuma pasta de trabalho a usa.' % default,
            })
        elif branch.get('ahead') is None:
            branch_rows.append({
                'name': branch['name'], 'action': 'revisar',
                'reason': 'Não deu para comparar com %s.' % default,
            })
    worktree_rows = []
    for tree in worktrees:
        path = str(tree.get('worktree') or '')
        if not path or tree.get('bare'):
            continue
        try:
            if Path(path).resolve() == root_path:
                continue
        except OSError:
            pass
        if tree.get('exists'):
            continue
        branch = str(tree.get('branch') or '').removeprefix('refs/heads/') or '(HEAD detached)'
        worktree_rows.append({
            'path': path, 'branch': branch, 'action': 'candidata',
            'reason': 'O Git ainda registra a pasta, mas ela não existe no disco.',
        })
    stash_rows = [{
        'ref': stash['ref'], 'subject': stash['subject'], 'date': stash['date'],
        'fileCount': len(stash.get('tracked') or []) + len(stash.get('untracked') or []),
        'action': 'revisar', 'reason': 'O Atlas não sabe se este stash ainda será usado.',
    } for stash in stashes]
    subjects = [commit['subject'] for commit in local_only[:12]]
    if has_origin_refs:
        commit_reason = 'Estes commits estão nas branches locais e não nas refs da origin desta cópia. Podem ser trabalho ainda não publicado.'
    else:
        commit_reason = 'Não há refs da origin nesta cópia. A lista é o histórico das branches locais, não uma prova de que falta publicar.'
    if len(local_only) > len(subjects):
        commit_reason += ' A lista mostra %s de %s.' % (len(subjects), len(local_only))
    staged = sum(1 for item in files if item.get('index') not in (' ', '?'))
    return {
        'branches': branch_rows,
        'worktrees': worktree_rows,
        'stashes': stash_rows,
        'localCommits': {'count': len(local_only), 'reason': commit_reason, 'subjects': subjects},
        'localChanges': {
            'count': len(files), 'staged': staged,
            'reason': 'Alterações sem commit. Não são descarte automático.',
        },
    }


def worktrees(git):
    result = []
    for block in git('worktree', 'list', '--porcelain', '-z').strip('\0').split('\0\0'):
        item = {}
        for line in block.split('\0'):
            key, _, value = line.partition(' ')
            item[key] = value
        if 'worktree' not in item:
            continue
        item['exists'] = Path(item['worktree']).is_dir()
        if item['exists'] and 'bare' not in item:
            item['files'] = changed_files(Git(item['worktree']))
        else:
            item['files'] = []
        result.append(item)
    return result


def collect(root, previous=None, remote=False, trigger='manual'):
    git = Git(root)
    root = git('rev-parse', '--show-toplevel').strip()
    git = Git(root)
    head = git.sha('HEAD')
    current = git('symbolic-ref', '--short', '-q', 'HEAD', optional=True).strip() or '(HEAD detached)'
    cached = {r['ref'][len('refs/remotes/origin/'):]: r for r in read_refs(git, 'refs/remotes/origin')
              if r['ref'] != 'refs/remotes/origin/HEAD'}
    default = git('symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD', optional=True).strip().removeprefix('origin/')
    default = default or ('master' if git.sha('master') or 'master' in cached else 'main')
    remote_url = sanitize_url(git('remote', 'get-url', 'origin', optional=True).strip())
    previous = previous or {}
    verification = previous.get('remoteVerification') if previous.get('remote') == remote_url else None
    if remote and remote_url:
        advertised = git('ls-remote', '--symref', 'origin', 'HEAD', 'refs/heads/*', timeout=25)
        live = {}
        for line in advertised.splitlines():
            value, _, ref = line.partition('\t')
            if value.startswith('ref: refs/heads/') and ref == 'HEAD':
                default = value.removeprefix('ref: refs/heads/')
            elif ref.startswith('refs/heads/') and re.fullmatch(r'[0-9a-f]{40,64}', value):
                live[ref.removeprefix('refs/heads/')] = value
        verification = {'at': now(), 'refs': live, 'default': default}
    advertised = verification['refs'] if remote and verification else {n: r['sha'] for n, r in cached.items()}
    remote_source = 'ls-remote' if remote and verification else 'local-refs'
    default_sha = advertised.get(default) or git.sha(default)
    base = default_sha if git.sha(default_sha) else git.sha('origin/' + default) or git.sha(default)
    trees = worktrees(git)
    branches = []
    for ref in read_refs(git, 'refs/heads'):
        name, sha = ref['ref'].removeprefix('refs/heads/'), ref['sha']
        ahead, behind = git.comparison(base, sha)
        up_ahead, up_behind = git.comparison(git.sha(ref['upstream']) if ref['upstream'] else None, sha)
        same_sha = advertised.get(name)
        same_ahead, same_behind = git.comparison(same_sha, sha)
        cherry = git('cherry', base, sha, optional=True).splitlines() if base else []
        branches.append({
            'name': name, 'sha': sha, 'upstream': ref['upstream'], 'date': ref['date'], 'subject': ref['subject'],
            'ahead': ahead, 'behind': behind, 'upAhead': up_ahead, 'upBehind': up_behind,
            'sameNameRemote': same_sha, 'sameNameAhead': same_ahead, 'sameNameBehind': same_behind,
            'patchNew': sum(x.startswith('+') for x in cherry), 'patchEquivalent': sum(x.startswith('-') for x in cherry),
            'worktree': next((w['worktree'] for w in trees if w.get('branch') == ref['ref']), None),
            'commits': git.commits(base + '..' + sha) if base else git.commits(sha),
        })
    remote_refs = []
    for name, sha in sorted(advertised.items()):
        available = bool(git.sha(sha))
        tip = git.commits('-1', sha) if available else []
        ahead, behind = git.comparison(base, sha) if available else (None, None)
        remote_refs.append({'name': name, 'sha': sha, 'date': tip[0]['date'] if tip else None,
                            'subject': tip[0]['subject'] if tip else 'Objeto ainda não baixado',
                            'ahead': ahead, 'behind': behind, 'objectAvailable': available,
                            'localName': name if any(b['name'] == name for b in branches) else None})
    stashes = []
    for line in git('stash', 'list', '--format=%gd%x00%H%x00%cI%x00%s').splitlines():
        ref, sha, date, subject = line.split('\0', 3)
        # --no-renames keeps each path unambiguous and avoids reading file content.
        tracked = git('diff', '--no-ext-diff', '--no-renames', '--name-status', '-z', sha + '^1', sha).split('\0')
        stashes.append({'ref': ref, 'sha': sha, 'date': date, 'subject': subject,
                        'tracked': [tracked[i] + '\t' + tracked[i + 1] for i in range(0, len(tracked) - 1, 2)],
                        'untracked': [p for p in git('ls-tree', '-r', '-z', '--name-only', sha + '^3', optional=True).split('\0') if p]})
    gitdir = Path(git('rev-parse', '--absolute-git-dir').strip())
    fetch_path = Path(git('rev-parse', '--path-format=absolute', '--git-path', 'FETCH_HEAD').strip())
    current_branch = next((b for b in branches if b['name'] == current), None)
    upstream = current_branch['upstream'] if current_branch else ''
    local_origin_refs = [r['ref'] for r in cached.values()]
    local_only = git.commits('--branches', '--not', *local_origin_refs) if local_origin_refs else git.commits('--branches')
    git_ops = [p for p in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply') if (gitdir / p).exists()]
    # Git removes some state files only after its success hook returns. Export
    # the completed operation, not its temporary cleanup markers.
    if trigger == 'post-rewrite':
        git_ops = [p for p in git_ops if p not in ('rebase-merge', 'rebase-apply')]
    if trigger in ('post-commit', 'post-merge') and 'MERGE_HEAD' in git_ops:
        parents = set(git('rev-list', '--parents', '-1', head).split()[1:])
        merge_heads = set((gitdir / 'MERGE_HEAD').read_text().splitlines())
        if merge_heads and merge_heads <= parents:
            git_ops.remove('MERGE_HEAD')
    changed = changed_files(git)
    return {
        'schemaVersion': 1, 'root': root, 'collectedAt': now(), 'trigger': trigger,
        'remote': remote_url, 'remoteDefault': default, 'remoteSource': remote_source,
        'remoteVerifiedAt': verification['at'] if verification else None, 'remoteVerification': verification,
        'remoteLiveCount': len(verification['refs']) if verification else None,
        'remoteDiff': {'new': sorted(set(advertised) - set(cached)), 'gone': sorted(set(cached) - set(advertised)),
                       'changed': sorted(n for n in advertised.keys() & cached.keys() if advertised[n] != cached[n]['sha'])},
        'current': current, 'head': head, 'originMaster': advertised.get(default), 'comparisonRef': 'origin/' + default if default in cached else default,
        'worktrees': trees, 'branches': branches, 'files': changed, 'stashes': stashes,
        'remoteRefs': remote_refs, 'remoteUnknown': [r['name'] for r in remote_refs if not r['objectAvailable']],
        'trackedCommits': git.commits('-16', base) if base else [],
        'headVsUpstream': git.commits(upstream + '..HEAD') if upstream and git.sha(upstream) else [],
        'localOnly': local_only,
        'masterGap': git.commits(default + '..' + base) if base and git.sha(default) else [],
        'fetchAt': dt.datetime.fromtimestamp(fetch_path.stat().st_mtime, TZ).isoformat() if fetch_path.exists() else None,
        'totalCommits': int(git('rev-list', '--all', '--count').strip() or '0'),
        'tags': git('tag', '--list').splitlines(),
        'gitOps': git_ops,
        'pullRequests': pull_requests_for(root, remote_url, previous, trigger),
        'cleanup': build_cleanup(branches, trees, stashes, changed, local_only, current, default, root, bool(local_origin_refs)),
    }


def update(root, output, remote=False, trigger='manual'):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with (output.parent / '.update.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            previous = json.loads(output.read_text())
        except (OSError, ValueError):
            previous = None
        snapshot = collect(root, previous, remote, trigger)
        temp = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='.git-state-', suffix='.tmp', dir=output.parent, delete=False) as f:
                temp = Path(f.name)
                json.dump(snapshot, f, ensure_ascii=False, indent=2)
                f.write('\n')
                f.flush()
                os.fsync(f.fileno())
            temp.replace(output)
        finally:
            if temp and temp.exists():
                temp.unlink()
        return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=HERE.parent.parent)
    parser.add_argument('--output', type=Path, default=HERE / 'git-state.json')
    parser.add_argument('--remote', action='store_true', help='Consultar origin sem fetch (somente leitura).')
    parser.add_argument('--trigger', default='manual')
    args = parser.parse_args()
    try:
        result = update(args.repo, args.output, args.remote, args.trigger)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        parser.exit(1, 'Git Atlas: atualização falhou; o JSON anterior foi preservado.\n')
    print('Git Atlas atualizado: ' + result['collectedAt'])


if __name__ == '__main__':
    main()
