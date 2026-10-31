# Copy da landing, versão 2 (rascunho)

**Status:** Rascunho de 31/10/2026, ainda não aplicado ao código. Base: a
landing atual em [`landing.tsx`](../../../artifacts/iaschool-app/src/pages/landing.tsx).
A estrutura das seções continua a mesma. Mudam os textos que prometem mais do
que o produto entrega ou que dependem de revisão jurídica. Os achados estão em
[regras de comunicação](../../07-conformidade/regras-de-comunicacao.md).

**Público:** dono ou direção de rede particular de 5 a 20 unidades, e a coordenação das unidades ([ICP](../../01-estrategia/publico-e-icp.md), [personas](../../01-estrategia/personas.md)).
**Objetivo da página:** pedido de demonstração.
**Voz:** [voz e tom](../../02-marca/voz-e-tom.md): clara, concreta, cuidadosa.

---

## SEO

- **Meta title (51 caracteres):** AIESCOLA | Fotos da escola entregues a cada família
- **Meta description (149 caracteres):** A escola sobe as fotos do evento, a IA separa por aluno e a equipe confere. Cada família recebe só as fotos do seu filho, com autorização registrada.

## Hero

**Título, três opções:**

- **A (atual, recomendada):** Cada família recebe as fotos do seu filho.
- **B:** As fotos do evento, separadas por aluno e entregues a cada família.
- **C:** Chega de foto do evento perdida no grupo da turma.

A opção A fala do resultado que a escola quer entregar. A B explica melhor o
produto e serve para teste A/B. A C ataca a dor, mas puxa para o problema.

**Subtítulo:**

> A escola sobe as fotos do evento, a AIESCOLA sugere quem está em cada uma e a
> equipe confere. Cada responsável recebe um álbum só com as fotos do próprio
> filho, com a autorização registrada.

**Botão principal:** Agendar demonstração
**Botão secundário:** Ver como funciona

**Selos abaixo dos botões:** Revisão humana antes de enviar · Sem app para a família · Autorização por finalidade

## Problema

**Título:** Depois do evento, começa o trabalho que ninguém vê.

- **Horas** abrindo foto por foto para descobrir quem aparece em cada uma.
- **Grupos** e pastas abertas onde todo mundo vê a foto de todo mundo.
- **Dúvida** sobre quais famílias autorizaram o uso da imagem do filho.

Sem mudança: o texto atual já está bom.

## Como funciona

**Título:** Do upload ao álbum da família em quatro passos
**Apoio:** A escola controla cada etapa. A IA faz a parte repetitiva.

1. **Cadastro e autorização.** A escola cadastra turmas e alunos. O responsável autoriza o reconhecimento facial e o recebimento das fotos, cada um separado.
2. **Upload do evento.** Depois da festa, da formatura ou do passeio, a equipe sobe todas as fotos de uma vez.
3. **Separação e revisão.** O reconhecimento facial sugere quem está em cada foto. Uma pessoa da escola confere e confirma.
4. **Entrega à família.** Cada responsável recebe um link com as fotos aprovadas do seu filho.

O texto atual do passo 4 diz "agrupadas por evento". Esse álbum só existe no
código local, sem publicação. Volte com a frase quando ele for publicado.

## Recursos

**Título:** Tudo o que a escola precisa para entregar fotos com cuidado

**Destaque: Reconhecimento com revisão humana**
A IA sugere quem está em cada foto do evento. Nada vai para a família sem uma
pessoa da escola conferir.

- **Álbum por link.** Sem aplicativo para instalar. A família abre o link no celular e baixa as fotos uma a uma ou todas em ZIP.
- **Artes com IA por aluno.** Gere artes por aluno e turma a partir do modelo da escola. A mensagem de compartilhamento avisa que a imagem foi feita por inteligência artificial.
- **Turmas e eventos organizados.** Pasta de cada aluno com as fotos confirmadas, separadas por evento.
- **Registro de tudo.** Quem aprovou, o que foi enviado e quando o álbum foi aberto ficam registrados.

## Segurança

**Título:** Feita para quem cuida de imagem de criança e adolescente.
**Apoio:**

> Cada etapa depende da autorização do responsável. A escola sabe quem
> autorizou, o que foi enviado e para quem.

Saiu a frase "construída em torno das regras do ECA Digital". Ela só volta
depois da revisão jurídica, que já é pendência no BACKLOG.

- Autorização do responsável separada por finalidade: reconhecimento facial e recebimento das fotos.
- Se a autorização for retirada, o reconhecimento para e o acesso pelo link é interrompido.
- Link exclusivo por família, com acesso de prazo curto que a escola pode cancelar.
- Cada família recebe só as fotos em que o próprio filho foi confirmado pela escola.
- Arte gerada por IA vai com o aviso de que foi feita por inteligência artificial.
- Registro de aprovações, envios e aberturas para a escola prestar contas.

## Para quem

**Título:** Um fluxo, três pessoas mais tranquilas

- **Direção e coordenação.** Eventos, entregas e autorizações num só lugar, com registro de tudo.
- **Equipe da escola.** Sobe o evento inteiro de uma vez e só revisa as sugestões, sem separar foto à mão.
- **Famílias.** Recebem só as fotos do filho, num link que abre no celular.

Saiu "e baixam quando quiserem": o acesso tem prazo e a escola define por
quanto tempo guarda as fotos.

