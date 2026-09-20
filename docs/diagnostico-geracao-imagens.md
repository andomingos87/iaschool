# Diagnóstico — "Falha na geração / Falha de conexão ao enviar as fotos"

**Data:** 30/08/2026
**Sintoma:** ao clicar em "Gerar arte", o app mostra
*"Falha de conexão ao enviar as fotos. Verifique sua internet e tente novamente."*

**A internet não tem nada a ver com o erro.** São três problemas empilhados.

> **Estado em 15/09/2026:** o Problema 1 foi superado no próprio dia 30/08 pelo
> provisionamento de um banco novo (ver `artifacts/iaschool-app/SUPABASE.md`).
> Os Problemas 2 e 3 são de código e **ainda não foram verificados**; estão no
> [`BACKLOG.md`](../BACKLOG.md), higiene da Fase 0.

---

## Problema 1 — O projeto Supabase não existe mais (causa raiz)

O app aponta para `jtyyauivokutperouqyh.supabase.co`, que **não resolve em DNS**:

```
$ nslookup jtyyauivokutperouqyh.supabase.co
** server can't find jtyyauivokutperouqyh.supabase.co: NXDOMAIN
```

Esse ref também **não aparece na lista de projetos da conta Supabase**
(52 projetos consultados via MCP, nenhum com esse ref). O projeto foi
excluído ou pertencia a outra conta.

Consequência no backend (`api-server` na Fly), reproduzido 5x:

```
$ curl -X POST https://iasport-image-api-r9.fly.dev/api/generation/post-image \
    -H "Authorization: Bearer <qualquer-token>"

{"code":"supabase_unavailable",
 "error":"Não foi possível validar sua sessão agora. Tente novamente."}
HTTP 503
```

`supabase_unavailable` (e não `supabase_timeout`) confirma que o `fetch` para
`${SUPABASE_URL}/auth/v1/user` **falha instantaneamente** (~1 s, contra os 10 s
do timeout configurado) — assinatura de falha de DNS.

Ou seja: **nenhuma geração autenticada funciona hoje**, com qualquer usuário.

> O backend em si está no ar: `GET /api/healthz` → `{"status":"ok"}` em 0,8 s.

---

## Problema 2 — Modo demonstração chama o backend real sem token

`src/lib/data/mock/index.ts:689`

```ts
const generation: ImageGenerationService = createOpenAIGenerationService(
  undefined,   // ← getAccessToken
  ...
);
```

Mesmo em **Modo demonstração** (dados mock em localStorage), a geração chama
`POST /api/generation/post-image` no backend real — e passa `undefined` como
`getAccessToken`, ou seja, **sem header `Authorization`**.

O middleware responde 401 na hora:

```
$ curl -X POST .../api/generation/post-image
{"error":"Você precisa estar logado para gerar imagens. Entre e tente de novo."}
HTTP 401
```

Todo o resto do modo demo é mock (auth, alunos, storage), mas a geração não é.
Como a sessão demo não é uma sessão Supabase, **a geração nunca pode funcionar
em modo demonstração** — falha 100% das vezes, por construção.

---

## Problema 3 — O erro real é mascarado por um erro de rede

`artifacts/api-server/src/routes/generation.ts:76`

```ts
router.post(
  "/generation/post-image",
  requireSupabaseUser,          // ← responde 401/403/503 aqui...
  (req, res, next) => {
    upload.array("images", MAX_IMAGES)(...)   // ← ...antes de o multer ler o corpo
  },
  ...
```

O `requireSupabaseUser` roda **antes** do multer. Quando ele rejeita, o Express
responde e encerra **sem drenar o corpo da requisição**. O navegador ainda está
enviando as fotos, o socket é resetado, e o XHR dispara `onerror` em vez de
`onload` — o cliente nunca chega a ler o 401.

`src/lib/data/openai-generation.ts:82`

```ts
xhr.onerror = () =>
  reject(new Error("Falha de conexão ao enviar as fotos. Verifique sua internet..."));
```

Comprovação: num POST de 3 MB, o servidor respondeu depois de receber apenas
**262 KB** (8,7% do corpo):

```
$ curl -X POST ... -F "images=@3mb.bin"
HTTP 401 | size_upload 261912 | total 1.13s
```

O `curl` é tolerante e ainda leu o status. O navegador não é — ele reporta
falha de rede.

**É por isso que um problema de sessão/configuração aparece como
"verifique sua internet".**

---

## Encadeamento

```
Projeto Supabase excluído (P1)
        ↓
Backend não valida sessão → 503   (ou 401, em modo demo — P2)
        ↓
Resposta enviada antes de o corpo ser lido → socket resetado (P3)
        ↓
Navegador: "Falha de conexão ao enviar as fotos"
```

---

## Correções necessárias

| # | Correção | Onde | Tipo |
| --- | --- | --- | --- |
| 1 | Apontar para um projeto Supabase válido e aplicar `setup.sql` + `pivot-fase0.sql` | Secrets da Fly, env da Vercel, `.env.local` | **Infra — bloqueia tudo** |
| 2 | Decidir o que a geração faz em modo demo: voltar a um gerador mock (canvas) **ou** desabilitar o botão com aviso claro | `src/lib/data/mock/index.ts:689` | Produto |
| 3 | Drenar o corpo antes de responder no `requireSupabaseUser` (ou mover o multer para antes da auth) | `api-server/src/routes/generation.ts` | Código |
| 4 | Tratar `onerror` do XHR sem afirmar que é a internet do usuário | `src/lib/data/openai-generation.ts:82` | Código |

> As correções 3 e 4 não fazem a geração voltar a funcionar — elas fazem o app
> **dizer a verdade** sobre o motivo da falha. Sem elas, qualquer erro de
> sessão ou configuração vai continuar aparecendo como problema de conexão.

## Observação sobre a Fly

`fly.toml` usa `auto_stop_machines = "stop"` com `min_machines_running = 0`.
A primeira requisição após ociosidade paga o cold start (medido: **7,8 s**
contra 0,8 s com a máquina quente). Não é a causa deste erro, mas soma
latência ao primeiro envio do dia e pode agravar uploads grandes.
