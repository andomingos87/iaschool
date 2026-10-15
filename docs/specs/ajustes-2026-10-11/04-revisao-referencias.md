# S04 — Seleção na revisão e referências a partir de fotos confirmadas

**Atualizado em:** 12/10/2026.
**Estado:** T12/T09 implementados e publicados; origem/fila verificadas em integração sintética. Reconhecimento real do modelo e aceite completo em aparelho continuam pendentes.
**Origem:** T12 e T09 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulos:** `app`, `face` quando o processamento precisar mudar.

## Resultado esperado e limites

A escola seleciona/desmarca as sugestões de um aluno no evento e confirma
humanamente. Depois pode escolher uma foto já confirmada para adicionar apenas
o rosto daquele aluno às referências de reconhecimento, com autorização ativa.

Selecionar não confirma. Confirmar reconhecimento não dá autorização de entrega
ou de exposição a outras famílias. Modelos de arte não são referências
biométricas. A mudança não cria identificação automática de adultos ou consentimento.

## Estado local e referências

- `artifacts/iaschool-app/src/components/review-student-card.tsx` oferece
  selecionar/desmarcar todas por cartão e evento, contagem e confirmação
  separada. `src/lib/review-selection.ts` concilia os IDs; novas fotos não
  entram numa seleção antiga. `src/pages/event-review.tsx` mantém a confirmação
  humana e sua trilha existente.
- `src/components/student-reference-faces.tsx` integra o seletor
  `src/components/confirmed-event-reference-picker.tsx`: fotos confirmadas,
  filtro por evento, rosto destacado e confirmação explícita para enfileirar.
  `src/lib/data/review-media.ts` contém o contrato e a projeção sem vetor.
- `public.photo_faces`, `public.student_photos`, `public.authorizations`,
  `public.student_reference_faces`, `public.student_reference_jobs` e
  `public.biometric_events` mantêm suas referências em
  `artifacts/iaschool-app/supabase/fase3-face-recognition.sql`,
  `fase3-authorizations-reference-faces.sql` e `fase3-review-audit-purge.sql`.
- O SQL complementar aplicado em **12/10/2026** é
  `artifacts/iaschool-app/supabase/fase5-review-media.sql`:
  `public.confirmed_reference_photos`, `public.enqueue_confirmed_event_reference`
  e `public.reference_event_source` verificam escola, autorização e rosto
  confirmado. `public.student_reference_jobs.source_photo_id`,
  `public.student_reference_jobs.source_face_id`,
  `public.student_reference_jobs.source_bbox` e a autorização existente
  preservam a origem; `public.student_reference_faces.source_photo_id` e
  `public.student_reference_faces.source_face_id` preservam a origem processada.
- `artifacts/face-worker/src/face_worker/handlers.py` processa somente a caixa
  exata do rosto confirmado. O original não é copiado permanentemente para as
  referências. Cancelamento, revogação ou alteração da origem invalidam o
  processamento/derivado e usam a fila de expurgo existente. Uma tentativa
  atrasada não apaga o recorte de outra tentativa já concluída.
- Contextos atualizados: [.context/modules/app/AGENTS.md](../../../.context/modules/app/AGENTS.md)
  e [.context/modules/face/AGENTS.md](../../../.context/modules/face/AGENTS.md).

## Requisitos

- **REV-01 — Alcance explícito.** “Selecionar todas” e “Desmarcar todas” afetam
  somente sugestões exibidas no cartão do aluno e evento atuais. Selecionar
  todas inclui “Precisa de atenção”, com aviso de que inclui fotos ambíguas.
- **REV-02 — Ação humana separada.** Contagem e “Confirmar N fotos” refletem
  imediatamente a seleção. Zero selecionadas desabilita confirmação. Durante
  confirmação, bloquear alteração e repetição. Desmarcadas seguem a regra
  existente da fila de exceção; manter revisor/data na trilha.
- **REV-03 — Lista atualizada.** Remover seleções de sugestões que saíram do
  contexto. Fotos novas não podem ser confirmadas por uma seleção antiga de
  “todas”. Trocar aluno/evento não reaproveita IDs marcados no contexto anterior.
- **REV-04 — Referência elegível.** Na aba Rosto de referência, oferecer
  “Escolher foto de evento”, com fotos confirmadas daquele aluno e filtro por
  evento. Exigir `biometric_sorting` ativo e vínculo confirmado, revalidando no
  processamento; sugestão ainda não confirmada nunca vira referência.
- **REV-05 — Rosto certo em grupo.** Destacar para conferência o rosto confirmado
  do aluno e processar somente ele. Usar vínculo/recorte/caixa do rosto validado,
  sem pedir ao worker que escolha livremente uma pessoa da foto de grupo.
  Sem rosto aproveitável ou correspondência inequívoca, bloquear com orientação.
- **REV-06 — Fila existente.** Reutilizar qualidade, deduplicação, validade,
  fila e nova tentativa; mostrar aguardando, processada e erro. Referência só
  aumenta a cobertura após processamento efetivo, não ao selecionar/enfileirar.
- **REV-07 — Origem e expurgo.** Manter origem da foto/rosto de evento e a
  autorização usada, sem guardar vetores no browser ou log. Preservar remoção,
  retenção e expurgo de referências; não transformar a pasta em cópia permanente
  adicional de todas as fotos do aluno.
- **REV-08 — Falhas e isolamento.** Tratar vazio, foto já usada, imagem
  indisponível, autorização revogada, seleção inválida e outra escola. Erro
  mantém contexto para tentativa segura, sem registro/arquivo órfão ou referência
  parcialmente cadastrada apresentada como processada.

