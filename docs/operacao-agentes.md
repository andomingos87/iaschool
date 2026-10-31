# Operação do IAschool

**Atualizado em 25/10/2026 contra o código local.** Estado de produto:
[BACKLOG](../BACKLOG.md). Regras de execução: [AGENTS](../AGENTS.md).
Este guia distingue arquivos presentes, publicações registradas e trabalho
pendente. Nenhum serviço remoto foi consultado ou publicado nesta revisão.

## Mapa de execução

| Serviço | Responsabilidade | Configuração versionada |
| --- | --- | --- |
| App Vercel `iaschool-app` | UI e rewrite de `/api` para a Fly | `artifacts/iaschool-app/vercel.json` |
| Fly `iaschool-api` | Express: geração, cota, logs, proxy do álbum | `Dockerfile` e `fly.toml` na raiz |
| Fly `iaschool-ingest-worker` | Miniaturas, render de entrega, chamada interna de geração e expurgo | `artifacts/ingest-worker/Dockerfile` e `fly.toml` |
| Fly `iaschool-face-worker` | Referências e reconhecimento; confirmação permanece humana | `artifacts/face-worker/Dockerfile` e `fly.toml` |
| Supabase | Auth, Postgres/RLS/RPC, Storage, Realtime, cron e sete Edge Functions | SQL e funções em `artifacts/iaschool-app/supabase/` |

Supabase deste produto: ref `jtyyauivokutperouqyh`, MCP local
`supabase-iaschool` declarado na raiz. Não usar conector global ou Drizzle
para operar o schema. Segredos ficam no ambiente dos respectivos serviços;
service role nunca no navegador. `.mcp.json` também declara `ai-context`,
ainda sem rotina operacional documentada no repositório.

## Fases e pendências

| Fase | Implementação | Publicação registrada | Aceite restante |
| --- | --- | --- | --- |
| 0 — Descontaminação | Concluída, com higiene legada no backlog | Agosto/setembro | Remover resíduos legados dentro do escopo aprovado |
| 1 — Fundação | M1 implementado; escopo completo parcial | 20/09 e app 26/09/2026 | CSV, telas de administração e vínculos restantes |
| 2 — Upload | M2/M3 implementados | Setembro/2026 | Aceites de carga/rede do backlog |
| 3 — Reconhecimento | M4–M6 implementados, revisão humana e expurgo | Setembro; complemento 12/10/2026 | Métricas medidas e gates para dados reais |
| 4 — Autorização/portal | Escopos, aceite direto e álbum privado; portal completo pendente | Consentimento 05/10, frontend/álbum 12/10/2026 | Homologação do termo; portal e política operacional |
| 5 — Entregas/artes | W0–W4 parciais; artes por lote com modelo | Entregas 13/10, pausa 15/10, modelo 16/10/2026 | Meta, E2E transporte, W5 e templates de evento |
| Transversal | Controle de acesso e travas presentes | Registros parciais | E-mail, domínio, jurídico, suporte, CI de domínio e recuperação |

## Histórico de publicação relevante

Registros preservados no backlog e nos módulos; versões abaixo não são
resultado de leitura atual de produção.

| Data | Publicação registrada | Limite da evidência |
| --- | --- | --- |
| 26/09/2026 | App Vercel, API e ambos os workers Fly | Saúde/rotas verificadas naquela data |
| 02–05/10/2026 | Fundação OTP, Z-API, consentimento e preparo de entregas | OTP adulto em 03/10; webhook e rotação ainda pendentes no registro |
| 12/10/2026 | Ajustes de revisão/álbum, `guardian-album` v1, `school-delivery` v1, `delivery-preview` v3; API/ingest/face e app | Ensaio sintético integrado; geração paga da versão anterior; zero WhatsApp |
| 13/10/2026 | Migration `iaschool_delivery_original_photos` (20261013113430), prévia v9, ingest v6, app `dpl_64iuU8mzCYexreaBggzNdeFj3ey4` | Fotos nítidas, retirada, aprovação, sessão/download/revogação com dados sintéticos |
| 15/10/2026 | `school-delivery` v5; app `dpl_FdawDGUTsedR4xW9jQYnPi3bgeyn` | Capacidade/pausa; chamada sem sessão 401 não comprova envio |
| 16/10/2026 | Migration `iaschool_generation_batch_reference` (20261016192755), API v7, app `dpl_4wmzoWgVmJUxn8qk1ft66H51aDmp` | Wizard com modelo; sem geração paga dessa versão |

### Alteração ainda local: álbum reutilizável

