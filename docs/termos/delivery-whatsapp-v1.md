# Termo — Autorização para envio das fotos por WhatsApp (`delivery_whatsapp.v1`)

**Rascunho para homologação jurídica.** Não publicar o convite de consentimento
antes da revisão (spec §18.1; `BACKLOG.md`, Transversal). Enquanto o texto não
for homologado, este documento e o texto exibido na página pública são a mesma
versão — `delivery_whatsapp.v1`.

O texto que o responsável lê na página `/consentimento/:token` vive em
[`artifacts/iaschool-app/supabase/functions/_shared/whatsapp/consent-terms.ts`](../artifacts/iaschool-app/supabase/functions/_shared/whatsapp/consent-terms.ts)
e a versão aceita fica gravada em `authorizations.evidence.termsVersion`.
**Mudar o texto exige nova versão** (`delivery_whatsapp.v2`): o aceite antigo
continua provando o texto que a pessoa leu.

## Texto exibido (versão atual)

1. O IAschool é a plataforma que a escola usa para organizar e guardar as fotos
   dos eventos escolares.
2. Ao autorizar, você permite que a escola envie, pelo WhatsApp do número que
   você verificou, as fotos em que seu filho aparece. A mensagem traz apenas um
   link privado — nenhuma foto é anexada.
3. Nas fotos, outras crianças aparecem desfocadas. Este aceite vale para as
   fotos do seu filho; as fotos dele não são enviadas às outras famílias por
   causa dele.
4. O link do álbum vale por 24 horas e as versões preparadas para envio são
   apagadas depois de alguns dias. Você pode revogar esta autorização quando
   quiser, mas o que já foi baixado não pode ser recolhido.
5. O envio usa a infraestrutura do WhatsApp. Dados de contato e de acesso são
   tratados conforme a política de privacidade do IAschool.

## Mensagem de convite (template `guardian_consent.v1`)

Texto curto enviado ao número verificado, com o link opaco:

> Acesse este link para revisar a solicitação do IAschool: `<link>`

A mensagem não contém nome de aluno, escola, código nem anexo. O link é de uso
único e expira em 24 horas; um pedido novo invalida o anterior.

## Checklist do que a versão precisa cobrir (spec §6.2 e §15.2)

- [ ] Finalidade específica (`delivery_whatsapp`) separada dos outros escopos
- [x] Ação afirmativa: aceite só pelo clique do responsável; silêncio não autoriza
- [x] Prova versionada: `evidence.source = guardian_link`, `termsVersion`, data e canal
- [x] Escola não aceita em nome do responsável (o pedido sai por Edge Function; o aceite, pela página pública)
- [ ] Retenções homologadas (spec §11.3): link 24 h, derivados até 7 dias, trilha de eventos — **prazos provisórios** (5 anos de trilha e 15 dias de resposta ao titular seguem em revisão)
- [ ] Provedores envolvidos no modo ativo (hoje Z-API como ponte controlada; Meta Cloud API como destino) e o que muda quando o provedor trocar
- [ ] Limite da revogação: o que já foi baixado não volta
- [ ] Circulação restrita: o desfoque de terceiros nos derivados (regra da spec §6.4, implementação no W3) precisa estar refletido no texto
- [ ] Base legal e controlador/operador definidos na avaliação de impacto

> Este checklist é técnico, não jurídico. A redação final, a base legal e a
> retenção são decisão da homologação com o jurídico.
