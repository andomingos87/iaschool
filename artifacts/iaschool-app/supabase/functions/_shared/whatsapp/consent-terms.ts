/**
 * Termo de `delivery_whatsapp` exibido na página pública de consentimento.
 *
 * RASCUNHO: o texto abaixo segue os itens que a spec §6.2 exige mostrar
 * (finalidade, retenção, provedores envolvidos, limite da revogação) e está
 * sujeito à homologação jurídica (BACKLOG.md, Transversal). Publicar o
 * convite de consentimento depende dessa homologação (spec §18.1).
 *
 * A versão gravada em `authorizations.evidence.termsVersion` é `version`.
 * Mudou o texto, muda a versão — o aceite antigo continua provando o texto
 * que a pessoa leu.
 */
export const DELIVERY_WHATSAPP_TERMS = {
  version: "delivery_whatsapp.v1",
  title: "Autorização para envio das fotos por WhatsApp",
  paragraphs: [
    "O IAschool é a plataforma que a escola usa para organizar e guardar as fotos dos eventos escolares.",
    "Ao autorizar, você permite que a escola envie, pelo WhatsApp do número que você verificou, as fotos em que seu filho aparece. A mensagem traz apenas um link privado — nenhuma foto é anexada.",
    "Nas fotos, outras crianças aparecem desfocadas. Este aceite vale para as fotos do seu filho; as fotos dele não são enviadas às outras famílias por causa dele.",
    "O link do álbum vale por 24 horas e as versões preparadas para envio são apagadas depois de alguns dias. Você pode revogar esta autorização quando quiser, mas o que já foi baixado não pode ser recolhido.",
    "O envio usa a infraestrutura do WhatsApp. Dados de contato e de acesso são tratados conforme a política de privacidade do IAschool.",
  ],
} as const;

export const DELIVERY_WHATSAPP_TERMS_VERSION = DELIVERY_WHATSAPP_TERMS.version;