Commit `d2eeafc`, SQL `artifacts/iaschool-app/supabase/fase5-album-open-link.sql`:
reabre o link, mantém sessões de 24 h separadas e agrupa fotos disponíveis da
família por evento. Modifica `public.consume_delivery_album_token` e
`public.delivery_album_session`, com `public.delivery_album_tokens.used_at`
como primeira abertura. Revogação/prazos continuam sendo revalidados.

Não há migration remota nem publicação registrada. Uma futura liberação
precisa coordenar SQL, app, `guardian-album` e `school-delivery` (mensagem
compartilhada), conferir dependências compartilhadas e testar acesso,
isolamento, expiração e revogação. Esta revisão documental não aplica nada.

## Publicar somente com autorização

1. Definir mudança, serviços e SQL envolvidos; comparar com versões remotas pelo MCP local e provedores autorizados.
2. Executar [testes locais](development/testes.md), typecheck e build. Validar dependências de schema em ambiente isolado.
3. Aplicar migration apenas por `apply_migration` no MCP `supabase-iaschool`, com autorização explícita; manter SQL de referência no mesmo commit. Nunca SQL Editor para schema.
4. Publicar somente os serviços aprovados. Funções têm autenticação própria: `config.toml` declara apenas três das sete. Conferir a matriz em [SUPABASE.md](../artifacts/iaschool-app/SUPABASE.md), sem assumir que deploy genérico configura todas.
5. Conferir versão/saúde e o fluxo afetado; registrar separadamente implementação, publicação e ensaio. Mensagem aceita pelo provedor não é prova de entrega ao telefone.

App usa raiz `artifacts/iaschool-app` na Vercel. API usa contexto Docker da
raiz. Ingest usa contexto da raiz; face usa contexto de sua pasta. Os READMEs
dos workers contêm comandos de referência; executá-los exige autorização de
publicação, configuração ou custo conforme a ação.

## Diagnóstico e recuperação

- **UI sem dados:** distinguir demonstração de Supabase; conferir variáveis públicas, aprovação e vínculo escolar. Não tratar dados mock como evidência remota.
- **`/api` local falha:** Vite não configura proxy. Ver [setup](development/cross-platform-web.md); dois processos em portas diferentes não bastam para o fluxo integrado.
- **Fila parada:** ler `/health`, logs sanitizados, estado de jobs/lease e erro por item. Ingest possui quatro loops; face prioriza referência. Não alterar ou reenfileirar lotes reais durante diagnóstico.
- **Geração incerta:** conferir tentativa e resultado persistidos antes de nova cota. Sem retry automático do provedor; repetição manual explícita. Nunca usar geração paga como health check.
- **Álbum/entrega:** conferir capacidade, prévia, autorização, retenção e origem/cookie. Aprovação com envio bloqueado é estado esperado. `refresh_required` em rascunho antigo pede atualização explícita; não reprocessar fotos reais como teste.
- **WhatsApp:** conferir pausa/kill switch, escola, allowlist, teto, instância e configuração sem expor valores. Se houver dúvida de transmissão, preservar `unknown` e reconciliar com webhook; não reenviar automaticamente.

## Backup, restauração e reversão — roteiro ainda não ensaiado

Não há prova atual de política de backup, retenção, restauração ou tempo de
recuperação. Antes do uso real, definir responsável, perda de dados tolerada
e tempo aceitável de indisponibilidade. Verificar separadamente banco, objetos
de Storage, Auth, configurações/secrets e imagens/releases dos serviços.
Não presumir que um backup de banco recupera arquivos do Storage.

Ensaio proposto, dependente de ambiente e autorização: restaurar cópia em
destino isolado; manter envio e workers externos desativados; comparar schema,
RLS/grants, objetos e relações; testar login, acesso por escola/família,
revogação, filas e expurgo com material sintético. Registrar resultado, alcance
e limitações no backlog, sem dumps ou segredos em Markdown.

Reversão de aplicação não desfaz migration nem remove mensagem já enviada.
Antes de voltar uma release, conferir compatibilidade com o schema e filas.
Não há procedimento automático de rollback SQL homologado. Retomada de jobs,
restauração de dados e exclusão exigem análise/escopo próprios.

## Lacunas abertas

CI de domínio e isolamento de integração; OpenAPI além de `/healthz`; ensaio
completo de transporte WhatsApp e observabilidade; runbook de suporte e
incidente com responsáveis; recuperação ensaiada; homologação do termo e
política. Nenhuma dessas lacunas foi marcada como resolvida por esta revisão.
Consulte [pendências de produção](pendencias-producao.md).
