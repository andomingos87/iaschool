# S05 — Foto nítida com proteção localizada da pessoa inteira

> **Decisão de produto — 13/10/2026:** nas novas entregas, todas as fotos ficam nítidas. A exigência de desfoque e conferência de regiões foi substituída por seleção das fotos e aprovação do álbum. A implementação anterior abaixo é histórica. A nova política usa `public.delivery_items.render_policy` em `artifacts/iaschool-app/supabase/delivery-original-photos.sql`, sem mudar a autorização do destinatário, os limites de acesso ou a retenção. Nova política publicada e verificada em 13/10/2026; validação abaixo.

**Atualizado em:** 12/10/2026.
**Estado:** implementada e publicada; render/prévia/download da mesma versão verificados no ambiente real com dados sintéticos. Inspeção dos pixels publicados, termo específico e aceite completo em aparelho pendentes.
**Origem:** T10; N-D3, N-D4 e N-D10 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulos:** `ingest`, `app`; `face` somente se a detecção for alterada.

## Resultado esperado e limites

A entrega começa com a cena nítida. Proteger somente a pessoa inteira que não
pode aparecer para aquele responsável, com revisão e ajuste humano. Não
desfocar cenário, corpo do aluno autorizado ou adulto/equipe confirmado.

O escopo que permite entrega ao próprio responsável não autoriza exposição a
outras famílias. Outra criança só fica nítida quando houver prova de autorização
explícita para esse escopo. Conferir o termo vigente e obter novo aceite quando
necessário é pré-requisito; não presumir que a configuração existente já cobre.

Esta spec muda o alvo do render, não libera dados reais ou envio comercial.
Aplica-se às fotos de evento entregues, não ao original interno nem à composição
de arte de S02. Ocultar rosto isoladamente não é garantia de proteção da pessoa
inteira; a qualidade da máscara precisa ser conferida.

## Estado local e referências

- `artifacts/ingest-worker/src/localized-delivery-render.ts` parte da cena
  orientada nítida e protege somente regiões da pessoa inteira. Foi ligado a
  `render-handler.ts` e `render-queue.ts`; a miniatura nasce do arquivo já
  protegido. `delivery-render.ts` permanece como implementação anterior, sem
  comandar o novo handler.
- `artifacts/iaschool-app/src/components/photo-person-region-editor.tsx` permite
  marcação por retângulos/polígonos e campos de coordenadas, associação ao rosto
  detectado, classificação humana e atestação de cobertura completa. A tela
  `src/pages/event-deliveries.tsx`/`src/components/delivery-draft-dialog.tsx`
  integra a revisão e permite retirar a foto insegura do conjunto selecionado.
- `public.photo_faces.bbox` é apenas caixa do rosto, conforme
  `artifacts/iaschool-app/supabase/fase3-face-recognition.sql`. A escola precisa
  marcar corpo e partes visíveis; o sistema não amplia essa caixa para fingir
  que detectou a pessoa inteira.
- `public.authorizations` e seus escopos continuam definidos em
  `artifacts/iaschool-app/supabase/fase3-authorizations-reference-faces.sql`.
  Não existe termo/escopo novo para liberar outra criança a outra família:
  sem prova específica válida, a pessoa continua protegida.
- A persistência inicial está em
  `artifacts/iaschool-app/supabase/fase5-person-regions.sql`:
  `public.photo_person_regions`, `public.photos.regions_version` e
  `public.delivery_items.rendered_regions_version`. O histórico desta spec
  registra a migration inicial como aplicada em 12/10/2026; a rodada integrada
  também verificou a persistência de revisão/versão usada pelo render publicado.
- Complementos aplicados em **12/10/2026**:
  `artifacts/iaschool-app/supabase/fase5-review-media.sql` adiciona
  `public.photos.regions_reviewed_version`, `public.photos.all_people_reviewed`,
  dimensões/autoria da revisão e RPCs com versão esperada; valida geometria,
  cobertura do rosto, identidade e escola. Alterar região, rosto, classificação
  ou original invalida a atestação.
- `artifacts/iaschool-app/supabase/fase5-adjustments-delivery-album.sql` integra
  `public.delivery_render_jobs.lease_version`, versão do rascunho e conclusão
  atômica do render. `public.approve_delivery_batch` e os gates de envio/álbum
  exigem a revisão e os arquivos da versão exata aprovada. A assinatura interna
  é feita por `supabase/functions/delivery-preview/index.ts`; não há fallback
  para o original na entrega ao responsável.

## Requisitos

- **PROT-01 — Base nítida.** Renderizar a partir do original orientado e sem
  metadados. Aplicar ocultação/desfoque só nas pessoas a proteger, sem desfoque
  global nem efeito apenas de CSS. Miniatura, prévia e download devem proteger
  os mesmos pixels da mesma versão.
- **PROT-02 — Matriz por destinatário.** Filhos/irmãos confirmados daquele
  responsável ficam nítidos se aptos ao escopo aplicável; outra criança só com
  autorização explícita para outras famílias. Sem prova de escopo, proteger.
  Adulto/equipe só fica nítido com classificação humana confirmada.
