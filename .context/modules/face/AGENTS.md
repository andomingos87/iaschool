# face

Worker Python de reconhecimento. Um processo por máquina.

## Entrada
- Pacote `@workspace/face-worker`. Arranque: `python -m face_worker` (`src/face_worker/__main__.py`).
- Consome a tabela `public.photo_jobs` (`artifacts/iaschool-app/supabase/fase2-photo-jobs-worker.sql`) com `kind = 'recognize'` e a tabela `public.student_reference_jobs` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`).
- Detecção SCRFD, embedding ArcFace 512-d, atribuição por limiar em `src/face_worker/matcher.py`.
- `Dockerfile` e `fly.toml` próprios. App na Fly: `iaschool-face-worker`.

## Depende de
- Schema do módulo `app`: `public.photo_faces` e `public.face_recognition_settings` (`artifacts/iaschool-app/supabase/fase3-face-recognition.sql`), `public.student_reference_faces` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`).
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Modelos locais do InsightFace. O teste que carrega `buffalo_l` é pulado quando eles não estão na máquina.

## Quem depende
- A revisão e a pasta do aluno no `app` leem o que este worker gravou. O vetor não volta para o browser.

## Sensível
- Embedding só persiste para aluno com o escopo `biometric_sorting` ativo em `public.authorizations` (`artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`). Isso é escopo, não tabela.
- `artifacts/face-worker/scripts/live_check.py` usa adultos (LFW), nunca foto de criança.
- Não confirmar rosto por este worker: confirmação é revisão humana. A coluna `public.photo_faces.reviewed_by` é exigida pelo CHECK em `artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql`.

## Comandos
- Setup: `pnpm --filter @workspace/face-worker run setup`
- Dev: `pnpm --filter @workspace/face-worker run dev`
- Teste: `pnpm --filter @workspace/face-worker run test`
