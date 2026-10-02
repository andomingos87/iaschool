# Spec — WhatsApp oficial para OTP e entrega privada de fotos

**Fases cobertas:** conclusão da pendência de produção #7, parte da Fase 4
(consentimento do responsável) e Fase 5 (entrega de fotos).
**Data:** 27/09/2026.
**Estado do documento:** aprovado em 27/09/2026. D1 a D7 foram homologadas pelo
produto; a implementação segue a opção 1 de cada decisão. Atualizado em
29/09/2026 com a D8: ponte temporária pela Z-API para validação controlada antes
do contrato, com migração obrigatória para a Meta Cloud API antes do uso
comercial.
**Acompanhamento:** [`BACKLOG.md`](../BACKLOG.md) continua sendo a fonte única de
estado. Este documento define produto, arquitetura, segurança e aceite.

---

## 1. Decisões já tomadas

O provedor definitivo do IAschool continua sendo a **Meta WhatsApp Cloud API
direta** para:

1. enviar o código de verificação do número do responsável;
2. solicitar o aceite do responsável para o escopo de entrega;
3. avisar que as fotos do evento estão disponíveis;
4. receber os estados `sent`, `delivered`, `read` e `failed` por webhook.

Antes da assinatura do primeiro contrato, o MVP terá uma ponte temporária pela
**Z-API** para exercitar o mesmo fluxo com no máximo quatro destinatários em
allowlist. A Z-API usa uma sessão do WhatsApp Web e realiza envios externos
reais; portanto esse modo não é mock, sandbox nem prova de equivalência com a
Meta.

A ponte existe somente no modo servidor `controlled_zapi`, sem fallback
automático entre provedores. Ao fechar o contrato, o modo é desabilitado, o
adaptador da Meta passa pelo mesmo contrato automatizado e o rollout comercial
continua bloqueado até os gates da §18.

## 2. Objetivo

Permitir que a escola envie as fotos confirmadas de um evento ao WhatsApp
verificado do responsável, com consentimento explícito, acesso privado,
proteção das outras crianças da foto e trilha do resultado real da entrega.

### 2.1 Resultado observável

| # | Resultado |
| --- | --- |
| R1 | O código de verificação chega ao WhatsApp do responsável e nunca volta ao navegador ou ao usuário da escola |
| R2 | O responsável aceita ou recusa, diretamente, um termo versionado para `delivery_whatsapp` |
| R3 | A escola vê quem está apto, bloqueado ou pendente antes de criar um lote |
| R4 | Um lote cria no máximo uma entrega por responsável e evento, mesmo quando o responsável tem mais de um aluno |
| R5 | Só fotos com rostos confirmados entram na entrega; rostos de outras crianças e rostos sem identificação ficam desfocados |
| R6 | O responsável recebe uma mensagem oficial com acesso privado às fotos, sem nome completo do aluno no texto ou na URL |
| R7 | A escola acompanha `na fila`, `aceita pela Meta`, `enviada`, `entregue`, `lida` ou `falhou` |
| R8 | Repetir uma ação ou receber o mesmo webhook não duplica mensagem nem evento de auditoria |
| R9 | Revogar a autorização bloqueia novos envios, invalida o acesso ainda ativo e agenda a exclusão dos derivados |
| R10 | O sistema diferencia aceitação da API, entrega no aparelho, leitura e download; nenhum HTTP 200 é apresentado como entrega |

### 2.2 Fora de escopo

- atendimento por chat, bot ou caixa de entrada;
- campanhas de marketing e mensagens promocionais;
- publicação em rede social;
- geração de artes em lote;
- cobrança de responsáveis;
- conta completa do papel `guardian` e portal permanente;
- envio de fotos como anexos permanentes dentro da conversa na primeira versão;
- troca automática para SMS, e-mail ou API não oficial.
- uso comercial da Z-API ou ampliação da allowlist acima de quatro pessoas.

O acesso temporário do responsável definido aqui é compatível com um portal
completo no futuro, mas não depende dele.

## 3. Estado atual verificado

Conferido no código local em 27/09/2026. O estado remoto citado abaixo vem da
documentação do repositório e precisa de leitura remota antes do rollout.

| Componente | O que existe | Lacuna para produção |
| --- | --- | --- |
| Provedor | Meta Cloud API aprovada como destino final; Z-API aprovada como ponte controlada | Nenhum adaptador existe; credenciais Z-API e ativos Meta não estão comprovados |
| OTP | `send-guardian-code` gera 6 dígitos, TTL de 10 min e antiflood de 60 s | Está em simulação, grava o código em texto e devolve `demoCode` ao navegador |
| Confirmação | RPC `confirm_guardian_code` limita tentativas e carimba `guardians.whatsapp_verified_at` | O fluxo ainda depende de a escola digitar o código; falta prova com mensagem real |
| Número | `guardians.whatsapp` em E.164; trocar o número zera a verificação | Falta normalização e validação também no servidor antes de chamar a Meta |
| Consentimento | `authorizations`, inclusive `delivery_whatsapp`, com histórico de concessão e revogação | A tela registra uma declaração da escola; não há aceite direto do responsável nem termo versionado |
| Fotos elegíveis | Pasta do aluno consulta somente `photo_faces.state = 'confirmed'` | Falta selecionar um evento, congelar os itens do lote e validar autorização de entrega |
| Proteção de terceiros | `photo_faces` preserva `bbox` e distingue `not_a_student` e `adult_or_staff` | O derivado desfocado ainda não é gerado nem revisado |
| Compartilhamento | A geração unitária abre `wa.me` e grava `share_logs` antes | A imagem não é anexada; abrir o WhatsApp não prova envio; o cliente ainda pode gravar a trilha |
| Fila | Existem filas em tabela para processamento de fotos | Não existem `delivery_batches`, destinatários, tentativas ou retry de WhatsApp |
| Webhook | Nenhum receptor da Meta | Faltam verificação GET, assinatura POST, deduplicação e estados de mensagem |
| Acesso externo | Buckets são privados para membros autenticados da escola | Responsável sem conta não possui sessão privada nem URL revogável |
| Auditoria | `share_logs` é append-only | Falta trilha normalizada de fila, provedor, entrega, acesso, download, revogação e expurgo |
| Observabilidade | Logs de funções e banco | Faltam métricas, alertas, painel por lote e runbook operacional |

Arquivos que definem o ponto de partida:

- [`send-guardian-code`](../artifacts/iaschool-app/supabase/functions/send-guardian-code/index.ts);
- [`guardian-verify-dialog.tsx`](../artifacts/iaschool-app/src/components/guardian-verify-dialog.tsx);
- [`eca.ts`](../artifacts/iaschool-app/src/lib/eca.ts);
- [`student-authorizations-card.tsx`](../artifacts/iaschool-app/src/components/student-authorizations-card.tsx);
- [`student-photo-folder.tsx`](../artifacts/iaschool-app/src/components/student-photo-folder.tsx);
- [`fase3-authorizations-reference-faces.sql`](../artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql);
- [`fase3-review-audit-purge.sql`](../artifacts/iaschool-app/supabase/fase3-review-audit-purge.sql).

