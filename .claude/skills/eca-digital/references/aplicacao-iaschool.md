# Aplicação ao IAschool — mapa técnico atual

**Revisado em 25/10/2026 contra o código local.** Este mapa substitui o
diagnóstico antigo de autocadastro de aluno, campos esportivos e ausência de
consentimento. Não é parecer jurídico nem declaração de conformidade.
Referências legais da skill exigem validação própria quando usadas para uma
decisão; esta revisão não atualizou legislação nem consultou serviços remotos.

## Produto e acesso

A escola cadastra alunos, organiza fotos de eventos, revisa o reconhecimento,
prepara entregas ao responsável e gera artes. Conta pública é de escola;
aluno é registro, sem conta própria. `signup.tsx` e `student-area.tsx` não
fazem parte do app atual. As rotas públicas são login/cadastro, recuperação,
consentimento e álbum; não equivalem a portal autenticado completo de família.

## Mapa de controles presentes

| Área | Código/SQL | O que existe |
| --- | --- | --- |
| Escola e aprovação | `artifacts/iaschool-app/src/App.tsx`, `src/lib/data/supabase/`; `artifacts/iaschool-app/supabase/fase1-min-schools-events.sql` | `public.profiles`, `public.school_members`, `public.students`, `public.guardians`: aprovação, vínculo escolar, data e responsável |
| Autorização e biometria | `artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql` e `fase3-face-recognition.sql` | `public.authorizations`, `public.student_reference_faces`, `public.photo_faces`: escopos, referência consentida, vetores restritos, confirmação humana |
| Revogação e expurgo | `artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql` | `public.biometric_events` e `public.storage_purge_queue`: trilha e remoção assíncrona dos arquivos |
| OTP e mensagens | `artifacts/iaschool-app/supabase/fase4-whatsapp-foundation.sql`, `supabase/functions/send-guardian-code/` | `public.guardian_verification_codes`, `public.whatsapp_messages`: código com hash, limites, provedor controlado; sem código na resposta |
| Aceite direto | `artifacts/iaschool-app/supabase/fase5-guardian-consent.sql`, funções `request-guardian-consent`/`guardian-consent` | `public.guardian_action_tokens` e evidência versionada em `public.authorizations`; escola não aceita pelo responsável |
| Entrega | `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql` e `delivery-original-photos.sql` | `public.delivery_approvals`, `public.delivery_items`, `public.delivery_access_sessions`: seleção/aprovação, sessão privada, prazo e revogação; novas fotos são nítidas |
| Artes em lote | `artifacts/api-server/src/lib/generation-batch-process.ts`; `artifacts/iaschool-app/supabase/generation-batches.sql` | `public.generation_batches` e `public.generation_batch_items`: revalidação de autorização/foto, modelo + foto enviados à IA, cota e tentativa explícita |

Caminhos `src/` e `supabase/functions/` na tabela são relativos ao app quando
não precedidos de outro pacote. O inventário completo está em
`artifacts/iaschool-app/SUPABASE.md` e os contratos em `docs/api.md`.

## Divergências e limites

- **Termo:** `_shared/whatsapp/consent-terms.ts` ainda promete terceiros desfocados em `delivery_whatsapp.v1`; novas entregas usam `original_v1`, sem desfoque. Homologação de nova versão/tratamento de aceites anteriores permanece aberta. Não reescrever v1 como se consentimentos passados cobrissem a mudança.
- **Publicação:** há registros de OTP/consentimento/álbum e fotos nítidas em outubro. O álbum reutilizável em `fase5-album-open-link.sql` segue apenas local. Publicação antiga não prova configuração ou comportamento remoto hoje.
- **IA:** wizard atual usa modelo da escola e foto do aluno, sem garantia de pixels originais. O caminho determinístico antigo não representa o fluxo vigente. Controles presentes não comprovam moderação completa nem adequação de saídas para menores.
- **Compartilhamento:** canal verificado, aceite, autorização e trilha são controles distintos. `accepted` no provedor não prova entrega. Revogação impede acessos futuros conforme implementação/prazos, mas não recolhe cópias baixadas.
- **Gates:** homologação jurídica, operadores/transferências, retenção, transparência, canal de atendimento/remoção, e-mail, Meta, webhook, segredos e E2E operacional continuam no backlog. Não inferir ausência total de consentimento ou de auditoria a partir do diagnóstico antigo.

## Regra operacional vigente

Nenhuma foto real de criança/adolescente e nenhum WhatsApp comercial até os
gates de `docs/pendencias-producao.md`. Exceção: ensaio `controlled_zapi` com
uma escola, 1–4 pessoas allowlisted, teto, kill switch e material sintético/adulto.
Não converter uma revisão documental em ativação, envio, geração paga ou
mudança de schema. Relatar separadamente código, testes locais, publicação
registrada e evidência remota; homologação não foi realizada por esta revisão.
