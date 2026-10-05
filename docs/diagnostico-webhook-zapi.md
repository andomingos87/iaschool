# Diagnóstico — ponte Z-API e webhook de status

**Data:** 02–03/10/2026
**Projeto Supabase:** `jtyyauivokutperouqyh` (IAschool)
**Instância Z-API:** `th2-iaschool` — id `3FA0AC622C49A19C23A072C933C06ADD`
**Escopo:** configurar a ponte `controlled_zapi` e investigar por que o webhook
de status não chega ao `provider-webhook`.
**Estado:** OTP validado de ponta a ponta; webhook de status **não dispara** pela
Z-API (causa do lado da Z-API, não do nosso código).

> Este documento é um registro operacional de depuração. Valores de token,
> segredo de rota e números completos estão redigidos de propósito.

---

## 1. Objetivo

Fechar o fluxo da ponte temporária Z-API: OTP real por WhatsApp → confirmação
do código → canal do responsável verificado, e telemetria de entrega
(`sent`/`delivered`/`read`) chegando por webhook e sendo gravada no banco.

Base: [`docs/plano-implementacao-zapi.md`](plano-implementacao-zapi.md) e
[`docs/spec-whatsapp-api-oficial-entrega-fotos.md`](spec-whatsapp-api-oficial-entrega-fotos.md),
§§9.5 e 15.6.

---

## 2. Ambiente configurado

| Item | Valor |
| --- | --- |
| Edge Functions publicadas | `send-guardian-code` v4 (`verify_jwt` true) e `provider-webhook` v2 (`verify_jwt` false) |
| Migration | `iaschool_fase4_whatsapp_foundation` (aplicada em 02/10/2026) |
| Escola habilitada | `Colégio Aurora (demo)` — única com `enabled = true` |
| Allowlist | 2 números (adultos já verificados) |
| Teto diário | 40 |
| Kill switch | ligado (envio ativo) |
| Secrets no Supabase | `WHATSAPP_MODE=controlled_zapi`, `WHATSAPP_PROVIDER=zapi`, `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`, `WHATSAPP_WEBHOOK_SECRET` |

Confirmação de que os secrets estavam ativos (sem enviar nada):

- `provider-webhook` com rota inválida → `404` (segredo configurado);
- `send-guardian-code` com JWT anon → `401` em vez de `503` (passou da checagem do provedor).

---

## 3. Linha do tempo das tentativas

### 3.1 Primeiro envio — "não chegou"

- OTP disparado pela ficha do aluno.
- Banco: `whatsapp_messages.status = accepted`, com `messageId` e `zaapId`.
- **Nenhum evento** em `whatsapp_webhook_events`.
- Usuário relatou que a mensagem não chegou.

### 3.2 Descoberta nº 1 — auto-envio

**Erro de configuração:** a instância Z-API foi conectada ao **mesmo número** que
deveria receber o OTP. Mensagens para o próprio número caem na conversa
**"com você mesmo"**, sem notificação — parecia falha de envio, mas o código
estava lá.

- Ação: confirmado no WhatsApp; código encontrado na conversa consigo mesmo.
- Digitação do código → `guardians.whatsapp_verified_at` carimbado →
  **verificação real confirmada** (não mais o valor semeado da demo).
- **Lição:** para o canário, a instância precisa estar conectada a um número
  **diferente** do destinatário.

### 3.3 Webhook configurado no painel — ainda sem eventos

- Usuário desligou o toggle **"Ignorar webhook de status"**.
- Novo OTP (`accepted`) → **0 eventos**.

### 3.4 Configuração do webhook pela API Z-API

```
PUT https://api.z-api.io/instances/<ID>/token/<TOKEN>/update-webhook-message-status
Headers: Client-Token: <CLIENT_TOKEN>, Content-Type: application/json
Body:    {"value":"https://jtyyauivokutperouqyh.supabase.co/functions/v1/provider-webhook/<SEGREDO>"}
Resposta: {"value":true}
```

- Novo OTP → **0 eventos** de novo.

### 3.5 Teste sintético — prova de que o nosso lado funciona

`POST` direto no `provider-webhook` com um payload de status válido:

- `SENT` → `204`; `RECEIVED` → `204`; `READ` → `204`.
- Banco: `whatsapp_webhook_events` gravou `sent`, `delivered`, `read` e a
  mensagem avançou de `accepted` até `read`.

**Conclusão:** endpoint, segredo, parsing, correlação (`instanceId` + `phone` +
`messageId`) e atualização de status **estão corretos**. O problema é a Z-API
não chamar.

### 3.6 Descoberta nº 2 — filtros de webhook