## 4. Regras bloqueantes

1. Nenhuma foto real de criança entra no fluxo enquanto os gates de produção da
   §18 não estiverem fechados.
2. `school_declaration` não libera entrega real. Em produção, a autorização
   `delivery_whatsapp` precisa ter aceite do responsável, termo versionado e
   canal verificado.
3. O número verificado é o destino. A escola não digita outro número no lote.
4. Verificação do número não é consentimento para receber fotos. São fatos
   separados e auditados separadamente.
5. Uma resposta 2xx do provedor significa apenas que ele aceitou ou enfileirou a
   requisição. `delivered` só existe depois do webhook correspondente.
6. Foto ou rosto apenas `suggested` nunca sai do perímetro da escola.
7. Um erro ambíguo depois de transmitir ao provedor não causa retry imediato. Primeiro o
   sistema aguarda e reconcilia o webhook para evitar mensagem duplicada.
8. Revogação impede futuro acesso. Não existe forma de recolher uma mensagem,
   captura de tela ou arquivo já baixado pelo responsável; o termo deve dizer isso.
9. Tokens, códigos, telefone completo, nome de aluno, caminhos de arquivos e
   conteúdo de webhook não entram em logs de aplicação.
10. `anon` não chama helpers `security definer`, não lê filas e não lê buckets.
11. `controlled_zapi` aceita no máximo quatro telefones em allowlist definida no
    servidor e aplica limite global diário e kill switch.
12. O cliente não escolhe provedor, modo, destinatário alternativo ou endpoint.
13. A Z-API recebe somente texto e link privado; nenhum arquivo de foto é
    enviado como mídia pela API temporária.
14. Ausência de atividade comercial não elimina consentimento, minimização,
    auditoria ou dever de segurança sobre fotos e telefones.
15. O primeiro contrato bloqueia novos envios pela Z-API até a migração e o E2E
    da Meta serem aceitos.

## 5. Decisões de produto e arquitetura

As opções são mutuamente exclusivas. Em 27/09/2026, o produto aprovou a opção 1
de D2 a D7. As alternativas permanecem registradas para preservar o contexto.

### D1 ✅ — Provedor

**Decidido:** Meta WhatsApp Cloud API direta como provedor definitivo.

### D2 ✅ — Forma de entrega

**Aprovada:** opção 1 — link privado para álbum temporário.

1. **Link privado para álbum temporário (aprovado).** Uma mensagem por responsável e evento; permite revogar acesso, reduz custo e evita várias cópias no WhatsApp.
2. Enviar cada foto como mídia. É simples para o responsável, mas não permite revogação e multiplica mensagens e cópias.
3. Enviar um ZIP como documento. Reduz mensagens, mas o arquivo passa a circular fora do controle e piora a experiência no celular.

Motivo da decisão: entrega as fotos pelo WhatsApp sem tornar cada foto
uma cópia permanente e irrecuperável na conversa.

### D3 ✅ — Identidade da empresa no WhatsApp

**Aprovada:** opção 1 — uma WABA e um número dedicado do IAschool no MVP.

1. **Uma WABA e um número dedicado do IAschool no MVP (aprovado).** A mensagem identifica a escola em variável aprovada do template.
2. Uma WABA e um número por escola. Melhora a marca da escola, mas transforma onboarding e suporte em parte central do produto.
3. Contratar um BSP para gerenciar números e contas. Reduz operação da Meta, mas adiciona fornecedor, custo e novo operador de dados.

Motivo da decisão: reduz a operação durante o piloto. Reavaliar por volume, contrato e demanda de
marca própria antes de atender várias redes.

### D4 ✅ — Quem pode disparar

**Aprovada:** opção 1 — professor prepara; `school_admin` ou `school_staff`
aprova e envia.

1. **`school_admin` e `school_staff` aprovam e enviam; `teacher` prepara o lote (aprovado).** Mantém dois níveis sem retirar o trabalho operacional do professor.
2. Qualquer membro da escola envia. É mais rápido, mas amplia o risco de envio indevido.
3. Somente `school_admin` envia. É o controle mais forte, mas vira gargalo diário.

Regra aprovada: `dev` e `super_admin` não enviam em nome da escola, salvo se
forem membros dela no papel permitido.

### D5 ✅ — Fila de entrega

**Aprovada:** opção 1 — tabelas de domínio, claim atômico e Edge Function em
lotes pequenos.

1. **Tabelas de domínio + claim atômico + Edge Function em lotes pequenos (aprovado).** Segue o padrão já usado no produto e mantém estado, RLS e Realtime na mesma fonte.
2. Supabase Queues (`pgmq`) + Edge Function. É durável e oficial, mas duplica o estado operacional que a interface precisa consultar.
3. Uma chamada síncrona por destinatário no navegador. Não suporta retry confiável, segredo do provedor nem lote.

Regra aprovada para o MVP. Reavaliar `pgmq` acima de 50 mil destinatários
por dia ou quando houver mais canais de entrega.

### D6 ✅ — Geração da versão desfocada

**Aprovada:** opção 1 — derivado por destinatário, guardado por até 7 dias em
bucket privado.

1. **Gerar por destinatário ao preparar o lote e guardar por até 7 dias em bucket privado (aprovado).** O acesso continua rápido e o derivado pode ser expurgado ou refeito.
2. Gerar em toda abertura. Reflete o consentimento mais recente, mas adiciona espera e custo a cada acesso.
3. Gerar uma versão global por foto. É barata, mas não representa qual aluno é o destinatário e tende a expor ou esconder rostos errados.

Regra aprovada: gerar sempre a partir do original e fazer nova checagem de
autorização antes de assinar a URL.

### D7 ✅ — Fallback quando a Meta não estiver disponível

**Aprovada:** opção 1 — falhar fechado e manter na fila.

1. **Falhar fechado e manter na fila (aprovado).** Nenhuma mensagem sai por canal não aprovado.
2. Twilio Verify apenas para OTP; entrega continua bloqueada. Adiciona custo e operador, mas destrava verificação.
3. E-mail para OTP e fotos. Exige novo canal verificado, novo consentimento e muda o escopo da feature.

Regra aprovada para o lançamento. A opção 2 só entra por nova decisão de
produto e revisão do mapa de operadores.

### D8 ✅ — Ponte temporária antes do contrato

**Aprovada em 29/09/2026:** Z-API em ambiente controlado, com no máximo quatro
destinatários allowlisted, para validar o fluxo completo antes da Meta.

Regras aprovadas:

1. o domínio usa uma interface única de provedor; Z-API e Meta são adaptadores;
2. OTP, solicitação de consentimento e aviso de álbum usam mensagens lógicas
   versionadas, sem copy específica espalhada pelo código;
3. a Z-API envia apenas texto e link privado, nunca a foto como anexo;
4. `controlled_zapi` exige allowlist de até quatro E.164, teto diário no servidor,
   feature flag de uma escola e kill switch;
5. resposta 2xx vira `accepted`; `SENT`, `RECEIVED` e `READ` do webhook viram,
   respectivamente, `sent`, `delivered` e `read`;
