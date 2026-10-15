# S06 — Rascunho, seleção, aprovação e fila de entrega

> **Decisão de produto — 13/10/2026:** nas novas entregas, todas as fotos ficam nítidas. A exigência de desfoque e conferência de regiões foi substituída por seleção das fotos e aprovação do álbum. A implementação anterior abaixo é histórica. A nova política usa `public.delivery_items.render_policy` em `artifacts/iaschool-app/supabase/delivery-original-photos.sql`, sem mudar a autorização do destinatário, os limites de acesso ou a retenção. Nova política publicada e verificada em 13/10/2026; validação abaixo.

**Atualizado em:** 12/10/2026.
**Estado:** implementada e publicada; integração sintética confirmou render, prévia, aprovação pausada e envio bloqueado. Transporte real pelo provedor permanece desligado e não verificado.
**Origem:** T11.1–T11.3; N-D2 e N-D7 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulos:** `app`, `ingest` e funções pertencentes ao módulo `app`.

## Resultado esperado e dependências

A escola prepara um rascunho, escolhe fotos por responsável/aluno, edita campos
permitidos, vê a mensagem e o álbum completos e aprova aquela versão. Depois
acompanha o resultado real da fila, sem confundir preparo e transmissão.

WhatsApp contém apenas texto e link exclusivo, sem anexos de fotos. O responsável
vê/baixa o conjunto no [álbum de S07](07-album-privado.md). O editor/rascunho pode
avançar com provedor falso, mas transmissão depende de S07 funcional e dos
derivados seguros de [S05](05-protecao-localizada.md). Não ligar envio comercial
nem ampliar o modo `controlled_zapi` por esta entrega.

## Estado local e referências

- `artifacts/iaschool-app/src/pages/event-deliveries.tsx`,
  `src/components/delivery-draft-dialog.tsx`, `src/lib/delivery-workspace.ts` e
  `src/lib/delivery-service.ts`: editor de campos, seleção/ordem por responsável,
  prévia separada de texto e álbum, papéis e estados implementados no código local.
  Progresso `renderedCount/itemCount` continua significando imagens preparadas.
- `public.delivery_batches.message_fields`, `public.delivery_batches.draft_version`,
  `public.delivery_batches.approved_version`, `public.delivery_batches.approved_mode`,
  `public.delivery_items.selected`, `public.delivery_items.display_order`,
  `public.delivery_item_students` e `public.delivery_approvals`: rascunho,
  relação dos irmãos e snapshot imutável em
  `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
  `public.delivery_recipient_students` preserva autorização/termos existentes
  (`artifacts/iaschool-app/supabase/fase5-delivery-batches.sql`).
- RPCs `public.delivery_draft_detail`, `public.save_delivery_draft` e
  `public.approve_delivery_batch` usam vínculo escolar, versão esperada e
  validação do conjunto seguro. Nome do evento tem até 120 caracteres, chamada
  opcional até 160 e assinatura até 80; URLs e caracteres de controle são recusados.
  Referência: `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- `public.delivery_recipients.dispatch_started_at` impede edição, cancelamento
  e retry de render depois do início de transmissão, inclusive se um webhook
  posterior trouxer `failed`. `public.reserve_delivery_dispatch` e
  `public.delivery_dispatch_gate` revalidam o snapshot e o vínculo exato
  escola/aluno/responsável da autorização; não aceitam responsável desvinculado.
  Referência: `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- `artifacts/iaschool-app/supabase/functions/school-delivery/index.ts` executa
  dispatch, reenvio e revogação no servidor; `_shared/delivery/message.ts`
  renderiza o texto controlado com link `/album#<token>`, sem anexo.
  Aprovação não liga o envio: runtime requer modo permitido, provedor configurado,
  HTTPS e `DELIVERY_ALBUM_READY=true`, além dos controles existentes.
- `public.reserve_whatsapp_send`, `public.complete_whatsapp_send` e
  `public.record_whatsapp_provider_status`
  (`artifacts/iaschool-app/supabase/fase4-whatsapp-foundation.sql`) mantêm
  allowlist/teto/kill switch e correlação dos estados. Callback duplicado/fora
  de ordem não duplica evento nem substitui o resultado de outra mensagem.
  `_shared/whatsapp/zapi-provider.ts` trata timeout, HTTP 5xx/408 e resposta
  incompleta como `unknown`, sem retry automático; 2xx válido fica `accepted`.
