#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadNativeTools } from './lib/native-tools.mjs';
import { COREPACK, spawnOptionsFor } from './lib/corepack.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptionsFor(command) });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

export async function verifyNativeTools({ runCommand = run } = {}) {
  const report = {
    package: '@workspace/iaschool-app',
    platform: process.platform,
    arch: process.arch,
    loaded: [],
    status: 'failed',
  };

  try {
    const loaded = await loadNativeTools();
    report.loaded = loaded.loaded;
    const vite = await runCommand(COREPACK, ['pnpm', '--filter', '@workspace/iaschool-app', 'exec', 'vite', '--version']);
    report.viteVersion = vite.output.trim();
    if (vite.code !== 0) throw new Error(`Vite version command exited with code ${vite.code}`);
    report.status = 'passed';
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await verifyNativeTools();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}
