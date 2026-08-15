#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_ARGS = ['pnpm', '--filter', '@workspace/r9-app', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'];

function sanitize(output) {
  return output.replace(/\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)\s*=\s*[^\s]+/g, '[redacted]');
}

function lastLines(output) {
  return sanitize(output).split(/\r?\n/).filter(Boolean).slice(-80).join('\n');
}

function waitForExit(child) {
  return new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
}

async function terminate(child, shutdownTimeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

export async function runSmokeTest({
  command = 'corepack',
  args = DEFAULT_ARGS,
  url = 'http://127.0.0.1:5173/',
  timeoutMs = 30_000,
  shutdownTimeoutMs = 5_000,
} = {}) {
  let child;
  let output = '';
  try {
    child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '5173', BASE_PATH: '/' },
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    const startupFailure = new Promise((resolve) => {
      child.once('error', (error) => resolve(error));
    });
    const deadline = Date.now() + timeoutMs;
    let failure;

    while (Date.now() < deadline) {
      const failureEvent = await Promise.race([
        startupFailure,
        new Promise((resolve) => setTimeout(() => resolve(null), 0)),
      ]);
      if (failureEvent) {
        failure = failureEvent.message;
        break;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        failure = `server exited before responding (code ${child.exitCode ?? 'null'}, signal ${child.signalCode ?? 'none'})`;
        break;
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000), redirect: 'manual' });
        if (response.status >= 200 && response.status < 400) {
          return { ok: true, status: response.status, output: lastLines(output) };
        }
        failure = `HTTP ${response.status} from ${url}`;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    return { ok: false, error: failure ?? `timed out after ${timeoutMs}ms waiting for ${url}`, output: lastLines(output) };
  } finally {
    if (child) await terminate(child, shutdownTimeoutMs);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runSmokeTest();
  if (result.ok) {
    console.log(`R9 smoke passed with HTTP ${result.status}.`);
  } else {
    console.error(`R9 smoke failed: ${result.error}`);
    if (result.output) console.error(result.output);
    process.exitCode = 1;
  }
}
