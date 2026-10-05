# Referência — Z-API (ponte temporária)

**Fonte:** documentação oficial via Context7, biblioteca `/websites/developer_z-api_io`
(`https://developer.z-api.io`). **Consultado em:** 03/10/2026.
**Uso no produto:** adaptador temporário `controlled_zapi`, não comercial. Ver
[`docs/spec-whatsapp-api-oficial-entrega-fotos.md`](spec-whatsapp-api-oficial-entrega-fotos.md)
§9.5 e [`docs/plano-implementacao-zapi.md`](plano-implementacao-zapi.md).

> Dependência viva: confirmar os formatos contra a instância de teste antes do
> canário. Nenhum token, segredo, URL completa ou número real entra neste doc.

---

## 1. Autenticação

A Z-API usa **dois** segredos, com papéis diferentes:

| Segredo | Onde vai | Escopo |
| --- | --- | --- |
| **ID da instância** | no caminho da URL (`/instances/<id>/token/<...>`) | uma instância |
| **Token da instância** | no caminho da URL | uma instância |
| **Client-Token** (Token de Segurança da Conta) | header `Client-Token` | toda a conta |

- A URL sempre tem o formato:
  `https://api.z-api.io/instances/<INSTANCE_ID>/token/<INSTANCE_TOKEN>/<recurso>`
- O `Client-Token` nasce **desativado**; ao ativar, passa a ser **obrigatório
  em todas as requisições** das instâncias da conta.
- Headers sempre com `Content-Type: application/json`.

No produto, esses valores vivem só nos secrets do servidor:
`ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` (nunca no
browser, no banco ou em log).

---

## 2. Endpoints usados pela integração

### 2.1 Enviar texto — `send-text`

```
POST https://api.z-api.io/instances/<ID>/token/<TOKEN>/send-text
Headers: Client-Token: <CLIENT_TOKEN>
Body:
{
  "phone": "5511999999999",
  "message": "texto"
}
```

- `phone`: só dígitos, formato DDI + DDD + número (ex.: `5511999999999`).
  Sem máscara, sem `+`.
- Opcionais: `delayMessage` (1–15 s) e `delayTyping` (1–15 s).
- **Resposta 200:**
  ```json
  { "zaapId": "3999984263738042930CD6ECDE9VDWSA",
    "messageId": "D241XXXX732339502B68",
    "id": "D241XXXX732339502B68" }
  ```
- `messageId` é o ID **no WhatsApp**; `zaapId` é o ID **na Z-API**. Guardamos os
  dois (`whatsapp_messages.provider_message_id` / `provider_zaap_id`).
- **`200` significa enfileirado/aceito, não entregue.** A entrega vem pelo
  webhook de status.
- Erros comuns: `405` (método errado), `415` (falta `Content-Type`).

No código: `artifacts/iaschool-app/supabase/functions/_shared/whatsapp/zapi-provider.ts`.

### 2.2 Status da instância

```
GET https://api.z-api.io/instances/<ID>/token/<TOKEN>/status
```

Verifica se a instância está conectada a uma conta de WhatsApp. Útil para
diagnóstico antes de enviar.

---

## 3. Webhook de status da mensagem

Configuração (exige **HTTPS**):

```
PUT https://api.z-api.io/instances/<ID>/token/<TOKEN>/update-webhook-message-status
Headers: Client-Token: <CLIENT_TOKEN>
Body:  { "value": "https://SEU-HOST/functions/v1/provider-webhook/<SEGREDO>" }
```

Payload recebido:

```json
{
  "instanceId": "instance.id",
  "status": "SENT",
  "ids": ["999999999999999999999"],
  "momment": 1632234645000,
  "phoneDevice": 0,
  "phone": "5544999999999",
  "type": "MessageStatusCallback",
  "isGroup": false
}
```

| Campo | Observação |
| --- | --- |
| `type` | sempre `MessageStatusCallback` |
| `status` | `SENT`, `RECEIVED`, `READ`, `READ_BY_ME`, `PLAYED` |
| `ids` | lista de identificadores da mensagem |
| `momment` | timestamp em ms — **grafia com dois "m", é da Z-API** |
| `phone` | número de destino, só dígitos |
| `isGroup` | deve ser `false` |

