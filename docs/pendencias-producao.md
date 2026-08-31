# Pendências para produção — IAschool

Registrado em 2026-08-30, após o provisionamento do banco Supabase do zero
(projeto `jtyyauivokutperouqyh`, 7 migrations aplicadas).

## Regra desta fase (MVP)

Enquanto as pendências abaixo não estiverem **implementadas e ligadas**:

- **Nenhuma foto real de criança ou adolescente entra no produto.** Só material
  de teste/demonstração.
- **O fluxo de WhatsApp não é ligado.** A verificação do responsável e o envio
  podem ser *simulados no front-end*, nunca executados de verdade.

Essa regra é o que sustenta a conformidade com o ECA Digital nesta fase: o
banco já tem toda a estrutura de proteção provisionada (consentimento do
responsável, canal verificado, trilha imutável de envio), mas os mecanismos que
a alimentam ainda não existem. Rodar com dado real antes disso significaria
tratar imagem de menor sem o canal verificado que o Decreto nº 12.880/2026,
art. 35 exige.

## Pendências

| # | Pendência | Tipo | Bloqueia |
| --- | --- | --- | --- |
| 1 | Comprar domínio | Infra | 2, 3 |
| 2 | Assinar o Resend | Infra | 3 |
| 3 | Confirmar o domínio no Resend (SPF + DKIM, DMARC recomendado) | Infra | 5 |
| 4 | Criar os templates HTML de e-mail | Código | 5 |
| 5 | Ligar "Confirm email" no Supabase | Config | 6 |
| 6 | Testar o fluxo de cadastro ponta a ponta | QA | Uso real |
| 7 | Implementar a WhatsApp API oficial + fluxo OTP | Código | Foto real de menor |

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

**7. WhatsApp API oficial + OTP**

Decisão tomada: **Meta WhatsApp Cloud API direto**, não Z-API/UAZAPI/Evolution.
O compartilhamento do post já é um deep link `wa.me` aberto no WhatsApp do
próprio professor (`src/pages/generate.tsx`), então a API serve *só* para o OTP
de verificação do responsável — cerca de uma mensagem por aluno, uma vez. O
volume não justifica o risco de ban e a fragilidade probatória de uma API não
oficial num fluxo cuja razão de existir é comprovar conformidade.

Passos:

1. Meta Business Suite: criar a WABA, verificar a empresa, cadastrar número dedicado.
2. Criar o template `guardian_verification_code`, categoria **Authentication**,
   idioma `pt_BR`, com botão de copiar código.
3. Guardar `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` como secrets do Supabase.
4. Implementar a edge function `send-guardian-code`:
   - JWT verificado; confere que `auth.uid()` é o `owner_id` do aluno (ou super_admin);
   - gera código de 6 dígitos e grava em `guardian_verification_codes` com
     `expires_at = now() + 10 min`;
   - antiflood: recusa reenvio se já houver código com menos de 60s;
   - chama a Graph API e **nunca** devolve o código ao cliente.
5. Teste ponta a ponta: aluno menor → verificar responsável → compartilhar →
   conferir a linha gravada em `share_logs`.

*Fallback se o onboarding da Meta travar:* OTP por SMS (Twilio Verify) como
interino. Verifica a posse do mesmo número e é defensável; a troca depois não
mexe no banco.

#### Estado atual: stub de simulação no ar

A edge function `send-guardian-code` já está implantada, mas **em modo
simulação**: ela gera o código, grava em `guardian_verification_codes` e
devolve o código à própria tela, que o exibe com o aviso "Modo demonstração".
Nenhuma mensagem sai para o WhatsApp.

Isso existe para que a demo do MVP exercite o fluxo real de ponta a ponta
(autorização → TTL → antiflood → RPC `confirm_guardian_code` →
`students.guardian.whatsappVerifiedAt` → liberação do compartilhamento →
`share_logs`) sem tocar em canal de verdade.

Fonte: `artifacts/iaschool-app/supabase/functions/send-guardian-code/index.ts`.

Para ligar o envio real, substitua **apenas** o bloco marcado `SIMULAÇÃO` pela
chamada à Graph API e pare de devolver `demoCode` e `simulated`. Todo o resto
(autorização por dono/super_admin, TTL de 10 min, antiflood de 60s, código com
aleatoriedade criptográfica) já é comportamento de produção.

Três coisas sinalizam que o stub está ativo, para ninguém achar que o OTP está
no ar: a resposta carrega `simulated: true`, cada chamada emite um warn no log
da função, e a tela mostra o código com o aviso de demonstração.

Cobertura: `tests/guardian-verification.integration.test.ts` valida o fluxo
inteiro contra o Supabase real (7 testes). Os casos que dependem do código
visível se pulam sozinhos quando `simulated` deixar de vir na resposta.

## O que já está pronto

O banco não precisa de nenhuma alteração para as pendências acima:

- `guardian_verification_codes` + RPC `confirm_guardian_code` (security definer,
  RLS sem policy — só a edge function e a RPC acessam);
- `share_logs` append-only (policies de insert e select, nenhuma de update/delete);
- `students.guardian` (jsonb) e `profiles.age_bracket` / `guardian_name` /
  `guardian_consent`, com a constraint que impede conta de criança sem
  responsável autorizado;
- super admin provisionado e aprovado.

O que falta é só o que alimenta essas estruturas — e, no caso do WhatsApp, a
troca do stub de simulação pelo envio real.
