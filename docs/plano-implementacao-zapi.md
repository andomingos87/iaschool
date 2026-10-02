# Plano de implementação — ponte temporária Z-API

**Base:** [spec de WhatsApp](spec-whatsapp-api-oficial-entrega-fotos.md), decisão D8 e marcos W0–W5 do [backlog](../BACKLOG.md).  
**Estado em 29/09/2026:** plano; nenhuma etapa abaixo é declarada implementada, configurada ou publicada. O `BACKLOG.md` continua sendo a fonte do estado de execução.

## Resultado e limites

Validar com uma escola e até quatro pessoas participantes o fluxo completo: OTP no WhatsApp → aceite direto do responsável → preparo e revisão das fotos → mensagem com link privado → status por webhook → acesso, revogação e expurgo. O teste usa somente imagens sintéticas ou de adultos autorizados.

`controlled_zapi` é uma ponte que usa sessão do WhatsApp Web e envia mensagens externas reais. Ela não libera foto real de menor, uso comercial, quinta pessoa, outra escola, mídia anexada ou fallback automático. Ao fechar o primeiro contrato, a ponte é desligada; a Meta Cloud API precisa passar pelos gates da spec §18 antes do primeiro uso comercial.

## Ordem de execução

| Marco | Entrega verificável | Depende de |
| --- | --- | --- |
| Z0 — Contrato e trava | Provedor isolado; modo controlado falha fechado antes da rede | D8 aprovada |
| Z1 — OTP | Código real, sem `demoCode`, com estado de envio auditável | Z0, migration OTP |
| Z2 — Aceite | Responsável aceita termo versionado por link próprio | Z1, termo homologado |
| Z3 — Álbum | Lote, blur nos pixels, prévia, acesso e expurgo | Z2, migrations de entrega |
| Z4 — Envio e retorno | Fila, Z-API e webhook com correlação e reconciliação | Z3 |
| Z5 — Canário e retirada | E2E adulto; depois contrato Meta, troca de provedor e novo E2E | Z4 |

### Z0 — Contrato do provedor e travas operacionais

- [ ] Criar `WhatsAppProvider` para `sendOtp`, `sendConsentRequest`, `sendDeliveryReady` e `normalizeWebhook`, com resultados internos `accepted`, `sent`, `delivered`, `read`, `failed` e `unknown`. Centralizar as três mensagens lógicas, textos e versões; criar adaptador falso para testes e Z-API para o modo controlado. Reservar o mesmo contrato para o adaptador Meta.
- [ ] Resolver `WHATSAPP_MODE` e `WHATSAPP_PROVIDER` apenas no servidor. Qualquer combinação inválida, segredo ausente ou modo pausado falha fechado. O cliente não escolhe provedor nem recebe capacidade de forçar `controlled_zapi`.
- [ ] Antes **de toda chamada externa**, validar escola única habilitada, número E.164 na allowlist de 1–4 pessoas, máximo de 40 mensagens externas por dia, limite específico de OTP e kill switch. Contabilizar OTP, pedido de aceite e aviso do álbum no mesmo teto, de forma atômica no banco; concorrência não pode passar do limite. Normalizar E.164 para o formato só com dígitos exigido pelo campo `phone` da Z-API.
- [ ] Implementar `ZApiProvider` apenas com envio de texto: `POST /send-text`, corpo `phone` e `message`, cabeçalho `Client-Token`. Guardar `zaapId` e `messageId` da resposta no registro operacional. Construir a URL com o token da instância somente dentro do adaptador; jamais registrar URL completa, headers, texto do OTP ou link.
- [ ] Configurar instância temporária, conexão por QR, token da instância e `Client-Token` como secrets de servidor. Validar conexão e procedimento de pausa/desconexão sem disparar mensagens fora do canário. Registrar custo da instância, suporte, rotação e encerramento no runbook.
- [ ] Configurar webhook HTTPS exclusivo com segredo de rota de alta entropia. A documentação da Z-API consultada para este plano descreve `ids[]` no webhook de status, enquanto `/send-text` devolve `messageId`; a implementação deve correlacionar **cada ID recebido** com `messageId`, `instanceId` e telefone esperado. Rejeitar grupo, tipo inesperado e evento sem correspondência. Testar o formato com retorno real antes de liberar o canário.
- [ ] Atualizar avaliação de impacto e mapa de operadores para incluir Z-API/WhatsApp; homologar termo versionado e retenções da spec §11.3 antes de qualquer envio de consentimento ou foto.

