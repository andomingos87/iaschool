# Marketing da AIESCOLA

Pasta de trabalho de marketing da AIESCOLA (aiescola.com.br). Fica fora do
código do produto: nada aqui é importado pelo app.

Cada arquivo marca o que está **Definido** (tem fonte no repositório),
**Hipótese** (proposta a validar com escolas) e **A definir** (lacuna que
precisa de decisão de vocês).

**Painel interativo:** [painel.html](painel.html) reúne estes arquivos com
busca, filtro por status, lista de pendências e simulador de proposta. Ele é
gerado a partir dos `.md`: quando um arquivo mudar, peça para regenerar.

## Antes de escrever qualquer peça

Leia [regras de comunicação](07-conformidade/regras-de-comunicacao.md). Em uma
linha: sem foto real de criança, sem declarar conformidade com o ECA Digital,
sem número que não foi medido, sem depoimento inventado e sem anunciar entrega
por WhatsApp.

## Estrutura

| Pasta | Arquivo | Para que serve | Status |
| --- | --- | --- | --- |
| `01-estrategia` | [posicionamento.md](01-estrategia/posicionamento.md) | Categoria, proposta de valor, mensagens-chave | Hipótese |
| | [publico-e-icp.md](01-estrategia/publico-e-icp.md) | Perfil da rede que compra (ICP) e pré-requisitos de produto | Definido |
| | [personas.md](01-estrategia/personas.md) | Quem decide, quem usa, quem influencia, quem trava | Hipótese |
| | [jornada-de-compra.md](01-estrategia/jornada-de-compra.md) | Etapas da compra e calendário escolar | Hipótese |
| | [concorrencia.md](01-estrategia/concorrencia.md) | Alternativas que a escola usa hoje | A definir |
| | [oferta-e-preco.md](01-estrategia/oferta-e-preco.md) | Modelo de cobrança, preço e piloto | Definido em parte |
| | [metas-e-metricas.md](01-estrategia/metas-e-metricas.md) | Funil, indicadores e metas | A definir |
| `02-marca` | [voz-e-tom.md](02-marca/voz-e-tom.md) | Como a marca escreve | Definido |
| | [identidade-visual.md](02-marca/identidade-visual.md) | Paleta, fontes, arquivos de logo | Definido |
| `03-canais` | [plano-de-canais.md](03-canais/plano-de-canais.md) | Papel de cada canal | Hipótese |
| | [landing/copy-landing-v2.md](03-canais/landing/copy-landing-v2.md) | Proposta de copy para a landing | Rascunho |
| `04-vendas` | [roteiro-demonstracao.md](04-vendas/roteiro-demonstracao.md) | Roteiro da demo | Hipótese |
| | [objecoes.md](04-vendas/objecoes.md) | Respostas às objeções comuns | Hipótese |
| `05-conteudo` | [calendario-editorial.md](05-conteudo/calendario-editorial.md) | Temas por mês do ano letivo | Hipótese |
| `06-pesquisa` | [roteiro-entrevista.md](06-pesquisa/roteiro-entrevista.md) | Entrevista com escolas para validar as hipóteses | Pronto para uso |
| `07-conformidade` | [regras-de-comunicacao.md](07-conformidade/regras-de-comunicacao.md) | O que a comunicação pode e não pode prometer | Definido |

## O que falta decidir para fechar a estratégia

**Decidido em 31/10/2026:** ICP é rede particular de 5 a 20 unidades em
Guarulhos e São Paulo; preço de R$ 6,00 por aluno por mês, pago pela rede, com
artes incluídas por cota e piloto pago com desconto.

1. **Quando o produto pode receber foto real de aluno.** Enquanto os gates de
   [pendências de produção](../docs/pendencias-producao.md) estiverem abertos,
   a conversa com as redes é demonstração, não piloto.
2. **Pré-requisitos de produto do ICP:** importação por planilha, autorização e
   entrega sem depender do WhatsApp comercial, homologação jurídica. Lista em
   [publico-e-icp.md](01-estrategia/publico-e-icp.md).
3. **Números da oferta:** descontos por prazo, cota de artes, mínimo por unidade.
   O custo por aluno já está em [estimativa de custos](../docs/estimativa-custos-por-aluno.md).
4. **Meta e orçamento** do primeiro ciclo, e quem executa.
5. **Conversas com as redes conhecidas**, para validar preço e dores.

## Fontes

- Landing atual: [`landing.tsx`](../artifacts/iaschool-app/src/pages/landing.tsx)
- Marca: `branding/` (PDFs) e [`artifacts/iaschool-ui/public/brand/`](../artifacts/iaschool-ui/public/brand/)
- Demonstrações gravadas: `videos/*.md`
- Perfis de público do produto: [pivotagem, §3.3](../docs/pivotagem-iaschool.md)
- Gates de produção: [pendências de produção](../docs/pendencias-producao.md)
- Andamento: [BACKLOG](../BACKLOG.md)
