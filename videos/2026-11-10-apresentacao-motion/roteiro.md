# Vídeo de apresentação da AIESCOLA (motion)

**Status:** v04 com narração, música e efeitos sonoros renderizada em 10/11/2026
(`renders/apresentacao_v04.mp4`, 34 s, −14,4 LUFS). Versões anteriores em `renders/`:
v01 (sem áudio, 30 s, aprovada), v02 (só narração) e v03 (narração e música). Prévias das músicas testadas em
`renders/previas-musica/`.

- v2: o vídeo passou a mostrar as telas do app, com cursor e cliques.
- v3: WhatsApp onde o app usa e elementos 3D.
- v4: telas recriadas em HTML com dados fictícios, a partir do código do app,
  sem login no app conectado. Decisão de vocês em 10/11/2026.
- v5 (vídeo v02): narração por IA na voz cedar. A abertura e o fecho foram
  esticados para a fala caber; o vídeo passou de 30 s para 34 s.
- v6 (vídeo v03): música "Hazy After Hours" (Mixkit), escolhida em 10/11/2026 entre
  três prévias.
- v7 (vídeo v04): efeitos sonoros sintetizados no próprio projeto.

| Item | Decisão |
| --- | --- |
| Formato | 16:9, 1920×1080, 30 fps |
| Duração | 34 s (30 s na v01; a narração pediu mais tempo na abertura e no fecho) |
| Áudio | Narração por IA (voz cedar), música "Hazy After Hours" (Mixkit) e efeitos sonoros sintetizados |
| Estilo | Demonstração de produto em 3D: telas do app sobre um chão de estúdio, peças que levantam, celular 3D, cursor e cliques |
| Fonte das telas | Recriadas em HTML a partir dos componentes reais do app (tema claro, mesmos rótulos), dados fictícios |
| Público | Direção e coordenação de rede particular ([ICP](../../marketing/01-estrategia/publico-e-icp.md)) |
| Onde roda | Landing, LinkedIn, abertura de demonstração |
| Objetivo | Pedido de demonstração |
| Ferramenta | HyperFrames 0.9.26 (fixa neste vídeo), 3D em CSS |

## A ideia em uma linha

O cursor é a escola e o celular é a família. A escola autoriza, sobe, confere e
aprova no computador; a família recebe no WhatsApp e abre o álbum no celular.

As quatro telas do app ficam lado a lado num chão claro. A câmera passa de uma
para a outra sem corte, e a peça que importa em cada cena levanta da tela.

## Referências (prompt-motion.com)

