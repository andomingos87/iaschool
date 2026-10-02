export const WHATSAPP_MESSAGE_TEMPLATES = {
  guardian_otp: {
    version: "guardian_otp.v1",
    render: (code: string) => `Seu código de verificação do IAschool é ${code}. Ele expira em 10 minutos.`,
  },
  guardian_consent: {
    version: "guardian_consent.v1",
    render: (link: string) => `Acesse este link para revisar a solicitação do IAschool: ${link}`,
  },
  delivery_ready: {
    version: "delivery_ready.v1",
    render: (link: string) => `As fotos autorizadas do evento estão disponíveis neste link privado: ${link}`,
  },
} as const;
