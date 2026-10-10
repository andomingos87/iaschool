# gpt-image-2.5

Submódulo de `geracao-arte`. Documenta a chamada de edição de imagem. Não tem pasta de código. A chamada mora em `artifacts/api-server/src/routes/generation.ts`.

Não existe id `gpt-image-2.5` na API. A família 2.5 tem dois ids, lidos na referência da OpenAI em 09/10/2026:

| Id | Uso |
| --- | --- |
| `gpt-image-2.5-flare` | Geração do dia a dia. É o id que o código envia. Snapshot datado: `gpt-image-2.5-flare-2026-09-08`. |
| `gpt-image-2.5-sunburst` | Edição com mais controle e mais tempo. Snapshot: `gpt-image-2.5-sunburst-2026-09-08`. |

O Flare é o sucessor do `gpt-image-2` para o caso geral. O código usa o alias sem data, então a OpenAI pode mover o comportamento quando publicar outro snapshot.

## Chamada

`POST /v1/images/edits`, pelo SDK `openai` (`client.images.edit`). A chave `OPENAI_API_KEY` fica só no servidor.

O código envia só isto:

- `model`: `gpt-image-2.5-flare`
- `image`: as imagens do multipart, nesta ordem: modelo de arte, foto do aluno
- `prompt`: o texto já montado no app
- `size`: `1024x1024`

Não envia `quality`, `background`, `n`, `output_format` nem `input_fidelity`. A resposta usada é `data[0].b64_json`. O log guarda metadados, não o base64.

O pacote `openai` em `^7.4.0` ainda lista só até `gpt-image-2` no tipo `ImageModel`. O campo `model` também aceita string, e é assim que o Flare passa.

## Limites desta chamada e limites nossos

A referência do endpoint, para os modelos GPT Image, aceita até 16 imagens, cada uma png, webp ou jpg com menos de 50 MB, e prompt de até 32000 caracteres. `quality` aceita `low`, `medium`, `high`, `xhigh`, `max` e `auto` no Flare e no Sunburst.

O IAschool corta antes: 6 imagens, 8 MB cada, 24 MB no total, prompt de 4000 caracteres, MIME `image/png`, `image/jpeg` ou `image/webp`.

## Preço

Na página do Flare, em 09/10/2026: texto de entrada US$ 5 / 1M tokens; imagem de entrada US$ 8 / 1M; imagem de saída US$ 30 / 1M no processamento padrão. O Sunburst publica a mesma faixa de texto e saída na página do modelo. A calculadora do GPT Image 2 não estima o consumo de tokens do 2.5.

## Fora daqui

Cota, rajada, log e o portão do menor estão no índice `geracao-arte`. Este arquivo não autoriza trocar o id sem mudar `IMAGE_MODEL` no servidor e `GENERATION_MODEL` no app no mesmo commit.
