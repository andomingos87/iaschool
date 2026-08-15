import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeToolReport } from '../lib/native-tools.mjs';

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
