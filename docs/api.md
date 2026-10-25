# Contratos HTTP implementados

**Revisão do código local em 25/10/2026.** Base Express: `/api`.
Fonte: `artifacts/api-server/src/routes/`. O OpenAPI em
`lib/api-spec/openapi.yaml` cobre somente `GET /healthz`; este documento cobre
as rotas manuais e não altera clientes gerados.

## Autenticação e rotas

Rotas de escola usam `Authorization: Bearer <JWT Supabase>` e o middleware
valida a conta; o banco revalida escola/recursos. Logs de leitura exigem papel
global `dev` ou `super_admin`. O álbum usa sessão própria e a rota interna de
processamento usa assinatura do worker, não o JWT do navegador.

| Método e caminho (após `/api`) | Acesso | Entrada e resultado |
| --- | --- | --- |
| `GET /healthz` | Público | `{ "status": "ok" }`; não testa banco/provedor |
| `GET /generation/quota` | Conta autenticada | Disponibilidade/cota; não inicia geração |
| `POST /generation/post-image` | Conta autenticada | Multipart unitário legado, detalhado abaixo |
| `GET /generation/logs` | Admin global | `page`, `pageSize` (padrão 20, teto 50), `status=success\|error`, `from`, `to`; itens/paginação |
| `GET /generation/logs/:id` | Admin global | Detalhe do log |
| `POST /generation/logs/:id/result` | Conta autenticada, dona do log | `{ "imageUrl": "https://…" }`; vincula resultado |
| `GET /generation/batches/eligibility` | Conta autenticada | `schoolId` UUID; alunos/turmas aptos |
| `GET /generation/batches/photos` | Conta autenticada | `studentId` UUID; `{photos:[{source,id,url,eventId?,eventName?}]}` |
| `POST /generation/batches` | Conta autenticada | Cria ou recupera lote pela solicitação; HTTP 201 e detalhe |
| `GET /generation/batches` | Conta autenticada | `schoolId` UUID; lotes da escola |
| `GET /generation/batches/:id` | Conta autenticada | Detalhe, progresso e resultados assinados |
| `POST /generation/batches/:id/retry` | Conta autenticada | Nova solicitação e itens falhos/incertos; decisão explícita de nova cota |
| `POST /generation/batches/internal/process` | Assinatura do worker | `{itemId,leaseId}` UUID; processa tentativa com lease |
| `POST /guardian-album` | Token/cookie de álbum | Proxy de mesmo domínio; ações abaixo |

## Criar lote: contrato do wizard atual

Exemplo estrutural; os IDs são ilustrativos, substituídos por recursos
permitidos retornados pelo servidor:

```json
{
  "requestId": "10000000-0000-4000-8000-000000000001",
  "schoolId": "10000000-0000-4000-8000-000000000002",
  "referenceId": "10000000-0000-4000-8000-000000000003",
  "prompt": "",
  "noLogo": false,
  "noText": false,
  "students": [{
    "studentId": "10000000-0000-4000-8000-000000000004",
    "photo": {"source": "profile", "id": "id-retornado-na-lista-de-fotos"}
  }]
}
```

- `referenceId` é obrigatório: modelo da escola ativa em `public.reference_posts` (`artifacts/iaschool-app/supabase/setup.sql` e `generation-batches.sql`). Modelos globais ficam fora do lote.
- `prompt` é string obrigatória, pode ser vazia e tem até 3000 caracteres após trim. O servidor acrescenta instruções e limita o texto final a 3500. `noLogo`/`noText` são booleanos opcionais, padrão `false`.
- `students` contém de 1 a 50 alunos, sem IDs repetidos. `photo.source` aceita `profile`, `event` ou `reference_face`; `id` é string de 1–1024 caracteres e precisa ser UUID para evento/referência facial. Use o ID retornado pela lista, nunca URL arbitrária.
- Elegibilidade exige vínculo/autorização/foto e demais regras do banco; evento exige foto individual revisada. Não basta a seleção no browser.
- `requestId` preservado após resposta perdida evita criar outro lote/reservar cota novamente. Outro conteúdo com a mesma solicitação pode retornar `request_conflict`.
- Detalhe contém `id`, `schoolId`, `status`, `prompt`, `total`, `completed`, `failed` e `items`. Cada item contém aluno, estado, foto, erro quando houver e `imageUrl` quando concluído. O caminho privado é omitido; assinatura dura até 300 segundos.

