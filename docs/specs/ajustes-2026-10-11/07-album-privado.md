# S07 — Álbum privado, sessão temporária e reenvio pela escola

> **Decisão de produto — 13/10/2026:** nas novas entregas, todas as fotos ficam nítidas. A exigência de desfoque e conferência de regiões foi substituída por seleção das fotos e aprovação do álbum. A implementação anterior abaixo é histórica. A nova política usa `public.delivery_items.render_policy` em `artifacts/iaschool-app/supabase/delivery-original-photos.sql`, sem mudar a autorização do destinatário, os limites de acesso ou a retenção. Nova política publicada e verificada em 13/10/2026; validação abaixo.

**Atualizado em:** 12/10/2026.
**Estado:** implementada e publicada; HTTP integrado verificou cookie, sessão, uso único, download e revogação com conjunto sintético. Reenvio/transporte real e aceite completo em aparelho permanecem pendentes.
**Origem:** T11.4; N-D8, N-D9 e N-D12 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulo:** `app`, incluindo as funções de acesso/entrega.

## Resultado esperado e dependências

O responsável abre o link exclusivo e vê/baixa somente o conjunto de fotos
protegidas aprovado para sua família. A escola pode reenviar acesso e revogar.
Não há código adicional, conta/login do responsável ou solicitação automática
de recuperação no MVP. Acesso temporário não equivale ao portal permanente da
Fase 4.

N-D8 aceita o risco de encaminhamento: quem receber o link antes do primeiro
uso pode abri-lo primeiro. Preservar essa decisão, sem prometer identidade do
visitante pelo link nem inserir OTP. Número cadastrado/verificado, autorização,
prazo, revogação e isolamento continuam obrigatórios.

O álbum depende do conjunto/versão aprovado de [S06](06-preparacao-entrega.md)
e dos derivados seguros de [S05](05-protecao-localizada.md). Nenhum aviso com
link pode ser transmitido antes do álbum funcional e validado.

## Estado local e referências

- `artifacts/iaschool-app/src/pages/guardian-album.tsx`,
  `src/lib/delivery-service.ts` e `src/lib/album-download.ts`: página temporária,
  abertura/retorno por sessão, foto/download e ZIP sob demanda implementados no
  código local. Reaproveitam utilitários de ZIP, sem pacote permanente.
- `artifacts/api-server/src/routes/guardian-album.ts` faz o proxy POST no mesmo
  domínio. `artifacts/iaschool-app/supabase/functions/guardian-album/index.ts`
  e `_shared/delivery/album.ts` validam token/cookie e chamam RPCs privadas.
  Link `/album#<token>` evita transportar o segredo no caminho GET; a página
  remove o fragmento depois de abrir. Não há login/OTP do responsável.
- `public.delivery_album_tokens` guarda somente hash do token, versão aprovada,
  prazo, uso e revogação. Não reutiliza `public.guardian_action_tokens` nem muda
  seu contrato de consentimento. `public.consume_delivery_album_token` usa
  locks e cria exatamente uma sessão por token válido; `public.delivery_access_sessions`
  mantém prazo fixo de 24h. Referência de ambos:
  `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- Cookie `__Host-iaschool-album` usa `HttpOnly`, `Secure`, `SameSite=Lax` e
  duração limitada ao prazo do banco. Sessão existente só reutiliza link do
  mesmo destinatário/versão; sessão de outro álbum não captura um novo link.
  Token ainda não usado vence em até 24h, limitado à disponibilidade dos ativos.
- `public.delivery_album_session` e `public.delivery_recipient_gate` exigem
  versão aprovada corrente e existência/identidade de **todos** os itens do
  snapshot, sem aceitar item removido por cascata. Conferem vínculo exato da
  autorização, responsável/telefone e ativos seguros ainda disponíveis.
  Referência: `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- `public.reserve_delivery_dispatch` invalida somente tokens antigos não
  usados; não renova nem fecha sessões abertas. `public.revoke_delivery_album`
  bloqueia tokens e sessões. Consumo, reemissão e revogação usam a mesma ordem
  de locks. Referência:
  `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- Assinatura dura no máximo 300 segundos e respeita também o prazo restante da
  sessão/ativo. Novas assinaturas revalidam depois de assinar para recusar
  revogação concorrente. Somente derivados do bucket privado `delivery-assets`
  são liberados; o álbum não recebe permissão de originais da escola.
- `public.delivery_events` registra abertura, reemissão/revogação e autorização
  de URLs; `photo_downloaded` traz fase `url_issued`, sem alegar que a gravação
  do arquivo terminou. ZIP registra fase `assembled`, informada pelo cliente
  após montar bytes. Referência:
  `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
  Logs não incluem o segredo, telefone completo, caminho ou URL assinada.

