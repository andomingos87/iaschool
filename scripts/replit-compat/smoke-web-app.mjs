#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_ARGS = ['pnpm', '--filter', '@workspace/iaschool-app', 'exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '5173'];

function sanitize(output) {
  return output.replace(/\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)\s*=\s*[^\s]+/g, '[redacted]');
}

function lastLines(output) {
  return sanitize(output).split(/\r?\n/).filter(Boolean).slice(-80).join('\n');
}

async function defaultRequest(url) {
  return fetch(url, { signal: AbortSignal.timeout(1_000), redirect: 'manual' });
}

async function terminate(child, exit, shutdownTimeoutMs) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const stopped = await Promise.race([
      exit,
      new Promise((resolve) => setTimeout(() => resolve(null), shutdownTimeoutMs)),
    ]);
    if (stopped) return stopped;
  }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  return exit;
}

export async function runSmokeTest({
  command = 'corepack',
  args = DEFAULT_ARGS,
  url = 'http://127.0.0.1:5173/',
  request = defaultRequest,
  expectedBinding = url,
  timeoutMs = 30_000,
  shutdownTimeoutMs = 5_000,
} = {}) {
  let output = '';
  let startupError = null;
  let child;
  let exit;
  let result;

  try {
    child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '5173', BASE_PATH: '/' },
    });
    exit = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => { startupError = error; });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (startupError) {
        result = { ok: false, error: startupError.message, output: lastLines(output) };
        break;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        result = { ok: false, error: `server exited before responding (code ${child.exitCode ?? 'null'}, signal ${child.signalCode ?? 'none'})`, output: lastLines(output) };
        break;
      }
      try {
        const response = await request(url);
        if (response.status >= 200 && response.status < 400) {
          const serverOutput = lastLines(output);
          result = expectedBinding && serverOutput && !serverOutput.includes(expectedBinding)
            ? { ok: false, error: `server did not confirm binding ${expectedBinding}`, output: serverOutput }
            : { ok: true, status: response.status, output: serverOutput };
          break;
        }
        result = { ok: false, error: `HTTP ${response.status} from ${url}`, output: lastLines(output) };
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    result ??= { ok: false, error: `timed out after ${timeoutMs}ms waiting for ${url}`, output: lastLines(output) };
  } finally {
    const termination = child && exit ? await terminate(child, exit, shutdownTimeoutMs) : null;
    result ??= { ok: false, error: 'failed to start smoke process', output: lastLines(output) };
    result.termination = termination;
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runSmokeTest();
  if (result.ok) {
    console.log(`R9 smoke passed with HTTP ${result.status} at 127.0.0.1:5173.`);
  } else {
    console.error(`R9 smoke failed: ${result.error}`);
    if (result.output) console.error(result.output);
    process.exitCode = 1;
  }
}
