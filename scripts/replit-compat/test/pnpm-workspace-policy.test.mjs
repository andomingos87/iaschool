import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePnpmWorkspacePolicy } from '../lib/workspace-policy.mjs';

test('accepts a cross-platform pnpm workspace native-tool policy', () => {
  const result = validatePnpmWorkspacePolicy({
    packageJson: { packageManager: 'pnpm@11.17.0' },
    workspaceYaml: 'allowBuilds:\n  esbuild: true\n',
  });

  assert.deepEqual(result.errors, []);
});

test('rejects native package overrides set to a dash', () => {
  const result = validatePnpmWorkspacePolicy({
    packageJson: { packageManager: 'pnpm@11.17.0' },
    workspaceYaml: 'overrides:\n  "rollup>@rollup/rollup-darwin-arm64": "-"\n',
  });

  assert.match(result.errors[0], /rollup-darwin-arm64/);
});