Código/SQL local e, depois, aplicação das duas migrations/publicação/ensaio
sintético autorizados em 12/10/2026. O ensaio HTTP remoto foi concluído sem
transmitir link nem habilitar WhatsApp. Abertura por link mantém o risco de
encaminhamento aceito em N-D8, sem alegar identidade adicional.

## Requisitos

- **ALB-01 — Primeiro uso atômico.** Link opaco exclusivo para a entrega daquele
  responsável troca token de uso único por sessão. Banco guarda hash, não o
  token. Requisições concorrentes não criam duas sessões do mesmo token.
  Token consumido não abre nova sessão em outro navegador/aparelho.
- **ALB-02 — Sessão de 24 horas.** Primeiro consumo válido abre sessão com
  prazo fixo de 24 h, cookie `HttpOnly`, `Secure` e `SameSite=Lax`, seguindo a
  política base. No mesmo navegador, retornar dentro do prazo usa a sessão
  atual sem consumir outro link. Visitas não renovam o relógio. Expiração,
  revogação ou perda da sessão não reativam token consumido.
- **ALB-03 — Conteúdo aprovado e protegido.** Listar somente fotos/ordem/versão
  do conjunto aprovado para o responsável, incluindo seus alunos/irmãos sem
  duplicações. Não aceitar troca de escola, destinatário, foto ou versão por
  parâmetro da URL. Foto pendente, revogada ou não selecionada não aparece.
  Não devolver originais internos, arquivos inseguros ou caminhos de Storage.
- **ALB-04 — Revalidação e tempo dos arquivos.** Revalidar sessão, responsável,
  número, autorização e disponibilidade em cada acesso/assinatura/download.
  Derivados disponíveis por até 7 dias, sujeitos a revogação/expurgo anteriores;
  URL assinada de arquivo dura no máximo 5 min e não amplia a retenção. Sessão
  de 24 h não recupera ativo já expirado; reenvio não prolonga prazo das fotos.
- **ALB-05 — Ver e baixar.** Abrir foto, baixar individualmente e gerar ZIP
  protegido sob demanda, sem salvar pacote permanente. Reaproveitar utilitários
  de [S03](03-pasta-aluno-zip.md) com entradas autorizadas do álbum, sem acesso
  à assinatura dos originais. Conteúdo, contagem, nomes e aviso de parcial
  devem corresponder ao conjunto permitido.
- **ALB-06 — Estados de acesso.** Mostrar vazio, carregando, indisponível,
  expirado, revogado e link já usado sem revelar dados de outra família. Se
  perder acesso, orientar a procurar a escola. Não introduzir recuperação
  automática ou conta/login como alternativa.
- **ALB-07 — Reenvio autorizado pela escola.** “Reenviar acesso” no painel
  revalida responsável, telefone cadastrado/verificado, autorização e arquivos.
  Só emite/transmite outro link de uso único ao mesmo número válido; não permite
  destinatário livre. Bloquear conjunto vazio/expirado, autorização revogada,
  clique duplicado e repetição imediata de resultado incerto.
- **ALB-08 — Reenvio não revoga sessões.** Novo link invalida links anteriores
  ainda não consumidos do mesmo álbum/entrega. Sessões já abertas permanecem até
  seus vencimentos originais, sem renovação. O novo link, quando consumido, cria
  sua própria sessão; aparelhos podem coexistir. Não reaproveitar token antigo
  nem reativar sessão expirada.
- **ALB-09 — Revogação distinta.** “Revogar acesso” e revogação de autorização
  bloqueiam sessões afetadas e novas assinaturas/downloads. A escola vê a
  diferença para reenviar. Reenvio não retira quem já abriu. Não prometer
  recolher cópias baixadas nem invalidar instantaneamente uma URL de arquivo
  emitida antes da revogação; seu prazo máximo continua limitado a 5 min.
- **ALB-10 — Trilha e proteção do segredo.** Registrar quem reenvia/revoga e
  resultados de abertura/download sem telefone completo, token, URL privada,
  vetor ou caminho de objeto em logs. Cookie/segredos só no servidor; respostas
  da aplicação usam cache privado e sem armazenamento, conforme política base.
  Token/sessão válido não libera consultas arbitrárias às tabelas ou bucket.

## Implementação adotada

