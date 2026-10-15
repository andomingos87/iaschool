# S03 — Pasta do aluno por evento e download em ZIP

**Atualizado em:** 12/10/2026.
**Estado:** implementação e verificação locais concluídas; app publicado em 12/10/2026. Aceites externos ainda não executados estão indicados abaixo.
**Origem:** T07 e T08 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulo:** `app`.

## Resultado esperado e limites

A escola encontra as fotos confirmadas do aluno por evento, pode ver Todos e
baixa um ZIP válido do conjunto escolhido. A pasta permanece consulta dos
originais, sem cópia permanente adicional. O álbum do responsável, em
[S07](07-album-privado.md), baixa somente derivados protegidos; não reutiliza
acesso aos originais desta pasta interna.

T08 pede investigação do fluxo existente. Corrigir falhas reproduzidas e
implementar os requisitos de organização/validação abaixo, sem reescrever o
gerador ZIP por suposição.

## Estado local e referências

- `artifacts/iaschool-app/src/components/student-photo-folder.tsx` mostra uma
  grade com datas e gera ZIP sequencialmente em memória no navegador, assinando
  URLs dos originais. Pode omitir indisponíveis e avisar pacote parcial.
- `src/hooks/use-photos.ts`, `src/lib/data/types.ts` (`StudentPhoto`),
  `src/lib/data/supabase/index.ts` e `src/lib/zip.ts`/`zip.test.ts`: consulta,
  assinatura e pacote. O tipo já contém `eventId`, sem nome de evento ou rosto.
- A consulta é a RPC `public.student_photos`, definida em
  `artifacts/iaschool-app/supabase/fase3-face-recognition.sql`; não presumir que
  seja uma tabela/view. `public.events` tem referência em
  `artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`.

Testes da estrutura ZIP não comprovam clique, transferência e abertura reais.
Esses passos não foram executados nesta rodada documental.

## Requisitos

- **PASTA-01 — Evento real.** Agrupar pelo vínculo com evento, apresentando nome,
  data e quantidade. Não inferir evento pela data da foto, nome do arquivo ou
  aparência. Vínculo indisponível entra em “Evento não identificado”.
- **PASTA-02 — Todos e filtro.** “Todos os eventos” reúne grupos; escolher um
  evento restringe a grade. Não repetir a mesma foto dentro de um evento.
  Contagens refletem as fotos confirmadas daquele aluno na escola correta.
- **PASTA-03 — Navegação/estados.** Preservar abertura da imagem, filtro ao
  navegar e estados carregando, erro e vazio. Evento sem fotos tem vazio próprio;
  escola/aluno sem permissão não recebe imagens de outro contexto. Usar teclado
  e celular sem perder as ações principais.
- **PASTA-04 — Alcance do ZIP.** Ação explicita “Baixar fotos deste evento” ou
  “Baixar todos os eventos”. O pacote usa exatamente o conjunto do filtro,
  com pastas por evento e nomes seguros, compreensíveis e sem colisões.
- **PASTA-05 — Conteúdo válido.** Conferir sucesso HTTP e conteúdo de imagem
  antes de incluir arquivo. Não empacotar HTML/erro como imagem. Um clique gera
  pacote que abre e contém os arquivos válidos esperados.
- **PASTA-06 — Parcial e tentativa.** Progresso representa fotos realmente
  processadas. Informar faltantes e quantidade incluída; pacote parcial nunca
  aparece como completo. Oferecer nova tentativa. Zero arquivos válidos é erro,
  sem falso sucesso ou ZIP vazio; zero fotos desabilita a ação.
- **PASTA-07 — Recursos e concorrência.** Impedir downloads simultâneos, liberar
  memória/URLs temporárias sem cancelar a transferência prematuramente e
  verificar tempo/memória com pelo menos 50 fotos de teste. O teste não cria
  novo teto de produto nem muda armazenamento para persistir ZIP.

## Plano técnico inicial

Reusar `eventId` e a consulta permitida de eventos para nome/data. Conferir a
projeção real da RPC antes de alterar SQL; preferir o menor ajuste sem cópias
de fotos nem perda de isolamento. Identificar eventos por ID mesmo quando
nome/data se repetirem; só os nomes das pastas ZIP precisam ser desambiguados.

