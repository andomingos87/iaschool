# Status — IAschool

Legenda: ✅ concluído · 🔄 em andamento · ⬜ a fazer · ⛔ bloqueado

Atualizado em 12/10/2026. Resumo do [BACKLOG.md](../../../BACKLOG.md); o backlog e as specs preservam a distinção entre código, publicação, ensaio e gates de produção.

## Correção de experiência — 12/10/2026

✅ Geração simplificada publicada e conferida para foto de referência + prompt + Gerar arte. Removidos recorte/conferência obrigatória e etapas; resultado salva automaticamente com nova tentativa sem outra geração. 298 testes app + 28 API e typecheck/build verdes. API v5 saudável; fluxo sintético simulado e interface publicada conferidos, sem nova geração paga. Substitui a decisão anterior de composição com pixels originais.

---

## Fase 0 — Descontaminação ✅

- ✅ Remover entidades de futebol
- ✅ Renomear domínio
- ✅ Reescrever prompt de geração
- ✅ Wizard 7 → 4 passos; selo da plataforma removido
- ✅ Comunicação aluno/escola
- ✅ Marca e pacotes
- ✅ Rebrand do design system
- ✅ Banco Supabase provisionado
- ✅ Super admin provisionado
- ✅ Edge `send-guardian-code` em simulação
- ✅ Docs da fase

### Higiene pendente da Fase 0 ✅

- ✅ Commitar working tree
- ✅ `.playwright-mcp/` no `.gitignore`
- ✅ PR `pivot/fase-0` → `main`
- ✅ Apagar specs divergentes
- ✅ Verificar Problemas 2 e 3 do diagnóstico
- ⬜ Geração em modo demo (mock ou botão desabilitado)
- ⬜ `api-server`: drenar corpo antes de responder
- ⬜ Cliente: tratar `onerror` do XHR

---

## Transversal — Produção e conformidade 🔄

### Infra e cadastro

- ✅ Reativação do Supabase
- ✅ `SUPABASE_ACCESS_TOKEN` renovado
- ⬜ Evitar nova pausa por inatividade
- ⬜ #1 Comprar domínio
- ⬜ #2 Assinar o Resend
- ⬜ #3 Confirmar domínio no Resend
- ⬜ #4 Template "Confirm signup" pt-BR
- ⬜ #5 Ligar "Confirm email"
- ⬜ #6 Cadastro ponta a ponta

### Publicação, CI e higiene