- **PROT-03 — Desconhecido protegido.** Pessoa sem identidade/classificação,
  inclusive parcialmente visível, fica protegida por inteiro. Não inferir idade
  nem liberar automaticamente. Um reconhecimento sugerido não basta para
  liberar; ausência de detecção não prova ausência de pessoa sem autorização.
- **PROT-04 — Máscara ajustável.** Escola confere e ajusta a região protegida
  antes de aprovar, inclusive pessoas não detectadas, criança de costas, rosto
  parcial e sobreposição. Usar coordenadas coerentes com orientação/dimensões
  da imagem e conferir cobertura da pessoa inteira, sem cortar pela borda.
- **PROT-05 — Pendência por foto.** Se não houver proteção segura, manter
  aquela foto pendente e fora do conjunto aprovado. Outras fotos que passaram
  pela revisão podem seguir. Não liberar usando apenas uma caixa de rosto
  nem esconder a falha num derivado considerado pronto.
- **PROT-06 — Versão e revisão.** Alterar máscara, identificação/classificação
  ou autorização relevante exige reprocessar ativos afetados, invalidar
  versões/miniaturas antigas e revisar novamente antes de liberar. A versão
  aprovada deve ser a exata mostrada e baixada; render atrasado não restaura uma
  aprovação antiga.
- **PROT-07 — Revalidação e expurgo.** Preservar isolamento por escola/família,
  checagem de autorização ao preparar/enviar/acessar, remoção de metadados,
  revogação e expurgo existentes. Dados biométricos não chegam à interface ou
  logs; um derivado de outra família não pode ser reutilizado por conveniência.

## Implementação local autorizada

Em 12/10/2026 o usuário autorizou o código/SQL local com revisão humana e,
posteriormente, a aplicação das duas migrations, publicação e ensaio integrado
sintético, com envio comercial desligado. A proteção permanece ativa enquanto
não existir termo e prova específica válida para exposição de outra criança a
outras famílias; essa autorização não criou esse escopo.

O editor não aprova uma foto só porque detectou rostos. Cada pessoa detectada
precisa de região correspondente, e a escola declara que conferiu também as
não detectadas. Sem essa atestação, geometria válida e versão atual, o render
recusa a foto. Salvar sem concluir mantém a pendência; as demais fotos podem
seguir quando aquela foto é retirada do conjunto aprovado.

Mudanças exigem nova revisão/render antes de transmitir. Depois do início do
envio, o snapshot fica imutável e o acesso ao ativo antigo é bloqueado quando
sua revisão/autorização deixa de valer. Uma resposta atrasada do worker não
restaura a versão anterior nem apaga os arquivos de outra tentativa válida.

## Tarefas de implementação

- [x] Conferir escopo/termo e dados necessários para máscara/versão; apresentar
  eventuais migrations e decisões técnicas antes de alterar (PROT-02–PROT-04,
  PROT-06).
- [x] Implementar política por destinatário, render localizado e miniatura
  derivada da mesma versão protegida (PROT-01–PROT-03, PROT-07).
- [x] Integrar marcação/conferência humana, ajuste de região e pendência por
  foto, com erro/carregando/ausência de região (PROT-04, PROT-05).
- [x] Reprocessar/inutilizar versão anterior com nova revisão e revalidação
  nos pontos de uso; preservar expurgo (PROT-06, PROT-07).
- [x] Testar pixels, regra de autorização e concorrência; atualizar contextos
  de `ingest` e `app`, e `face` se seu comportamento mudar.

## Cenários de aceite

`[x]` indica prova **local** com cena sintética, teste de domínio ou PostgreSQL
isolado. Nenhum desses checks comprova publicação, autorização real de foto de
grupo ou entrega de arquivos em produção.


- [x] **C01 (PROT-01, PROT-02):** cena com aluno alvo, irmão, outra criança sem
  escopo e adulto/equipe confirmado mantém cenário/autorizados nítidos e protege
  somente quem não pode aparecer, por inteiro.
- [ ] **C02 (PROT-02):** autorização de entrega própria de B não libera B para
  família A. Com prova específica válida, B pode aparecer nítido; revogação
  dessa prova muda o derivado e exige revisão, sem liberar por dado antigo.
- [x] **C03 (PROT-03–PROT-05):** desconhecido, criança de costas, ausência de
  detecção e pessoa parcial são marcados/protegidos manualmente; sobreposição
  sem proteção segura deixa só a foto pendente, e as demais podem ser aprovadas.
- [x] **C04 (PROT-01, PROT-04):** imagem girada e regiões na borda mantêm
  coordenadas/cobertura corretas; arquivo final e miniatura baixados têm a mesma
  proteção da prévia, sem metadados sensíveis.
- [x] **C05 (PROT-05, PROT-06):** foto pendente nunca aparece no álbum aprovado;
  alterar máscara/classificação depois de revisar invalida a aprovação/versão
  antiga. Worker atrasado ou retry não recoloca versão antiga no conjunto atual.
