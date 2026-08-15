import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { runSmokeTest } from '../smoke-r9-app.mjs';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function runTemporaryServer(statusCode) {
  const directory = await mkdtemp(join(tmpdir(), 'r9-smoke-'));
  const marker = join(directory, 'terminated');
  const port = await availablePort();
  const source = [
    "const http = require('node:http');",
    "const fs = require('node:fs');",
    `const marker = ${JSON.stringify(marker)};`,
    `const server = http.createServer((request, response) => { response.writeHead(${statusCode}); response.end('ok'); });`,
    `server.listen(${port}, '127.0.0.1');`,
    "process.on('SIGTERM', () => server.close(() => { fs.writeFileSync(marker, 'terminated'); process.exit(0); }));",
  ].join(' ');

  const result = await runSmokeTest({
    command: process.execPath,
    args: ['-e', source],
    url: `http://127.0.0.1:${port}/`,
    timeoutMs: 5_000,
    shutdownTimeoutMs: 1_000,
  });

  return { marker, result };
}

test('terminates the temporary server after a successful HTTP request', async () => {
  const { marker, result } = await runTemporaryServer(200);

  assert.equal(result.ok, true);
  assert.equal(await readFile(marker, 'utf8'), 'terminated');
});

test('terminates the temporary server after a failed HTTP request', async () => {
  const { marker, result } = await runTemporaryServer(500);

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 500/);
  assert.equal(await readFile(marker, 'utf8'), 'terminated');
});
