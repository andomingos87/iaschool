import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const NATIVE_TOOLING = ['rollup', 'esbuild', 'lightningcss', '@tailwindcss/oxide'];

const platformPackagePatterns = {
  darwin: /(?:@rollup\/rollup-darwin|@esbuild\/darwin|@tailwindcss\/oxide-darwin|lightningcss-darwin)-[^\s\"']+/,
};

function excludedPackages(workspaceYaml, platform, arch) {
  const packages = new Set();
  const pattern = platformPackagePatterns[platform];
  if (!pattern) return packages;

  for (const line of workspaceYaml.split(/\r?\n/)) {
    if (!line.includes('"-"') && !line.includes("'-'")) continue;
    const match = line.match(/(?:^|\")([^\"]+)(?:\"|'):\s*["']-["']/);
    if (!match) continue;
    const packageName = match[1].split('>').pop();
    if (!pattern.test(packageName)) continue;
    if (arch && !packageName.includes(arch)) continue;
    packages.add(packageName);
  }
  return packages;
}

export function inspectTextConfiguration({
  workspaceYaml = '',
  hasReplitConfig = false,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const blockers = [...excludedPackages(workspaceYaml, platform, arch)].map((packageName) => ({
    package: packageName,
    reason: 'platform-native-binary-excluded',
  }));

  return {
    kind: 'pnpm-workspace-vite',
    platform,
    arch,
    hasReplitConfig,
    blockers,
    nativeTooling: NATIVE_TOOLING,
    proposedRecipe: 'pnpm-workspace-vite-cross-platform',
  };
}

export async function inspectRepository(rootDir) {
  const [workspaceYaml, packageJson] = await Promise.all([
    readFile(join(rootDir, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(join(rootDir, 'package.json'), 'utf8'),
  ]);

  let hasReplitConfig = true;
  try {
    await readFile(join(rootDir, '.replit'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    hasReplitConfig = false;
  }

  const report = inspectTextConfiguration({
    workspaceYaml,
    hasReplitConfig,
    platform: process.platform,
    arch: process.arch,
  });

  // Keep the package read part of the preflight contract without emitting its
  // contents: configuration text and filenames are safe, secrets are not.
  JSON.parse(packageJson);
  return report;
}
