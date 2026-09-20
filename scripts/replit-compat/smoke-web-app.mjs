#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { COREPACK, spawnOptionsFor } from './lib/corepack.mjs';

const DEFAULT_ARGS = ['pnpm', '--filter', '@workspace/iaschool-app', 'exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '5173'];

// O Vite 7 colore a saída mesmo sem TTY e imprime o banner como
// `http://127.0.0.1:\u001B[1m5173\u001B[22m/` — com o negrito no meio da
// porta. Sem remover o escape, a conferência do binding não casa e o smoke
// reprova um servidor que subiu e respondeu.
function stripAnsi(output) {
  // eslint-disable-next-line no-control-regex
  return output.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}

function sanitize(output) {
  return output.replace(/\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)\s*=\s*[^\s]+/g, '[redacted]');
}

function lastLines(output) {
  return sanitize(output).split(/\r?\n/).filter(Boolean).slice(-80).join('\n');
}

async function defaultRequest(url) {
  return fetch(url, { signal: AbortSignal.timeout(1_000), redirect: 'manual' });
}

// O comando do smoke é uma árvore: corepack -> pnpm -> vite (no Windows, com um
// cmd.exe na frente). `child.kill()` atinge só a raiz, e os netos herdam os
// pipes de stdout/stderr — por isso a promessa abaixo escuta 'exit' e não
// 'close': 'close' espera os pipes fecharem, e um neto vivo os segura para
// sempre. No Windows não há propagação de sinal nenhuma, então a árvore é
// encerrada com `taskkill /T`, ou o Vite sobrevive ao fim do teste.
function killTree(child) {
  if (process.platform !== 'win32') return false;
  try {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function terminate(child, exit, shutdownTimeoutMs) {
  if (child.exitCode === null && child.signalCode === null) {
    if (!killTree(child)) child.kill('SIGTERM');
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
  command = COREPACK,
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
      ...spawnOptionsFor(command),
    });
    exit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
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
          result = expectedBinding && serverOutput && !stripAnsi(serverOutput).includes(expectedBinding)
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
    console.log(`IAschool smoke passed with HTTP ${result.status} at 127.0.0.1:5173.`);
  } else {
    console.error(`IAschool smoke failed: ${result.error}`);
    if (result.output) console.error(result.output);
    process.exitCode = 1;
  }
}