## Prova social

**Ainda não existe.** Não publicar depoimento, logo de escola ou número de uso
antes de ter cliente real, com autorização escrita para cada item. Até lá, a
seção fica fora da página. Quando houver piloto, o lugar dela é entre "Como
funciona" e "Recursos":

> [Depoimento curto da direção sobre o primeiro evento entregue]
> [Nome, cargo, escola], só com autorização escrita

## Perguntas frequentes

**Título:** O que as escolas costumam perguntar

1. **A família precisa instalar algum aplicativo?**
   Não. O responsável recebe um link e abre no navegador do celular ou do computador. Dali dá para ver e baixar as fotos.
2. **O reconhecimento facial decide sozinho quem está na foto?**
   Não. Ele sugere, e uma pessoa da escola revisa e confirma antes de qualquer foto ser entregue.
3. **E se o responsável não autorizar?**
   Sem a autorização, o aluno não entra no reconhecimento e a família não recebe fotos pela plataforma. A autorização pode ser retirada depois.
4. **Outras crianças podem aparecer nas fotos que a família recebe?** *(nova, substitui "Uma família pode ver fotos de outro aluno?")*
   Em foto de grupo, sim. A família recebe as fotos em que o próprio filho foi confirmado, e colegas podem aparecer nelas. A escola escolhe, na revisão, quais fotos entram em cada entrega.
   **Depende de revisão jurídica** antes de publicar: o termo de entrega atual ainda fala em desfoque.
5. **Se a autorização for retirada, o que acontece com as fotos já baixadas?** *(nova)*
   O acesso pela plataforma é interrompido. As fotos que a família já baixou ficam com ela, como qualquer arquivo salvo no celular.
6. **Por quanto tempo as fotos ficam disponíveis?** *(nova)*
   A escola define o prazo de armazenamento quando cria o evento.
   **Confirmar com produto** o que acontece com as fotos ao fim do prazo antes de detalhar.
7. **Serve para qualquer etapa de ensino?**
   Sim. Educação infantil, fundamental e médio: festas, formaturas, passeios e qualquer evento com fotos.
8. **Funciona para rede com várias unidades?** *(nova)*
   Sim. Cada unidade tem seus eventos e sua equipe, e a mesma pessoa pode alternar entre as unidades.
9. **Quanto custa?** *(nova)*
   A oferta está em [oferta e preço](../../01-estrategia/oferta-e-preco.md): R$ 6,00 por aluno por mês.
   **A definir** se o preço aparece na página ou só na proposta.

## Chamada final

**Título, duas opções:**

- **A (recomendada):** Veja o fluxo completo antes do próximo evento.
- **B:** Prepare a entrega de fotos da sua escola para 2027.

A atual, "Leve o próximo evento da sua escola para a AIESCOLA", convida a usar
fotos reais já, o que ainda não é permitido. A opção B aproveita a janela de
planejamento do ano que vem.

**Apoio:** Mostramos o fluxo completo com material de demonstração, do upload ao álbum da família.
**Botão:** Agendar demonstração

## Rodapé

© [ano] AIESCOLA. Fotos da escola, entregues a cada família.
Link: Acesso da escola

---

## Notas

**Voz aplicada:** a da [voz e tom](../../02-marca/voz-e-tom.md), com
vocabulário escolar e sem promessa de volume, velocidade ou conformidade legal.

**SEO.** Palavras-chave sugeridas, sem consulta a ferramenta de volume de
busca (validar antes de usar):

- Principal: "entrega de fotos escolares"
- Relacionadas: "fotos de eventos escolares", "autorização de uso de imagem escola", "álbum de fotos para pais", "reconhecimento facial fotos escola"
- Colocar a principal no título da página, no primeiro parágrafo e na meta description.
- Links internos: das futuras pautas do [calendário editorial](../../05-conteudo/calendario-editorial.md) para a landing.
- Texto alternativo: a ilustração do produto pode ter `alt="Tela da AIESCOLA com fotos de um evento separadas por aluno"`. Hoje ela é decorativa.

**Mudanças em relação à landing atual**

| Trecho atual | Proposta | Motivo |
| --- | --- | --- |
| "construída em torno ... das regras do ECA Digital" | Removido até a revisão jurídica | Afirmação de conformidade sem homologação |
| "nunca as de outro aluno" e FAQ "Uma família pode ver fotos de outro aluno? Não." | "só as fotos em que o próprio filho foi confirmado" e FAQ nova sobre foto de grupo | As entregas usam fotos nítidas, e colegas aparecem em foto de grupo |
| "Toda imagem gerada por IA sai identificada como tal." | "Arte gerada por IA vai com o aviso de que foi feita por inteligência artificial." | O aviso está na mensagem de compartilhamento, não na imagem |
| "separar milhares de fotos" | "sugere quem está em cada foto do evento" | Volume não medido |
| "filtra por evento", "agrupadas por evento" | Removido | Álbum agrupado por evento só existe local |
| "baixam quando quiserem" | Removido | Acesso tem prazo e retenção |
| "Leve o próximo evento da sua escola" | "Veja o fluxo completo antes do próximo evento." | Foto real de aluno ainda não é permitida |

**Próximos passos da peça:** revisão jurídica dos trechos marcados, decidir a
oferta para a FAQ de preço e, depois, aplicar no `landing.tsx` com o item do
BACKLOG.