6. status sem correlação por `messageId`, instância e telefone esperado é
   rejeitado e nunca autoriza acesso;
7. não existe fallback automático Meta → Z-API ou Z-API → Meta;
8. assinatura do primeiro contrato exige desligar a Z-API, configurar a Meta,
   rodar testes de contrato e repetir o E2E antes de liberar uso comercial.

Motivo da decisão: permite demonstrar o comportamento real do produto com um
grupo pequeno, preservando uma fronteira descartável para a troca de provedor.

## 6. Fluxos do usuário

### 6.1 Verificar o WhatsApp do responsável

1. Um membro permitido solicita a verificação na ficha do aluno.
2. O servidor resolve `primary_guardian_id`, a escola e o número salvo.
3. O servidor valida sessão, papel, vínculo com a escola, número em E.164,
   cooldown e limites por responsável, número e escola.
4. Gera um código criptograficamente aleatório de 6 dígitos.
5. Persiste somente o hash do código, expiração, tentativas e solicitante.
6. Envia a mensagem lógica `guardian_verification_code`, `pt_BR`; o adaptador
   escolhe texto Z-API ou template Authentication da Meta.
7. Persiste o provedor e o ID externo como `accepted`, nunca `delivered`.
8. O responsável informa o código à escola, que o digita na tela atual.
9. A RPC compara hashes, limita a cinco tentativas e consome o código no sucesso.
10. `guardians.whatsapp_verified_at` e `whatsapp_verified_value` são gravados.
11. Trocar o número zera os dois campos e invalida sessões e entregas pendentes.

O código não aparece em resposta, toast, console, log, teste de produção ou
painel administrativo. Testes automatizados recebem um adaptador de provedor
falso; não dependem de `demoCode`.

### 6.2 Coletar o consentimento direto

1. Depois da verificação, a escola chama `request-guardian-consent`, que envia
   `guardian_consent_request` ao número verificado.
2. A mensagem contém um link opaco, de uso único, válido por 24 horas.
3. O responsável abre uma página pública do IAschool, vê escola, aluno,
   finalidade, retenção, compartilhamento com Meta e regra de revogação.
4. O aceite de `delivery_whatsapp` é separado dos demais escopos e começa
   desligado. Silêncio ou fechar a página não autoriza.
5. Ao aceitar, o servidor grava uma nova linha em `authorizations` com
   `source = 'guardian_link'`, `termsVersion`, `guardian_id`, data, canal e hash
   da sessão. O texto aceito fica versionado no repositório.
6. Ao recusar, grava apenas o evento de recusa; não cria autorização ativa.
7. A escola vê o estado, mas não consegue aceitar em nome do responsável.

O consentimento antigo com `source = 'school_declaration'` continua no
histórico, mas não satisfaz o preflight de produção.

### 6.3 Preparar um lote de entrega

1. Na tela do evento, a escola abre **Entregar aos responsáveis**.
2. O preflight agrupa alunos por responsável e mostra: apto, número não
   verificado, autorização ausente/revogada, revisão pendente ou sem fotos.
3. O professor seleciona destinatários aptos e cria um rascunho.
4. Uma RPC em transação congela evento, alunos, responsável, número verificado,
   autorização usada, fotos confirmadas e versão do termo.
5. O `ingest-worker`, que já possui `sharp`, gera os derivados em
   `delivery-assets/{school_id}/{batch_id}/{recipient_id}/...`.
6. A tela mostra a versão exata que o responsável verá.
7. O professor conclui a preparação. `school_admin` ou `school_staff` revisa e
   aprova o lote.
8. A aprovação enfileira um destinatário por responsável.

Se o mesmo responsável possui dois alunos no evento, recebe um link e vê duas
pastas separadas na mesma sessão.

### 6.4 Regra de desfoque

Para cada foto e cada destinatário:

| Rosto | Saída |
| --- | --- |
| Aluno filho daquele responsável e `confirmed` | nítido |
| Outro aluno | desfocado na primeira versão, mesmo que possua autorização própria |
| `suggested`, `unassigned` ou `not_a_student` | desfocado |
| `adult_or_staff`, confirmado por pessoa | nítido |
| Detecção rejeitada | não participa do recorte, mas a prévia humana continua obrigatória |

Essa regra evita interpretar `delivery_whatsapp` como autorização para expor a
criança a todas as outras famílias. Uma futura permissão de compartilhamento
entre famílias exige escopo e termo próprios.

O desfoque é aplicado nos pixels do arquivo, nunca como CSS. O lote não sai sem
prévia porque o detector pode deixar de encontrar um rosto.

### 6.5 Enviar o lote

1. O consumidor reivindica destinatários `queued` com lease e lote limitado.
2. Revalida número, consentimento, autorização, evento e existência dos ativos.
3. Cria token opaco de 256 bits, guarda apenas o hash e associa ao destinatário.
4. Envia a mensagem lógica `guardian_event_photos_ready` com escola, evento,
   expiração e URL. Na Meta ela usa template **Utility**; na Z-API vira texto
   versionado. A mensagem não inclui nome completo do aluno.
5. Guarda provedor, ID externo, versão da mensagem lógica, configuração técnica
   do adaptador e horário.
6. O retorno 2xx muda para `accepted`.
7. O webhook promove para `sent`, `delivered`, `read` ou `failed`.
8. Realtime atualiza a tela do lote.

### 6.6 Abrir e baixar

1. O link troca o token de uso único por uma sessão aleatória em cookie
   `HttpOnly`, `Secure`, `SameSite=Lax`, válida por 24 horas.
2. O servidor revalida autorização, número, responsável e expiração.
3. A página lista somente os itens congelados para aquele destinatário.
4. Cada imagem recebe URL assinada por no máximo 5 minutos, com
   `Cache-Control: private, no-store` na resposta da aplicação.
5. O download individual ou ZIP é montado sob demanda. O ZIP não fica salvo.
6. Abertura e download geram eventos de auditoria sem registrar URL ou token.

Encaminhar o link antes da troca de token transfere o acesso. Por isso ele é de
uso único e curto. Depois da troca, o token original não abre outra sessão.

### 6.7 Revogar

Ao revogar `delivery_whatsapp`:

1. novos lotes recusam o aluno;
2. destinatários ainda não enviados viram `canceled`;
3. tokens e sessões ainda ativos são revogados;
4. derivados são enfileirados em `storage_purge_queue`;
5. o evento de revogação registra quem, quando e qual lote foi afetado;
6. mensagens e arquivos já baixados não podem ser recolhidos.

## 7. Arquitetura proposta

```text
Aplicação da escola
  ├─ send-guardian-code ───────┐
  ├─ request-guardian-consent ─┼───────► WhatsAppProvider
  └─ RPC create/approve delivery batch
             │
             ▼
       Postgres / RLS / Realtime
             │
      delivery_render_jobs
             │
             ▼
       ingest-worker + sharp
             │
             ▼
      bucket delivery-assets
             │
             ▼
  process-whatsapp-deliveries ─┬──────► ZApiProvider (`controlled_zapi`)
             ▲                 └──────► MetaCloudProvider (`meta_test`+)
             │                                │
       delivery_queue                        ▼
                                  provider-webhook normalizado
                                              │
                                              ▼
                                      estados e auditoria

Responsável ─► link opaco ─► guardian-delivery ─► URLs assinadas de 5 min
```