**Aceite Z0:** quinta pessoa, outra escola, teto esgotado, pausa, segredo ausente e modo incompatível são barrados antes do HTTP externo. A suíte de contrato prova que o domínio não contém payload ou status da Z-API.

### Z1 — Verificação real do número

- [ ] Criar migration independente para trocar `guardian_verification_codes.code` por `code_hash`, descartar códigos pendentes em texto, registrar solicitante e mensagem externa, limitar tentativas e vincular a verificação ao hash do número atual. Atualizar o SQL de referência no mesmo conjunto de mudanças.
- [ ] Adaptar `send-guardian-code` para gerar código aleatório, guardar só hash e chamar a mensagem lógica pelo provedor ativo. Remover `demoCode` e `simulated` da resposta, tipos e interface. Ao mudar `guardians.whatsapp`, invalidar OTP, verificação, tokens e envios ainda pendentes.
- [ ] Aplicar 10 minutos de validade, 60 segundos entre envios, 5 por hora, 10 por dia por número e no máximo 5 tentativas de confirmação. O limite geral de 40 mensagens também vale para OTP.
- [ ] Persistir `whatsapp_messages` por tentativa: provedor, finalidade, versão lógica, ID externo e erro sanitizado. Resposta 2xx com ID externo vira somente `accepted`; timeout após transmissão vira `unknown`.

**Aceite Z1:** E2E com adulto comprova que o OTP chega ao número correto e confirma apenas aquele número; código nunca aparece no navegador, logs ou banco em texto. `anon` e `authenticated` não leem códigos ou mensagens operacionais.

### Z2 — Consentimento direto

- [ ] Criar `guardian_action_tokens` com token opaco de 256 bits, somente hash persistido, uso único e 24 horas de validade. Implementar `request-guardian-consent`, página pública e `guardian-consent`.
- [ ] Enviar texto de convite ao número **já verificado**, com link opaco. O responsável vê termo versionado, finalidade, retenção, operadores envolvidos no modo ativo e limite da revogação. Aceite exige ação afirmativa separada; recusa ou silêncio não criam autorização.
- [ ] Gravar `authorizations.evidence` com `source = guardian_link`, responsável, versão do termo, data e canal. `school_declaration` e consentimento herdado permanecem no histórico, mas não satisfazem o preflight. Revogação invalida tokens e bloqueia novas entregas.

**Aceite Z2:** teste com adulto percorre mensagem → termo → aceite/recusa → revogação. A escola acompanha estado, mas não aceita pelo responsável; corrida entre aceite e revogação termina no estado mais protetivo.

### Z3 — Lote e proteção das imagens

- [ ] Criar migrations de `delivery_batches`, `delivery_recipients`, itens, jobs de render, sessões de acesso, eventos e deduplicação do webhook; manter RLS sem policy nas tabelas internas, RPCs com checagem de escola/papel e grants explícitos. Criar bucket privado `delivery-assets`.
- [ ] Construir preflight por escola/evento. Usar somente `photo_faces.state = confirmed`; agrupar irmãos em uma entrega por responsável e evento. O professor prepara; `school_admin`/`school_staff` revisa e aprova. Revalidar consentimento e número na aprovação e no claim.
- [ ] Estender `ingest-worker` para gerar derivado por destinatário a partir do original. Desfocar nos **pixels** terceiros e rostos incertos, remover EXIF, guardar miniatura e derivado por no máximo 7 dias. Prévia humana da versão final é obrigatória; falha de render bloqueia envio.
- [ ] Ligar revogação e expiração a `storage_purge_queue`; provar remoção do objeto no Storage. Link de entrega é de uso único, vira sessão de 24 horas; URL assinada de arquivo dura no máximo 5 minutos e cada acesso revalida autorização.

**Aceite Z3:** foto de grupo sintética/adulta demonstra alvo nítido, terceiros/incertos desfocados no arquivo final, prévia igual ao download e expurgo verificado no banco e no Storage. Outro responsável ou escola não abre o álbum.

### Z4 — Fila, envio e webhook