O acesso temporário usa o mesmo snapshot aprovado de S06. O visitante não
consulta tabelas/bucket diretamente: token opaco troca por cookie, e cada
listagem/download revalida sessão, família, consentimento e todos os ativos.
Funções internas têm revoke para `public`, `anon` e `authenticated`; apenas a
Edge Function com service role as chama.

Sessão não renova por visita, token consumido não reabre outro navegador e
reemissão não prolonga arquivos. Revogar fecha novos acessos/assinaturas, mas
não recolhe cópias baixadas nem URLs já emitidas; estas vencem em até cinco
minutos. A escola recebe status/motivo, nunca o token exclusivo.

## Tarefas de implementação

- [x] Contrato de token/sessão/S06, prazos, cookie, reemissão, revogação e expurgo
  implementados no SQL local autorizado (ALB-01–ALB-04, ALB-08–ALB-10).
- [x] Endpoint/proxy/página e listagem da versão aprovada implementados no código
  local, sem conta/OTP e com revalidação por operação (ALB-01–ALB-04, ALB-06, ALB-10).
- [x] Foto/download/ZIP sob demanda, deduplicação/ordem, falha parcial e interrupção
  por perda de sessão implementados; utilitários testados (ALB-04–ALB-06, ALB-09).
- [x] Reenvio/revogação implementados com papéis escolares e portões de
  autorização/número/arquivo, proteção contra repetição e status separado
  (ALB-07–ALB-10; S06).
- [x] Roundtrip e conexões PostgreSQL locais concorrentes exercitaram uso único,
  reemissão, preservação da sessão e revogação; testes Edge/provedor falso passaram.
- [x] Navegação com fixture verificada: `/album` sem login, fragmento removido,
  três miniaturas e ZIP realmente baixado/aberto com três JPEGs e CRC válido;
  largura de 390px sem overflow.
- [x] Consolidar contexto final de `app` (12/10/2026).
- [x] Validar HTTP da integração publicada: cookie protegido emitido no domínio
  do app, sessão/retorno sem renovação, uso único, download e revogação, com seed
  de token exclusivamente sintético e limpeza final.
- [ ] Conferir armazenamento/comportamento do cookie em navegador/aparelho real,
  aceite completo de acessibilidade e eventual transporte/reenvio autorizado.

Checks locais e integração HTTP publicada têm provas separadas abaixo. Nenhum
deles comprova identidade de quem recebeu o link. O teste HTTP reproduz o cookie
nas requisições; não declara que verificou seu armazenamento automático em
aparelho real. Os cenários abaixo preservam o aceite completo.

## Cenários de aceite

`[x]` combina a prova de domínio/SQL local com o HTTP remoto descrito abaixo;
levar o cookie nas requisições de teste não equivale a inspeção do seu
armazenamento automático em aparelho real. Os demais cenários preservam o
aceite completo, sem presumir transporte ou inspeção de pixels publicados.


- [x] **C01 (ALB-01, ALB-02):** primeiro uso abre sessão sem login/OTP; duas
  aberturas concorrentes do mesmo token não emitem duas sessões. Token usado
  em outro navegador é recusado; navegador com sessão válida retorna ao álbum.
- [ ] **C02 (ALB-02, ALB-04, ALB-06):** sessão vence em 24 h sem renovação por
  visitas; perda/troca de navegador ou expiração orienta procurar a escola;
  arquivos expirados antes da sessão não reaparecem.
- [x] **C03 (ALB-03, ALB-04):** alterar IDs de escola/família/foto/versão é
  recusado; somente seleção/ordem aprovada aparece e a URL de arquivo nunca
  excede 5 min ou a validade restante aplicável.
- [ ] **C04 (ALB-03–ALB-05):** foto e ZIP baixados têm proteção nos pixels e
  contagem/ordem corretas, sem original interno ou duplicação de foto de irmãos;
  falha parcial é informada e nenhum ZIP permanente fica guardado.
- [ ] **C05 (ALB-07, ALB-08):** com sessão A aberta e link B ainda não usado,
  reemitir C invalida B, preserva prazo original de A e cria sessão própria ao
  consumir C; não prolonga retenção dos arquivos nem renova A.
- [ ] **C06 (ALB-07, ALB-09):** reenvio com número alterado/não verificado,
  autorização revogada, arquivos expirados, conjunto vazio ou resultado incerto
  é bloqueado. Revogação explícita bloqueia sessões abertas/novas assinaturas,
  mesmo após reenvio; cópia baixada não é apresentada como recolhida.
- [ ] **C07 (ALB-01, ALB-08, ALB-09):** consumo concorrente com reemissão e
  revogação não cria sessão de link invalidado nem restaura acesso revogado;
  sessões legitimamente abertas antes do reenvio mantêm seus prazos.