### 7.1 Responsabilidades

| Componente | Responsabilidade |
| --- | --- |
| App React | Preflight, rascunho, prévia, aprovação e acompanhamento; nunca conhece credencial ou escolhe provedor |
| `WhatsAppProvider` | Contrato interno de envio, erro e status; isola diferenças entre Z-API e Meta |
| `send-guardian-code` | Autenticar escola, limitar requisições, criar hash e enviar a mensagem lógica de OTP pelo provedor ativo |
| `request-guardian-consent` | Criar token de ação e enviar a mensagem lógica de consentimento ao número verificado |
| `guardian-consent` | Trocar token, exibir termo, registrar aceite ou recusa |
| RPCs | Congelar lote, checar tenant/papel/autorização e fazer transições atômicas |
| `ingest-worker` | Produzir derivados com `sharp`; não conhece token do WhatsApp |
| `process-whatsapp-deliveries` | Reivindicar poucos destinatários e chamar o adaptador ativo |
| `provider-webhook` | Aplicar a validação disponível em cada provedor, correlacionar, normalizar status e responder rápido |
| `guardian-delivery` | Trocar token por sessão, listar ativos e assinar URLs curtas |
| `storage_purge_queue` | Remover derivados expirados ou revogados do bucket |

### 7.2 Por que não enviar do navegador

O token da Meta é segredo de servidor. Além disso, o navegador não oferece
lease durável, retry seguro, deduplicação, webhook ou prova do resultado. O
cliente solicita uma transição; o servidor decide se ela é válida.

## 8. Modelo de dados

Nomes finais podem mudar na migration, mas as responsabilidades não.

### 8.1 Alterações existentes

`guardian_verification_codes`:

- substituir `code` por `code_hash`;
- adicionar `requested_by` e `whatsapp_message_id`; o estado do provedor fica
  no registro operacional de mensagem;
- `attempts <= 5` e expiração de 10 minutos;
- nunca expor tabela pela Data API.

`guardians`:

- adicionar `whatsapp_verified_hash` para provar qual número foi verificado sem
  criar outra coluna com o telefone em texto;
- trocar `whatsapp` invalida verificação, consent sessions, access sessions e
  destinatários ainda não enviados.

`share_logs`:

- manter linhas antigas do fluxo manual;
- revogar `insert` de `authenticated` antes do envio automático;
- não usar como estado mutável da fila;
- novas entregas são auditadas em `delivery_events`.

`authorizations.evidence`:

- aceitar `source = 'guardian_link'`;
- exigir `guardianId`, `termsVersion`, `acceptedAt` e `channel = 'whatsapp'`
  para liberar produção.

### 8.2 Novas tabelas

#### `guardian_action_tokens`

Token genérico de uso único para consentimento, troca por sessão e futuras
ações do responsável.

Campos essenciais: `id`, `guardian_id`, `purpose`, `token_hash`, `expires_at`,
`used_at`, `revoked_at`, `created_by`, `whatsapp_message_id`, `created_at`.

#### `whatsapp_messages`

Registro operacional de toda tentativa externa, seja OTP, consentimento ou
entrega. Campos essenciais: `id`, `purpose`, `guardian_id`, referências do
domínio, `target_whatsapp`, `provider`, `provider_message_id`,
`logical_message_name`, `logical_message_version`, `provider_config_version`,
idioma, `status`, `attempt_no`, timestamps e erro sanitizado.

Cada retry cria uma nova linha. `provider_message_id` é único quando presente.
A tabela é somente de servidor; a escola recebe uma projeção mascarada.

#### `delivery_batches`

Um lote aprovado pela escola.

Campos essenciais: `id`, `school_id`, `event_id`, `status`, `created_by`,
`approved_by`, `approved_at`, `terms_version`, contadores, `created_at`,
`finished_at`, `canceled_at`.

Estados: `draft`, `preparing`, `awaiting_review`, `ready`, `queued`,
`processing`, `completed`, `completed_with_errors`, `canceled`.

#### `delivery_recipients`

Uma entrega por responsável dentro do lote.

Campos essenciais: `id`, `batch_id`, `guardian_id`, `target_whatsapp`,
`verified_at_snapshot`, `status`, `attempts`, `next_attempt_at`, lease,
`current_whatsapp_message_id`, timestamps e erro sanitizado.

`target_whatsapp` existe porque o servidor precisa transmitir para o provedor,
mas não é selecionável pelo cliente. A interface recebe somente número
mascarado por RPC.

Estados: `preparing`, `blocked`, `awaiting_review`, `ready`, `queued`,
`sending`, `accepted`, `sent`, `delivered`, `read`, `failed`, `unknown`,
`canceled`, `revoked`, `expired`.

#### `delivery_recipient_students`

Liga um destinatário aos alunos sob sua responsabilidade. Guarda
`student_id`, `authorization_id` e snapshots mínimos para auditoria.

#### `delivery_items`

Foto preparada para um destinatário e aluno. Guarda `photo_id`,
`recipient_student_id`, `asset_path`, `thumb_path`, hash do ativo, estado de
render, revisor da prévia e prazo de expurgo.

#### `delivery_render_jobs`

Fila em tabela com o padrão de lease já usado em `photo_jobs`: `queued`,
`leased`, `done`, `failed`, cinco tentativas e erro sanitizado.

#### `delivery_access_sessions`

Sessão do responsável: `recipient_id`, `session_hash`, `expires_at`,
`revoked_at`, `last_accessed_at`. Nunca guarda token em texto.

#### `delivery_events`

Trilha append-only escrita apenas pelo servidor. Tipos mínimos:

- `batch_created`, `batch_approved`, `recipient_blocked`;
- `render_started`, `render_completed`, `preview_approved`;
- `provider_accepted`, `provider_sent`, `provider_delivered`, `provider_read`,
  `provider_failed`;
- `access_opened`, `photo_downloaded`, `zip_downloaded`;
- `authorization_revoked`, `access_revoked`, `assets_purged`.

O detalhe guarda identificadores e códigos técnicos necessários, sem telefone,
nome, token, URL ou caminho de objeto.

#### `whatsapp_webhook_events`

Deduplicação normalizada por `provider_message_id`, status, timestamp e código
de erro. RLS sem policy. O payload bruto não é persistido por padrão.

### 8.3 RLS e privilégios

- `delivery_batches`: leitura pelo membro da escola e escrita somente por RPCs
  específicas;
- destinatários, itens, filas, tokens, sessões e webhook: RLS ligada e nenhuma
  policy; a aplicação lê projeções seguras por RPC, sem telefone ou caminho;
- `whatsapp_messages`: RLS ligada e nenhuma policy; somente funções de servidor
  inserem ou atualizam;
- `delivery_events`: leitura por `school_admin` e `school_staff`; professor lê
  somente lotes que criou ou eventos aos quais tem acesso;
