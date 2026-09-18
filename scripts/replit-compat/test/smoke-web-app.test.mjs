import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runSmokeTest } from '../smoke-web-app.mjs';

async function waitForFile(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function runTemporaryProcess(statusCode, { ignoreSigterm = false } = {}) {
  const directory = await mkdtemp('/tmp/r9-smoke-');
  const marker = join(directory, 'terminated');
  const ready = join(directory, 'ready');
  const source = [
    "const fs = require('node:fs');",
    `const marker = ${JSON.stringify(marker)};`,
    `fs.writeFileSync(${JSON.stringify(ready)}, 'ready');`,
    ignoreSigterm
      ? "process.on('SIGTERM', () => {});"
      : "process.on('SIGTERM', () => { fs.writeFileSync(marker, 'terminated'); process.exit(0); });",
    'setInterval(() => {}, 1_000);',
  ].join(' ');

  const result = await runSmokeTest({
    command: process.execPath,
    args: ['-e', source],
    url: 'http://r9.test/',
    request: async () => {
      await waitForFile(ready);
      return { status: statusCode };
    },
    expectedBinding: null,
    timeoutMs: 5_000,
    shutdownTimeoutMs: 100,
  });

  return { marker, result };
}

test('terminates the smoke child after a successful HTTP response', async () => {
  const { marker, result } = await runTemporaryProcess(200);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(await readFile(marker, 'utf8'), 'terminated');
});

test('terminates the smoke child after a failed HTTP response', async () => {
  const { marker, result } = await runTemporaryProcess(500);

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 500/, JSON.stringify(result));
  assert.equal(await readFile(marker, 'utf8'), 'terminated');
});

test('accepts HTTP success when the child prints no bind banner', async () => {
  const directory = await mkdtemp('/tmp/r9-smoke-');
  const ready = join(directory, 'ready');
  const source = [
    "const fs = require('node:fs');",
    `fs.writeFileSync(${JSON.stringify(ready)}, 'ready');`,
    'setInterval(() => {}, 1_000);',
  ].join(' ');

  const result = await runSmokeTest({
    command: process.execPath,
    args: ['-e', source],
    url: 'http://r9.test/',
    request: async () => {
      await waitForFile(ready);
      return { status: 200 };
    },
    expectedBinding: 'http://127.0.0.1:5173/',
    timeoutMs: 5_000,
    shutdownTimeoutMs: 100,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
});

test('waits for child close after escalating shutdown to SIGKILL', async () => {
  const { result } = await runTemporaryProcess(200, { ignoreSigterm: true });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.termination, { code: null, signal: 'SIGKILL' });
});