- [x] **C06 (PROT-06, PROT-07):** autorização revogada e acesso de outra
  escola/família recusam nova assinatura/acesso; expurgo e estado indisponível
  não oferecem o original como fallback.
- [ ] **C07 (PROT-04, PROT-05):** revisar no celular/teclado, erro de render,
  carregamento e lista sem fotos mostram como conferir, corrigir e tentar de
  novo sem permitir aprovação de foto insegura.

## Verificação e publicação

Verificações locais em 12/10/2026:

- `localized-delivery-render.test.ts`: pixels de aluno/irmão/adulto nítidos,
  outra criança e desconhecido protegidos por inteiro, sobreposição com
  prevalência da proteção, orientação, polígono na borda, ausência de metadados,
  geometria/autoria/revisão inválidas recusadas e miniatura derivada do mesmo
  arquivo protegido.
- `review-media.test.ts` e `review-media-coverage.test.ts`: limites, polígonos
  cruzados/côncavos, cobertura do rosto, versão esperada e imagem indisponível
  sem fallback do original.
- Navegador local: abrir o editor dentro do rascunho, adicionar retângulo,
  associar rosto confirmado, ajustar largura/altura da região por campos, atestar a cobertura
  e salvar. O fluxo foi conferido com teclado; gesto de desenho e celular
  ainda precisam do ensaio completo.
- `render-handler.test.ts` e ensaio SQL em
  `rehearsal/adjustments-delivery-checks.sql`: arquivo/miniatura por destinatário,
  hash/dimensões, falha parcial com expurgo, foto insegura retirada do conjunto,
  geração de lease monotônica e conclusão antiga recusada. O ensaio também
  recusa acesso após revogação/desvinculação do responsável e quando o item
  aprovado foi apagado; não permite editar/cancelar/reprocessar lote já
  transmitido mesmo quando o provedor depois relata falha.
- O runner `rehearsal/test-adjustments-local.py` passou com PostgreSQL
  descartável e concorrência real de duas conexões. Suítes locais de app/ingest
  e `pnpm run typecheck` verdes. Não usou banco real, foto real de menor,
  Storage publicado ou provedor externo nesse ensaio local.

C02 permanece aberto para a conferência de termo/prova específica e o ensaio
remoto de sua revogação, caso esse escopo seja autorizado. A parte já provada
localmente mantém outra criança protegida, inclusive quando ela é filha de
outro responsável. Não há liberação entre famílias por nome de escopo.

C07 permanece aberto para verificar todo o editor no celular/gestos e provocar
os estados de falha/carregamento/lista vazia no ambiente integrado. O fluxo
principal local e as recusas de domínio estão verificados.

### Publicação e ensaio integrado em 12/10/2026

Aplicadas `fase5-review-media.sql` e `fase5-adjustments-delivery-album.sql`.
Fly: `ingest-worker` **v3**, API **v4** e `face-worker` **v2**. Edge Functions:
`delivery-preview` **v3**, `guardian-album` **v1** e `school-delivery` **v1**.
App promovido ao endereço
[https://iaschool-app.vercel.app](https://iaschool-app.vercel.app), deployment
`dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`.

`tests/adjustments-integrated.integration.test.ts`: **Run 5, 1 teste verde em
27,64 s**, incluindo limpeza. O worker publicado produziu o derivado sintético
**320 × 240**, usando a versão de regiões persistida pela revisão. Prévia e
download JPEG tiveram o **mesmo hash** do ativo produzido. Nenhum original foi
usado como fallback da entrega.

Esta verificação prova o processamento remoto e a identidade/versão dos
arquivos. **Não inspecionou os pixels baixados do ambiente publicado**; os
checks de nitidez/proteção/orientação/metadados continuam baseados nos testes
locais sintéticos listados acima. Essa inspeção integrada ainda precisa ser
feita antes de afirmar qualidade da máscara em uso real.

A aprovação permaneceu pausada e a tentativa de envio foi bloqueada antes do
provedor, com **zero mensagens WhatsApp**. Dados/conta/escola e objetos
sintéticos foram removidos e conferidos. Não houve foto real de menor nem
ampliação de escopo entre famílias.


## Fotos nítidas — publicação de 13/10/2026

Publicada em 13/10/2026: migration `iaschool_delivery_original_photos` (`20261013113430`) aplicada pelo MCP local; Edge `delivery-preview` v9 com JWT; ingest v6 (`deployment-01M4TGPSEWM2218R6WTMCD8EBR`), mesma máquina e recursos; app Vercel `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` promovido. 320 testes app, 69 ingest, 25 funções, PostgreSQL descartável, typecheck/build e ensaio integrado real sintético passaram. O ensaio comprovou original sem regiões, arquivo corrompido isolado, retirada/seleção, aprovação pausada, prévia, sessão, download e revogação; limpeza conferida, zero WhatsApp/IA. A tela local conectada ao Supabase real foi reaberta, exibindo Atualizar fotos no lote antigo; não houve reprocessamento, retirada nem aprovação das fotos reais.