- bucket `delivery-assets`: nenhuma policy para `anon` ou `authenticated`;
- funções `security definer`: `search_path` fixo, checagem de `auth.uid()`, papel
  e escola dentro do corpo; `revoke execute from public, anon` explícito;
- o responsável sem conta acessa apenas Edge Functions com token/sessão
  próprios, nunca PostgREST direto.

## 9. Integração com provedores

O domínio não importa SDK, payload ou nome de status de provedor. Ele chama um
contrato pequeno, com `sendOtp`, `sendConsentRequest`, `sendDeliveryReady` e
`normalizeWebhook`. Cada envio retorna `provider`, `providerMessageId`,
`acceptedAt` e uma classificação segura de erro.

As mensagens lógicas e suas versões pertencem ao IAschool. O adaptador da
Z-API renderiza texto; o adaptador da Meta seleciona template aprovado. Essa
fronteira é o requisito principal para a troca de provedor não alterar fila,
auditoria, consentimento, links ou interface.

### 9.1 Meta — ativos externos definitivos

- Meta Business Portfolio verificado;
- WABA do IAschool;
- número dedicado que não dependa do aparelho de um funcionário;
- Meta App em modo Live;
- usuário de sistema com menor privilégio necessário;
- permissões `whatsapp_business_messaging` e, quando a operação exigir,
  `whatsapp_business_management`;
- método de pagamento e limites de mensageria verificados;
- assinatura da WABA no webhook;
- templates aprovados em `pt_BR`.

### 9.2 Meta — templates

| Nome lógico | Categoria proposta | Finalidade |
| --- | --- | --- |
| `guardian_verification_code` | Authentication | Código de 6 dígitos para verificar o número |
| `guardian_consent_request` | Utility | Link privado para o responsável aceitar ou recusar o termo |
| `guardian_event_photos_ready` | Utility | Link privado para abrir as fotos preparadas do evento |

A categoria final é a aceita pela Meta. O rollout não começa se o template
estiver pendente, rejeitado, pausado ou com qualidade impeditiva.

### 9.3 Secrets

Secrets do projeto Supabase:

- `WHATSAPP_ACCESS_TOKEN`;
- `WHATSAPP_PHONE_NUMBER_ID`;
- `WHATSAPP_WABA_ID`;
- `WHATSAPP_APP_SECRET`;
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
- `WHATSAPP_GRAPH_VERSION`;
- `WHATSAPP_OTP_TEMPLATE`;
- `WHATSAPP_CONSENT_TEMPLATE`;
- `WHATSAPP_DELIVERY_TEMPLATE`;
- `WHATSAPP_TEMPLATE_LANGUAGE`;
- `WHATSAPP_PROVIDER` (`fake`, `zapi` ou `meta`);
- `WHATSAPP_MODE` (`simulation`, `controlled_zapi`, `meta_test`, `pilot` ou
  `production`);
- `ZAPI_INSTANCE_ID`;
- `ZAPI_INSTANCE_TOKEN`;
- `ZAPI_CLIENT_TOKEN`;
- `ZAPI_WEBHOOK_SECRET`;
- `ZAPI_ALLOWLIST_E164`, com no máximo quatro números;
- `ZAPI_MAX_MESSAGES_PER_DAY`, limitado a 40 no modo controlado;
- `IASCHOOL_PUBLIC_URL`.

A versão da Graph API fica em configuração para permitir migração controlada.
Tokens, URLs completas de chamada e allowlist nunca são gravados no banco,
enviados ao browser ou incluídos em log.

### 9.4 Meta — webhook

`whatsapp-webhook` é público apenas na rede:

- GET valida `hub.verify_token` com comparação constante e devolve o challenge;
- POST lê o corpo bruto e valida `X-Hub-Signature-256` com HMAC-SHA256 e
  `WHATSAPP_APP_SECRET`;
- rejeita `phone_number_id` diferente do configurado;
- normaliza e persiste o evento antes de responder 200;
- deduplica reentregas;
- aceita estados fora de ordem usando timestamp do provedor;
- não registra o payload bruto nem conteúdo de mensagens recebidas;
- responde rápido e deixa processamento complementar para fila.

### 9.5 Z-API — ponte controlada

O adaptador temporário usa somente recursos documentados pela Z-API:

- `POST /send-text`, com `Client-Token`, para OTP, consentimento e aviso do álbum;
- resposta com `zaapId` e `messageId`, tratada apenas como `accepted`;
- webhook HTTPS de status;
- mapeamento `SENT` → `sent`, `RECEIVED` → `delivered` e `READ` → `read`.

O endpoint da Z-API inclui o token da instância no caminho. A aplicação não
registra a URL da requisição. O `Client-Token` fica obrigatório em todas as
chamadas. O webhook recebe uma URL exclusiva com segredo de alta entropia,
valida o `instanceId` e só aceita status que encontre correlação por
`messageId` e destinatário esperado.

A documentação consultada em 29/09/2026 exige HTTPS, mas não documenta uma
assinatura HMAC equivalente à Meta. Por isso o webhook da Z-API tem confiança
menor: ele atualiza telemetria de entrega, mas nunca cria consentimento, libera
álbum, muda destinatário ou autoriza qualquer operação sensível.

O modo `controlled_zapi` também exige:

- allowlist de 1 a 4 números E.164 no servidor;
- uma única escola habilitada por feature flag;
- teto de 40 mensagens externas por dia e limites menores do OTP;
- botão de pausa/kill switch no servidor;
- somente mensagens iniciadas por uma ação auditada no IAschool;
- texto identificando que é um teste controlado;
- proibição de anexar mídia; a mensagem leva apenas o link privado.

### 9.6 Status e verdade apresentada

| Sinal | Texto na interface |
| --- | --- |
| chamada local criada | Na fila |
| HTTP 2xx + ID externo | Aceita pelo provedor |
| webhook `sent` | Enviada pelo WhatsApp |
| webhook `delivered` | Entregue ao aparelho |
| webhook `read` | Lida |
| webhook `failed` | Falhou — mostrar motivo seguro |
| sem resposta após timeout | Resultado incerto — aguardando reconciliação |

A interface administrativa mostra qual provedor processou a tentativa. A tela
do responsável não expõe Z-API, Meta, IDs ou detalhes operacionais.

## 10. Idempotência e retry

### 10.1 Chaves

- uma aprovação de lote tem `idempotency_key` gerada no servidor;
- existe no máximo um destinatário ativo por `(batch_id, guardian_id)`;
- existe no máximo uma tentativa `sending` por destinatário;
- webhook usa chave normalizada única;
- render usa `(delivery_item_id, source_hash, render_policy_version)`.

### 10.2 Política de retry

- `429` e `5xx`: retry com jitter em 1 min, 5 min, 30 min, 2 h e 12 h;
- erro permanente de número, credencial, template, permissão ou pagamento: `failed`, sem
  retry automático;
- timeout depois de transmitir a requisição: `unknown`, aguarda webhook por 15
  minutos e exige reconciliação antes de nova tentativa;
