import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTextConfiguration } from '../lib/preflight.mjs';

test('flags a Replit Linux-only Rollup exclusion', () => {
  const report = inspectTextConfiguration({
    workspaceYaml: 'overrides:\n  "rollup>@rollup/rollup-darwin-arm64": "-"\n',
    hasReplitConfig: true,
    platform: 'darwin',
    arch: 'arm64',
  });

  assert.deepEqual(report.blockers, [{
    package: '@rollup/rollup-darwin-arm64',
    reason: 'platform-native-binary-excluded',
  }]);
});
