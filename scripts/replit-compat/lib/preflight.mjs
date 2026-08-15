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
    const match = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([^:]+?))\s*:\s*["']-["']/);
    if (!match) continue;
    const packageName = (match[1] ?? match[2] ?? match[3]).trim().split('>').pop();
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
  knownRecipe = true,
  sourcePath = null,
  sourceFiles = undefined,
} = {}) {
  const blockers = [...excludedPackages(workspaceYaml, platform, arch)].map((packageName) => ({
    package: packageName,
    reason: 'platform-native-binary-excluded',
    ...(sourcePath ? { sourcePath } : {}),
  }));

  return {
    kind: knownRecipe ? 'pnpm-workspace-vite' : 'unknown',
    platform,
    arch,
    hasReplitConfig,
    blockers,
    nativeTooling: NATIVE_TOOLING,
    proposedRecipe: knownRecipe ? 'pnpm-workspace-vite-cross-platform' : null,
    ...(sourceFiles ? { sourceFiles } : {}),
  };
}

export async function inspectRepository(rootDir) {
  const [workspaceYaml, packageJson, lockfileText, replitDocumentation] = await Promise.all([
    readFile(join(rootDir, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(join(rootDir, 'package.json'), 'utf8'),
    readFile(join(rootDir, 'pnpm-lock.yaml'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }),
    readFile(join(rootDir, 'replit.md'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }),
  ]);

  let hasReplitConfig = true;
  try {
    await readFile(join(rootDir, '.replit'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    hasReplitConfig = false;
  }

  const parsedPackage = JSON.parse(packageJson);
  const knownRecipe = hasReplitConfig
    && /^\s*packages\s*:/m.test(workspaceYaml)
    && /(?:^|\n)\s*(?:vite(?:@|:)|['"]vite['"]\s*:)/m.test(`${workspaceYaml}\n${lockfileText ?? ''}`);
  const sourceFiles = {
    lockfile: {
      path: 'pnpm-lock.yaml',
      present: Boolean(lockfileText),
      ...(lockfileText ? { lockfileVersion: (() => {
        const raw = lockfileText.match(/^lockfileVersion:\s*["']?([^"'\s]+)["']?/m)?.[1];
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? numeric : raw ?? null;
      })() } : {}),
    },
    replitDocumentation: {
      path: 'replit.md',
      present: Boolean(replitDocumentation),
      ...(replitDocumentation ? { heading: replitDocumentation.match(/^#\s+(.+)$/m)?.[1] ?? null } : {}),
    },
  };

  const report = inspectTextConfiguration({
    workspaceYaml,
    hasReplitConfig,
    platform: process.platform,
    arch: process.arch,
    knownRecipe,
    sourcePath: 'pnpm-workspace.yaml',
    sourceFiles,
  });

  // Keep the package read part of the preflight contract without emitting its
  // contents: configuration text and filenames are safe, secrets are not.
  void parsedPackage;
  return report;
}
