import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectRepository, inspectTextConfiguration } from '../lib/preflight.mjs';

test('flags a Darwin Rollup exclusion', () => {
  const report = inspectTextConfiguration({
    workspaceYaml: 'overrides:\n  "rollup>@rollup/rollup-darwin-arm64": "-"\n',
    hasReplitConfig: true,
    platform: 'darwin',
    arch: 'arm64',
  });

  assert.deepEqual(report.blockers, [{
    package: '@rollup/rollup-darwin-arm64',
    reason: 'platform-native-binary-excluded',
  }]);
});

test('reports lockfile and Replit documentation metadata with blocker source paths', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'replit-preflight-'));
  await mkdir(join(rootDir, 'scripts'), { recursive: true });
  await writeFile(join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\noverrides:\n  \'rollup>@rollup/rollup-darwin-arm64\': \'-\'\n');
  await writeFile(join(rootDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\npackages:\n  vite@7.3.2: {}\n');
  await writeFile(join(rootDir, 'replit.md'), '# Compatibility notes\nUse the web workflow.\n');
  await writeFile(join(rootDir, '.replit'), 'modules = ["nodejs-24"]\n');
  await writeFile(join(rootDir, 'package.json'), '{"name":"fixture"}\n');

  const report = await inspectRepository(rootDir);
  assert.deepEqual(report.sourceFiles, {
    lockfile: { path: 'pnpm-lock.yaml', present: true, lockfileVersion: 9 },
    replitDocumentation: { path: 'replit.md', present: true, heading: 'Compatibility notes' },
  });
  assert.equal(report.blockers[0].sourcePath, 'pnpm-workspace.yaml');
  assert.equal(report.proposedRecipe, 'pnpm-workspace-vite-cross-platform');
});

test('exits 2 for an unsupported repository without a known recipe', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'replit-unsupported-'));
  await writeFile(join(rootDir, 'package.json'), '{"name":"unsupported"}\n');
  await writeFile(join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(join(rootDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  await writeFile(join(rootDir, 'replit.md'), '# Unsupported\n');

  const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts/replit-compat/preflight.mjs')], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /"proposedRecipe": null/);
});

test('runbook lists the reproducible bootstrap commands', async () => {
  const runbook = await readFile('docs/development/replit-cross-platform.md', 'utf8');

  assert.match(runbook, /corepack pnpm install --frozen-lockfile/);
  assert.match(runbook, /pnpm run replit:verify-native/);
  assert.match(runbook, /pnpm run replit:smoke:web/);
});