## Implementação local autorizada

Em 12/10/2026 o usuário autorizou primeiro o código/SQL local e depois a
aplicação das duas migrations, publicação e validação integrada com dados
sintéticos. Não foi criado serviço novo, ampliado escopo de autorização ou
ligado envio comercial.

A projeção usa a identidade do rosto confirmado, não apenas a presença da foto
na pasta do aluno. A fila existente continua responsável por qualidade,
tentativa e retenção. A autorização e a origem são conferidas no enfileiramento,
antes do processamento e novamente na conclusão. Deduplicação por aluno/rosto
é serializada no banco; cobertura só aumenta quando a referência é processada.

## Tarefas de implementação

- [x] Implementar comandos de seleção, aviso de ambiguidade, contagem e
  conciliação de IDs por aluno/evento (REV-01–REV-03).
- [x] Conferir projeção/recorte/origem; detalhar a integração com a fila e
  eventuais ajustes de contrato ou SQL (REV-04, REV-05, REV-07).
- [x] Criar seletor de fotos confirmadas por evento e prévia do rosto correto;
  revalidar autorização e enfileirar sem duplicar referência (REV-04–REV-08).
- [x] Verificar domínio e interface local; atualizar contextos de `app` e `face`
  quando seus comportamentos mudarem.

## Cenários de aceite

`[x]` abaixo indica verificação **local** com dados sintéticos, não aceite de
produção. O ensaio publicado descrito abaixo verifica origem/fila, sem comprovar detecção
e embedding reais do modelo.


- [x] **C01 (REV-01, REV-02):** cartão com confiança alta/baixa permite marcar
  todas com aviso, zerar e confirmar só as escolhidas; cartão de outro aluno
  permanece igual; seleção sozinha não grava confirmação.
- [x] **C02 (REV-02, REV-03):** durante confirmação, não alterar/duplicar;
  atualização que acrescenta foto não a inclui silenciosamente na confirmação;
  trocar contexto não carrega seleção antiga.
- [x] **C03 (REV-04, REV-05):** foto de grupo confirmada para dois alunos
  destaca/processa apenas o rosto do aluno aberto, com origem preservada.
- [x] **C04 (REV-04, REV-08):** sugestão sem confirmação, outra escola,
  autorização ausente/revogada e foto sem rosto válido são recusadas antes de
  criar referência; revogação entre escolha e processamento também é respeitada.
- [x] **C05 (REV-06–REV-08):** escolher foto já usada, falhar, repetir e cancelar
  não duplica nem deixa órfão; cobertura muda só após processamento válido e
  permanece correta após remoção/expurgo.
- [ ] **C06 (REV-01, REV-08):** cartão vazio/parcial, seletor sem fotos, imagem
  indisponível, carregando e erro têm ação clara; teclado e celular permitem
  selecionar, conferir rosto e confirmar sem liberar rosto errado.

## Verificação e publicação

Verificações locais em 12/10/2026:

- `review-selection.test.ts`: alcance por cartão, ambiguidade, bloqueio durante
  confirmação, troca/atualização de lista e seleção vazia.
- Navegador local: selecionar/desmarcar todas e confirmar duas fotos;
  seletor com duas confirmadas, exclusão de duas sugestões, filtro por evento
  e enfileiramento mantendo zero referências válidas e uma pendente.
- Suíte de `face-worker`: **39 testes verdes**. O ensaio de pixels com dois
  rostos sintéticos prova que só o recorte escolhido chega ao motor; inclui
  origem inválida/revogada e conclusão concorrente sem remoção de recorte válido.
- `rehearsal/adjustments-reference-checks.sql`, executado pelo
  `rehearsal/test-adjustments-local.py`: projeção sem vetor, ausência/revogação
  de autorização, outra escola, sugestão recusada, deduplicação, origem após
  processamento, retenção, remoção/expurgo e privilégios. Executado em
  PostgreSQL descartável local; o tipo de vetor é um domínio de fixture e
  não verifica pgvector nem o modelo de reconhecimento real.
- Suíte local do app e `pnpm run typecheck` verdes.

### Publicação e ensaio integrado em 12/10/2026

Aplicadas `fase5-review-media.sql` e `fase5-adjustments-delivery-album.sql`.
`face-worker` publicado na Fly, versão **v2**. App promovido ao endereço
[https://iaschool-app.vercel.app](https://iaschool-app.vercel.app), deployment
`dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`. S04 não criou Edge Function própria.

`tests/adjustments-integrated.integration.test.ts` passou no ambiente publicado:
**Run 5, 1 teste verde em 27,64 s**, incluindo limpeza. Criou escola/conta,
responsável e aluno adultos fictícios, imagem inteiramente sintética e vínculos
manuais de rosto para exercitar o domínio. A projeção confirmou a origem e a
fila aceitou o rosto, mantendo **zero referências processadas**. Isso não é
prova de detecção/reconhecimento/embedding reais nem usa foto de menor.

Escola, conta, registros e objetos desta execução foram removidos por
identificação/prefixo próprios; a conferência pelo Storage passou. Não houve
mensagem WhatsApp nem impressão de token/credencial nos resultados.

C06 permanece aberto para o ensaio completo no aparelho real, gestos e estados
de falha de imagem/conexão. O fluxo principal no navegador local foi verificado;
a integração publicada complementa a prova do servidor, sem substituir esse
aceite nem a avaliação de reconhecimento com adultos autorizados reais.
