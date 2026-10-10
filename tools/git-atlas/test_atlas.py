"""Behavioral checks in disposable repositories; never commit in the real project."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import socket

from serve import bind_server
from update import Git, HERE, collect, normalize_pull_requests, sanitize_url, update


class AtlasTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='atlas test ')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'project with spaces'
        self.repo.mkdir()
        self.git('init', '-b', 'master')
        self.git('config', 'user.name', 'Atlas Test')
        self.git('config', 'user.email', 'atlas@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        (self.repo / 'file.txt').write_text('first\n')
        self.git('add', 'file.txt')
        self.git('commit', '-m', 'Initial')
        self.atlas = self.repo / 'tools' / 'git-atlas'
        self.atlas.mkdir(parents=True)
        for name in ('update.py', 'install_hook.py', '.gitignore'):
            shutil.copyfile(HERE / name, self.atlas / name)
        self.output = self.atlas / 'git-state.json'
        self.env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')

    def git(self, *args, cwd=None, env=None):
        return subprocess.run(['git', '-C', str(cwd or self.repo), *args],
                              capture_output=True, text=True, check=True, env=env).stdout.strip()

    def install(self, *args, check=True):
        return subprocess.run([sys.executable, str(self.atlas / 'install_hook.py'), *args],
                              capture_output=True, text=True, env=self.env, check=check)

    def test_post_commit_and_worktree_hook_update_canonical_json(self):
        self.install()
        first = update(self.repo, self.output)
        self.git('commit', '--allow-empty', '-m', 'Second', env=self.env)
        second = json.loads(self.output.read_text())
        self.assertNotEqual(first['head'], second['head'])
        self.assertEqual(second['head'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(second['trigger'], 'post-commit')
        self.assertEqual(second['remoteSource'], 'local-refs')
        self.assertEqual(self.git('check-ignore', str(self.output)), str(self.output))
        worktree = self.base / 'worktree with spaces'
        self.git('worktree', 'add', '-b', 'feature', str(worktree))
        (worktree / 'worktree.txt').write_text('new\n')
        self.git('add', 'worktree.txt', cwd=worktree)
        self.git('commit', '-m', 'Worktree commit', cwd=worktree, env=self.env)
        third = json.loads(self.output.read_text())
        self.assertEqual(third['root'], str(self.repo.resolve()))
        self.assertEqual(third['head'], second['head'])
        feature = next(b for b in third['branches'] if b['name'] == 'feature')
        self.assertEqual(feature['sha'], self.git('rev-parse', 'HEAD', cwd=worktree))
        self.assertEqual(len(third['worktrees']), 2)

    def test_status_keeps_index_rename_and_unusual_paths(self):
        self.git('mv', 'file.txt', 'new name.txt')
        (self.repo / 'untracked\twith\nnewline.txt').write_text('content')
        data = collect(self.repo)
        renamed = next(f for f in data['files'] if f['path'] == 'new name.txt')
        self.assertEqual(renamed['index'], 'R')
        self.assertEqual(renamed['worktree'], ' ')
        self.assertEqual(renamed['originalPath'], 'file.txt')
        self.assertTrue(any(f['path'] == 'untracked\twith\nnewline.txt' for f in data['files']))

    def test_origin_live_then_cached_is_honest(self):
        origin = self.base / 'origin.git'
        self.git('init', '--bare', str(origin))
        self.git('remote', 'add', 'origin', str(origin))
        self.git('push', '-u', 'origin', 'master')
        # A new remote ref, not fetched, is visible only via ls-remote.
        self.git('--git-dir=' + str(origin), 'update-ref', 'refs/heads/remote-only', 'refs/heads/master')
        live = update(self.repo, self.output, remote=True)
        self.assertEqual(live['remoteSource'], 'ls-remote')
        self.assertEqual(live['remoteDiff']['new'], ['remote-only'])
        self.assertTrue(live['remoteVerifiedAt'])
        cached = update(self.repo, self.output)
        self.assertEqual(cached['remoteSource'], 'local-refs')
        self.assertEqual(cached['remoteVerifiedAt'], live['remoteVerifiedAt'])
        self.assertEqual([r['name'] for r in cached['remoteRefs']], ['master'])

    def test_failed_collection_preserves_snapshot_and_commit(self):
        update(self.repo, self.output)
        before = self.output.read_bytes()
        with patch('update.collect', side_effect=RuntimeError('failed')):
            with self.assertRaises(RuntimeError):
                update(self.repo, self.output)
        self.assertEqual(self.output.read_bytes(), before)
        self.install()
        (self.atlas / 'update.py').write_text('raise RuntimeError("simulated failure")\n')
        old_head = self.git('rev-parse', 'HEAD')
        self.git('commit', '--allow-empty', '-m', 'Commit survives', env=self.env)
        self.assertNotEqual(old_head, self.git('rev-parse', 'HEAD'))
        self.assertEqual(self.output.read_bytes(), before)

    def test_installer_preserves_other_hooks_and_configuration(self):
        target = self.repo / '.git' / 'hooks' / 'post-commit'
        original = '#!/bin/sh\nprintf existing\n'
        target.write_text(original)
        self.assertNotEqual(self.install(check=False).returncode, 0)
        self.assertEqual(target.read_text(), original)
        target.unlink()
        self.install()
        text = target.read_text()
        self.install()
        self.assertEqual(target.read_text(), text)
        self.install('--remove')
        for name in ('post-commit', 'post-merge', 'post-rewrite'):
            self.assertFalse((target.parent / name).exists())
        self.git('config', 'core.hooksPath', '.hooks')
        self.assertNotEqual(self.install(check=False).returncode, 0)
        self.assertEqual(self.git('config', '--get', 'core.hooksPath'), '.hooks')

    def test_conflicting_merge_hook_does_not_partially_install(self):
        directory = self.repo / '.git' / 'hooks'
        existing = directory / 'post-merge'
        existing.write_text('#!/bin/sh\nprintf existing\n')
        self.assertNotEqual(self.install(check=False).returncode, 0)
        self.assertFalse((directory / 'post-commit').exists())
        self.assertFalse((directory / 'post-rewrite').exists())
        self.assertEqual(existing.read_text(), '#!/bin/sh\nprintf existing\n')

    def remote_clone(self):
        origin = self.base / 'origin.git'
        self.git('init', '--bare', '-b', 'master', str(origin))
        self.git('remote', 'add', 'origin', str(origin))
        self.git('push', '-u', 'origin', 'master')
        peer = self.base / 'remote contributor'
        self.git('clone', str(origin), str(peer))
        self.git('config', 'user.name', 'Remote Test', cwd=peer)
        self.git('config', 'user.email', 'remote@example.invalid', cwd=peer)
        self.git('config', 'commit.gpgsign', 'false', cwd=peer)
        return peer

    def add_commit(self, filename, cwd=None):
        (Path(cwd or self.repo) / filename).write_text(filename + '\n')
        self.git('add', filename, cwd=cwd)
        self.git('commit', '-m', filename, cwd=cwd, env=self.env)

    def assert_snapshot(self, trigger):
        snapshot = json.loads(self.output.read_text())
        self.assertEqual(snapshot['trigger'], trigger)
        self.assertEqual(snapshot['head'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(snapshot['current'], 'master')
        self.assertEqual(snapshot['gitOps'], [])
        self.assertEqual(next(b for b in snapshot['branches'] if b['name'] == 'master')['sha'], snapshot['head'])
        self.assertFalse(any(f['path'] in ('local.txt', 'remote.txt') for f in snapshot['files']))
        return snapshot

    def test_pull_fast_forward_refreshes_after_files_are_updated(self):
        peer = self.remote_clone()
        self.install()
        update(self.repo, self.output)
        self.add_commit('remote.txt', peer)
        self.git('push', cwd=peer)
        self.git('pull', '--ff-only', env=self.env)
        self.assert_snapshot('post-merge')
        self.assertTrue((self.repo / 'remote.txt').exists())

    def test_merge_commit_refreshes_snapshot(self):
        self.git('checkout', '-b', 'feature')
        self.add_commit('remote.txt')
        self.git('checkout', 'master')
        self.add_commit('local.txt')
        self.install()
        update(self.repo, self.output)
        self.git('merge', '--no-ff', '--no-edit', 'feature', env=self.env)
        self.assert_snapshot('post-merge')
        self.assertEqual(len(self.git('rev-list', '--parents', '-1', 'HEAD').split()), 3)

    def test_pull_rebase_refreshes_final_branch_and_skips_duplicate_amend(self):
        peer = self.remote_clone()
        self.install()
        self.add_commit('local.txt')
        self.add_commit('remote.txt', peer)
        self.git('push', cwd=peer)
        self.git('pull', '--rebase', env=self.env)
        self.assert_snapshot('post-rewrite')
        self.git('commit', '--amend', '--no-edit', env=self.env)
        self.assert_snapshot('post-commit')

    def test_conflicted_merge_keeps_previous_snapshot(self):
        self.git('checkout', '-b', 'conflict')
        (self.repo / 'file.txt').write_text('feature\n')
        self.git('commit', '-am', 'Feature change')
        self.git('checkout', 'master')
        (self.repo / 'file.txt').write_text('master\n')
        self.git('commit', '-am', 'Master change')
        self.install()
        update(self.repo, self.output)
        before = self.output.read_bytes()
        with self.assertRaises(subprocess.CalledProcessError):
            self.git('merge', '--no-edit', 'conflict', env=self.env)
        self.assertEqual(self.output.read_bytes(), before)

    def test_credentials_are_not_exported(self):
        self.assertEqual(sanitize_url('https://user:secret@github.com/org/repo?token=secret#secret'),
                         'https://github.com/org/repo')

    def test_occupied_port_uses_the_next_free_one(self):
        held = socket.socket()
        held.bind(('127.0.0.1', 0))
        held.listen(1)
        self.addCleanup(held.close)
        port = held.getsockname()[1]
        server = bind_server(port, attempts=5)
        self.addCleanup(server.server_close)
        self.assertNotEqual(server.server_address[1], port)
        self.assertGreater(server.server_address[1], port)
        self.assertLess(server.server_address[1], port + 5)

    def test_pull_request_checks_drop_secrets(self):
        items = normalize_pull_requests([{
            'number': 7, 'title': 'Arruma o header', 'isDraft': True,
            'url': 'https://user:token@github.com/acme/atlas/pull/7?token=secret',
            'headRefName': 'feature', 'author': {'login': 'ana'},
            'updatedAt': '2026-10-07T12:00:00Z',
            'statusCheckRollup': [
                {'name': 'unit', 'status': 'COMPLETED', 'conclusion': 'SUCCESS'},
                {'name': 'e2e', 'status': 'IN_PROGRESS', 'conclusion': None},
                {'context': 'ci/lint', 'state': 'FAILURE'},
            ],
        }, {
            'number': 3, 'title': 'Aberto', 'isDraft': False, 'url': 'https://github.com/acme/atlas/pull/3',
            'headRefName': 'main', 'author': {'login': 'bia'}, 'updatedAt': None,
            'statusCheckRollup': [],
        }])
        self.assertEqual([item['number'] for item in items], [3, 7])
        draft = items[1]
        self.assertTrue(draft['draft'])
        self.assertEqual(draft['url'], 'https://github.com/acme/atlas/pull/7')
        self.assertEqual([check['conclusion'] for check in draft['checks']], ['sucesso', 'pendente', 'falha'])
        self.assertNotIn('token', draft['url'])

    def test_cleanup_marks_merged_unused_branch_and_keeps_unique_work(self):
        self.git('checkout', '-b', 'done')
        self.add_commit('done.txt')
        self.git('checkout', 'master')
        self.git('merge', '--ff-only', 'done')
        self.git('checkout', '-b', 'wip')
        self.add_commit('wip.txt')
        self.git('checkout', 'master')
        (self.repo / 'file.txt').write_text('dirty\n')
        self.git('stash', 'push', '-m', 'guardar')
        data = collect(self.repo)
        actions = {branch['name']: branch['action'] for branch in data['cleanup']['branches']}
        self.assertEqual(actions.get('done'), 'candidata')
        self.assertNotIn('wip', actions)
        self.assertNotIn('master', actions)
        self.assertEqual(data['cleanup']['stashes'][0]['action'], 'revisar')
        self.assertIn('guardar', data['cleanup']['stashes'][0]['subject'])
        self.assertEqual(data['pullRequests']['items'], [])
        self.assertIn('github.com', data['pullRequests']['error'])

    def test_hook_trigger_keeps_previous_pull_requests(self):
        previous = collect(self.repo)
        previous['pullRequests'] = {
            'queriedAt': '2026-10-07T12:00:00-03:00', 'error': None,
            'items': [{
                'number': 1, 'title': 't', 'draft': False,
                'url': 'https://github.com/acme/atlas/pull/1', 'branch': 'feature',
                'author': 'ana', 'updatedAt': None, 'checks': [{'name': 'unit', 'conclusion': 'sucesso'}],
            }],
        }
        again = collect(self.repo, previous, trigger='post-commit')
        self.assertEqual(again['pullRequests'], previous['pullRequests'])


if __name__ == '__main__':
    unittest.main()