- `public.delivery_render_jobs.lease_version` não zera em retry. O worker
  `artifacts/ingest-worker/src/render-handler.ts` usa máscara localizada,
  snapshot por lote e caminhos separados por versão/lease. Conclusão atrasada
  não substitui o ativo atual; upload parcial e ativo removido entram no expurgo.
  Referência: `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
- `artifacts/iaschool-app/supabase/functions/delivery-preview/index.ts` assina
  somente a seleção protegida corrente, respeita a retenção restante e recusa
  prévia truncada ou revisão invalidada. O token exclusivo não volta à escola.

Em 12/10/2026 o usuário autorizou também aplicar as duas migrations, publicar
e validar o fluxo integrado com material sintético, mantendo envio comercial
desligado. A seção final registra as versões publicadas e o ensaio remoto.
O teste não enviou WhatsApp real nem modificou configurações para habilitá-lo.

## Requisitos

- **ENT-01 — Fluxo e permissão.** Rascunho → seleção → prévia → aprovação →
  fila → resultado. Preservar papéis já aprovados: professor prepara;
  `school_admin`/`school_staff` aprova/envia. Administrador de plataforma só
  opera em nome da escola se também tiver vínculo/papel permitido nela.
- **ENT-02 — Seleção por responsável.** Escolher fotos confirmadas para cada
  responsável/aluno, com selecionar/desmarcar, contagem e aviso para conjuntos
  grandes. Ações não afetam outra família/evento. Irmãos têm uma entrega por
  responsável, sem duplicar a mesma foto no conjunto do álbum, preservando a
  relação com os alunos a que pertence. Permitir retirar/reordenar antes da
  aprovação; nenhuma foto pendente/insegura entra no conjunto aprovado.
- **ENT-03 — Campos editáveis.** Escola edita nome do evento, chamada curta e
  assinatura da escola. Sistema controla link e informações de acesso; não
  aceita troca por URL arbitrária. Validar os limites do contrato/template do
  provedor já aprovado antes de transmitir, com mensagem clara para corrigir.
  Não inserir nome completo do aluno no texto ou na URL.
- **ENT-04 — Prévia completa.** Mostrar texto preenchido, responsável com
  telefone mascarado, destino do link e fotos na ordem final. Separar visualmente
  a mensagem de texto e a prévia do álbum. O link de prévia de arquivo com cinco
  minutos não é o link exclusivo do responsável. Não enviar para testar a prévia.
- **ENT-05 — Versão congelada.** Aprovação fixa texto, fotos/ordem, destinatários,
  autorização, modo e versão dos derivados. Alteração antes de transmitir
  exige nova prévia/aprovação. Aprovação antiga nunca valida mudanças silenciosas;
  o conjunto que S07 mostra é exatamente o aprovado. Não alterar retroativamente
  uma mensagem já transmitida nem mutar sua versão de auditoria.
- **ENT-06 — Portão do envio.** Antes da transmissão revalidar autorização,
  número cadastrado/verificado, escola, arquivos/versão e modo permitido. Nada
  sai sem álbum acessível. Preservar allowlist, teto diário, kill switch e
  ausência de fallback automático; provedor só no servidor.
- **ENT-07 — Status verdadeiros.** Separar preparo de imagens de transmissão.
  Mostrar contagens de aguardando, enviando, aceita pelo provedor, enviada,
  entregue, lida, falha, bloqueada e resultado incerto, com última atualização
  e motivo acionável. HTTP 2xx do provedor é aceitação, não entrega. Não inventar
  posição na fila ou prazo de chegada.
- **ENT-08 — Falha, cancelamento e retomada.** Exibir envio desligado, consumidor
  indisponível e falha de conexão. Cancelar o que ainda pode ser cancelado e
  retomar só tentativas seguramente repetíveis. Não reenviar automaticamente
  mensagem já entregue ou cujo resultado seja incerto. Cliques/claims/webhooks
  duplicados não duplicam mensagem nem eventos.
- **ENT-09 — Estados e isolamento.** Tratar evento vazio, sem destinatário
  apto, zero fotos selecionadas, render pendente/falhou, revisão invalidada e
  carregamento. Contagens da prévia e do álbum aprovado devem coincidir;
  telefone completo, token e URL privada não chegam a logs ou projeções da escola.

## Implementação adotada

A tela existente usa o rascunho versionado e a projeção mascarada do servidor.
Salvar seleção/texto exige a versão lida; concorrência ou revisão nova pede
recarregar e aprovar novamente. Aprovação congela ordem, campos, modo e versões
seguras. Irmãos preservam relação com os alunos e aparecem uma vez por foto.

A fila trabalha somente com itens selecionados. Permissão de preparo não concede
permissão para aprovar/transmitir. Antes do provedor, o servidor confere vínculo,
autorização, telefone verificado, arquivos e álbum. Depois da transmissão, a
versão fica imutável; novo acesso usa reemissão do mesmo conjunto.

## Tarefas de implementação

- [x] Contrato comum S06/S07, snapshot, ordem, versão e aprovação transacional
  implementados no SQL local autorizado (ENT-02–ENT-06).
- [x] Editor/seleção, papéis, contagens e prévia implementados no código local;
  domínio de seleção/limites/permissão testado (ENT-01–ENT-04, ENT-09).
- [x] Aprovação imutável, invalidação e portão de envio com derivados seguros
  implementados e ensaiados no PostgreSQL local (ENT-05, ENT-06).
- [x] Estados correlacionados, motivos sanitizados e cancelamento/retry seguros
  implementados; provedor falso, timeout, callbacks duplicados/fora de ordem e
  controles de envio exercitados localmente (ENT-07, ENT-08).
- [x] Testes de domínio/Edge Functions/worker, roundtrip SQL e concorrência de
  token/revogação executados; contexto de `ingest` atualizado.
- [x] Fluxo de navegação S06 com fixture verificado: URL editável bloqueada, campos
  válidos, exclusão/reordenação, salvamento de versão 2, revisão/aprovação e envio
  falso `accepted`. Botão de envio ausente antes da aprovação.
- [x] Consolidar contexto final de `app` (12/10/2026).
- [x] Validar integração publicada com material sintético e envio desligado:
  worker/prévia/aprovação pausada, bloqueio antes do provedor e limpeza conferidos.

Os checks diferenciam domínio/interface locais da integração publicada. A
integração sintética não equivale a entrega comercial pelo provedor ou aceite
completo em aparelho real.

## Cenários de aceite

`[x]` identifica os cenários comprovados pelos testes de domínio/interface
locais descritos abaixo e, quando indicado, pela integração HTTP sintética.
Os demais preservam o aceite completo. O ensaio publicado prova o caminho
seguro **pausado**; nenhum envio real, aparelho real ou leitor de tela é presumido.


- [ ] **C01 (ENT-01, ENT-02):** responsável com irmãos escolhe só suas fotos,
  remove e ordena; a mesma foto confirmada para ambos entra uma vez no conjunto;
  outra família permanece intacta e professor não consegue aprovar sem papel.
- [x] **C02 (ENT-03, ENT-04):** editar campos permitidos atualiza texto/álbum;
  tentativa de URL arbitrária ou texto incompatível com o contrato é recusada;
  prévia mascara telefone e não envia mensagem nem anexo.
- [ ] **C03 (ENT-05):** alteração de texto, foto/ordem, destinatário, modo ou
  versão protegida depois da aprovação impede envio até nova aprovação;
  render atrasado não restaura o snapshot anterior.
- [ ] **C04 (ENT-06, ENT-09):** revogação, número alterado/não verificado,
  álbum indisponível, ativo expirado e versão insegura bloqueiam a transmissão
  com motivo, sem consumir o caminho de outra família.
- [x] **C05 (ENT-07):** 100% de render com consumidor desligado continua
  “imagens preparadas/envio desligado”; retorno 2xx fica aceito; apenas estados
  correlacionados de envio/entrega/leitura mostram esses resultados.
- [ ] **C06 (ENT-08):** timeout de resultado incerto não dispara retry;
  cancelamento/retomada, clique repetido e webhook duplicado/fora de ordem
  preservam uma tentativa válida e trilha coerente, sem novo envio entregue.
- [x] **C07 (ENT-06):** no provedor falso validar limites e isolamento;
  `controlled_zapi` recusa fora da allowlist/escola, acima do teto e kill switch
  ativo; teste não liga o modo real nem o comercial.
- [ ] **C08 (ENT-04, ENT-09):** vazio, zero selecionadas, carregando, render
  falhou e erro de rede permitem correção; teclado/celular chegam à prévia,
  seleção e motivo de bloqueio sem liberar aprovação inválida.

## Verificação e publicação

Verificação executada em 12/10/2026: 55 testes do `ingest-worker`, 20 testes Deno
(álbum/dispatch/token/provedor), typecheck do worker e das três funções de entrega.
`artifacts/iaschool-app/supabase/rehearsal/test-adjustments-local.py` cria um
Postgres descartável somente em socket local, sem credenciais/rede externa;
compila/reexecuta SQL e ensaia S04–S07 com dados sintéticos. Passaram deduplicação,
snapshot, professor sem aprovação, lease atrasado/upload parcial, uso único,
revogação concorrente, sessão preservada no reenvio, vínculo nulo recusado,
item aprovado removido, histórico `accepted` → `failed`, allowlist, teto e kill
switch. O fixture usa um domínio no lugar de pgvector; não valida a extensão
nem reconhecimento em produção.

No navegador com fixture/fetch simulado, foram exercitados bloqueio de URL,
campos válidos, exclusão da terceira foto, ordem, salvamento da versão 2, revisão
e aprovação. Envio falso retornou `accepted`, com rótulo separado de entrega;
botão de envio não apareceu antes da aprovação. Isso verifica a interface, não
o transporte real, consumo de cookie pelo browser ou o banco remoto.
A simulação não prova entrega pelo provedor; a integração publicada é descrita abaixo.

### Publicação e ensaio integrado em 12/10/2026

Aplicadas `artifacts/iaschool-app/supabase/fase5-review-media.sql` e
`artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`.
Publicadas as Edge Functions `guardian-album` **v1**, `school-delivery` **v1** e
`delivery-preview` **v3**. Fly: API **v4**, `ingest-worker` **v3** e
`face-worker` **v2**. App promovido ao endereço
[https://iaschool-app.vercel.app](https://iaschool-app.vercel.app), deployment
`dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`.

`tests/adjustments-integrated.integration.test.ts`: **Run 5, 1 teste verde em
27,64 s**, incluindo limpeza. Em escola/conta descartáveis com dados adultos
fictícios e imagem inteiramente sintética, o worker publicado preparou o ativo
320 × 240 da versão revisada. A prévia assinada correspondeu ao hash do render;
a aprovação persistiu **`approved_mode = 'paused'`**.

A chamada publicada a `school-delivery` foi bloqueada antes do provedor e
confirmou **zero registros de mensagem WhatsApp** da escola de teste. Isso
prova o portão desligado; não prova envio, aceitação ou entrega pelo provedor
real. Esses estados continuam apoiados nos testes locais/falsos, sem confundir
`accepted` com entrega.

O mesmo conjunto aprovado foi aberto e baixado pelo álbum de S07 usando um
token privilegiado exclusivo de teste, **sem transmiti-lo a ninguém**. Dados,
conta/escola e objetos do ensaio foram removidos por identificação/prefixo
próprios, com conferência no Storage. Nenhum segredo foi impresso nos resultados.

C02 foi exercitado pela interface com fixture e validação do servidor; C05 tem
prova de estados/correlação local e bloqueio remoto pausado; C07 usa as RPCs reais
copiadas no PostgreSQL descartável, sem acionar provedor externo. Os demais
cenários não receberam marcação completa por essa prova parcial.

A publicação está concluída; continuam pendentes o aceite completo em aparelho
real e, somente com autorização própria, a validação de transporte no modo
controlado permitido. O envio comercial permanece desligado.

## Revisão de clareza — 13/10/2026

A tela agora explica três etapas: preparar fotos, conferir/aprovar, enviar acesso ao álbum. O progresso conta fotos processadas e não atesta revisão atual nem envio. Falha de preparo mostra “Precisa de atenção”. Há uma única ação para abrir fotos/mensagem, atualização de prévia sem fechar, sugestão explícita do nome do evento, salvar alterações e aprovação da versão conferida. Erro ou atualização da consulta retira URLs anteriores da grade e mantém aprovação bloqueada. Retry afeta apenas falhas; cancelamento explica cópias/originais e exige confirmação. Revogação de acesso aparece somente após possível emissão de acesso. Detalhe/rascunho/prévia são invalidados nas mudanças do lote.

Teste sintético dos botões passou: retry, renovar prévia, editar/salvar, aprovar após carregar e conferir, voltar sem cancelar e confirmar cancelamento. 316 testes do app, typecheck e build passaram. O evento real indicado foi apenas consultado: quatro renders antigos sem versão de proteção atual e uma falha após cinco tentativas; sem aprovação ou envio. A escola precisa conferir a proteção; a interface não autoriza ou envia automaticamente. Sem nova migration, Edge Function, segredo ou liberação de WhatsApp comercial.

Publicado e promovido em 13/10/2026: `dpl_s2otZnquLRryKtraLFg6GxmR5DVJ`, https://iaschool-app.vercel.app. Verificação autenticada confirmou etapas, ação única de conferência, estado de atenção, ausência de revogação antes do envio e aprovação bloqueada com prévia indisponível. App local rodando em 127.0.0.1:5179, tela de entregas aberta no navegador integrado com material sintético. Sem migration ou Edge Function pendente para esta alteração.

## Falha por foto e exclusão da seleção — 13/10/2026

A prévia coletiva tinha uma relação ambígua entre `public.delivery_items` e `public.delivery_recipient_students` após existir `public.delivery_item_students` (SQL `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql`), retornando PGRST201 em vez da grade. O endpoint agora nomeia a FK direta explicitamente e retorna URL OU motivo por item selecionado: proteção pendente, falha de render ou arquivo indisponível. Uma foto inválida não esconde as demais; nunca recebe URL.

O diálogo permite “Retirar do álbum” por foto e retirar as problemáticas da família. Isso muda a seleção e precisa ser salvo; não apaga a origem. Aprovação continua exigindo todos os itens selecionados seguros e carregados. Se todas as selecionadas têm problema, a tela diz que é necessário conferir a proteção ou incluir fotos válidas. Erro global de consulta/carregamento não classifica automaticamente uma foto como defeituosa.

Worker classifica revisão pendente, download, imagem inválida, upload, timeout e contexto por códigos seguros. A falta de revisão é barrada antes do download. No job antigo o erro genérico não identifica retrospectivamente a etapa; metadata atual confirma original presente e ausência de revisão/regiões. Lote real foi apenas consultado.

Testes: prévia parcial/segurança 4 casos novos, 24 testes totais das funções; 319 testes app, 64 ingest, PostgreSQL descartável e typecheck/build verdes. Ensaio integrado real sintético passou depois de corrigir a consulta: uma foto sem revisão falhou isolada com código claro, outra foi preparada e assinada; retirar/salvar deixou lote aguardando conferência com uma foto e zero falhas, preservando a origem. Aprovação pausada, sessão/download/revogação e limpeza passaram, zero WhatsApp/IA. Primeira rodada encontrou PGRST201; fixture removida e rodada após correção passou.

### Publicação da correção de falhas isoladas — 13/10/2026

Publicado em 13/10/2026: app `dpl_9aJPieg7bFgJFX1b2swFmbZYxkXw` promovido, Edge `delivery-preview` v8 com JWT ligado e ingest v5 saudável. Conferência autenticada do lote real mostrou quatro problemas `protection_pending` e uma falha, sem erro global e com retirada por foto. Nenhuma foto/seleção real foi modificada. Teste integrado sintético real e limpeza passaram; nenhuma mensagem WhatsApp ou chamada OpenAI. Sem migration nova ou função pendente.


## Fotos nítidas — publicação de 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