- [ ] Implementar claim atômico com lease e `process-whatsapp-deliveries`. Antes do `POST /send-text`, revalidar modo, escola, allowlist, teto, autorização, número, revisão e ativos. Enviar só texto de teste controlado e link privado; nenhuma foto, miniatura ou ZIP vai à Z-API.
- [ ] Registrar uma tentativa em `whatsapp_messages` por chamada. Unicidade de destinatário ativo por lote/responsável, uma tentativa `sending` por destinatário e chave de idempotência impedem duplicatas sob concorrência.
- [ ] No `provider-webhook`, aceitar somente rota secreta, `instanceId` esperado, `type = MessageStatusCallback`, `isGroup = false`, telefone esperado e `ids[]` correlacionado. Deduplicar por provedor, ID, status e timestamp. Mapear `SENT` → `sent`, `RECEIVED` → `delivered`, `READ` → `read`; ignorar estados que não pertençam ao contrato, como `READ_BY_ME`/`PLAYED`. Status fora de ordem não regride o estado.
- [ ] Tratar 429/5xx com política de retry da spec; erro permanente vira `failed`. Timeout depois de transmitir vira `unknown`, aguarda 15 minutos para reconciliação e não causa novo envio imediato. Webhook Z-API atualiza **apenas telemetria de mensagem**: nunca cria aceite, sessão ou acesso ao álbum.
- [ ] Mostrar na escola `na fila`, `aceita pelo provedor`, `enviada`, `entregue`, `lida`, `falhou` e `resultado incerto`. Manter webhook ativo quando o consumidor estiver pausado para reconciliar envios anteriores.

**Aceite Z4:** suíte de funções cobre 2xx, 4xx, 429, 5xx, timeout, resposta malformada, webhook duplicado/fora de ordem, ID/instância/telefone divergentes e reconciliação. HTTP 2xx sozinho nunca mostra “entregue”.

### Z5 — Canário, operação e saída da Z-API

- [ ] Rodar suíte unitária, integração de banco/RLS, funções, worker, typecheck, build e advisors. Ensaiar 500 destinatários **somente com provedor falso**, sem envios externos. Verificar ausência de credenciais, códigos, telefones, tokens e URLs em bundle, resposta e logs.
- [ ] Ensaiar alertas de fila parada, falha de webhook, desconexão da instância, teto atingido e purge esgotado. Runbook deve cobrir pausar envios, reconciliar `unknown`, cancelar apenas o que não foi transmitido, revogar acesso e encerrar a instância.
- [ ] Cumprir integralmente o gate reduzido da spec §18.1. Rodar canário com até quatro participantes adultos autorizados e uma escola: OTP → aceite → lote com irmãos/foto de grupo → webhook → abertura/download → revogação → expurgo. Conferir estados por leitura de banco e Storage, sem guardar evidência sensível em arquivo.
- [ ] Após o contrato: desligar `controlled_zapi`, configurar ativos e três templates Meta, implementar `MetaCloudProvider`, rodar a mesma suíte de contrato e repetir E2E com adultos em `meta_test`. Só então avaliar os gates gerais da spec §18 e pedir autorização separada para piloto com foto real de menor.

**Aceite Z5:** canário Z-API reproduz o fluxo com dados permitidos, sem ultrapassar 4 números/40 mensagens/dia; adaptador Meta assume sem mudar domínio, banco, links ou UI. Uso comercial segue bloqueado enquanto o provedor ativo for Z-API.

## Entregáveis técnicos por camada

- **Edge Functions:** atualizar `send-guardian-code`; criar `request-guardian-consent`, `guardian-consent`, `provider-webhook`, `process-whatsapp-deliveries` e `guardian-delivery`, compartilhando `functions/_shared/whatsapp/`.
- **Banco:** migrations ordenadas para OTP/mensagens, tokens/aceite e entrega/webhook; SQL legível de referência em `artifacts/iaschool-app/supabase/`. Aplicação no projeto real somente via MCP `supabase-iaschool`, com autorização do marco e leitura posterior.
- **Worker:** `artifacts/ingest-worker/` para render, blur e expurgo. Publicação na Fly somente quando essa mudança estiver validada.
- **Web:** ficha do responsável, página de aceite, `/eventos/:id/entregas` e álbum temporário. Usar componentes/tokens existentes; nenhuma credencial no Vite.
- **Operação:** secrets de servidor, instância Z-API, webhook HTTPS, alertas, avaliação de impacto, mapa de operadores e runbooks. Instância, funções e modos remotos só contam como ativos após verificação no ambiente.

## Fontes externas conferidas para o contrato Z-API

- [Envio de texto e resposta `zaapId`/`messageId`](https://github.com/Z-API/z-api-docs/blob/main/docs/message/send-message-text.md).
- [Webhook de status, `ids[]`, `instanceId`, `phone`, `SENT`/`RECEIVED`/`READ` e HTTPS](https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes).
- [Uso de `Client-Token`](https://developer.z-api.io/security/client-token).

Esses formatos são dependências externas. Confirmar novamente na implementação e validar o payload recebido da instância de teste antes do canário.