| Vídeo | O que pegamos |
| --- | --- |
| [Landing page 3D scroll](https://prompt-motion.com/twoclipping-d89be5), @twoclipping | Principal. Telas deitadas num chão de estúdio, peças que levantam na direção da câmera, sombra macia, câmera que nunca corta |
| [Photo print app launch film](https://prompt-motion.com/twoclipping-221cab), @twoclipping | O cursor dirige toda mudança com cliques; uma cena nasce da outra |
| [Taxtello bookkeeping app film](https://prompt-motion.com/daniel-haida-8691d4), @daniel_haida | O código do produto é a fonte da verdade para as telas |
| [Supademo launch video](https://prompt-motion.com/jhylee95-e1152f), @jhylee95 | Gancho no primeiro segundo; cortes e animações na batida |
| [Datagran ChatGPT ads explainer](https://prompt-motion.com/charlesmendez-73b6e4), @charlesmendez | Fluxo do produto até a mensagem chegando do outro lado |

## Roteiro cena a cena

Tempos da v02, com narração. Rótulos entre aspas são textos reais do app.

| # | Tempo | O que se vê | Título na tela | Narração |
| --- | --- | --- | --- | --- |
| 1 | 0,0–3,85 | Fotos do evento caem como cartões 3D e se empilham. O título entra palavra a palavra; o Giz sublinha "ninguém vê". | **Depois do evento, começa o trabalho que ninguém vê.** | "Depois do evento, começa o trabalho que ninguém vê." |
| 2 | 3,85–8,0 | A câmera desce sobre a pilha. O cursor arrasta fotos para as pastas "Turma A" e "Turma B", cada vez mais rápido. Selos "Autorizou?" levantam das fotos. | **Foto por foto.** / **Quem autorizou?** | "Separar foto por foto. Descobrir quem autorizou." |
| 3 | 8,0–9,4 | As fotos se alinham numa grade. O símbolo 3D cai, o logotipo abre e a Faísca pousa no "i". | — | — (só música) |
| 4 | 9,4–14,2 | Ficha da aluna. O cartão "Autorizações" levanta. Clique na chave "Reconhecer o rosto". Clique em "Pedir aceite ao responsável": o selo vira "Aguardando resposta", o ícone do WhatsApp voa para o celular, chega a mensagem "Acesse este link para revisar a solicitação da AIESCOLA". Toque no link, página de aceite, toque em "Autorizar envio", "Autorização registrada". Na ficha, o selo vira "Aceito pelo responsável". | **Uma autorização para cada uso.** | "O responsável autoriza pelo WhatsApp, cada uso separado." |
| 5 | 14,2–17,0 | Evento "Festa junina 2026". O cursor arrasta a pasta "Festa junina" até "Arraste a pasta com as fotos do evento". As miniaturas enchem a grade; as barras correm até "Todas as 36 fotos processadas". | **O evento inteiro, de uma vez.** | "A escola sobe o evento inteiro." |
| 6 | 17,0–22,4 | "Revisão dos rostos". O aviso "Quem decide de quem é o rosto é você" levanta, depois o cartão da aluna com 4 fotos. A Faísca passa e marca cada sugestão com anel tracejado laranja "Lia M.?". Uma é outra criança: o cursor desmarca, o botão muda para "Confirmar 3 fotos", clique, os anéis viram azuis "Lia M. ✓" e aparece "3 fotos confirmadas para Lia Martins". | **A IA sugere.** / **A escola confere.** | "A IA sugere quem está em cada foto. E uma pessoa da escola confere." |
| 7 | 22,4–27,8 | "Entregas aos responsáveis": a prévia "É assim que a família recebe a mensagem" levanta. Marca "Conferi as fotos…", clique em "Aprovar esta versão", depois em "Enviar texto e link". O WhatsApp voa para o celular: chega a mensagem com o link do álbum. Toque, abre o álbum privado com as 3 fotos (os colegas saem desfocados), toque em "Baixar estas (3)". | **A escola aprova.** / **A família recebe no WhatsApp.** | "A escola aprova, e a família recebe o link no WhatsApp." |
| 8 | 27,8–34,0 | O celular vem para o centro e a tela dele inunda o quadro de Azul Caderno. Símbolo 3D branco, logotipo, Faísca no "i", assinatura e convite. Fica parado até o fim. | AIESCOLA / **Fotos da escola, entregues a cada família.** / Agende uma demonstração · aiescola.com.br | "AIESCOLA. Fotos da escola, entregues a cada família." |

**Narração:** 63 palavras, cerca de 26 s de fala dentro dos 34 s. Cada fala entra
casada com a ação: "WhatsApp" quando o ícone voa para o celular (cena 4), "a escola
confere" no clique em "Confirmar 3 fotos" (cena 6), "a escola aprova" no clique em
"Aprovar esta versão" (cena 7) e "AI Escola" quando o logotipo aparece (cena 8).

## Telas recriadas

Cada tela foi desenhada em HTML copiando estrutura, rótulos, cores do tema
claro e ícones lucide do app. Caminhos a partir de `artifacts/iaschool-app/src/`.

| Cena | Tela | Fonte no código |
| --- | --- | --- |
| 4 | Ficha da aluna e cartão de autorizações | `pages/student-detail.tsx`, `components/student-authorizations-card.tsx` |
| 4 | Página de aceite (celular) | `pages/consent.tsx` |
| 4 e 7 | Mensagens do WhatsApp | `supabase/functions/_shared/whatsapp/templates.ts`, `lib/delivery-workspace.ts` |
| 5 | Evento e envio | `pages/event-detail.tsx`, `components/event-upload-dropzone.tsx`, `components/event-upload-progress.tsx` |
| 6 | Revisão dos rostos | `pages/event-review.tsx`, `components/review-student-card.tsx` |
| 7 | Entregas e aprovação | `pages/event-deliveries.tsx`, `components/delivery-draft-dialog.tsx` |
| 7 | Álbum da família (celular) | `pages/guardian-album.tsx` |

Para caber no tempo, a aprovação e o envio aparecem na mesma tela de entregas;
no app, a aprovação fica no diálogo "Conferir fotos e mensagem".

## Fotos e pessoas

- As fotos do evento são ilustrações geradas no próprio código (bandeirinhas,
  barraca, fogueira), com pessoas sem rosto. Nenhuma foto real.
- Nomes fictícios: aluna Lia Martins, responsável Carla Martins, Escola Horizonte.
  Telefone mascarado como no app.

## Som

- **Música:** "Hazy After Hours", Alejandro Magaña, Mixkit (123 BPM, eletrônica
  calma). Entra em 7,0 s da faixa: a batida pulsa contida nas cenas 1 e 2 e fica
  contínua em 8,0 s, quando o logo entra (cena 3). Sai em fade de 2,5 s.
  Licença Mixkit Stock Music Free, sem crédito, conferida em 10/11/2026; registro em
  `motion/assets/musica/LICENCA.md`. A licença proíbe TV, rádio, CD/DVD e jogos.
- **Voz:** adulta, tom de colega da escola, não de locutor de comercial.
- **Efeitos:** 25 eventos, sintetizados em código (sem arquivo nem licença de
  terceiro): clique em cada clique do cursor (11), "toc" em cada toque no celular (4),
  "tic" em cada troca de selo (6), duas notas subindo quando a mensagem chega (2,
  genérico, não o som do WhatsApp) e brilho no pouso da Faísca (2). Picos entre
  −15 e −20 dBFS, bem abaixo da voz.
- **Mixagem:** a música abaixa 9 dB sob a voz (rampa de 0,3 s antes e 0,45 s
  depois de cada fala) e sobe nos respiros. Teto de −1,5 dBTP no master.
  Resultado da v04: −14,4 LUFS, pico −1,5 dBTP.

## Como está montado

- `motion/index.html`: estilos e camadas (mundo 3D, sobreposições, celular, títulos, fecho).
- `motion/scene.js`: telas, fotos ilustradas e toda a linha do tempo, cena por cena.
- `motion/assets/`: logo, símbolo, logotipo sem a Faísca (ela entra animada) e ícones lucide extraídos do app.
- Conferir: `npx --yes hyperframes@0.9.26 check` dentro de `motion/`.
- Renderizar: `npx --yes hyperframes@0.9.26 render -o ../renders/apresentacao_vNN.mp4`. Nunca sobrescrever uma versão.
- Tempo: os tempos em `scene.js` continuam os da v01; a função `W()` no começo do
  arquivo estica a abertura (0–5,4 s viram 0–8,0 s) e empurra o resto em +2,6 s.
  Para mexer no ritmo, mude `WARP` e `DUR`, não cada animação.
- Narração: `audio/tts.py` gera cada fala (OpenAI `gpt-4o-mini-tts`, chave
  `OPENAI_API_KEY` do `.env.local`); as tomadas brutas ficam em `audio/falas/<voz>/`.
  `audio/prepara_narracao.py cedar` corta silêncios, nivela a fala em −17 LUFS
  (o MP4 da v02 fecha em −14,2 LUFS, pico −2,0 dBTP) e grava em `motion/assets/narracao/`. Cada fala é um `<audio>` no
  `index.html` (#vo1 a #vo8) com seu `data-start`.
- Música: `<audio id="music">` no `index.html` (`data-media-start="7"`, `data-volume`
  0,343). A curva que abaixa a música sob a voz (`data-automation`) é gerada por
  `audio/envelope_musica.py`, que lê os tempos das falas: rode de novo sempre que
  mexer em alguma fala. `audio/previa_musica.py` monta prévias com outras faixas.
  O MP3 da música não vai para o git (repositório público; ver `LICENCA.md`): em
  outra máquina, baixe pelo link do `LICENCA.md` antes de renderizar.
- Fora do git (`.gitignore` desta pasta): `renders/`, tomadas brutas em
  `audio/falas/`, amostras em `audio/amostras/`, caches do HyperFrames e a música.
- Efeitos: `scene.js` registra cada evento com `sfx(tipo, tempo)` (cliques e toques
  entram sozinhos pelos helpers `click` e `tap`) e publica a lista em `window.__sfx`.
  Com o preview aberto (`npx --yes hyperframes@0.9.26 preview --background`), abra
  `http://localhost:3002/api/projects/motion/preview`, copie `window.__sfx` para
  `audio/efeitos_tempos.json` e rode `audio/efeitos.py`, que grava
  `motion/assets/efeitos/efeitos.wav` (`<audio id="sfx">`, `data-volume` 0,35).

## Conferência com as regras de comunicação

- **WhatsApp:** aparece como canal de aceite e de entrega. Vocês decidiram em
  10/11/2026: é um diferencial, o app ainda não está em produção e o envio será
  liberado quando o cliente contratar. A regra 5 de
  [regras de comunicação](../../marketing/07-conformidade/regras-de-comunicacao.md)
  ainda diz o contrário e precisa ser atualizada.
- **Logo do WhatsApp:** marca da Meta. Usado o glifo oficial (Simple Icons), sem
  mudar cor nem forma, e sem sugerir parceria.
- Sem foto nem rosto de criança: só ilustração.
- Sem número de desempenho: contagens na tela são da cena, não promessa.
- IA descrita como sugestão, com a escola corrigindo um erro (cena 6).
- Sem declarar conformidade com lei: a cena 4 mostra o que o produto faz.
- Convite à ação é demonstração.

## Pendências

1. **Pronúncia de AIESCOLA:** "êi-ái escola" (a sigla AI dita em inglês), decidido em 10/11/2026.
   No TTS, escrever "Eiái Escola." (marin) ou "EiÁi Escola." (cedar), com a orientação de pronúncia
   nas instruções. A leitura varia a cada geração: gerar várias tomadas e conferir pela transcrição.
2. **Voz:** resolvida em 10/11/2026: IA, voz cedar (amostras das duas vozes em
   `audio/amostras/`). Ninguém da equipe ouviu ainda a v02 inteira com a imagem.
3. **Música:** resolvida em 10/11/2026 ("Hazy After Hours", Mixkit). Ninguém ouviu
   ainda a mixagem final da v03; eu conferi só por medição e transcrição.
4. **Assinatura:** "Fotos da escola, entregues a cada família." ainda é
   candidata a slogan ([posicionamento](../../marketing/01-estrategia/posicionamento.md)).
5. **Domínio no convite:** confirmar que aiescola.com.br está no ar antes de publicar.
6. **Modelos de mensagem do WhatsApp no código** ainda dizem "IAschool"
   (`supabase/functions/_shared/whatsapp/templates.ts`); o vídeo já mostra AIESCOLA.
7. **Aviso de voz por IA:** a política de uso do TTS da OpenAI pede deixar claro para
   quem assiste que a voz é gerada por IA. Antes de publicar, pôr o aviso na legenda
   do post ou num texto discreto no vídeo.
