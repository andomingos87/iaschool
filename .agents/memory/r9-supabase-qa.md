---
name: R9 Supabase QA quirks
description: Environment quirks when e2e-testing R9 app against the live Supabase project
---
- The dev environment now runs on the REAL Supabase project (VITE_SUPABASE_URL is set), not mock/localStorage. Demo credentials from login page only apply in mock mode; testers must provision users via the service role.
- Supabase auth rejects `@example.com` emails (400 email_address_invalid) and rate-limits signups (429 "email rate limit exceeded"). Use `@gmail.com`-style fake addresses and create accounts via the admin API when testing signup-dependent flows.
- The live Supabase DB can lag behind `artifacts/r9-app/supabase/setup.sql`; 404s from PostgREST usually mean a table (e.g. prompt_template_versions) hasn't been applied yet — schema gap, not app bug.
- Reset-password screen can be reached in tests by opening the app with `#type=recovery` in the URL hash.
- Updating a column the live DB doesn't have yet returns PostgREST code PGRST204 ("schema cache"), while selects/filters return 42703 — handle both when degrading gracefully around pending setup.sql migrations.
