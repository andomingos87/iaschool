# face

Worker Python de reconhecimento. Um processo por máquina.

## Entrada
- Pacote `@workspace/face-worker`. Arranque: `python -m face_worker` (`src/face_worker/__main__.py`).
- Consome `photo_jobs` (`kind = 'recognize'`) e `student_reference_jobs`.
- Detecção SCRFD, embedding ArcFace 512-d, atribuição por limiar em `src/face_worker/matcher.py`.
- `Dockerfile` e `fly.toml` próprios. App na Fly: `iaschool-face-worker`.

## Depende de
- Schema do módulo `app`: `photo_faces`, `student_reference_faces`, `face_recognition_settings`.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Modelos locais do InsightFace. O teste que carrega `buffalo_l` é pulado quando eles não estão na máquina.

## Quem depende
- A revisão e a pasta do aluno no `app` leem o que este worker gravou. O vetor não volta para o browser.

## Sensível
- Embedding só persiste para aluno com consentimento ativo de `biometric_sorting`.
- `artifacts/face-worker/scripts/live_check.py` usa adultos (LFW), nunca foto de criança.
- Não confirmar rosto por este worker: confirmação é revisão humana, com `reviewed_by`.

## Comandos
- Setup: `pnpm --filter @workspace/face-worker run setup`
- Dev: `pnpm --filter @workspace/face-worker run dev`
- Teste: `pnpm --filter @workspace/face-worker run test`
