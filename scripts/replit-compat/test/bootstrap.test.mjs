import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runbook lists the reproducible bootstrap commands', async () => {
  const runbook = await readFile('docs/development/cross-platform-web.md', 'utf8');

  assert.match(runbook, /corepack pnpm install --frozen-lockfile/);
  assert.match(runbook, /pnpm run verify:native/);
  assert.match(runbook, /pnpm run smoke:web/);
});

test('CI tests macOS, Ubuntu and Windows', async () => {
  const workflow = await readFile('.github/workflows/cross-platform-web.yml', 'utf8');

  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /verify:native/);
  assert.match(workflow, /smoke:web/);
  assert.match(workflow, /test:compat/);
});
