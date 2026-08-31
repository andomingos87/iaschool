---
name: R9 app data-layer swap points
description: How the R9 Escolinhas app isolates mock data/auth/storage; security rules for the Supabase swap.
---

The R9 Escolinhas app (artifacts/iaschool-app) can run on mocks (localStorage) or real Supabase depending on env vars.

**Rule:** all screens access data only via `getDataLayer()` from `src/lib/data` — never import mock implementations directly.

**Why:** the Supabase implementation is live behind the same interfaces; the swap is env-var-driven, not a code change.

**How to apply:**
- Supabase-shaped interfaces live in `src/lib/data/contract.ts`; Supabase impl in `src/lib/data/supabase/index.ts`; mock (localStorage) in `src/lib/data/mock/`.
- `getDataLayer()` picks Supabase when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set; falls back to mock with demo indicator.
- AI post-image generation: frontend `src/lib/data/openai-generation.ts` → backend `POST /api/generation/post-image` → OpenAI gpt-image-2.

**Security invariants (must hold in RLS + backend middleware):**
- Every domain table (`students`, `clubs`, `reference_posts`, `metrics`, `generated_posts`) has `owner_id uuid`. `school_user` can only read/write own rows; `super_admin` sees all — enforced in RLS, not in app code.
- Storage buckets are PRIVATE. Upload paths prefixed with `{uid}/` (enforced in storage policy and in code). Images served via signed URLs (1-year TTL).
- Metrics: predefined rows have `owner_id = NULL`; custom metrics carry the creator's `owner_id`.
- API middleware (`artifacts/api-server/src/middlewares/supabase-auth.ts`) validates both the JWT AND a `profiles` row before allowing the paid OpenAI call. Without both, the request is rejected (401/403). If Supabase env vars are missing but OPENAI_API_KEY is present, the middleware returns 503 (no open fallback to demo mode on the server).

**Why the profiles check in the backend matters:** Supabase allows self-signup by default. An attacker could create an Auth account and bypass the app's profile gate, calling the paid endpoint. The middleware blocks this by verifying a profiles row exists.

**How to apply:** When adding new paid/sensitive backend routes, always require both a valid JWT and a profiles row via `requireSupabaseUser`. The middleware sets `req.supabaseUserId`; the generation route uses it for per-user burst + daily quotas (in-memory, `GENERATION_DAILY_QUOTA` env var, default 50/day).
