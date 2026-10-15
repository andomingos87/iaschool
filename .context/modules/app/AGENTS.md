# app

Aplicação web da escola: cadastro, eventos, upload, galeria, revisão, pasta do aluno, entregas e geração unitária de arte.

## Entrada
- Pacote `@workspace/iaschool-app`. Processo: `src/main.tsx`. Rotas em `src/App.tsx`.
- SQL de referência, ensaios e Edge Functions: `artifacts/iaschool-app/supabase/`.
- Integração do banco: `artifacts/iaschool-app/SUPABASE.md`.

## Depende de
- `design-system` para componente e token.
- `contrato` para o que estiver no OpenAPI. A geração de arte chama a API na mão. O fluxo está em `.context/modules/geracao-arte/AGENTS.md`.
- Supabase (Auth, RLS, Storage, Realtime) direto do browser, com a chave anon.

## Quem depende
- `ingest` e `face` consomem o schema e as filas declaradas no SQL deste módulo.
- A Vercel publica este pacote. O rewrite `/api` em `vercel.json` aponta para o módulo `api`.

## Sensível
- Foto, consentimento, data de nascimento, responsável e entrega. Ver `.context/security.md`.
- Mudança de schema: SQL de referência aqui e `apply_migration` no MCP `supabase-iaschool`, no mesmo commit.
- Edge Functions em `supabase/functions/` publicam à parte do app. Listar quais faltam publicar ao fechar a tarefa.