**Mapeamento para o nosso domínio:** `SENT` → `sent`, `RECEIVED` → `delivered`,
`READ` → `read`. `READ_BY_ME`/`PLAYED` são ignorados (fora do contrato).

No código: `normalizeWebhook` em `zapi-provider.ts` e
`artifacts/iaschool-app/supabase/functions/provider-webhook/index.ts`.

---

## 4. Filtros de webhook (pegadinha)

Além da URL por evento, existe um **filtro de desativação por tipo de callback**:

```
PUT https://api.z-api.io/instances/<ID>/token/<TOKEN>/update-filters
Body:
{
  "messageFilters": [ ... ],
  "callbackTypeFilters": [ "FILTER_MESSAGE_STATUS_CALLBACK", ... ]
}
```

- `callbackTypeFilters`: os callbacks **listados não disparam**, mesmo com URL configurada.
- **`FILTER_MESSAGE_STATUS_CALLBACK` desativa o webhook de status.**
- `messageFilters` afeta **apenas** o webhook "Ao receber" (`ReceivedCallback`);
  não afeta status.
- São as mesmas opções dos toggles **"Ignorar webhook de …"** no painel.

Valores possíveis de `callbackTypeFilters`:
`FILTER_RECEIVED_CALLBACK`, `FILTER_DELIVERY_CALLBACK`, `FILTER_CONNECTED_CALLBACK`,
`FILTER_DISCONNECTED_CALLBACK`, `FILTER_PRESENCE_CHAT_CALLBACK`,
`FILTER_MESSAGE_STATUS_CALLBACK`.

Para **receber status**, `FILTER_MESSAGE_STATUS_CALLBACK` precisa estar **fora**
da lista.

---

## 5. Outros webhooks (não usados hoje)

- **Ao enviar** (`DeliveryCallback`) — confirmação de envio; pode trazer erro.
- **Ao receber** (`ReceivedCallback`).
- **Ao conectar / Ao desconectar** (`ConnectedCallback` / `DisconnectedCallback`).
- **Presença do chat** (`PresenceChatCallback`).

O `provider-webhook` só processa `MessageStatusCallback`; os demais retornam
`400` e não são gravados.

---

## 6. Gotchas aprendidos em produção-lite

1. **Auto-envio engana.** Se a instância está conectada ao **mesmo número** que
   recebe, a mensagem cai na conversa "com você mesmo" e não notifica. Para
   canário, use números diferentes do da instância.
2. **`200` ≠ entregue.** `send-text` só confirma que a Z-API enfileirou. A
   entrega só é conhecida pelo webhook de status.
3. **URL e filtros são independentes.** Configurar a URL não basta se o filtro
   `FILTER_MESSAGE_STATUS_CALLBACK` estiver ativo (e vice-versa).
4. **Instância errada.** Confirme que a URL do webhook está na **mesma instância**
   cujo ID está nos secrets — ter duas instâncias (`iaschool`/`th2-iaschool`)
   facilita salvar na errada.
5. **HTTPS obrigatório.** A Z-API não chama webhook HTTP.
6. **`momment` com dois "m".** Não é erro de digitação nosso.
7. **Instância precisa estar conectada** (QR lido) para enviar de fato.

Detalhes da depuração real: [`docs/diagnostico-webhook-zapi.md`](diagnostico-webhook-zapi.md).

---

## 7. Endpoints de apoio (diagnóstico)

| Recurso | Método / caminho | Para quê |
| --- | --- | --- |
| Status da instância | `GET /instances/<id>/token/<t>/status` | ver se está conectada |
| Reiniciar instância | `POST .../restart` | recarregar config/conexão |
| QR code | `GET .../qrcode` | conectar/desconectar |
| Fila | `POST .../queue` | ver mensagens enfileiradas |
| Atualizar todos webhooks | `PUT .../update-every-webhooks` | apontar todos para uma URL |
| Filtros | `PUT .../update-filters` | ligar/desligar callbacks |

---

## 8. Fontes

- [Enviar texto simples](https://developer.z-api.io/message/send-text)
- [Status da mensagem (webhook)](https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes)
- [Filtros de webhook](https://developer.z-api.io/webhooks/update-filters)
- [Token de segurança da conta](https://developer.z-api.io/security/client-token)
- [Introdução](https://developer.z-api.io/quickstart/introduction)