- [ ] **C08 (ALB-06, ALB-10):** vazio, link expirado/revogado/usado, erro de
  rede e carregando funcionam no celular/teclado; logs/projeções não expõem
  segredo ou dados completos. Link encaminhado antes do primeiro uso mantém o
  risco aceito em N-D8, sem alegar verificação adicional de quem abriu.

## Verificação e publicação

Em 12/10/2026, passaram 20 testes Deno de álbum/dispatch/token/provedor e o
check de `guardian-album`, `school-delivery` e `delivery-preview`. O ensaio
`artifacts/iaschool-app/supabase/rehearsal/test-adjustments-local.py` passou com
uso único em duas conexões concorrentes, consumo versus revogação, novo link
preservando prazo da sessão antiga, link não usado invalidado, token consumido
recusado, acesso a outro item recusado, responsável desvinculado e item removido
bloqueados. O ensaio usa socket/fixture descartável e nenhuma credencial externa;
pgvector não é exercitado como extensão real. Utilitários de download/ZIP têm
testes de ordem/deduplicação, resposta inválida, parcial e sessão perdida.

No navegador com fetch/fixture simulado, `/album` abriu sem login, retirou o
fragmento e exibiu três miniaturas. O ZIP foi baixado e aberto: três JPEGs, CRC
válido; tela de 390px sem overflow. A simulação não usa banco/provedor real nem
prova o cookie real no navegador; proxy/API e helpers têm testes próprios de
cookie/headers. A integração HTTP publicada foi verificada separadamente abaixo.
Testes locais isolados não provam a operação remota.

### Publicação e ensaio integrado em 12/10/2026

Aplicadas `artifacts/iaschool-app/supabase/fase5-review-media.sql` e
`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
Edge Functions publicadas: `guardian-album` **v1**, `school-delivery` **v1** e
`delivery-preview` **v3**. Fly: API **v4**, `ingest-worker` **v3** e
`face-worker` **v2**. App promovido ao endereço
[https://iaschool-app.vercel.app](https://iaschool-app.vercel.app), deployment
`dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`.

A API v4 preserva separadamente o cookie `__Host-iaschool-album` da resposta da
Edge Function, ignorando cookies de infraestrutura. Antes dessa correção, a
agregação de múltiplos `Set-Cookie` fazia a validação segura rejeitar o cookie
legítimo depois que o token já havia sido consumido.

`tests/adjustments-integrated.integration.test.ts`: **Run 5, 1 teste verde em
27,64 s**, incluindo limpeza. Usou token **gerado como seed privilegiado de
teste** para o conjunto sintético aprovado em modo pausado; o token não foi
enviado por WhatsApp nem apresentado como prova de transporte real.

Verificado pelo endpoint HTTPS `/api/guardian-album` no domínio do app:

- Consumo emitiu um único cookie `__Host-iaschool-album`, com `Path=/`,
  `HttpOnly`, `Secure`, `SameSite=Lax` e `Max-Age` limitado a 24h, sem `Domain`
  ou cookies de infraestrutura agregados. O segredo não apareceu no corpo.
- A sessão teve prazo de 24h. Retorno com o cookie não emitiu outro cookie,
  consumiu outro token ou alterou o vencimento. Requisição sem a sessão com o
  token já usado foi recusada com HTTP 410.
- Listagem mostrou somente o item aprovado. O JPEG baixado teve o mesmo hash
  do ativo produzido pelo worker e da prévia, com URL assinada por até 300 s.
- Revogação pela função publicada `school-delivery` bloqueou a listagem da
  sessão existente com HTTP 410.
- A tentativa de envio permaneceu bloqueada e houve **zero mensagens WhatsApp**.
  Conta/escola, dados e objetos sintéticos foram removidos e conferidos.

C01 combina concorrência em duas conexões SQL locais com consumo/retorno/uso
único por HTTP remoto. C03 combina recusas de item/vínculo/snapshot locais com
listagem/download da versão aprovada e limite de assinatura no ambiente real.
C02/C04–C08 não receberam aceite completo por esses checks parciais.

Não foi testado o transporte/reenvio pelo provedor real, o decorrer de 24h/7d
em relógio real, o armazenamento nativo do cookie em aparelho ou a inspeção dos
pixels do JPEG/ZIP baixados do ambiente publicado. Prazo/concorrência/reenvio e
pixels têm provas locais de domínio/fixture separadas, sem substituição desse
aceite completo. Nenhuma foto real de menor ou segredo entrou no relatório.


## Fotos nítidas — publicação de 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