## Comandos
- Dev: `pnpm --filter @workspace/iaschool-app run dev`
- Teste: `pnpm --filter @workspace/iaschool-app run test`
- Teste de integração contra o banco real exige `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. O Vitest lê o `.env.local` da raiz quando a variável ainda não está no processo e compila JSX no runtime automático.

## Comportamento

- O cadastro da escola consulta o CEP só no ViaCEP, com oito dígitos, e não grava `public.schools.logo` nem `public.schools.colors` (`artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`). Valores antigos permanecem na linha. A geração não anexa esse logo nem injeta essas cores, inclusive quando `public.prompt_settings` (`artifacts/iaschool-app/supabase/setup.sql`) ainda tem os blocos legados.
- A pasta do aluno agrupa `public.student_photos` (`artifacts/iaschool-app/supabase/fase3-face-recognition.sql`) por `public.student_photos.event_id`, com nome e data lidos de `public.events` (`artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`) pela consulta já permitida. Evento desta escola sem foto confirmada permanece na seleção, com a lista vazia. O ZIP é do filtro, nasce no navegador e não é gravado. As frases da espera da geração não dizem que as cores da escola entram na arte.

- A revisão por aluno oferece selecionar/desmarcar todas somente no cartão e evento atuais. Selecionar todas inclui fotos ambíguas com aviso; confirmar continua sendo ato separado. A seleção é conciliada por IDs: novas sugestões ficam desmarcadas, IDs removidos são esquecidos e troca de evento/aluno reinicia o contexto. Durante confirmação, seleção e repetição do lote ficam bloqueadas. A confirmação e sua trilha continuam nas RPCs existentes (`artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql`).

## Fora deste módulo
- `lib/db` não representa estas tabelas.
- `artifacts/mockup-sandbox` é protótipo, não este app.

- S04 local: `reviewMedia` e `confirmed-event-reference-picker.tsx` oferecem fotos de evento por rosto confirmado, com filtro por evento e caixa destacada. `public.confirmed_reference_photos`/`public.enqueue_confirmed_event_reference` (`artifacts/iaschool-app/supabase/fase5-review-media.sql`, aplicado em 12/10/2026 pelo MCP supabase-iaschool) revalidam escola, revisão humana e autorização `biometric_sorting`; guardam `public.student_reference_jobs.source_photo_id`, `public.student_reference_jobs.source_face_id`, `public.student_reference_jobs.source_bbox` e a autorização existente. O worker processa apenas a caixa exata; cobertura continua dependendo do processamento. Remoção, revogação, alteração da origem e retenção invalidam referências e enfileiram expurgo do recorte.
- Histórico S05 (substituído nas entregas em 13/10/2026 pela decisão de fotos nítidas): `PhotoPersonRegionEditor` usa original interno orientado para marcar retângulos/polígonos da pessoa inteira por gesto ou coordenadas. Desconhecido e outra criança são protegidos; aluno precisa de rosto confirmado e adulto detectado exige classificação humana na revisão. `public.save_photo_person_review` (`artifacts/iaschool-app/supabase/fase5-review-media.sql`, aplicado em 12/10/2026 pelo MCP supabase-iaschool) verifica geometria, vínculo, escola, dimensões e `public.photos.regions_version` esperada; só atesta a foto completa quando todas as pessoas detectadas têm região e a escola confere também as não detectadas. Salvar sem concluir mantém somente esta foto pendente. Mudança de região, face, classificação ou original invalida `public.photos.regions_reviewed_version` e `public.photos.all_people_reviewed`; aprovação/render dependem da versão persistida.

- S06 local: `delivery-workspace`, `delivery-service` e `DeliveryDraftDialog` permitem texto/seleção/ordem por família e conferência dos derivados carregados. `public.save_delivery_draft` e `public.approve_delivery_batch` (`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`, aplicado em 12/10/2026 pelo MCP supabase-iaschool) controlam versão e congelam o snapshot. Aprovar exige papel na escola do evento; preparação/100% não significa envio. Ações explícitas em `school-delivery` revalidam modo, número e autorizações; resultado incerto não oferece repetição automática. Versão já aprovada não pede segundo aceite; editar e salvar invalida o anterior.
- S07 local: `/album` é pública, recebe token no fragmento e o remove antes da chamada. A API do mesmo domínio faz proxy `/api/guardian-album`; sessão só em cookie HttpOnly/Secure/SameSite=Lax, sem token/session em localStorage. `public.consume_delivery_album_token`, `public.resolve_delivery_album_session` e `public.audit_delivery_album_access` (`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`, aplicado em 12/10/2026 pelo MCP supabase-iaschool) limitam destinatário/conjunto aprovado e prazos fixos; serviço rejeita versão alterada/revogação. Download/ZIP renova assinatura curta por item, valida HTTP/bytes e exige auditoria positiva antes de liberar ZIP. Auditoria registra autorização/ZIP preparado, sem prometer download final concluído. Miniatura expirada/falha orienta atualizar; erros usados/expirados/revogados orientam procurar a escola.
- A cobertura das referências considera somente referências processadas, autorizadas e não expiradas; fila é mostrada separadamente. Fixture `tests/fixtures/ajustes-ui.html` aceita apenas loopback + camada mock, material sintético/adultos e respostas locais; não comprova Supabase, cookie real, IA ou WhatsApp. Testes locais: `run test src`; não acrescentar `--` e não rodar integração no banco real sem autorização.

- A ficha do aluno usa colunas com largura mínima zero e abas que quebram linha para não alargar a pasta/referências no celular. Ensaio local de 50 fotos sintéticas, ZIP e teclado em viewport de 390 px; memória/aparelho físico não medidos.

- `/album` e `/api/guardian-album` recebem `Referrer-Policy: no-referrer` também na Vercel; regras específicas vêm depois da regra geral para não sobrescrever o cabeçalho privado do proxy. Build protegido em produção ensaiado antes da promoção.

- Publicado em 12/10/2026 na Vercel: `https://iaschool-app.vercel.app`, deployment `dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`. Dois SQLs complementares aplicados via MCP local; funções `guardian-album` v1, `school-delivery` v1 e `delivery-preview` v3 ativas. Teste `tests/adjustments-integrated.integration.test.ts`, opt-in/autorização própria, passou contra banco/workers/Edge/proxy reais com material sintético e aprovação pausada: sessão/cookie/uso único/download/hash/revogação, nenhum WhatsApp. Fixtures eliminadas e ausência de resíduos conferida. Não representa consentimento de responsável real nem reconhecimento real de pessoa. Gate false e gates de dados reais/comercial permanecem.

## S02 — decisão vigente: artes por aluno e turma

`pages/generate.tsx` usa três etapas: seleção de alunos/turmas, foto por aluno e pedido comum com quantidade/cota. A busca mostra somente alunos aptos retornados pela API autenticada; turma expande os aptos e informa o total, sem duplicar alunos. Remover turma preserva escolhas individuais. Foto principal de perfil é `photos[0]`; o modal Todas/Eventos recebe somente escolhas assinadas pela API, incluindo eventos revisados com o aluno sozinho. Não há contorno, segundo modelo ou upload obrigatório.