- lease vencido volta à fila;
- operador pode reenfileirar falha permanente somente depois de corrigir a causa;
- nenhuma retentativa troca provedor, mensagem lógica, número ou autorização
  silenciosamente.

## 11. Segurança e privacidade

### 11.1 Base técnica de proteção

A feature é de alto risco porque trata foto e identificação biométrica de
menores e envia acesso para fora do produto. Aplicam-se privacidade por padrão,
minimização, finalidade específica, melhor interesse e segurança desde a
concepção. A verificação do canal é uma barreira técnica do produto; não deve
ser descrita como uma exigência literal do art. 35 do Decreto nº 12.880/2026.

Base usada no desenho: Lei nº 15.211/2025, arts. 3º, 5º, 7º, 8º e 16; LGPD,
arts. 6º, 11 e 14. O Decreto nº 12.880/2026, art. 35 trata de conteúdo
violador, vexatório ou degradante, não de verificação de WhatsApp.

### 11.2 Controles mínimos

- consentimento granular e ativo do responsável;
- separação entre verificar o canal e autorizar a finalidade;
- nenhuma data de nascimento ou nome completo em mensagem e URL;
- telefone mascarado em UI e logs;
- token opaco de alta entropia, hash no banco e uso único;
- cookie seguro para a sessão temporária;
- URL assinada curta para cada arquivo;
- proteção contra enumeração por resposta e tempo;
- rate limit por token, sessão, número, escola e IP com IP reduzido/hash quando
  estritamente necessário;
- `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` e CSP nas
  páginas públicas;
- segredo Meta restrito às funções de envio;
- App Secret para validar webhook;
- nenhum rosto ou arquivo nos logs de observabilidade;
- rotação documentada de token e verify token;
- avaliação de impacto e mapa de operadores atualizados antes do piloto real.

### 11.3 Retenção proposta, sujeita à homologação jurídica

| Dado | Retenção técnica proposta |
| --- | --- |
| OTP | até uso, cinco falhas ou 10 minutos; depois apagar |
| Token de consentimento | 24 horas; hash apagado ou inutilizado depois do uso |
| Sessão de entrega | 24 horas ou revogação |
| Derivados de entrega | até 7 dias, revogação ou fim do lote, o que ocorrer primeiro |
| Evento normalizado de webhook | 90 dias para suporte e reconciliação |
| `delivery_events` | 2 anos após o evento, configurável após revisão jurídica |
| Fotos originais e biometria | seguem as regras já definidas para evento e expurgo; esta feature não amplia prazo |

Não há prazo legal específico confirmado para a trilha de entrega. O prazo de
2 anos é proposta de produto e precisa de homologação antes de produção.

## 12. Experiência da escola

### 12.1 Ficha do aluno

Substituir o toggle direto de `delivery_whatsapp` por estados e ações:

- número não cadastrado;
- aguardando verificação;
- número verificado;
- aguardando aceite do responsável;
- autorizado, com versão e data;
- recusado;
- revogado.

A escola pode **solicitar** verificação e consentimento. Não pode marcar o
aceite do responsável.

### 12.2 Evento

Nova rota `/eventos/:id/entregas`:

- resumo do preflight;
- filtros por turma e estado;
- motivos claros para bloqueio;
- criação de rascunho;
- progresso da geração dos derivados;
- grade da prévia protegida;
- aprovação por papel permitido;
- progresso de envio e entrega;
- ação de cancelar apenas o que ainda não foi enviado;
- exportação CSV operacional sem telefone completo.

### 12.3 Linguagem

- “Aceita pelo provedor” não vira “entregue”.
- “Lida” não vira “baixada”.
- “Acesso revogado” não promete apagar cópia já baixada.
- A UI nunca diz “consentimento confirmado” para declaração feita pela escola.

## 13. Observabilidade e operação

### 13.1 Métricas

- OTP solicitado, aceito pelo provedor, entregue, confirmado, expirado e bloqueado;
- idade da fila e do item mais antigo;
- destinatários por estado;
- taxa `accepted → delivered` e `delivered → read`;
- falhas por provedor e código seguro;
- atraso entre webhook e persistência;
- derivados pendentes, falhos e expirados;
- tokens usados, expirados e revogados;
- expurgo pendente e falho.

### 13.2 Alertas iniciais

- webhook sem evento por 30 minutos durante lote ativo;
- fila mais antiga acima de 10 minutos;
- falha acima de 5% em 15 minutos;
- template pausado/rejeitado;
- token/permissão inválido;
- instância Z-API desconectada ou allowlist recusada;
- expurgo com cinco falhas;
- `unknown` há mais de 30 minutos.

Os limites são ponto de partida e devem ser calibrados no piloto.

### 13.3 Runbooks obrigatórios

- token Meta expirado ou revogado;
- instância, token ou `Client-Token` da Z-API inválido;
- migração Z-API → Meta e rollback sem troca automática de provedor;
- template pausado ou reclassificado;
- conta sem pagamento ou limite;
- webhook inválido ou atrasado;
- mensagem com resultado incerto;
- número inválido ou sem WhatsApp;
- revogação durante lote;
- ativo não expurgado;
- cancelamento de lote;
- incidente de acesso indevido.

## 14. Testes e evidências

### 14.1 Unidade

- normalização E.164;
- hash e comparação de OTP e tokens;
- rate limits e máximo de tentativas;
- máquina de estados de lote, destinatário e mensagem;
- classificação de erro transitório, permanente e ambíguo;
- ordem de status de webhook;
- idempotência;
- regra de desfoque por estado do rosto;
- cálculo de elegibilidade;
- sanitização de logs e erros.

### 14.2 Integração com banco

- escola A não lê ou envia lote da escola B;
- professor prepara, mas não aprova;
- admin/staff aprovam;
- `anon` não chama RPC nem lê tabela;
- declaração da escola não libera produção;
- aceite do responsável cria autorização versionada;
- revogação cancela, invalida sessão e enfileira expurgo;
- corrida entre aprovação e revogação falha fechada;
- duas aprovações simultâneas não duplicam destinatário;
- webhook repetido gera um evento;
- status fora de ordem preserva a verdade temporal;
- troca de número invalida verificação.

### 14.3 Funções

- JWT ausente ou membro de outra escola;
- Meta: assinatura de webhook ausente, errada e correta;
- Meta: `phone_number_id` errado e Graph API 2xx, 4xx, 429, 5xx e timeout;
- Z-API: allowlist, limite de quatro números, teto diário e kill switch;
- Z-API: `instanceId`, `messageId` e telefone divergentes;
- Z-API: 2xx, 4xx, 429, 5xx, timeout e payload inesperado;
- contrato compartilhado: os adaptadores falso, Z-API e Meta produzem os mesmos
  estados internos e classes de erro;
- payload malformado sem vazamento em log;
- token expirado, usado, revogado e válido;
- URL assinada somente após sessão válida.

### 14.4 Imagem

- todas as caixas esperadas recebem blur nos pixels;
- alvo permanece nítido;
- outras crianças ficam desfocadas;
- desconhecido e `not_a_student` ficam desfocados;
- `adult_or_staff` permanece nítido;
- EXIF não reaparece no derivado;
- arquivo final respeita limite e formato aceitos;
- prévia e download usam o mesmo hash.

