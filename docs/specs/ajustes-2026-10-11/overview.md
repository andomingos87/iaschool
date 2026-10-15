# Ajustes de 11/10/2026 — overview e execução por specs

**Atualizado em:** 12/10/2026.
**Estado:** S01–S07 implementadas; migrations, funções, app/API e workers publicados em 12/10/2026 após autorização do usuário. Ensaio integrado sintético e uma geração real passaram. WhatsApp comercial desligado; fotos reais de menores e demais gates de produção continuam restritos. Aceites externos ainda não exercitados estão indicados em cada spec.
**Origem:** [Notion — IASCHOOL, Ajustes 11/10](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Acompanhamento:** [BACKLOG.md — Ajustes de produto (11/10/2026)](../../../BACKLOG.md#ajustes-de-produto-11102026--specs-por-entrega).

## Objetivo e limites

Facilitar o cadastro da escola, a criação de artes, a revisão e a organização
das fotos e a entrega privada aos responsáveis. Reaproveitar componentes,
tokens, filas e validações existentes. A escola escolhe e confere o que entrega;
o responsável recebe texto com link para o álbum e decide o que baixar.

As decisões de produto desta rodada estão fechadas no Notion. A leitura do
código local identifica pontos de implementação, mas não comprova configuração
remota, publicação ou funcionamento em produção. Os cenários locais executados e os aceites externos pendentes estão identificados
em cada spec.

Estas specs não autorizam mudanças no banco, dependências, segredos, deploy,
foto real de menor nem envio comercial. Continuam valendo o [AGENTS.md](../../../AGENTS.md),
a [segurança do projeto](../../../.context/security.md), a skill local
[eca-digital](../../../.claude/skills/eca-digital/SKILL.md) e as
[pendências de produção](../../pendencias-producao.md). Material de teste deve
ser sintético ou de adultos autorizados. A ponte `controlled_zapi` mantém uma
escola, de uma a quatro pessoas allowlisted, teto diário e kill switch; a Meta
continua sendo o destino antes do uso comercial.

## Fonte de cada regra

- As regras operacionais e os limites de segurança do projeto permanecem ativos.
- N-D1–N-D13 abaixo identificam exclusivamente as decisões do Notion de 11/10.
  D1–D8 da [spec de WhatsApp](../../spec-whatsapp-api-oficial-entrega-fotos.md)
  conservam seus próprios significados; em especial, a D8 de WhatsApp é a ponte Z-API.
- Estas sete specs são o detalhamento executável do lote e apontam para a origem.
  Uma mudança posterior de produto precisa atualizar a spec afetada e o backlog.
- A [spec de 07/10](../../spec-ajustes-cadastro-arte-escola.md) conserva o histórico
  e os itens que não pertencem a este lote. Seus alvos conflitantes foram
  conciliados: logo/cores, faixa, proteção e preparo/álbum seguem as specs abaixo.
- O backlog é o único acompanhamento de conclusão. Uma spec escrita não torna
  sua funcionalidade implementada. Planos e tarefas aqui não são uma segunda
  lista de status: seus checkboxes distinguem implementação e critérios verificados localmente dos
  aceites externos ainda pendentes.

## Entregas e rastreabilidade

| Spec | Resultado verificável | Origem |
| --- | --- | --- |
| [S01 — Cadastro da escola](01-cadastro-escola.md) | Endereço assistido por CEP; produto sem logo/cores configuráveis da escola | T05, T06; N-D6 |
| [S02 — Criação de artes](02-criacao-artes.md) | Foto de referência + prompt em uma tela, sem recorte manual; novas artes sem faixa | T01, T02, T03, T04; N-D1, N-D5, N-D11, N-D13 |
| [S03 — Pasta do aluno e ZIP](03-pasta-aluno-zip.md) | Fotos por evento e ZIP válido do conjunto filtrado | T07, T08 |
| [S04 — Revisão e referências](04-revisao-referencias.md) | Seleção em lote humana; rosto confirmado reutilizado com autorização | T12, T09 |
| [S05 — Proteção localizada](05-protecao-localizada.md) | Cena nítida e pessoa sem autorização aplicável protegida nos arquivos finais | T10; N-D3, N-D4, N-D10 |
| [S06 — Preparação da entrega](06-preparacao-entrega.md) | Seleção, texto e destinatários revisados, aprovação congelada e fila compreensível | T11.1, T11.2, T11.3; N-D2, N-D7 |
| [S07 — Álbum privado](07-album-privado.md) | Acesso temporário só ao conjunto aprovado, com download, revogação e reenvio | T11.4; N-D8, N-D9, N-D12 |

## Decisões preservadas

| Decisão do Notion | Regra vinculada ao lote |
| --- | --- |
| N-D1 | Compor a pessoa da foto original; prompt sozinho não garante identidade nem preservação dos pixels |
| N-D2 | WhatsApp contém somente texto e link exclusivo; nenhuma foto como anexo |
| N-D3 | Outra criança só aparece nítida para outras famílias com autorização explícita que cubra esse escopo; verificar termo e obter aceite quando necessário |
| N-D4 | Proteger a criança inteira por ocultação/desfoque localizado, com marcação ajustável na revisão |
| N-D5 | Remover a aplicação da faixa “IMAGEM GERADA POR IA” nas novas gerações, sem outro selo visual |
| N-D6 | ViaCEP é a única fonte no MVP; falha mantém preenchimento manual |
| N-D7 | Escola edita nome do evento, chamada curta e assinatura; sistema controla link e informações de acesso |
| N-D8 | Sem código adicional ou conta/login do responsável: link de uso único abre sessão de 24 h; arquivos até 7 dias e URL assinada de arquivo no máximo 5 min |
| N-D9 | Recuperação pela escola, que revalida responsável/número, autorização e arquivos e reenvia pelo painel; sem solicitação automática no MVP |
| N-D10 | Pessoa desconhecida fica protegida por inteiro; escola confere/ajusta; proteção insegura mantém só aquela foto pendente |
| N-D11 | Preferir tudo que aparece da pessoa original; recorte permitido só abaixo do pescoço; pescoço, cabeça, cabelo, orelhas e rosto completos |
| N-D12 | Reenvio invalida links antigos não usados, mas mantém sessões já abertas até suas 24 h originais; revogação explícita continua bloqueando acesso |
| N-D13 | Artes antigas permanecem no histórico com o arquivo/faixa existentes; sem alteração ou reprocessamento retroativo |

O risco aceito em N-D8 permanece: quem recebe um link encaminhado antes do
primeiro uso pode consumi-lo primeiro. Não acrescentar OTP/login a esse álbum
por iniciativa técnica. O número de destino precisa continuar cadastrado e
verificado. Revogar bloqueia novos acessos, mas não recolhe cópias já baixadas;
URLs de arquivo já emitidas podem continuar válidas até seu prazo de no máximo
5 minutos. Não prometer retirada instantânea desses arquivos.

## Como executar com Spec Driven Development

Para cada entrega: revisar requisitos e cenários → fechar plano técnico →
implementar tarefas pequenas → verificar cada critério → atualizar documentação
do módulo e status no backlog. O detalhamento do plano deve preceder código que
exija nova biblioteca, schema ou arquitetura. Não instalar um framework de SDD
para executar este lote.

Os requisitos têm IDs próprios por spec; os cenários e as tarefas apontam para
eles. Na revisão de código, verificar a ligação requisito → implementação →
teste/ensaio. Alterar só o escopo aprovado, incluindo erro, vazio, carregando,
validação, teclado e celular. Consultar documentação atual via MCP antes de
escrever código que use terceiros. Não editar cliente, Zod ou tokens gerados.

### Ordem e dependências

1. Conferir os pontos técnicos de S02 (foto + prompt; decisão simplificada de 12/10), S05 (termo e
   máscara da pessoa inteira) e o contrato compartilhado S06/S07. Não criar
   schema por suposição. Essas conferências não precisam bloquear S01 e S03.
2. Executar S01 e S03 e o trecho T12 de S04. T09 pode usar a consulta de fotos
   confirmadas sem depender da apresentação nova de S03; se houver novo seletor
   por evento, reaproveitar os dados já obtidos. Não depende de S05 ou de envio.
3. Executar S02 e S05. Os ajustes independentes de S02 podem ser verificados
   separadamente, mas T04 só fecha com a composição da pessoa original validada.
4. S06 pode construir rascunho/editor com provedor falso enquanto S07 é feito.
   Primeiro alinhar o conjunto aprovado, sua versão e a relação por responsável.
   O álbum de S07 consome esse conjunto; o envio de S06 depende do álbum funcional
   e dos derivados seguros de S05. Isso evita uma dependência circular de código.
5. Ensaiar S05 → S06 → S07 com material permitido e provedor falso. Qualquer
   canário real, publicação ou aplicação de migration requer a autorização própria.

### Pontos técnicos a conferir, sem reabrir decisões de produto

- Template ativo no banco e sua origem; o código permite fallback, mas o valor
  remoto não foi consultado nesta rodada.
- Termo atual e prova de aceite para exposição em foto de grupo a outras famílias.
  O escopo de entrega própria não serve de prova desse outro uso.
- Projeção de evento/rosto confirmado, origem da referência, persistência da
  máscara revisada e da versão de texto/seleção. Identificar o menor ajuste e
  apresentar eventual migration antes de criar/aplicar mudança de schema.
- Consumo atômico de token, reemissão e revogação concorrentes, respeitando a
  arquitetura de sessões já planejada, sem presumir que esteja implementada.

## Verificação e definição de pronto

- Critérios de cada spec executados e resultado informado na conversa.
- Testes dos pacotes de código efetivamente tocados e `pnpm run typecheck`.
  Não executar testes que escrevem no banco real sem a autorização aplicável.
- CEP, ZIP e criação de arte ensaiados na interface; download realmente aberto;
  derivados/miniaturas inspecionados nos pixels com material permitido.
- Estados de mensagem comprovados com provedor falso: aceitação, envio, entrega,
  leitura, bloqueio, falha e resultado incerto são diferentes.
- Isolamento entre escolas/famílias, consentimento revogado, sessão expirada e
  concorrência cobertos. Nenhum teste local é descrito como prova de produção.
- Documentação do módulo atualizada quando o comportamento mudar. Relacionar
  migrations, Edge Functions e workers que realmente precisarem ser publicados.
  Não criar screenshots, dumps ou relatórios só como evidência.

## Fora deste lote

Arte em massa (spec de 07/10 §9, ainda sem escolha), primeiro login ainda não
reproduzido, cobrança/planos, portal permanente, criação de conta do responsável,
novo provedor, exclusão retroativa de logos/cores/arquivos antigos e liberação
comercial. Não estimar prazo fechado antes das conferências técnicas acima.

**Verificação em 12/10/2026:** 295 testes do app, 26 da API, 55 de ingest,
39 de face e 20 de funções verdes; typecheck/build do workspace e ensaio
Postgres local com idempotência/concorrência verdes. CEP, seleção/referências,
ZIPs abertos, recorte/revisão e rascunho/álbum ensaiados localmente.

Depois da autorização de publicação, teste integrado real passou: revisão,
render no worker publicado, prévia/hash, aprovação pausada, sessão/cookie no
domínio do app, uso único, download e revogação. Nenhuma mensagem WhatsApp.
Uma geração real autorizada retornou PNG 1024 e preservou os 18.600 pixels
conferidos da pessoa sintética. Fixtures, contas e arquivos removidos e ausência
de resíduos verificada. O teste de origem não atesta reconhecimento de pessoa
real. Leitor de tela, aparelho físico e termo entre famílias permanecem em aceite.

**Publicado:** `fase5-review-media.sql` e `fase5-adjustments-delivery-album.sql`
aplicados via MCP local, migrations `iaschool_adjustments_review_media` e
`iaschool_adjustments_delivery_album`. `fase5-person-regions.sql` confirmado
no histórico remoto como pré-requisito aplicado. Funções `guardian-album` v1,
`school-delivery` v1 e `delivery-preview` v3 ativas. Fly: API v4, ingest v3,
face v2, saúde real e recursos preservados. App:
[https://iaschool-app.vercel.app](https://iaschool-app.vercel.app), deployment
`dpl_EHLnkZvopVcLNJDPkQU4ZBh1AyQ6`, build verificado e promovido.

**Controle preservado:** `DELIVERY_ALBUM_READY=false` configurado e conferido;
sem envio comercial, sem foto real de menor. Não há SQL ou função pendente de
publicação deste lote. Ativação de envio e liberação de dados reais requerem seus
gates e autorização própria. Ensaio usa número/aceite/token sintéticos sem
transporte de WhatsApp, sem prometer identidade real do responsável.

## Revisão de S02 — 12/10/2026

O usuário rejeitou a experiência de recorte manual publicada. A decisão vigente remove assistente, modelo de estilo obrigatório, atalhos, contorno e conferência da montagem. O novo fluxo usa uma foto e prompt direto; a foto entra na IA, com instrução de preservar identidade sem garantia de pixels. Requisitos anteriores de composição original tornam-se históricos. Nenhuma mudança em S04–S07 ou no WhatsApp comercial.

## Wizard em lote — decisão posterior de 12/10/2026

O usuário confirmou [wizard de alunos/turmas e geração em lote](08-wizard-geracao-lote.md): seleção múltipla com autocomplete, somente alunos com foto principal e autorização, foto padrão do perfil com troca por fotos do perfil/eventos revisados individuais, prompt comum e uma arte por aluno. Lote processado no servidor, retomável após fechar a aba; falhas não param outros e retry manual só dos falhos. A implementação local está em andamento. A tela simples anterior permanece a versão publicada até aplicação/publicação deste lote.
