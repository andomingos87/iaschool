# Segurança e conformidade

Enquanto [docs/pendencias-producao.md](../docs/pendencias-producao.md) não estiver implementado e ligado:

- Nenhuma foto real de criança ou adolescente entra no produto. Só material de teste ou demonstração.
- O fluxo comercial de WhatsApp fica desligado. A exceção aprovada em 29/09/2026 é o modo `controlled_zapi`: uma escola, de uma a quatro pessoas allowlisted, teto diário, kill switch, só material sintético ou de adultos. Antes do primeiro uso comercial, a ponte temporária troca pela Meta Cloud API, conforme [docs/spec-whatsapp-api-oficial-entrega-fotos.md](../docs/spec-whatsapp-api-oficial-entrega-fotos.md).

As travas acima são regras do projeto, não uma afirmação de obrigação literal
de um artigo legal. Tarefa que toque cadastro, foto, WhatsApp, data de nascimento,
consentimento ou compartilhamento segue a skill `eca-digital`. Esta revisão de
25/10/2026 confere implementação; homologação jurídica continua pendente.

**Divergência aberta:** o termo servido `delivery_whatsapp.v1` promete desfoque,
mas entregas novas usam fotos nítidas. Homologar nova versão e tratamento dos
aceites anteriores antes de uso real. Ver [termo](../docs/termos/delivery-whatsapp-v1.md).
Código/SQL do álbum reutilizável ainda não têm publicação registrada.


O banco deste produto só se opera pelo MCP `supabase-iaschool` do `.mcp.json` da raiz. `apply_migration` e `execute_sql` escrevem no banco real e exigem autorização explícita.

`SUPABASE_SERVICE_ROLE_KEY` é usada somente em ambiente de servidor: API, ingest-worker, face-worker e Edge Functions; nunca no browser. A coluna `public.photo_faces.embedding` (`artifacts/iaschool-app/supabase/fase3-face-recognition.sql`) não é legível pelo cliente. Função nova em `public` nasce executável por `anon`; a que o visitante não deve chamar leva `revoke execute ... from public, anon` na própria migration.

Verificação ponta a ponta do reconhecimento usa material de adultos (LFW), nunca foto de criança.