`lib/generation-batches.ts` centraliza o contrato de `/api/generation/batches`: elegibilidade, fotos, criar/listar/detalhar e retry manual. O servidor continua após fechar a página e salva cada sucesso; o cliente consulta o progresso sem iniciar geração. Criar ou retomar preserva requestId após resposta perdida; falha definitiva libera edição. Resultado incerto exige confirmação explícita de nova geração/cota. Consultas incluem usuário/escola para evitar cache cruzado. Downloads e ampliação renovam a assinatura via detalhe antes de usar o arquivo. Compartilhamento conserva autorização e consentimento/auditoria existentes. Somente fixture localhost/mock simula progressão, falha e retomada sem chamada paga.

Estado: wizard publicado em 12/10/2026. Publicado em 12/10/2026: app Vercel `dpl_5pRkJ2TuKri1r6FGRYZSTaBUkU7f` promovido em `https://iaschool-app.vercel.app`, API v6 e ingest v4 saudáveis na Fly. Migration `iaschool_generation_batches` (20261012194454) aplicada via MCP local. Sessão do app carregou wizard e autocomplete sem erro; endpoints sem sessão retornaram 401. Privilégios das tabelas internas e helpers privados conferidos no banco real. Sem nova geração OpenAI; teste do lote com provedor simulado não comprova uma geração real remota. WhatsApp comercial permanece desligado; nenhuma Edge Function mudou neste wizard. A correção de tela única abaixo é histórico e foi substituída por esta decisão do usuário.

- Correção S02 publicada em 12/10/2026: Vercel `dpl_9J6hZtidZJ3anDbcduFJANTSHNK9`, alias `https://iaschool-app.vercel.app`. Tela autenticada real conferida com foto + prompt, sem etapas/crop/revisão obrigatória. 298 testes locais, typecheck/build verdes; fluxo de geração/autosave/galeria/ampliar e tela pequena em fixture sintética, sem novo provedor real. Sem migration ou Edge Function nesta correção.

- Novas artes em `generated/<escola>/generation-batches/...` são reassinadas por `batch-asset-signing.ts` com 300 segundos e sem cache de URL antiga; falha de assinatura não reutiliza URL anterior. Arquivos legados mantêm TTL/cache existentes. SQL de `public.generated_posts` e policies do namespace: `artifacts/iaschool-app/supabase/generation-batches.sql`.

- Autocomplete de lotes filtra por nome/rótulo visível, ignorando maiúsculas/acentos/espaços repetidos; IDs e prefixos técnicos não geram matches. Estado marcado é indicado também em texto para leitores de tela. Testes: `generation-batches.test.ts`.

### Ensaio posterior do wizard — 12/10/2026

Em 12/10/2026, uma geração sintética adicional autorizada passou pelo domínio do app, API v6 e ingest v4 publicados: lote com um aluno, uma tentativa e uma cota; pedido idempotente, listagem/retomada, PNG 1024×1024 salvo na galeria e download real, revogação bloqueando elegibilidade e nova assinatura. Zero mensagens WhatsApp. O corpo do teste passou; o cleanup inicial falhou ao usar download em cache para conferir remoção. A verificação foi corrigida para metadados do Storage, a limpeza foi concluída sem repetir geração e ausência de conta/escola/aluno/lote/arte/arquivos/cota/logs/filas conferida. 49 testes locais API e typecheck passaram depois da correção; teste pago ficou desativado na segunda rodada.

## Clareza das entregas — 13/10/2026

`src/pages/event-deliveries.tsx` distingue preparo, conferência/aprovação e envio; falha de preparo mostra “Precisa de atenção”, contagem explicita fotos processadas sem afirmar proteção atual. Ação única abre fotos/mensagem; retry só as falhas, cancelamento confirmado com efeito descrito e revogação somente após possível emissão de acesso. `src/components/delivery-draft-dialog.tsx` ordena fotos → mensagem → aprovação, oferece atualização das assinaturas sem fechar e sugestão explícita do nome do evento; consulta com erro ou em atualização não reutiliza URLs antigas. Aprovação exige salvar alterações, carregar prévia atual e conferir a versão. Hooks invalidam detalhe/rascunho/prévia ao mudar lote e atualizam o detalhe enquanto ativo. Testes funcionais sintéticos em `tests/fixtures/ajustes-ui.html?tela=entregas&falha=1`; nada muda no banco real durante o ensaio.

Diagnóstico somente leitura: lote indicado criado antes da revisão atual contém quatro imagens sem versão de proteção válida e uma falha após cinco tentativas; contagem 80% não é execução atual ou confirmação de envio. Naquele fluxo, a conferência humana de proteção era necessária; a decisão posterior de fotos nítidas substitui essa regra nas entregas. Não reenfileirar fotos reais para testar. Sem migration, Edge Function ou mudança no WhatsApp comercial.

