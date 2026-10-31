# Pendências para produção — IAschool

**Revisado em 25/10/2026 contra o código local.** Publicações abaixo são
registros do [BACKLOG](../BACKLOG.md), sem consulta remota nesta revisão.

## Regra de uso

Enquanto os gates não estiverem implementados, configurados e validados:

- Nenhuma foto real de criança ou adolescente entra no produto; somente material de teste/demonstração.
- WhatsApp comercial permanece desligado. A exceção aprovada é `controlled_zapi`, uma escola, 1–4 pessoas allowlisted, teto diário, kill switch e material sintético/adulto.

São controles do projeto. A existência de código, testes ou publicação não
constitui homologação jurídica nem autorização para ativar o fluxo.

## Implementado e com publicação registrada

| Área | Implementação atual | Registro anterior |
| --- | --- | --- |
| Identidade e autorização | Aprovação de conta, vínculo escolar, responsável, data de nascimento e autorização por escopo | Fundação/M1–M6 em agosto/setembro |
| OTP | Código aleatório, hash, TTL, antiflood, limite de tentativas e trilha de envio; nenhuma resposta `demoCode` | Fundação/funções em 02/10; OTP adulto via Z-API em 03/10/2026 |
| Consentimento direto | Pedido por link opaco, página pública, aceite/recusa/revogação e versão em evidência | Migration/funções em 05/10; frontend publicado em 12/10/2026 |
| Entregas | Preparo por família, prévia/seleção, aprovação, sessão privada, download e revogação | Primeiro preparo em 05/10; álbum em 12/10; fotos nítidas em 13/10/2026 |
| Trava de envio | `school-delivery` informa capacidade; botão só aparece quando `sending: ready` | App e função v5 em 15/10/2026 |

O provedor implementado é Z-API, criado somente em `controlled_zapi` com
configuração válida. `paused` falha fechado; `meta_test` é reconhecido como
modo, mas não possui adaptador Meta. Resposta `accepted` não comprova entrega:
`sent`, `delivered`, `read` e `failed` dependem de retorno correlacionado.

Fontes: `artifacts/iaschool-app/supabase/functions/` e
[mapa SQL](../artifacts/iaschool-app/SUPABASE.md). OTP usa
`public.guardian_verification_codes` e `public.whatsapp_messages`
(`artifacts/iaschool-app/supabase/fase4-whatsapp-foundation.sql`);
aceite usa `public.guardian_action_tokens` e `public.authorizations`
(`artifacts/iaschool-app/supabase/fase5-guardian-consent.sql`).

## Bloqueios e pendências

1. **Termo incompatível com a entrega atual.** `delivery_whatsapp.v1` promete
   desfoque de terceiros, mas novas entregas usam fotos nítidas (`original_v1`).
   O texto servido em `_shared/whatsapp/consent-terms.ts` continua assim.
   Homologar uma nova versão e definir o tratamento dos aceites anteriores antes
   de uso real; não alterar silenciosamente o significado de v1. O
   [rascunho do termo](termos/delivery-whatsapp-v1.md) registra essa divergência.
2. **Segredos e webhook Z-API.** O histórico de 03/10 aponta três segredos
   expostos na depuração e rotação pendente antes de novo envio. Também aponta
   falta de retorno do webhook pelo provedor. A revisão não consultou segredos
   nem comprovou correção. Validar rotação e correlação ponta a ponta antes do
   próximo canário autorizado.
3. **Meta e uso comercial.** Implementar adaptador, configurar WABA/número,
   templates e webhook; repetir E2E controlado. A ponte Z-API não libera uso
   comercial. Ver [plano da ponte](plano-implementacao-zapi.md) e W0–W5 no backlog.
4. **Domínio, e-mail e primeiro acesso.** Não há encerramento registrado para
   domínio próprio/SMTP, templates e confirmação de e-mail. Há arquivos
   `reset-password.html` e `invite.html` em
   `artifacts/iaschool-app/supabase/email-templates/`; falta Confirm signup.
   Confirmar provedor/plano, domínio autenticado, limites, redirects e instalação
   dos templates. Testar cadastro → e-mail → confirmação → aprovação → vínculo
   escolar → primeiro login, além de reset. O registro de 07/10 tinha confirmação
   automática ligada; isso não foi relido hoje. Aprovação fica em `/aprovacoes`.
5. **Conformidade e operação.** Homologar termos/política, finalidade,
   operadores/transferências, retenção, canal de atendimento/remoção e avaliação
   de impacto. Concluir medições de reconhecimento, revogação/expurgo, controle
   de acesso e ensaio completo com adultos. Completar alertas, suporte, backup e
   restauração; roteiro em [operação](operacao-agentes.md). A revisão de código
   não substitui validação jurídica nem comprova configuração remota.

## Implementado apenas localmente

Álbum com link reutilizável e fotos disponíveis da família agrupadas por evento:
`artifacts/iaschool-app/supabase/fase5-album-open-link.sql`, app e funções.
O histórico de 16/10 registra **migration não aplicada e publicação pendente**.
O código local deixa `public.delivery_album_tokens.used_at` como primeira
abertura, cria sessões separadas em `public.delivery_access_sessions` e mantém
prazos/revogação. Não tratar esse fluxo como disponível no ambiente publicado.

## Critério para fechar os gates

Cada pendência precisa de implementação quando aplicável, configuração
verificada no destino e ensaio autorizado. Registrar data, versão, alcance do
ensaio e limite da evidência no backlog. Saúde HTTP ou teste local não fecha
entrega WhatsApp, consentimento real, restauração ou geração paga.
