# Segurança e conformidade

Enquanto [docs/pendencias-producao.md](../docs/pendencias-producao.md) não estiver implementado e ligado:

- Nenhuma foto real de criança ou adolescente entra no produto. Só material de teste ou demonstração.
- O fluxo comercial de WhatsApp fica desligado. A exceção aprovada em 29/09/2026 é o modo `controlled_zapi`: uma escola, de uma a quatro pessoas allowlisted, teto diário, kill switch, só material sintético ou de adultos. Antes do primeiro uso comercial, a ponte temporária troca pela Meta Cloud API, conforme [docs/spec-whatsapp-api-oficial-entrega-fotos.md](../docs/spec-whatsapp-api-oficial-entrega-fotos.md).

Rodar com dado real antes do canal verificado trata imagem de menor sem o exigido pelo Decreto nº 12.880/2026, art. 35. Tarefa que toque cadastro, foto, WhatsApp, data de nascimento, consentimento ou compartilhamento segue a skill `eca-digital`.

O banco deste produto só se opera pelo MCP `supabase-iaschool` do `.mcp.json` da raiz. `apply_migration` e `execute_sql` escrevem no banco real e exigem autorização explícita.

`SUPABASE_SERVICE_ROLE_KEY` existe só na API, no ingest-worker e no face-worker. A coluna `photo_faces.embedding` não é legível pelo cliente. Função nova em `public` nasce executável por `anon`; a que o visitante não deve chamar leva `revoke execute ... from public, anon` na própria migration.

Verificação ponta a ponta do reconhecimento usa material de adultos (LFW), nunca foto de criança.
