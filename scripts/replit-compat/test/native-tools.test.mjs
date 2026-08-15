import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeToolReport } from '../lib/native-tools.mjs';
import { verifyNativeTools } from '../verify-native-tools.mjs';

test('rejects a native tool report that omits Rollup', () => {
  assert.throws(
    () => assertNativeToolReport({ loaded: ['esbuild', 'lightningcss', 'vite'] }),
    /rollup/,
  );
});

test('accepts a report that loaded every required native tool', () => {
  assert.doesNotThrow(() => {
    assertNativeToolReport({ loaded: ['rollup', 'esbuild', 'lightningcss', 'vite'] });
  });
});

test('keeps loaded native tool names when the Vite CLI check fails', async () => {
  const report = await verifyNativeTools({
    runCommand: async () => ({ code: 1, output: 'Vite unavailable' }),
  });

  assert.equal(report.status, 'failed');
  assert.deepEqual(report.loaded, ['rollup', 'esbuild', 'lightningcss', 'vite']);
  assert.equal(report.viteVersion, 'Vite unavailable');
});
