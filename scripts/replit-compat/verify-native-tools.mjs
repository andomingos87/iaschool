#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { loadNativeTools } from './lib/native-tools.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

export async function verifyNativeTools() {
  const report = {
    package: '@workspace/r9-app',
    platform: process.platform,
    arch: process.arch,
    loaded: [],
    status: 'failed',
  };

  try {
    const loaded = await loadNativeTools();
    const vite = await run('corepack', ['pnpm', '--filter', '@workspace/r9-app', 'exec', 'vite', '--version']);
    report.loaded = loaded.loaded;
    report.viteVersion = vite.output.trim();
    if (vite.code !== 0) throw new Error(`Vite version command exited with code ${vite.code}`);
    report.status = 'passed';
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  return report;
}

const report = await verifyNativeTools();
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
