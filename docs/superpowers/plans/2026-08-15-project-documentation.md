# Project Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate accurate agent instructions in the root `AGENTS.md` and create a concise human-facing `README.md` for the IAsport workspace.

**Architecture:** Keep `AGENTS.md` operational and agent-focused, preserving its existing collaboration rules. Keep `README.md` product- and contributor-focused, linking to deeper guides instead of duplicating every package detail.

**Tech Stack:** Markdown, pnpm workspaces, TypeScript, Vite, React, Express, Drizzle ORM, OpenAPI/Orval, Vitest, Replit compatibility scripts.

## Global Constraints

- Preserve the existing root collaboration rules.
- Document only commands and capabilities evidenced by repository files.
- Keep production, secrets, migrations, and deployment claims explicitly bounded.
- Do not change application code, dependencies, generated assets, or schemas.
- Use the existing IAsport logo asset when linking it from the root README.

---

### Task 1: Consolidate agent instructions

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: root `package.json`, `pnpm-workspace.yaml`, package manifests, existing `replit.md`, and `artifacts/iasport/docs/AGENTS.md`.
- Produces: actionable root-level instructions for agents working anywhere in the workspace.

- [ ] **Step 1: Preserve the existing collaboration rules**

  Keep the current decision and clarification policy at the top of the file.

- [ ] **Step 2: Add repository-specific operational sections**

  Document setup, package map, development commands, tests, code style, generated design-system rules, Replit compatibility gates, environment boundaries, and validation expectations using only verified repository facts.

- [ ] **Step 3: Inspect the completed file**

  Run `sed -n '1,320p' AGENTS.md` and confirm there are no placeholders, invented commands, or claims of production proof.

### Task 2: Create human-facing README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: root scripts, workspace manifests, existing documentation, and `artifacts/iasport/public/logo-color.png`.
- Produces: a concise project entry point with quickstart, architecture map, validation commands, and documentation links.

- [ ] **Step 1: Write the README structure**

  Include the IAsport identity, current repository purpose, stack, quickstart, workspace map, development and validation commands, design-system guidance, and known boundaries.

- [ ] **Step 2: Add valid relative links and logo**

  Link to existing guides under `docs/` and `artifacts/iasport/docs/`; use the logo path relative to the repository root.

- [ ] **Step 3: Inspect the completed README**

  Run `sed -n '1,320p' README.md` and check that it remains concise and does not include unsupported sections such as licensing or changelog claims.

### Task 3: Validate documentation against the repository

**Files:**
- Verify: `README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: the two documents and the repository's installed tooling.
- Produces: local evidence for documented install, preflight, tests, typecheck, and build commands, with environment-dependent failures reported separately.

- [ ] **Step 1: Run read-only compatibility checks**

  Run `pnpm run replit:preflight` and `pnpm run replit:test`.

- [ ] **Step 2: Run static validation**

  Run `pnpm run typecheck` and `pnpm run build` when dependencies are available.

- [ ] **Step 3: Review the final diff and status**

  Run `git diff -- README.md AGENTS.md docs/superpowers/specs/2026-08-15-project-documentation-design.md docs/superpowers/plans/2026-08-15-project-documentation.md` and `git status --short`, preserving unrelated user files.
