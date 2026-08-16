# Replit Web Cross-Platform Bootstrap Design

## Status

Scope approved for planning on 2026-08-15. This document defines the target
for a future reusable skill; it does not change the application runtime.

## Goal

Make web applications cloned from Replit open and run reproducibly in common
development environments while retaining their Replit deployment behavior.
The resulting workflow must persist the required compatibility changes in the
repository, explain every change, and prove the local result before it is
reported as usable.

## Supported scope

- Web repositories using Node.js, JavaScript or TypeScript.
- Vite, React, Express, Next.js, static web applications, and pnpm/npm/yarn
  workspaces when their manifest and lockfile are present.
- Development targets: macOS on Apple Silicon and Intel, Linux x64 and ARM64,
  and Windows x64.
- Replit configuration files including `.replit`, `replit.md`, workspace
  manifests, lockfiles, and Replit-generated package configuration.

## Out of scope

- Python-only, mobile-native, desktop-native, and infrastructure-only
  projects.
- Production deploys, database migrations, secret rotation, or changes to
  Replit deployment settings.
- Replacing an application's framework, package manager, or dependency
  versions merely to make a local environment work.

## Design principles

1. Detect before changing. The workflow records platform, CPU architecture,
   Node.js version, package-manager version, lockfile format, commands, and
   native dependency restrictions before it edits a file.
2. Keep compatibility changes versioned. The repository, not an individual
   machine, owns runtime policy and bootstrap commands.
3. Preserve deployment intent. `.replit` remains the source for Replit
   workflow and deployment configuration; local support must not remove or
   rewrite it.
4. Allow the smallest explicit build surface. Build scripts are approved only
   for packages identified by the selected recipe, never globally.
5. Never expose or commit secrets. Environment files are detected, their
   values are masked, and `.gitignore` is checked before any report.
6. Treat local evidence, CI evidence, and Replit production evidence as
   separate facts.

## Compatibility architecture

The future skill has four stages.

### 1. Repository preflight

The preflight is read-only. It identifies the web entry points, the package
manager and pinned version, Node engine, lockfile, Replit files, native
dependencies, platform-specific overrides, approved build scripts, environment
template, and the safest web development command. It writes a human-readable
report showing detected restrictions and a proposed recipe; it does not apply
changes when the report is ambiguous.

### 2. Versioned normalization recipes

Each recipe targets one package-manager and framework combination. The initial
recipe is `pnpm-workspace-vite` because this repository uses a pnpm workspace,
Vite, Rollup, esbuild, LightningCSS and Tailwind native tooling.

For that recipe the normalizer must:

- Pin the package-manager version in the root manifest so the developer and
  CI do not silently use different pnpm behavior.
- Replace Replit-only negative overrides that exclude native binaries for
  macOS, Windows, or non-Replit Linux with a cross-platform resolution policy.
  It must retain unrelated security overrides exactly.
- Migrate the build-approval policy to the syntax required by the pinned pnpm
  version and explicitly allow only expected build packages, such as esbuild.
- Add package scripts for preflight, deterministic install, local development,
  compatibility verification, and a web smoke test.
- Add a documented environment example that lists names only and never copies
  values from `.env`.

The recipe changes `package.json`, the workspace configuration, lockfile,
scripts, and CI only when the preflight proves they are relevant. It does not
delete generated artifacts, attachments, local environment files, or existing
user changes.

### 3. Local verification

The normalizer must install from a clean dependency directory using the pinned
manager and frozen lockfile. It must then prove that native tool loading works,
run type checks and production builds, start the selected web server on an
explicit local host and port, wait for the health condition, and make an HTTP
request. For UI applications, it also runs a desktop and narrow-mobile browser
smoke test, captures console errors, and saves screenshots as local evidence.

### 4. Cross-platform CI proof

The repository receives a CI workflow with macOS, Ubuntu and Windows jobs.
Each job uses the pinned Node and package-manager versions, performs a frozen
install, runs the compatibility check, typecheck, build, and HTTP smoke test.
CI must not receive production credentials and must use an explicit mock or
unavailable-data state when the UI requires external services.

## Failure handling

- An unsupported framework, absent lockfile, non-web project, or conflicting
  package manager stops after the read-only preflight with a precise report.
- A native-package load error names the package, requested platform, source
  override, and selected remediation. It never suggests deleting all
  `node_modules` as a generic fix.
- A lockfile/configuration mismatch is corrected by updating the versioned
  configuration and regenerating the lockfile with the pinned manager, then
  verified from a clean dependency directory.
- Missing environment variables must show their names and whether the app can
  still present a safe offline state. Values never appear in logs or reports.

## Acceptance criteria

1. A clean clone on each supported operating system installs with the pinned
   package manager and a frozen lockfile without interactive prompts.
2. The web build tool can load its native binary on each platform.
3. Typecheck, application build, server startup, HTTP smoke test, and browser
   smoke test pass locally on the supported developer platform.
4. The CI matrix proves install, compatibility, typecheck, build, and HTTP
   smoke test on macOS, Ubuntu, and Windows.
5. Replit workflows and deployment configuration remain present and unchanged
   unless a tested recipe requires an additive local command.
6. The future skill produces a report that distinguishes applied changes,
   passed validation, failed validation, skipped checks, and work requiring a
   human decision.
7. The skill is validated on at least two different Replit web repositories:
   a pnpm workspace and a non-workspace Vite or Next.js project.

## Security and data boundaries

- No secret is copied from `.env`, Replit Secrets, browser storage, or shell
  environment into versioned files, CI, logs, or skill output.
- No database query, migration, deployment, publish action, or remote Replit
  configuration change is part of the compatibility workflow.
- The normalizer reviews `git status` before and after each stage and requires
  an explicit decision if a necessary edit overlaps user-owned changes.

## Future skill contract

The skill accepts a cloned repository as its working directory and returns:

1. a stack and platform diagnosis;
2. a list of planned versioned modifications and their reason;
3. fresh local validation evidence; and
4. CI and remaining-platform evidence, clearly marked as configured versus
   actually executed.

The skill runs read-only preflight first, then asks for a numbered decision
before applying a recipe. Its recipes are independently testable and may be
extended without changing generic detection logic.
