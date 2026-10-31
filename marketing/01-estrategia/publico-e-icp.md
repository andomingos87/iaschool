# Público e perfil de escola ideal (ICP)

**Status:** Definido em entrevista com a equipe em 31/10/2026. Os pontos ainda
abertos estão marcados.

Persona descreve pessoas. ICP descreve quem compra. Aqui quem compra é a rede:
quem assina não é quem usa, e quem sente o resultado (a família) não paga.

## ICP do primeiro contrato

| Critério | Decisão | Status |
| --- | --- | --- |
| Tipo | Rede particular com várias unidades | Definido |
| Tamanho da rede | 5 a 20 unidades | Definido |
| Porte por unidade | Varia de 150 a 2.000 alunos | Definido (informação dos contatos) |
| Etapas | Educação infantil ao ensino médio | Definido |
| Região | Guarulhos e São Paulo | Definido |
| Quem decide | Dono ou diretor(a) da rede | Definido |
| Como entrega fotos hoje | Drive ou Google Fotos, rede social da escola, fotógrafo ou app escolar | Definido (informação dos contatos) |
| Acesso | Relação próxima com várias redes da região | Definido |

## Por que rede

- A equipe tem relação próxima com várias redes: a primeira venda é por relacionamento, não por anúncio.
- Um contrato cobre várias unidades.
- O piloto em poucas unidades vira caso para o resto da rede e para outras redes.

## Segunda onda: redes de 20 a 300 unidades

Os contatos incluem redes de até 300 unidades. Elas ficam para depois do
primeiro contrato e dos pré-requisitos abaixo, porque exigem compra formal,
jurídico, TI e volume que o produto ainda não comprovou.

## Pré-requisitos de produto para este ICP

| Pré-requisito | Situação hoje | Por que trava |
| --- | --- | --- |
| Importação de alunos e responsáveis por planilha | Decidida em 31/10/2026, não construída. Hoje o cadastro é aluno por aluno | Rede de 5 unidades com 500 alunos cada tem 2.500 alunos |
| Autorização e entrega em escala | O link de autorização só sai pelo WhatsApp (`artifacts/iaschool-app/supabase/functions/request-guardian-consent/index.ts:5-6`). O envio comercial está desligado e o adaptador da Meta não existe | Sem isso nenhuma família autoriza nem recebe fotos |
| Foto real de aluno liberada | Gates abertos em [pendências de produção](../../docs/pendencias-producao.md) | O piloto pago depende disso |
| Homologação jurídica e contrato de dados | Pendente ([pendências](../../docs/pendencias-producao.md), item 5) | Rede vai pedir antes de assinar |
| Visão da rede | Cada unidade é uma escola separada. A mesma pessoa pode trocar de unidade no menu (`artifacts/iaschool-app/src/components/app-shell.tsx`), mas não há painel da rede inteira nem cobrança por rede | **A definir** se o primeiro contrato precisa disso |
| Capacidade | Não medida para milhares de alunos e fotos por evento | Unidade de 2.000 alunos em festa junina |

## Sinais de boa candidata

- A direção já se incomodou com foto de aluno em pasta aberta ou rede social.
- A rede tem marketing ou comunicação central.
- Já pede autorização de uso de imagem na matrícula.
- Contrata fotógrafo nos eventos (volume alto de fotos).

## Fora do foco agora

- Rede pública: compra por licitação.
- Escola de unidade única: fora do foco do primeiro ciclo.
- Redes acima de 20 unidades, até os pré-requisitos fecharem.

## Lista de redes-alvo

Manter fora do repositório, em planilha ou CRM: nome da rede, número de
unidades, alunos por unidade, decisor e situação da conversa. Nome e contato de
pessoa não entram neste Markdown.

## Ainda a definir

- Se o primeiro contrato exige painel da rede inteira.
- Ensino médio: como fica a autorização do aluno que já fez 18 anos. Confirmar com produto.