### 14.5 E2E

Antes de foto real:

1. `controlled_zapi` com até quatro destinatários allowlisted;
2. fotos sintéticas ou de adultos com autorização;
3. OTP real sem código no navegador;
4. consentimento real pelo link;
5. lote com dois responsáveis, irmãos e foto de grupo;
6. webhook `sent`, `delivered`, `read` e falha controlada;
7. revogação antes do envio e depois da entrega;
8. expiração e expurgo confirmados por leitura do banco e Storage;
9. ensaio de 500 destinatários com provedor falso e sem mensagens reais;
10. repetir o mesmo roteiro em `meta_test` antes do primeiro contrato comercial.

## 15. Critérios de aceite

### 15.1 OTP

- [ ] Código nunca aparece no cliente, logs ou banco em texto.
- [ ] Expira em 10 minutos e aceita no máximo cinco tentativas.
- [ ] Respeita 60 s entre envios, 5 por hora e 10 por dia por número.
- [ ] Trocar número zera a verificação.
- [ ] Webhook comprova ao menos uma entrega real em ambiente de teste.

### 15.2 Consentimento

- [ ] Responsável aceita diretamente termo versionado.
- [ ] Toggle da escola não satisfaz o preflight.
- [ ] Recusa e revogação não podem ser contornadas pelo cliente.
- [ ] O texto explica destinatários, finalidade, prazo e impossibilidade de recolher download.

### 15.3 Fotos

- [ ] Apenas associação `confirmed` entra no lote.
- [ ] Outras crianças, desconhecidos e `not_a_student` ficam desfocados.
- [ ] Derivado não contém EXIF.
- [ ] Uma pessoa revisa a versão final antes da aprovação.
- [ ] Ativo expira e é removido pelo worker.

### 15.4 Entrega

- [ ] Uma mensagem por responsável e evento.
- [ ] Lote repetido não duplica mensagem.
- [ ] UI diferencia `accepted`, `sent`, `delivered`, `read` e `failed`.
- [ ] Timeout ambíguo não dispara retry imediato.
- [ ] Cancelamento interrompe destinatários ainda não transmitidos.
- [ ] Acesso usa token opaco, sessão curta e URL assinada de 5 minutos.

### 15.5 Segurança e operação

- [ ] Advisors do Supabase sem achado novo crítico.
- [ ] Nenhuma tabela ou RPC interna acessível a `anon`.
- [ ] Webhook Meta rejeita assinatura inválida; webhook Z-API rejeita eventos
      sem segredo e correlação completa.
- [ ] Secrets não aparecem no bundle, Git ou logs.
- [ ] Alertas e runbooks foram ensaiados.
- [ ] Avaliação de impacto e mapa de operadores foram atualizados.

### 15.6 Ponte temporária Z-API

- [ ] O modo `controlled_zapi` não inicia sem allowlist de 1 a 4 números.
- [ ] O quinto número, número não listado e limite diário excedido falham antes
      de qualquer chamada externa.
- [ ] Apenas texto e link privado são enviados; nenhum binário de foto chega à Z-API.
- [ ] `SENT`, `RECEIVED` e `READ` atualizam os estados internos sem liberar acesso.
- [ ] Pausar o modo bloqueia novos envios e mantém reconciliação dos já aceitos.
- [ ] Ativar Meta exige nova configuração e E2E; não existe fallback automático.

## 16. Plano de implementação

### W0 — Provedores e homologação

- registrar D2 a D7 como aprovadas; ✅ 27/09/2026;
- registrar D8 como aprovada; ✅ 29/09/2026;
- criar `WhatsAppProvider`, adaptador falso e suíte de contrato;
- implementar o adaptador Z-API, allowlist, teto diário e kill switch;
- configurar a instância temporária e webhook sem expor secrets;
- fechar texto e versão do termo;
- homologar retenções e mapa de operadores;
- depois do contrato, concluir WABA, empresa, número, cobrança e usuário de sistema;
- depois do contrato, aprovar três templates e implementar o adaptador Meta;
- registrar custos e limites vigentes da Meta no runbook, sem congelá-los no código.

**Saída temporária:** Z-API limitada a quatro destinatários e sem uso comercial.

**Saída definitiva:** ativos Meta prontos e adaptador aprovado pelo mesmo contrato.

### W1 — OTP real

- migration para hash, limites, snapshots do número e trilha;
- adaptar `send-guardian-code` para `WhatsAppProvider`;
- remover `demoCode` e `simulated`;
- testes com provedor falso, Z-API controlada e, na migração, Meta com adultos;
- status de mensagem por webhook.

**Saída:** canal verificável de verdade, ainda sem fotos reais.

### W2 — Consentimento do responsável

- tokens de ação;
- página pública de consentimento;
- termo versionado;
- estados novos na ficha do aluno;
- bloqueio de `school_declaration` no preflight.

**Saída:** autorização válida para entrega, sem lote ainda.

### W3 — Lote e derivados

- migrations de lote, destinatários, itens, render jobs, sessões e eventos;
- bucket privado `delivery-assets`;
- extensão do `ingest-worker` para blur e purge;
- tela de preflight, preparação e prévia;
- aprovação por papel.

**Saída:** entrega preparada e revisada, sem chamada de envio em produção.

### W4 — Envio, webhook e acesso

- consumidor da fila;
- adaptadores Z-API e Meta atrás do mesmo contrato;
- webhook normalizado e idempotente, com validação forte da Meta e correlação
  restrita da Z-API;
- link de uso único, sessão e URLs curtas;
- acompanhamento em Realtime;
- retry, reconciliação e cancelamento.

**Saída temporária:** E2E pela Z-API com até quatro allowlisted.

**Saída definitiva:** o mesmo E2E repetido pela Meta antes do uso comercial.

### W5 — Operação e piloto

- métricas, alertas e runbooks;
- ensaio de carga com provedor falso;
- teste de revogação e expurgo;
- canário Z-API com até quatro pessoas autorizadas;
- ensaio de migração e canário Meta com adultos após o contrato;
- piloto com uma escola somente depois dos gates da §18.

**Saída:** produção limitada e observada.

## 17. Arquivos previstos

### Código e configuração

- `artifacts/iaschool-app/supabase/functions/send-guardian-code/index.ts`;
- `artifacts/iaschool-app/supabase/functions/request-guardian-consent/index.ts`;
- `artifacts/iaschool-app/supabase/functions/whatsapp-webhook/index.ts`;
- `artifacts/iaschool-app/supabase/functions/process-whatsapp-deliveries/index.ts`;
- `artifacts/iaschool-app/supabase/functions/guardian-consent/index.ts`;
- `artifacts/iaschool-app/supabase/functions/guardian-delivery/index.ts`;
- `artifacts/iaschool-app/supabase/functions/_shared/whatsapp/provider.ts`;
- `artifacts/iaschool-app/supabase/functions/_shared/whatsapp/fake-provider.ts`;
- `artifacts/iaschool-app/supabase/functions/_shared/whatsapp/zapi-provider.ts`;
- `artifacts/iaschool-app/supabase/functions/_shared/whatsapp/meta-provider.ts`;
- `artifacts/iaschool-app/supabase/fase5-whatsapp-delivery.sql`;
- `artifacts/iaschool-app/src/pages/event-deliveries.tsx`;
- componentes e hooks de verificação, consentimento, preflight, prévia e status;
- `artifacts/ingest-worker/` para render e expurgo dos derivados;
- testes unitários e de integração nos pacotes afetados.

