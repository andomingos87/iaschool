# Local web development across platforms

This repository is a pnpm workspace with a Vite web application. The workflow
below is the reproducible local bootstrap for macOS (Apple Silicon or Intel),
Linux (x64 or ARM64), and Windows (x64). Use Node.js 24 and the package-manager
version pinned in `package.json`; run every pnpm command through Corepack.

## Bootstrap and validation

Run these commands from the repository root, in this order:

```bash
corepack pnpm install --frozen-lockfile
pnpm run verify:native
pnpm run smoke:web
pnpm run typecheck
pnpm --filter @workspace/iaschool-app run build
```

`verify:native` confirms that Vite and its native tooling can load on the
current platform. `smoke:web` starts the R9 app on `127.0.0.1:5173`, checks an
HTTP response, and terminates the child process. The typecheck and package
build are local evidence; they do not prove a CI or production deployment.

For the complete local compatibility test suite, run `pnpm run test:compat`.

## Local environment boundary

`.env` is local-only. Never copy values from it into source, reports, commits,
or CI. If a variable is needed, configure it in the local environment and
document only its name:

- `PORT`
- `BASE_PATH`
- `DATABASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GENERATION_DAILY_QUOTA`
- `GENERATION_QUOTA_OUTAGE_THRESHOLD`
- `LOG_LEVEL`

The browser may use the public `VITE_` values; service credentials remain
server-side. The web smoke test uses its explicit local port and base path and
does not require production credentials for its HTTP check.

## Native-tool failure signature

A Linux-only native override is incompatible with a cross-platform clone. On a
platform whose optional binary was excluded, Vite/Rollup fails before the web
server starts with an error such as:

```text
Error: Cannot find module '@rollup/rollup-linux-x64-gnu'
```

The package name and platform suffix may differ (`darwin-arm64`, `darwin-x64`,
or `win32-x64-msvc`). Restore the versioned workspace policy in
`pnpm-workspace.yaml` and repeat the frozen install. Do not paste environment
values into the failure report.

## Repository hygiene

Local `.env` files, screenshot evidence, and temporary validation reports are
ignored by Git. The runbook, compatibility scripts, and their tests remain
tracked so a fresh clone receives the same workflow.