A Z-API tem um filtro separado que desativa callbacks **mesmo com a URL
configurada**: `FILTER_MESSAGE_STATUS_CALLBACK` em `callbackTypeFilters`
(ver [Filtros de webhook](https://developer.z-api.io/webhooks/update-filters)).

```
PUT .../update-filters
Body: {"callbackTypeFilters":["FILTER_DELIVERY_CALLBACK","FILTER_DISCONNECTED_CALLBACK","FILTER_RECEIVED_CALLBACK","FILTER_PRESENCE_CHAT_CALLBACK","FILTER_CONNECTED_CALLBACK"]}
Resposta: {"value":true}
```

- Novo envio (para número **diferente** da instância, para descartar auto-envio)
  → **0 eventos** ainda.

### 3.7 Painel conferido — configuração correta

Print da aba "Webhooks e configurações gerais":

- campo "Receber status da mensagem" **preenchido** com a URL correta;
- toggle "Ignorar webhook de status" **desligado**.

Ou seja, o painel diz que deveria enviar, mas não envia.

---

## 4. Causas descartadas

| Hipótese | Resultado |
| --- | --- |
| Número do destinatário errado | Descartada — E.164 correto, com o 9º dígito |
| Segredo de rota divergente | Descartada — teste sintético retornou `204` |
| Payload/campo fora do contrato | Descartada — formato da doc bate com o parser |
| Correlação (`instanceId`/`phone`/`messageId`) | Descartada — evento sintético correlacionou |
| Auto-envio suprimindo status | Descartada — testado também com número diferente |
| Filtro `FILTER_MESSAGE_STATUS_CALLBACK` | Ajustado via API, sem efeito observado |
| URL não salva no painel | Descartada — painel mostra a URL preenchida |

---

## 5. Causa provável (pendente)

Sobra a própria Z-API não estar disparando o callback. Suspeitas, em ordem:

1. **Webhook configurado na instância errada.** Os prints iniciais mostravam duas
   instâncias: `iaschool` e `th2-iaschool` (id `3FA0…`). O envio usa a
   `th2-iaschool`. Se a URL foi salva na `iaschool`, a que envia fica sem
   webhook.
2. **Instância precisa reiniciar** após mudar a config de webhook.
3. **Restrição/limitação da Z-API** (instância em período `TRIAL`).

---

## 6. Como reproduzir os testes

Teste do nosso webhook (isola o lado da Z-API):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://jtyyauivokutperouqyh.supabase.co/functions/v1/provider-webhook/<SEGREDO>" \
  -H "Content-Type: application/json" \
  -d '{"instanceId":"3FA0AC622C49A19C23A072C933C06ADD","type":"MessageStatusCallback","isGroup":false,"status":"READ","ids":["<MESSAGE_ID>"],"phone":"<TELEFONE_DIGITOS>","momment":1790000000000}'
```

| Retorno | Significado |
| --- | --- |
| `204` | nosso webhook OK — o problema é a Z-API não chamar |
| `404` | segredo da URL ≠ `WHATSAPP_WEBHOOK_SECRET` |
| `400` | payload/URL fora do formato |
| `503` | faltou secret no Supabase |

Verificação no banco:

```sql
select provider_message_id, status, received_at
  from public.whatsapp_webhook_events order by received_at desc limit 10;

select provider_message_id, status, updated_at
  from public.whatsapp_messages order by created_at desc limit 10;
```

---

## 7. Segurança — pendência obrigatória

Durante a depuração, **tokens e segredos apareceram em texto** na conversa e em
prints:

- `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` e `WHATSAPP_WEBHOOK_SECRET`.

**Ação pendente:** rotacionar os três e atualizar o Supabase e a URL do webhook
na Z-API. Enquanto não forem rotacionados, tratá-los como comprometidos.

---

## 8. Próximos passos

1. Confirmar que o webhook está na instância **`th2-iaschool`** (a que envia).
2. **Reiniciar a instância** na Z-API e reenviar um OTP.
3. Se persistir, abrir com o **suporte da Z-API** (nosso lado está provado pelo
   teste sintético).
4. Rotacionar os segredos expostos.
5. Só então ligar o canário completo (Z4 exige a telemetria de webhook).

---

## 9. Lições aprendidas

- **Auto-envio engana:** conectar a instância ao número que recebe faz o OTP
  cair na conversa "com você mesmo" — parece falha, mas não é.
- **Webhook da Z-API tem dois interruptores independentes:** a URL por evento e
  os filtros (`callbackTypeFilters`). Um pode cancelar o outro.
- **Teste sintético isola camadas:** um `POST` manual ao endpoint separa
  "problema no nosso código" de "problema no provedor" de forma definitiva.
- **Sem ferramenta de log do Supabase no MCP**, o banco (`whatsapp_webhook_events`)
  funcionou como observabilidade primária do webhook.
