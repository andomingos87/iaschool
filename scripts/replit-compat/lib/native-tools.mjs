import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const REQUIRED_NATIVE_TOOLS = ['rollup', 'esbuild', 'lightningcss', 'vite'];
const r9Require = createRequire(new URL('../../../artifacts/r9-app/package.json', import.meta.url));
const viteRequire = createRequire(r9Require.resolve('vite'));

export function assertNativeToolReport(report) {
  const loaded = new Set(report?.loaded ?? []);
  for (const tool of REQUIRED_NATIVE_TOOLS) {
    if (!loaded.has(tool)) {
      throw new Error(`native tool report is missing ${tool}`);
    }
  }
  return report;
}

export async function loadNativeTools() {
  const loaded = [];
  for (const tool of REQUIRED_NATIVE_TOOLS) {
    await import(pathToFileURL(viteRequire.resolve(tool)).href);
    loaded.push(tool);
  }
  return assertNativeToolReport({ loaded });
}
