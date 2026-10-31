# face

Worker Python de reconhecimento. Um processo por máquina. Revisado em 25/10/2026; publicações abaixo são registros históricos, sem nova consulta remota.

## Entrada
- Pacote `@workspace/face-worker`. Arranque: `PYTHONPATH=src pnpm --filter @workspace/face-worker run dev` (da raiz; `src/face_worker/__main__.py`).
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
- Dev: `PYTHONPATH=src PORT=8081 pnpm --filter @workspace/face-worker run dev`
- Teste: `pnpm --filter @workspace/face-worker run test`

## Referência de evento (S04)

- `public.student_reference_jobs.source_kind = 'event'`, `public.student_reference_jobs.source_photo_id`, `public.student_reference_jobs.source_face_id` e `public.student_reference_jobs.source_bbox` (`artifacts/iaschool-app/supabase/fase5-review-media.sql`, aplicado em 12/10/2026 pelo MCP supabase-iaschool) identificam a origem confirmada. `public.reference_event_source` revalida autorização e confirmação antes de baixar o original; `public.complete_student_reference_job` repete a checagem ao persistir.
- O handler recorta somente a caixa EXATA desse rosto antes de chamar o motor; não escolhe um rosto na foto de grupo. Zero/múltiplos rostos ou caixa ilegível ficam como falha recuperável pela escola. Só o recorte sem metadados vai para `student-refs`, nunca outra cópia permanente da foto inteira. Cancelamento/revogação/revisão concorrente remove o recorte; jobs/referências usam a retenção e a fila de expurgo existentes.
- `public.student_reference_faces.source_photo_id` e `public.student_reference_faces.source_face_id` (`artifacts/iaschool-app/supabase/fase5-review-media.sql`) preservam origem após processamento. Alterar/remover origem invalida a referência derivada. Nada vetoriza no browser, confirma automaticamente ou muda escopo de autorização. Worker publicado na Fly em 12/10/2026, versão v2. Teste local não prova reconhecimento real.

- Publicação em 12/10/2026: Fly `iaschool-face-worker`, release v2, uma máquina em gru com 2 CPU compartilhadas/2 GB. Health real 200 após carregar o motor; o ensaio sintético de origem não atesta reconhecimento de uma pessoa real.

## Verificação integrada de 12/10/2026

- App/SQL complementares publicados/aplicados; ensaio `artifacts/iaschool-app/tests/adjustments-integrated.integration.test.ts` passou (Run 5, 27,64 s), com limpeza da escola/conta/dados/objetos sintéticos. O rosto foi vínculo de domínio confirmado manualmente sobre imagem de padrões, não detecção humana real. S04 validou origem/enfileiramento mantendo zero referências processadas: não comprova embedding ou precisão do modelo publicado. Nenhuma foto real de menor ou mensagem WhatsApp foi usada.