### Edge Functions a publicar

- `send-guardian-code` atualizada;
- `request-guardian-consent` nova;
- `whatsapp-webhook` nova;
- `process-whatsapp-deliveries` nova;
- `guardian-consent` nova;
- `guardian-delivery` nova.

### Migration a aplicar

No mínimo uma migration versionada para a Fase 5, aplicada exclusivamente pelo
MCP `supabase-iaschool`, com atualização do SQL de referência no mesmo commit.
Se o trabalho for dividido por marco, preferir migrations independentes e
ordenadas para OTP, consentimento e entrega.

## 18. Gates para produção com foto real

Todos precisam estar fechados:

- [ ] pendências de domínio, SMTP, confirmação de e-mail e cadastro E2E de
  [`docs/pendencias-producao.md`](pendencias-producao.md);
- [x] decisões D2 a D7 homologadas em 27/09/2026;
- [x] ponte temporária D8 homologada em 29/09/2026;
- [ ] WABA, empresa, número, cobrança, token e permissões comprovados;
- [ ] templates aprovados e ativos;
- [ ] OTP real comprovado sem vazamento de código;
- [ ] termo versionado e aceite direto do responsável;
- [ ] autorização e revogação testadas;
- [ ] derivados desfocados revisados;
- [ ] webhook Meta assinado e estados reais comprovados;
- [ ] RLS, grants e Storage validados;
- [ ] expiração e expurgo comprovados;
- [ ] avaliação de impacto e operadores atualizados;
- [ ] alertas, suporte e resposta a incidente disponíveis;
- [ ] canário com adultos concluído;
- [ ] autorização explícita para iniciar piloto real.

Build local, migration aplicada, função publicada ou mensagem aceita pela Meta
não substituem a prova E2E deste checklist.

### 18.1 Gate reduzido para a demonstração Z-API

O modo `controlled_zapi` pode ser exercitado antes da Meta somente quando:

- [ ] allowlist contém entre uma e quatro pessoas que aceitaram participar;
- [ ] a escola de teste está fixada por feature flag no servidor;
- [ ] teto diário e kill switch foram testados;
- [ ] consentimento, link privado, revogação, blur e expurgo funcionam;
- [ ] a avaliação de impacto e o mapa de operadores incluem Z-API e WhatsApp;
- [ ] o material usado é sintético/adulto até os gates gerais para foto de menor;
- [ ] está documentado que não há atividade comercial nem fallback automático.

Esse gate permite validar o comportamento do produto. Ele não libera operação
comercial nem substitui os gates da Meta acima.

## 19. Rollout e rollback

### Rollout

1. `WHATSAPP_MODE=simulation`: provedor falso, nenhuma mensagem externa.
2. `WHATSAPP_MODE=controlled_zapi`: Z-API, uma escola, até quatro números e teto diário.
3. `WHATSAPP_MODE=meta_test`: Meta de teste e allowlist de adultos, obrigatório
   após o contrato e antes do piloto.
4. `WHATSAPP_MODE=pilot`: Meta, uma escola e allowlist explícita.
5. `WHATSAPP_MODE=production`: Meta e escolas habilitadas por feature flag.

O modo é segredo/configuração de servidor. O cliente apenas lê capacidades
seguras e nunca escolhe o modo.

### Rollback

- desligar a criação de novos lotes por feature flag;
- pausar o consumidor sem apagar filas;
- cancelar somente destinatários ainda não transmitidos;
- manter webhook ativo para reconciliar mensagens já aceitas;
- manter acesso de entregas já válidas ou revogá-lo por decisão explícita;
- nunca apagar auditoria para “voltar versão”.

## 20. Custos

O documento não fixa preço por mensagem porque a Meta altera modelo, categoria
e tabela por país. Antes do piloto, registrar no runbook:

- custo temporário da instância Z-API e data prevista de encerramento;
- preço vigente de Authentication e Utility no Brasil;
- franquias ou janelas aplicáveis;
- custo do número e da conta;
- armazenamento temporário de derivados;
- invocações das Edge Functions;
- CPU adicional do `ingest-worker`.

As escolhas desta spec limitam custo a, em regra, um OTP quando necessário,
uma solicitação de consentimento e uma mensagem de entrega por responsável e
evento.

## 21. Dependências e riscos

| Risco | Resposta |
| --- | --- |
| Sessão Z-API cai, é bloqueada ou diverge da Meta | Pausar, mostrar `unknown`/falha e nunca trocar provedor automaticamente |
| Webhook Z-API sem assinatura forte documentada | Segredo de rota, correlação completa e nenhum efeito de autorização |
| Ponte temporária vira dependência permanente | Gate contratual desliga Z-API e exige suíte + E2E Meta antes do comercial |
| Aprovação da empresa ou template demora | Feature permanece em teste; sem fallback silencioso |
| Template é reclassificado ou pausado | Bloquear novos envios e alertar operação |
| Provedor aceita e webhook não chega | Estado `unknown`, reconciliação e sem retry imediato |
| Responsável encaminha link | Uso único, expiração curta e sessão; risco residual explícito |
| Detector deixa rosto sem caixa | Prévia humana obrigatória antes do envio |
| Consentimento revogado durante lote | Revalidação no claim e antes de assinar cada URL |
| Mensagem já entregue após revogação | Bloquear acesso; informar que a notificação não pode ser recolhida |
| Derivado não é removido | `storage_purge_queue`, cinco tentativas e alerta |
| Telefone reciclado | Revalidar após troca e prever renovação periódica em decisão futura |
| Custos crescem | Uma mensagem por responsável/evento e painel por categoria |

## 22. Referências técnicas externas

- [Meta — WhatsApp Business Platform, coleção oficial no Postman](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta — Cloud API: mensagens e acompanhamento por ID](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages)
- [Meta — referência de webhooks e estados](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Meta — mídia e limites de formato](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3)
- [Z-API — introdução e fluxo de envio](https://v2.developer.z-api.io/)
- [Z-API — envio de texto](https://github.com/Z-API/z-api-docs/blob/main/docs/message/send-message-text.md)
- [Z-API — webhook de status](https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes)
- [Z-API — Client-Token](https://developer.z-api.io/security/client-token)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase — Queues](https://supabase.com/docs/guides/queues)
- [Supabase — consumir filas com Edge Functions](https://supabase.com/docs/guides/queues/consuming-messages-with-edge-functions)

As páginas da Meta, Z-API e Supabase são dependências vivas. Versões, categorias,
preços, limites e payloads devem ser relidos no início de cada marco, na migração
de provedor e antes de produção.