Publicado e promovido em 13/10/2026: `dpl_s2otZnquLRryKtraLFg6GxmR5DVJ`, https://iaschool-app.vercel.app. Verificação autenticada confirmou etapas, ação única de conferência, estado de atenção, ausência de revogação antes do envio e aprovação bloqueada com prévia indisponível. App local rodando em 127.0.0.1:5179, tela de entregas aberta no navegador integrado com material sintético. Sem migration ou Edge Function pendente para esta alteração.

- Histórico da recuperação de álbum (13/10/2026, antes da decisão de fotos nítidas): `DeliveryDraftDialog` permite “Retirar do álbum” por foto e “Retirar fotos com falha” por família. A ação altera somente seleção/ordem local, preserva a origem do evento e exige salvar nova versão antes de aprovar. O atalho considera falha de preparo, problema explícito (`protection_pending`, `render_failed`, `unavailable`) ou erro do arquivo da URL atual; imagem pendente, URL apenas ausente/antiga e erro global da consulta não viram falha por foto. `DeliveryPreviewItem` entrega URL opcional ou problema por item; a UI mostra o motivo e descarta URL acompanhada de problema. `deliveryPreviewReady` continua exigindo render pronto, URL disponível e carregamento da mesma URL para cada foto selecionada; proteção ausente não vira pronta. Remover todas mantém a validação de ao menos uma foto no lote.

### Publicação da correção de falhas isoladas — 13/10/2026

Publicado em 13/10/2026: app `dpl_9aJPieg7bFgJFX1b2swFmbZYxkXw` promovido, Edge `delivery-preview` v8 com JWT ligado e ingest v5 saudável. Conferência autenticada do lote real mostrou quatro problemas `protection_pending` e uma falha, sem erro global e com retirada por foto. Nenhuma foto/seleção real foi modificada. Teste integrado sintético real e limpeza passaram; nenhuma mensagem WhatsApp ou chamada OpenAI. Sem migration nova ou função pendente.

## Entregas com fotos nítidas — 13/10/2026

Decisão vigente do usuário: as fotos do álbum permanecem nítidas, sem desfoque e sem marcar regiões ou conferir proteção. `event-deliveries.tsx` e `DeliveryDraftDialog` oferecem somente fotos, mensagem e aprovação; o editor de regiões foi retirado deste fluxo. A autorização do responsável, o vínculo da família, a conferência da prévia atual e o envio explícito permanecem.

`DeliveryPreviewItem.problem=refresh_required` indica foto de um rascunho antigo que precisa ser preparada na versão nítida. “Atualizar fotos” chama a retomada existente e recarrega o álbum; alterações da seleção devem ser salvas antes. O atalho “Retirar fotos com falha” ignora esse caso e continua atendendo falhas reais de preparo/arquivo. Retirar uma foto muda só a seleção da família; preservar uma foto válida permite salvar e seguir sem a que falhou. Sem fotos selecionadas, a aprovação continua bloqueada. Fixture sintética `tests/fixtures/ajustes-ui.html?tela=entregas&atualizar=1` cobre a atualização do álbum antigo; `falha=1` preserva o cenário de falha isolada. Estado desta seção: código local; publicação é registrada separadamente.

Verificação local: 320 testes do app em 38 arquivos e typecheck da raiz passaram. Ensaio no navegador integrado com fixture sintética confirmou atualizar três fotos antigas e aprovar; também retirar uma foto com falha, salvar duas e aprovar. A instância sintética 5180 foi encerrada sem alterar a instância real 5179. Nenhuma mensagem WhatsApp ou chamada OpenAI.

- Envio na tela de entregas (15/10/2026, código local, função não publicada): `school-delivery` aceita `capability` e devolve só `sending: ready` ou `blocked` com um motivo (`paused`, `provider_missing`, `album_not_ready`, `public_url_invalid`, `instance_missing`). Não devolve segredo, URL nem identificador. O botão "Enviar texto e link" fica oculto até `ready`. Lote `queued` com envio fechado mostra "Aprovado, sem envio" e "Sem envio", no lugar de "Na fila". Falha da consulta também esconde o botão. Revogar acesso continua disponível. A função publicada ainda não tem essa ação. Verificação local: 322 testes em `src`, 5 testes Deno de `dispatch.test.ts`, typecheck verde e fixture sintética. Integração no banco real não rodou.


### Publicação coordenada das fotos nítidas — 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