- ✅ Publicar o `iaschool-app`
- ✅ Subir a API de geração e trocar o rewrite
- 🔄 Geração real sintética no domínio publicado passou; o aceite completo de interface/visual está discriminado na S02.
- ✅ Deploy de produção fora da `main` corrigido (PR #12)
- ⬜ Conferir plano do time na Vercel (Hobby/comercial)
- ⬜ Confirmar exclusão do `iaschool-api-server`
- ⬜ Desligar produto antigo na Vercel
- ✅ Limpar resíduo dos testes de integração
- ⬜ Decidir as 2 escolas "(demo)"
- ⬜ Testes de integração disputam a fila com os workers
- ⬜ CI rodando testes
- ✅ Corrigir `generation-auth.integration.test.ts`
- ✅ Revogar `execute` de `anon` nas `security definer`
- ⬜ Ligar proteção contra senha vazada
- ⬜ Decidir se o repositório continua público
- ⬜ Apagar branches já mergeadas

### WhatsApp oficial + OTP (#7)

- ⬜ Meta Business Suite / WABA / número
- ⬜ Template `guardian_verification_code`
- ⬜ Secrets `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
- ⬜ Trocar bloco SIMULAÇÃO por Graph API
- ⬜ Teste ponta a ponta do responsável

### Comercial e piloto

- ⬜ Definir preço e cobrança
- ⬜ Escolher 3 exemplos reais de arte
- ⬜ Confirmar prazos do piloto
- ⬜ Identidade visual da rede-alvo
- ⬜ Agendar reunião com a diretora

### Conformidade antes de dado real

- ⬜ Avaliação de impacto
- ⬜ Termo `biometric_sorting` versionado
- ⬜ Política de privacidade biométrica
- ⬜ Termo: circulação entre famílias, revogação e prazos

---

## Fase 1 — Fundação escolar ✅/⬜

### M1 — Fase 1 mínima ✅

- ✅ Migration `iaschool_fase1_schools_members_classes`
- ✅ `schools`, `school_members`
- ✅ `profiles.role` global
- ✅ `classes` (série como coluna)
- ✅ `guardians`
- ✅ `students.school_id/class_id/enrollment_number/primary_guardian_id`
- ✅ `events` (status, retenção, declaração)
- ✅ Helpers `is_member_of`, `is_dev`
- ✅ Migração `owner_id` → `school_id`
- ✅ OTP do responsável refeito
- ✅ Policies por escola
- ✅ Ensaio e `rls.integration.test.ts`
- ✅ Hooks/repositórios por escola
- ✅ Aposentar autocadastro de aluno
- ✅ Atualizar `SUPABASE.md` e `AGENTS.md`
- ✅ Migration aplicada e testes verdes

### Fase 1 completa

- ⬜ Importação CSV de alunos e responsáveis
- ⬜ Professor responsável pela turma (tela)
- ⬜ Remover a tabela `clubs`
- 🔄 Papel `dev`: telas de manutenção
- ✅ Checagens de papel que ignoravam `dev`

---

## Fase 2 — Upload em massa ✅

### M2 — Fotos e upload no cliente ✅

- ✅ `photos` + `batch_jobs` + `event_photo_counts`
- ✅ Buckets `event-photos`/`event-thumbs`/`event-originals`
- ✅ Telas `/eventos`, `/eventos/novo`
- ✅ Aviso de alunos sem referência
- ✅ Tela `/eventos/:id` com dropzone e progresso
- ✅ Upload no cliente (hash, retomada, limites, 2560px)
- ✅ HEIC convertido no cliente
- ✅ Contagem "já enviada" (dedup)
- ✅ `useImageUpload` para logo/modelos
- ✅ Correção HEIC no upload de foto/logo/modelo
- ✅ Formatos do lote ampliados
- ✅ Testes RLS de `photos`
- ✅ Sobras do M2 resolvidas no M3
- ⬜ Lixeira de eventos com restauração
- ⬜ Apagar foto pela tela

### M3 — Fila, ingest-worker e galeria ✅

- ✅ `photo_jobs` + `claim_photo_jobs`
- ✅ Retry de jobs falhos
- ✅ `ingest-worker`
- ✅ Galeria virtualizada
- ✅ Progresso com Realtime
- ✅ Deploy do worker na Fly
- ✅ `/health` com `stalled_batch_jobs`
- ✅ Log estruturado
- ✅ Testes da fila e unitários
- ⬜ Sobras: backfill, R3, HEIC de iPhone real

---

## Fase 3 — Reconhecimento facial ✅

### M0 — Spike ✅

- ✅ Benchmarks
- ✅ D1 InsightFace self-hosted
- ✅ Limiares recalibrados
- ✅ `Dockerfile` do `face-worker`
- ✅ Medição em GPU dispensada
- ✅ Comparação com AWS dispensada
- ⛔ Acurácia em criança de 4 a 10 anos (só no piloto)

### M4 — Autorizações e rosto de referência ✅

- ✅ `authorizations` (4 escopos, travas)
- ⛔ Colher consentimento real (texto jurídico)
- ✅ Migrar `students.guardian->>'consentAt'`
- ✅ Toggles da ficha do aluno
- ✅ `student_reference_faces` + bucket `student-refs`
- ✅ Aba "Rosto de referência"
- ✅ `retention_until` fim do ano letivo
- ✅ Indicador de prontidão
- ✅ Texto da aba de referência
- ✅ Embedding `det_size` 640

### M5 — face-worker, atribuição e pasta do aluno ✅

- ✅ Extensão `vector`
- ✅ `docker build`
- ⬜ `bench_throughput.py` na máquina da Fly
- ✅ `face-worker`
- ✅ Laço de referência
- ✅ `photo_faces`
- ✅ `face_recognition_settings`
- ✅ Busca vetorial por escola
- ✅ Embedding só com consentimento
- ✅ `bbox`/`det_score` sobrevivem ao expurgo
- ✅ Bucket `face-crops`
- ✅ Revogar `select` de `embedding`
- ✅ Pasta do aluno (N:N)
- ✅ Service role só nos workers
- ✅ Deploy do `face-worker`
- ⬜ Sobras: medir §11.1, recalibrar limiares

### M6 — Revisão, trilha, expurgo e aceite ✅/⬜

- ✅ Tela `/eventos/:id/revisao` (aba por aluno)
- ✅ Aba de exceção
- ✅ RPCs `confirm_face`/`reject_face`
- ✅ RPC `confirm_faces_bulk`
- ✅ `confirmed` sempre com revisor
- ✅ Teste de concorrência do lote
- ✅ "Criança de fora" / "Adulto / equipe"
- ✅ Aba Fotos só `confirmed`
- ✅ Baixar fotos em ZIP
- ✅ `biometric_events` append-only
- ✅ `purge_expired_biometrics()` (cron)
- ✅ Fila `storage_purge_queue`
- ✅ Prazos de retenção
- ✅ Testes unitários
- ✅ Testes RLS de conformidade
- ⬜ Aceite §12.2 com dado sintético
- ⬜ Recalibrar limiares no piloto
- ⬜ Sobras do M6
- ✅ Trilha em cascata no delete
- ⬜ Apagar escola apaga trilha biométrica
- ⬜ Revisar `grant` de `purge_expired_student_trash()`

---

## Fase 4 — Autorização granular + portal ⬜

- ⬜ Spec da fase
- ⬜ Revogação retroativa sobre material entregue
- ⬜ Eliminação a pedido do responsável
- ⬜ Regras de quem pode apagar
- ⬜ Papel `guardian` e portal
- ✅ Desfocar quem não autorizou (implementação na Fase 5)

---

## Fase 5 — Criação e envio em lote

### Trilha A — Z-API / WhatsApp oficial

#### W0 — Provedores e homologação operacional 🔄

- ✅ Aprovar D1–D7
- ✅ Aprovar D8
- ⬜ `WhatsAppProvider` (falso, Z-API, Meta)
- ⬜ Mensagens lógicas versionadas
- ⬜ `WHATSAPP_MODE`
- ⬜ Allowlist E.164 / teto / kill switch
- ⬜ Instância Z-API
- ⬜ Webhook HTTPS Z-API
- ⬜ Avaliação de impacto com Z-API/WhatsApp
- ⬜ Termo versionado `delivery_whatsapp`
- ⬜ Homologar retenções
- ⬜ Runbook Z-API
- ⬜ Tarefas Meta pós-contrato (10 itens)
- ⬜ Suíte de contrato e evidências
- ⬜ Critérios de aceite do W0

#### W1 — OTP real e trilha de mensagens 🔄

- ⬜ Migration OTP/`whatsapp_messages`
- ⬜ `code_hash` (sem texto)
- ⬜ Hash do número verificado
- ⬜ Limites (60 s / 5 h / 10 dia)
- ⬜ 5 tentativas e consumo no sucesso
- ⬜ Adaptadores sob `WhatsAppProvider`
- ⬜ `send-guardian-code` com mensagem lógica
- ⬜ Remover `demoCode`/`simulated`
- ⬜ `provider-webhook`
- ⬜ Tela com estados distintos
- ⬜ Revogar acesso do cliente
- ⬜ Aplicar migration só via MCP
- ⬜ Publicar funções após testes
- ⬜ Testes e critérios de aceite do W1

#### W2 — Consentimento direto do responsável 🔄

- ⬜ Migration `guardian_action_tokens`
- ⬜ Token opaco, uso único, 24 h
- ⬜ `request-guardian-consent`
- ⬜ `guardian-consent`
- ⬜ Página pública de consentimento
- ⬜ Ação afirmativa
- ⬜ Evidência (guardian, versão, data, canal)
- ⬜ Impedir `school_declaration` de liberar
- ⬜ Substituir toggle direto por solicitação
- ⬜ Recusa/revogação/nova concessão
- ⬜ Invalidar tokens ao trocar número
- ⬜ Publicar funções
- ⬜ Testes e critérios de aceite do W2

#### W3 — Lote, derivados protegidos e prévia ✅

- ✅ Migrations do lote e `delivery_*`
- ✅ Bucket privado `delivery-assets`
- ✅ RPCs de preflight/congelamento/aprovação
- ✅ Papéis (teacher prepara, admin aprova)
- ✅ Projeções seguras por RPC
- ✅ Realtime sem dado do destinatário
- ✅ `ingest-worker`: `delivery-render.ts`, fila, handler
- ✅ Derivado por destinatário (desfoque nos pixels)
- ✅ Deploy do `ingest-worker`
- ✅ Edge `delivery-preview`
- ✅ Ensaio transacional + integração 9/9
- ✅ Tela `/eventos/:id/entregas` (código; deploy frontend pendente)
- ⬜ Aceite do W3

#### W4 — Envio, webhook, acesso e download ⬜

- ⬜ Claim atômico de destinatários
- ⬜ `process-whatsapp-deliveries`
- ⬜ Mensagem Z-API/template Meta
- ⬜ Linha em `whatsapp_messages` por tentativa
- ⬜ Retry com jitter / falha permanente
- ⬜ Timeout → `unknown`
- ⬜ `provider-webhook` (sent/delivered/read/failed)
- ⬜ Eventos fora de ordem
- ⬜ Cookie `HttpOnly` de sessão
- ⬜ `guardian-delivery` com revalidação
- ⬜ URLs assinadas ≤ 5 min
- ⬜ Download individual e ZIP
- ⬜ Eventos de acesso/download
- ⬜ Tela do lote por Realtime
- ⬜ Publicar funções
- ⬜ Testes e critérios de aceite do W4

#### W5 — Observabilidade, segurança e piloto ⬜

- ⬜ Métricas
- ⬜ Alertas
- ⬜ Runbooks e ensaios
- ⬜ Carga com 500 destinatários
- ⬜ Canário Z-API adulto
- ⬜ Typecheck/testes/build
- ⬜ Integração contra o projeto real
- ⬜ Advisors do Supabase
- ⬜ Secrets/PII fora de bundle/log
- ⬜ Expiração e expurgo
- ⬜ Dashboards/alertas/rollback
- ⬜ Fechar gates §18
- ⬜ Desligar Z-API e ativar `meta_test`
- ⬜ Autorização para piloto real
- ⬜ `pilot` em uma escola
- ⬜ Testes e aceite final do W5

#### Definição de pronto da Trilha A ⬜

- ⬜ Código + SQL + testes + docs juntos
- ⬜ Migrations via MCP com readback
- ⬜ Edge Functions publicadas
- ⬜ `ingest-worker` só se mudou
- ⬜ CI verde separado de E2E
- ⬜ E2E só adultos antes do piloto
- ⬜ Uso comercial bloqueado com `zapi`
- ⬜ Migração Meta comprovada
- ⬜ Relatório final
- ⬜ Primeiro lote acompanhado até `delivered`/expurgo

### Trilha B — Templates de evento e artes em lote ⬜

- ⬜ Spec própria
- ⬜ Decidir fila/cota/rate limit/custo/moderação/revisão
- ⬜ Implementar só após homologar a spec

---

## Ajustes de produto (07/10/2026)

- ✅ §1 WhatsApp só do responsável
- ✅ §2 Cadastro do aluno sem autorização
- ✅ §3 Foto de perfil vira referência
- ✅ §4 Scanner na miniatura
- ✅ §5 Tirar o passo de logo
- 🔄 §6 Primeiro login da escola
- ✅ §7 Ficha de gestão da escola
- ✅ §8 Escola única não escolhe escola
- ⬜ §9 Arte em massa (decisão em aberto)
- ✅ §10 Combobox com pesquisa
- ✅ §11 Porta para o lote de entrega

---

## Ajustes de produto (11/10/2026) — specs por entrega ✅

S01–S07 implementadas e publicadas em 12/10/2026. Detalhes e aceites ainda
não executados no [overview](overview.md) e em cada spec.

- ✅ S01 — ViaCEP, edição manual e retirada de logo/cores do produto.
- ✅ S02 — Modelo na etapa, quatro atalhos, recorte humano, composição original e novas artes sem faixa. Uma geração real PNG 1024 preservou 18.600 pixels protegidos e consumiu uma cota.
- ✅ S03 — Pasta por evento, filtro e ZIP realmente aberto; 50 fotos leves ensaiadas em viewport de celular.
- ✅ S04 — Seleção humana em lote e referência de rosto confirmado com origem/caixa/autorização. Origem/fila sintéticas verificadas; não é prova de reconhecimento de pessoa real.
- ✅ S05 — Revisão da foto completa e corpo inteiro, versão persistida e renderer publicado. Cena/proteção testadas em pixels localmente; render real conferido por versão/hash.
- ✅ S06 — Rascunho, seleção/ordem, aprovação congelada, estados e envio bloqueado com modo pausado. Zero mensagens WhatsApp no ensaio.
- ✅ S07 — Cookie privado, uso único, sessão de 24h sem renovar, assinatura curta, download/ZIP, reenvio e revogação. Sessão/download/revogação reais verdes no domínio do app.
- ✅ Migrations `iaschool_adjustments_review_media` e `iaschool_adjustments_delivery_album` aplicadas via MCP local.
- ✅ Funções `guardian-album` v1, `school-delivery` v1, `delivery-preview` v3 ativas; API v4, ingest v3 e face v2 na Fly; app promovido na Vercel.
- ✅ Dados/contas/arquivos sintéticos removidos e limpeza conferida. `DELIVERY_ALBUM_READY=false` preservado.
- ⬜ Aceites completos de leitor de tela/aparelho físico, conjunto visual/histórico e termo específico para circulação entre famílias, conforme specs. Envio comercial e dado real de menor continuam sujeitos aos gates próprios.

---

## Decisões em aberto ⬜

- ⬜ Animação distribuindo as fotos nas pastas
- ✅ Arte em massa (§9 de 07/10): decisões homologadas e código local verificado; migration aplicada e publicação concluída em [S08](08-wizard-geracao-lote.md).
- ✅ T04 — recorte conferido e composição original, sem serviço/modelo de segmentação novo (decisão aprovada e publicada).
- ⬜ S05 — termo/escopo de exposição entre famílias

## Correção posterior — wizard de artes (12/10/2026)

O recorte obrigatório descrito em S02 foi rejeitado pelo usuário. O wizard atual segue [S08](08-wizard-geracao-lote.md): alunos/turmas com autocomplete, fotos individuais e prompt comum, uma arte por aluno, execução persistente e retry manual. 313 testes app, 49 API, 58 ingest, ensaio PostgreSQL, typecheck/build e UI sintética verdes. Migration `iaschool_generation_batches` aplicada (20261012194454); app promovido, API v6/ingest v4 saudáveis. Sessão/autocomplete conferidos; sem geração OpenAI adicional. A geração real anterior comprovou somente o pipeline legado de composição; não é aceite real do lote novo. WhatsApp comercial permanece desligado.

### Ensaio posterior do wizard — 12/10/2026

Em 12/10/2026, uma geração sintética adicional autorizada passou pelo domínio do app, API v6 e ingest v4 publicados: lote com um aluno, uma tentativa e uma cota; pedido idempotente, listagem/retomada, PNG 1024×1024 salvo na galeria e download real, revogação bloqueando elegibilidade e nova assinatura. Zero mensagens WhatsApp. O corpo do teste passou; o cleanup inicial falhou ao usar download em cache para conferir remoção. A verificação foi corrigida para metadados do Storage, a limpeza foi concluída sem repetir geração e ausência de conta/escola/aluno/lote/arte/arquivos/cota/logs/filas conferida. 49 testes locais API e typecheck passaram depois da correção; teste pago ficou desativado na segunda rodada.

### Publicação da correção de falhas isoladas — 13/10/2026

Publicado em 13/10/2026: app `dpl_9aJPieg7bFgJFX1b2swFmbZYxkXw` promovido, Edge `delivery-preview` v8 com JWT ligado e ingest v5 saudável. Conferência autenticada do lote real mostrou quatro problemas `protection_pending` e uma falha, sem erro global e com retirada por foto. Nenhuma foto/seleção real foi modificada. Teste integrado sintético real e limpeza passaram; nenhuma mensagem WhatsApp ou chamada OpenAI. Sem migration nova ou função pendente.


### Fotos nítidas — 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
