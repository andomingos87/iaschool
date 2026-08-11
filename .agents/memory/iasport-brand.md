---
name: IAsport brand decisions
description: Durable decisions for the IAsport design system (artifacts/iasport)
---
- Palette (official deck): dark gray #2e2e2e, blue-gray #7e8a97, neon green #39ff14. Green is reserved for highlights (the "IA" initials evoke a rising chart/metrics) — don't spread it as a general surface color.
- **Why:** brand deck explicitly documents this rationale; user confirmed dark mode is the brand default (light also available).
- Prometo font files are **Trial** versions supplied by the user — flag licensing before production use. Weights 300/400/500/700/900 are embedded as base64 `@font-face` in `scripts/theme-template.css` so they survive token regeneration and reach consumers.
- Brand references and manifest live in `artifacts/iasport/docs/references/`.
