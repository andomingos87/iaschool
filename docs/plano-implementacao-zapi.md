# Ponte Z-API — implementação e pendências

**Reconciliado em 25/10/2026 contra o código local.** D8 de 29/09 autoriza
somente validação controlada antes do contrato. Publicações citadas são o
histórico do [BACKLOG](../BACKLOG.md), não checagem remota atual.
A [spec original](spec-whatsapp-api-oficial-entrega-fotos.md) conserva as
regras e critérios de aceite; decisões posteriores de fotos nítidas e álbum
estão indicadas no início dela.

## Limites da ponte

Uma escola, 1–4 pessoas allowlisted, até 40 mensagens externas por dia, limite
próprio de OTP e kill switch. Apenas material sintético/adulto autorizado.
Z-API envia mensagens reais; não é sandbox. Nenhuma foto de menor, uso
comercial, quinta pessoa, segunda escola, anexo de mídia ou fallback automático.
Antes do uso comercial, implementar/configurar Meta e repetir o E2E.

## Estado por marco

| Marco | Código atual | Publicação registrada | Pendente |
| --- | --- | --- | --- |
| Z0 — Contrato/travas | Interface `WhatsAppProvider`, fake de teste, Z-API, allowlist/teto/pausa | Fundação 02/10, configuração/ensaio 03/10/2026 | Rotação, webhook operacional, mapa de operadores e Meta |
| Z1 — OTP | Hash, limites, invalidação por troca de número, sem código na resposta | Função v4 em 02/10, OTP adulto em 03/10/2026 | Status reais por webhook e aceite de transição para Meta |
| Z2 — Aceite | Token opaco, página pública, aceite/recusa e evidência versionada | SQL/funções 05/10, frontend 12/10/2026 | Termo compatível com fotos nítidas e E2E completo pelo WhatsApp |
| Z3 — Álbum | Lote, render, prévia, aprovação, sessão, revogação/expurgo | Primeiro preparo 05/10; álbum 12/10; fotos nítidas 13/10/2026 | Aceite de retenção/escala e versão reutilizável local |
| Z4 — Envio/retorno | Ações explícitas em `school-delivery`, normalização e correlação em `provider-webhook` | Funções registradas; capacidade de envio v5 em 15/10/2026 | Comprovar transporte de ponta a ponta; Meta |
| Z5 — Canário/retirada | Plano e travas, sem encerramento registrado | Sem canário completo registrado | Executar adulto autorizado, encerrar ponte e homologar Meta |

## Contrato existente

`createWhatsAppProvider` cria Z-API somente com `WHATSAPP_MODE=controlled_zapi`,
`WHATSAPP_PROVIDER=zapi` e configuração completa. Ausência, pausa ou modo
incompatível falha fechado. `meta_test` é reconhecido, mas não possui adaptador.
Cliente não escolhe provedor nem recebe segredos ou token do consentimento.

Mensagens lógicas: `guardian_otp`, `guardian_consent`, `delivery_ready`.
`accepted` significa aceitação pelo provedor; entrega/leitura exigem eventos
correlacionados. Transmissão incerta fica `unknown`, sem reenvio automático.
O código não possui função `process-whatsapp-deliveries`: envio/reemissão/
revogação/capacidade são ações de `school-delivery`. Aprovar não transmite.

OTP: validade de 10 min, intervalo de 60 s, cinco por hora, dez por dia por
número e até cinco tentativas de confirmação. A reserva também consome o teto
geral. SQL: `artifacts/iaschool-app/supabase/fase4-whatsapp-foundation.sql`
(`public.guardian_verification_codes`, `public.whatsapp_messages`,
`public.whatsapp_controlled_settings`, `public.whatsapp_controlled_allowlist`).

Aceite: token de uso único, somente hash, 24 h; solicitação nova invalida a
anterior. Evidência `guardian_link` em `public.authorizations` e tokens em
`public.guardian_action_tokens` no SQL
`artifacts/iaschool-app/supabase/fase5-guardian-consent.sql`.
Verificação de número e aceite são atos distintos.

Entrega: `public.delivery_batches`, `public.delivery_recipients` e
`public.delivery_items`, SQL `artifacts/iaschool-app/supabase/fase5-delivery-batches.sql`
e complementos `fase5-adjustments-delivery-album.sql`/`delivery-original-photos.sql`.
Novas fotos são nítidas, sem desfoque; versões protegidas já aprovadas são
preservadas. Derivados expiram, sessões duram 24 h e assinaturas até 5 min.
O complemento `fase5-album-open-link.sql` (reutilização/agrupamento por evento)
está local e sem aplicação remota/publicação registrada.

## Antes do próximo ensaio externo

- O registro de 03/10 aponta três segredos expostos e rotação pendente; comprovar a rotação sem registrar valores. O webhook também ficou sem retorno operacional comprovado.
- Homologar nova versão do [termo](termos/delivery-whatsapp-v1.md): v1 ainda promete desfoque. Aceites anteriores não devem ser reinterpretados silenciosamente.
- Confirmar destino, participantes, limite e autorização do ensaio. Conferir aceite/recusa, acesso por família, status, revogação e expurgo. Testes com fake e publicação de função não fecham esse E2E.

Nada foi ativado, publicado, configurado ou enviado nesta revisão.