Retry: `{ "requestId": "<novo UUID>", "itemIds": ["<UUID>"] }`, de 1 a 50
IDs únicos. Não usar retry para recuperar uma resposta perdida da criação.
Fechar a página não cancela o lote. API/ingest mantêm uma tentativa por lease;
resultado incerto não gera repetição automática da chamada paga.

Persistência/RPCs: `public.generation_batches`, `public.generation_batch_items`,
`public.generation_batch_retries` e cota em `public.generation_usage`, em
`artifacts/iaschool-app/supabase/generation-batches.sql` e `generation-quota.sql`.

## Rota interna

O ingest assina com HMAC, usando `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor.
Cabeçalhos `x-iaschool-timestamp` (milissegundos, 13 dígitos, tolerância de 60 s)
e `x-iaschool-signature` (64 caracteres hexadecimais) vinculam método, caminho,
tempo e JSON ao segredo. Use as implementações em
`generation-batch-service.ts` e `generation-loop.ts` como referência exata;
não fabricar essa assinatura no cliente. A API revalida o lease no banco.

## Geração unitária legada

`POST /generation/post-image` recebe `multipart/form-data`, campo `images`.
O parser limita a seis arquivos, 8 MiB por arquivo e 24 MiB no total;
PNG/JPEG/WebP; prompt até 4000 caracteres. O modo determina a quantidade:

- `mode=photo_prompt`: exatamente uma foto e prompt não vazio; foto inteira normalizada em PNG, sem metadados, enviada ao provedor.
- Composição legada: exatamente duas imagens (modelo e original) e `composition` JSON com `version=original-pixels-v1`, `photoId`, `points`, `protectedHead` e `reviewed=true`; só o modelo entra na IA, e a pessoa é composta no servidor.

O wizard atual não chama essa rota. Nele, a edição usa **duas imagens na IA**:
modelo de estilo e foto do aluno. Preservação de identidade é instrução,
sem garantia de pixels idênticos. Limites/cota e proteções legadas não devem
ser generalizados para os lotes persistentes.

## Álbum privado

A UI pública `/album` envia ao proxy `/api/guardian-album`:

- `{action:"consume",token}`: token opaco de 32–256 caracteres; obtém cookie de sessão.
- `{action:"list"}`: lista o conjunto permitido pela sessão.
- `{action:"download",itemId}`: autoriza item e retorna URL/nome/expiração.
- `{action:"audit_zip",itemIds}`: valida/audita de 1 a 1000 itens antes de preparar ZIP.

A serialização JSON tem teto de 20.000 caracteres no proxy. O proxy confere origem; `APP_PUBLIC_URL` exige origem
exata. Encaminha somente `__Host-iaschool-album` com `Secure`, `HttpOnly`,
`Path=/`, `SameSite=Lax`, duração máxima de 24 h; não repassa sessão escolar.
Respostas privadas usam `no-store`/`no-referrer`; timeout do proxy: 20 s.
Tokens/sessão não vão para localStorage. URLs de arquivo duram até cinco
minutos, limitadas também pela sessão/retenção.

**Diferença de versão:** reutilização do link e agregação por evento estão no
código local e em `artifacts/iaschool-app/supabase/fase5-album-open-link.sql`;
sem aplicação/publicação registrada. A publicação anterior tinha consumo
único. Ver [operação](operacao-agentes.md) antes de presumir o contrato remoto.

## Erros e funções Supabase

Lotes retornam `{code,error}`: validação 400, falta de autenticação 401,
permissão 403, lote ausente 404, conflitos de domínio 409 e dependência
indisponível 503. Outros endpoints ainda têm formatos próprios; não existe
um envelope único de erro. Códigos/validações são definidos em
`generation-batch-service.ts`, rotas e middlewares.

O app também chama Supabase diretamente. Inventário de `send-guardian-code`,
`provider-webhook`, `request-guardian-consent`, `guardian-consent`,
`delivery-preview`, `school-delivery` e `guardian-album`, autenticação e SQL
no [SUPABASE.md](../artifacts/iaschool-app/SUPABASE.md). Não existe endpoint
implementado `process-whatsapp-deliveries`/`guardian-delivery`; eram nomes do
plano original. `school-delivery` executa ações explícitas, sem envio automático
por simplesmente aprovar o lote.
