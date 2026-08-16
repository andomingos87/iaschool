const NATIVE_OVERRIDE_PATTERN = /(?:^|>)(?:@esbuild\/(?:aix|android|darwin|freebsd|linux|netbsd|openbsd|openharmony|sunos|win32)-|lightningcss-(?:android|darwin|freebsd|linux|win32)-|@tailwindcss\/oxide-(?:android|darwin|freebsd|linux|win32)-|@rollup\/rollup-(?:android|darwin|freebsd|linux|openbsd|openharmony|win32)-|@expo\/ngrok-bin-(?:darwin|freebsd|linux|sunos|win32)-)/;

export function validatePnpmWorkspacePolicy({ packageJson = {}, workspaceYaml = '' } = {}) {
  const errors = [];

  if (packageJson.packageManager !== 'pnpm@11.17.0') {
    errors.push('package.json must pin packageManager to pnpm@11.17.0');
  }

  for (const line of workspaceYaml.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([^:]+?))\s*:\s*["']-["']/);
    const packageName = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
    if (packageName && NATIVE_OVERRIDE_PATTERN.test(packageName)) {
      errors.push(`pnpm-workspace.yaml excludes native package override: ${packageName}`);
    }
  }

  if (!/^allowBuilds:\s*\n\s+esbuild:\s*true\s*$/m.test(workspaceYaml)) {
    errors.push('pnpm-workspace.yaml must allow esbuild builds');
  }

  return { errors };
}
