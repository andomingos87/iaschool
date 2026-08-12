---
name: R9 app data-layer swap points
description: How the R9 Escolinhas app isolates mock data/auth/storage and mock AI generation for a future Supabase + OpenAI swap.
---

The R9 Escolinhas app (artifacts/r9-app) runs 100% on mocks by design.

**Rule:** all screens must access data only via `getDataLayer()` from `src/lib/data` — never import mock implementations directly.

**Why:** the user will later create an external Supabase project (auth, DB, storage) and connect OpenAI GPT Image; the swap must be a single-factory change, not a UI refactor.

**How to apply:**
- Supabase-shaped interfaces live in `src/lib/data/contract.ts`; mock impls (localStorage + simulated latency) in `src/lib/data/mock/`.
- AI post-image generation is mocked with a canvas composition (`src/lib/data/mock/generation.ts`) presented as AI; swap by replacing `ImageGenerationService` only.
- Expected env vars and table/bucket mapping are documented in `artifacts/r9-app/SUPABASE.md` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- No OpenAI Replit AI integration was available in this environment (only xAI connector in catalog); `setupReplitAIIntegrations` callback is not registered here.
