# Pendências para produção — IAschool

Registrado em 2026-08-30, após o provisionamento do banco Supabase do zero
(projeto `jtyyauivokutperouqyh`, 7 migrations aplicadas).

## Regra desta fase (MVP)

Enquanto as pendências abaixo não estiverem **implementadas e ligadas**:

- **Nenhuma foto real de criança ou adolescente entra no produto.** Só material
  de teste/demonstração.
- **O fluxo comercial de WhatsApp não é ligado.** A exceção controlada é a
  ponte Z-API de 29/09/2026: uma escola, até quatro pessoas allowlisted, teto
  diário, kill switch e material sintético/adulto. Ela não libera foto real de
  menor nem substitui a migração para Meta antes do primeiro contrato.

Essa regra é a barreira técnica de privacidade desta fase: o banco já tem parte
da estrutura de proteção (autorização por escopo, canal verificável e trilhas),
mas o aceite direto do responsável, a entrega protegida e a comprovação do
resultado ainda não existem. O art. 35 do Decreto nº 12.880/2026 trata de
conteúdo violador, vexatório ou degradante; a verificação do canal é um controle
de produto baseado em privacidade por padrão, minimização e melhor interesse,
não uma exigência literal desse artigo.

## Pendências

| # | Pendência | Tipo | Bloqueia |
| --- | --- | --- | --- |
| 1 | Comprar domínio | Infra | 2, 3 |
| 2 | Assinar o Resend | Infra | 3 |
| 3 | Confirmar o domínio no Resend (SPF + DKIM, DMARC recomendado) | Infra | 5 |
| 4 | Criar os templates HTML de e-mail | Código | 5 |
| 5 | Ligar "Confirm email" no Supabase | Config | 6 |
| 6 | Testar o fluxo de cadastro ponta a ponta | QA | Uso real |
| 7 | Implementar WhatsApp oficial para OTP, consentimento e entrega privada de fotos | Código + Meta | Foto real de menor |

### Detalhamento

**1–3. Domínio + Resend**

Sem SMTP próprio o Supabase mantém o limite padrão de 2–3 e-mails por hora, o
que quebra tanto a confirmação de cadastro quanto o "esqueci minha senha".

Configuração no Supabase → Authentication → SMTP Settings:
`smtp.resend.com`, porta `587`, usuário `resend`, senha = API key do Resend.

Depois de ativar, **subir os rate limits** em Authentication → Rate Limits — eles
não sobem sozinhos — e cadastrar as Redirect URLs (produção e desenvolvimento),
senão o `redirectTo` do reset de senha é ignorado.

**4. Templates de e-mail**

Ficam em `artifacts/iaschool-app/supabase/email-templates/`.

| Template no painel | Arquivo | Status |
| --- | --- | --- |
| Confirm signup | — | **falta criar** (pt-BR, marca IAschool) |
| Reset Password | `reset-password.html` | pronto |
| Invite user | `invite.html` | pronto |

Magic Link, Change Email e Reauthentication o app não usa.

**5–6. Confirmação de e-mail**

Authentication → Sign In / Up → Email → "Confirm email".

O acesso a dado nunca dependeu do e-mail: `handle_new_user` cria o perfil como
`pending` e a RLS (`is_approved()`) bloqueia qualquer leitura até o super_admin
aprovar. A confirmação soma uma segunda barreira e garante que o endereço de
contato é real — o que importa quando esse endereço é o canal com a escola
responsável por um menor.

Teste esperado: cadastro de escola → e-mail chega → confirma → cai em
"Aguardando aprovação" → super_admin aprova em /admin.

**7. WhatsApp: ponte controlada e integração oficial**

Decisão final de 27/09/2026: **Meta WhatsApp Cloud API direta** para OTP e
entrega das fotos em uso comercial. Decisão temporária de 29/09/2026: usar
**Z-API** somente para validar o fluxo antes do contrato, em uma escola, com
até quatro destinatários allowlisted, teto diário e kill switch. UAZAPI,
Evolution e outras automações continuam fora. A especificação completa é
[`spec-whatsapp-api-oficial-entrega-fotos.md`](spec-whatsapp-api-oficial-entrega-fotos.md).

Ela cobre a fronteira de provedor, Z-API temporária, migração para WABA,
templates, secrets, OTP sem vazamento, aceite direto do responsável, versão
desfocada, fila, webhook de status, acesso privado, revogação, expurgo,
observabilidade, rollout e gates de produção.

A Z-API usa sessão do WhatsApp Web e envia mensagens externas reais. O modo
controlado não é sandbox e não libera atividade comercial. Até os gates gerais
fecharem, o ensaio usa material sintético ou de adultos; foto real de menor
continua bloqueada.

#### Estado atual: stub de simulação no ar

A edge function `send-guardian-code` já está implantada, mas **em modo
simulação**: ela gera o código, grava em `guardian_verification_codes` e
devolve o código à própria tela, que o exibe com o aviso "Modo demonstração".
Nenhuma mensagem sai para o WhatsApp.

Isso existe para que a demo do MVP exercite o fluxo atual
(TTL → antiflood → RPC `confirm_guardian_code` →
`guardians.whatsapp_verified_at` → liberação do compartilhamento manual →
`share_logs`) sem tocar em canal de verdade. O aceite direto do responsável e
a entrega automática ainda não fazem parte desse ensaio.

Fonte: `artifacts/iaschool-app/supabase/functions/send-guardian-code/index.ts`.

Ligar qualquer envio externo exige mais do que substituir o bloco `SIMULAÇÃO`: o código
deve deixar de ser armazenado em texto, limites adicionais precisam ser
aplicados, a resposta deve parar de devolver `demoCode`, o webhook precisa
acompanhar o resultado e o consentimento deve ser aceito diretamente pelo
responsável. A sequência está dividida em W0 a W5 na nova spec. A Z-API entra
atrás de `WhatsAppProvider`; após o contrato, a Meta substitui o adaptador e o
E2E é repetido antes do uso comercial.

Três coisas sinalizam que o stub está ativo, para ninguém achar que o OTP está
no ar: a resposta carrega `simulated: true`, cada chamada emite um warn no log
da função, e a tela mostra o código com o aviso de demonstração.

Cobertura: `tests/guardian-verification.integration.test.ts` valida o fluxo
inteiro contra o Supabase real (7 testes). Os casos que dependem do código
visível se pulam sozinhos quando `simulated` deixar de vir na resposta.

## O que já está pronto

O banco já possui bases reutilizáveis:

- `guardian_verification_codes` + RPC `confirm_guardian_code` (security definer,
  RLS sem policy — só a edge function e a RPC acessam);
- `share_logs` append-only (policies de insert e select, nenhuma de update/delete);
- `guardians` + `students.primary_guardian_id`, com verificação por responsável
  e invalidação do carimbo quando o número muda;
- `authorizations`, inclusive o escopo `delivery_whatsapp`, ainda alimentado
  pela declaração da escola;
- super admin provisionado e aprovado.

Para a entrega automática, ainda faltam migrations de segurança do OTP,
consentimento direto, lote, destinatários, ativos temporários, sessões, webhook
e auditoria. O inventário completo está na nova spec.
