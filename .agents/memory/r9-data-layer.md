---
name: R9 app data-layer swap points
description: How the R9 Escolinhas app isolates mock data/auth/storage and real AI generation for a future Supabase swap.
---

The R9 Escolinhas app (artifacts/r9-app) runs on mocks for data/auth/storage, but AI image generation is REAL.

**Rule:** all screens must access data only via `getDataLayer()` from `src/lib/data` — never import mock implementations directly.

**Why:** the user will later create an external Supabase project (auth, DB, storage); the swap must be a single-factory change, not a UI refactor.

**How to apply:**
- Supabase-shaped interfaces live in `src/lib/data/contract.ts`; mock impls (localStorage + simulated latency) in `src/lib/data/mock/`.
- AI post-image generation is REAL: frontend `src/lib/data/openai-generation.ts` → backend `artifacts/api-server` `POST /api/generation/post-image` → OpenAI `images.edit` with model **gpt-image-2**, using the user's own `OPENAI_API_KEY` secret (server-side only). The Replit AI-integrations proxy was declined (user chose own key; account has gpt-image-2).
- The generation route carries its own 40mb body limit, MIME/size caps and a per-IP in-memory rate limit; the global express body limit stays at 1mb. Real server-side auth is still missing (mock login only) — revisit when Supabase auth lands.
- Expected env vars and table/bucket mapping are documented in `artifacts/r9-app/SUPABASE.md` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
