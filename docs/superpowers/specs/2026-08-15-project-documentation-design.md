# Project Documentation Design

## Goal

Consolidate the repository's agent instructions in the root `AGENTS.md` and
create a human-oriented `README.md` that accurately explains the IAsport
workspace, its commands, packages, design system, Replit compatibility gates,
and current implementation boundaries.

## Scope

- Preserve the existing collaboration rules in the root `AGENTS.md`.
- Add actionable setup, development, testing, architecture, security, and
  deployment guidance for coding agents.
- Add a concise README with project purpose, stack, repository map, quickstart,
  validation commands, and links to deeper documentation.
- Use only commands and capabilities evidenced by the repository.
- Do not claim a production deployment, configured secrets, database migration,
  or complete end-user product when the repository does not prove it.
- Do not alter application code, dependencies, generated assets, or database
  schema.

## Documentation Design

`AGENTS.md` is the operational source for coding agents. It will describe the
pnpm workspace, package responsibilities, exact commands, source-of-truth
files, generated design-system files, Replit compatibility workflow, testing
expectations, environment/secrets boundaries, and pull-request validation.

`README.md` is the entry point for humans. It will explain that the repository
contains the IAsport web/design-system workspace and supporting API/database
libraries, provide a deterministic install and validation path, show the main
workspace layout, and link to the existing Replit and design-system guides.
The existing IAsport logo asset will be used in the README header when the
relative path remains valid from the repository root.

## Validation

After editing, validate Markdown links and inspect the documented commands
against `package.json`, workspace manifests, and the existing compatibility
scripts. Run the repository's read-only preflight and test/typecheck commands
where the installed dependencies allow it. Report any environment-dependent
checks separately from local evidence.