Separar conjunto filtrado da montagem do pacote para que grade, contagem e ZIP
usem a mesma seleção. Reusar `safeZipName`, `uniqueNames` e `buildZip` onde
adequado. Investigar assinatura, expiração, HTTP, validação do conteúdo,
progresso, clique de download e liberação de recursos no caminho existente.

Compartilhar somente utilitários de ZIP com S07, com entradas autorizadas e
derivadas fornecidas pelo fluxo do álbum. Não compartilhar a assinatura de
originais da escola nem enfraquecer acesso para facilitar o download.

## Tarefas de implementação

- [x] Conferir projeção da RPC/eventos e montar grupos/filtro sem cópia de foto
  (PASTA-01, PASTA-02; qualquer schema exige autorização).
- [x] Implementar apresentação, contagens, estados e navegação por evento
  (PASTA-01–PASTA-03).
- [x] Reproduzir o clique/download existente; aplicar organização por evento e
  corrigir falhas identificadas em assinatura/HTTP/conteúdo/recursos
  (PASTA-04–PASTA-07).
- [x] Rodar cenários e atualizar `.context/modules/app/AGENTS.md` quando
  mudar o comportamento.

## Cenários de aceite

- [x] **C01 (PASTA-01, PASTA-02):** fotos de dois eventos de mesmo dia/nome
  ficam nos eventos certos; Todos mostra ambos com contagens corretas; filtro
  não inclui outro evento nem duplica foto confirmada várias vezes.
- [x] **C02 (PASTA-01, PASTA-03):** vínculo não utilizável continua visível no
  grupo de evento não identificado; vazio, erro e carregamento são distintos.
- [x] **C03 (PASTA-04, PASTA-05):** uma foto e vários eventos geram ZIP que
  abre, com pastas/nomes válidos, contagem correta e imagens legíveis.
- [x] **C04 (PASTA-05, PASTA-06):** resposta HTML com HTTP 200, erro HTTP,
  URL/sessão expirada e falha de rede não viram imagem; parcial informa o que
  faltou e permite tentar novamente; nenhum sucesso se nada foi incluído.
- [x] **C05 (PASTA-04, PASTA-07):** nomes iguais são desambiguados; filtro
  corresponde ao ZIP; clique repetido não inicia outro pacote e o arquivo
  baixado continua abrindo após a liberação dos recursos.
- [~] **C06 (PASTA-03, PASTA-07):** executar com no mínimo 50 fotos sintéticas
  ou de adultos permitidos, registrar na conversa o comportamento de tempo e
  memória e verificar navegação/download no celular e por teclado.
- [x] **C07 (PASTA-02, PASTA-03):** tentativa de aluno/escola fora da sessão
  é recusada; sugestão de rosto não confirmada não entra na pasta/ZIP.

## Verificação e publicação

Implementação local verificada em 12/10/2026. Testes cobrem agrupamento,
desambiguação, filtro, escola incorreta, sugestão excluída, erro HTTP/HTML,
falha parcial, repetição e liberação da URL depois do clique.

No navegador, Todos e evento filtrado produziram pacotes realmente baixados
e abertos: duas imagens em duas pastas no primeiro, uma imagem na pasta correta
no segundo, nomes válidos e CRC íntegro. Evento sem foto mostra vazio e desabilita
ZIP. Arquivos temporários foram removidos.

Além do teste da lógica, 50 imagens sintéticas leves (320 × 240) foram
baixadas por Enter no navegador em viewport de 390 px: cerca de 0,32 s do clique
até o arquivo, 50 JPEGs, duas pastas e CRC íntegro; ZIP de 207.222 bytes.
As abas foram ajustadas para caber no celular, com largura de conteúdo abaixo
da viewport. Não houve travamento nesse ensaio; memória não foi medida e o
resultado não representa fotos grandes/rede móvel ou aparelho físico.
C06 permanece parcial pela medição de memória em dispositivo real. Nenhum teste local comprova
produção. Nenhuma migration ou Edge Function de S03; app publicado em 12/10/2026 após autorização.
