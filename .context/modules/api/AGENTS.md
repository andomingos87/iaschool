# api

Servidor Express da geração de arte unitária e em lote, cota e log. Não serve a UI.

## Geração em lote — publicada em 12/10/2026

`src/routes/generation-batches.ts` recebe lote autenticado com escola, UUID de solicitação, prompt comum (até 3500 caracteres) e uma foto por aluno por ID. `public.generation_batches`, `public.generation_batch_items`, `public.generation_batch_retries` e os RPCs de `artifacts/iaschool-app/supabase/generation-batches.sql` reservam a cota completa atomicamente em `public.generation_usage` e deduplicam a solicitação. Não há fallback em memória para lote. Elegibilidade exige escola ativa, usuário aprovado com papel global permitido e vínculo escolar atual (ou privilégio de plataforma), nascimento válido, responsável cadastrado para menor de 18 e autorização ativa `biometric_sorting` para todos os alunos, inclusive adultos. O banco revalida antes do provedor, antes da persistência e na conclusão.

Contrato: `GET /generation/batches/eligibility?schoolId=...`, `GET /generation/batches/photos?studentId=...`, `POST /generation/batches`, `GET /generation/batches?schoolId=...`, `GET /generation/batches/:id`, `POST /generation/batches/:id/retry`. Criação: `{requestId,schoolId,prompt,students:[{studentId,photo:{source:'profile'|'event',id}}]}`. Retry manual: `{requestId,itemIds}`; só falhas/resultado incerto, nunca itens concluídos. Um arquivo já persistido é recuperado sem outra geração nem consumo de cota. A lista retorna resumos; o detalhe fornece resultados com assinatura de 300 segundos, sem caminho privado. IDs de perfil são `StoredImage.id`; a foto principal é a primeira de `public.students.photos`, e a escolha oferece as demais fotos de perfil aptas. Evento só oferece a imagem revisada com uma pessoa e um rosto confirmado do próprio aluno, sem recorte; nenhuma foto de grupo entra na IA.

`src/lib/generation-batch-process.ts` lê apenas caminhos internos do banco e do tenant, decodifica e remove EXIF/GPS e usa OpenAI com `maxRetries: 0`. Marca início do provedor no SQL antes da chamada: queda ou timeout sem resultado salvo vira `unknown`, sem repetição automática. Salva PNG no bucket privado `generated` com caminho determinístico por lote/item/tentativa e conclui uma única `public.generated_posts` transacionalmente. Retry de persistência usa os mesmos bytes. A API interna valida HMAC do corpo, método, rota e timestamp de até 60 segundos usando a service role já existente; o lease e o marcador de início impedem replay de geração. Erros e logs não carregam prompt, imagem, nome do aluno, caminho ou segredos.

HTTP 4xx confirmado pelo provedor (exceto timeout 408) e resultado inválido confirmado terminam em `failed`; transporte/resultado ambíguo termina em `unknown`. Ambos exigem uma ação manual explícita para iniciar outra tentativa. `public.discard_generation_batch_asset` (`generation-batches.sql`) agenda expurgo de arquivo atrasado apenas quando sua tentativa foi substituída ou sua origem deixou de ser autorizada; não remove o arquivo que uma lease atual recuperou.

As policies restritivas de `generation-batches.sql` protegem somente artes de lote em `public.generated_posts` e o namespace `generation-batches` do Storage. O navegador não pode criar/substituir uma saída reservada; a exclusão continua permitida para a arte arquivada, dentro das permissões da galeria. Leituras e novas assinaturas dependem de vínculo escolar, consentimento e origem atuais. Revogar `public.authorizations.revoked_at` em `biometric_sorting` agenda expurgo; a fila existente apaga os objetos de modo assíncrono. URLs já emitidas podem continuar válidas até expirar ou até o expurgo ocorrer, portanto isso não é revogação instantânea. O detalhe do lote oculta ponteiros de arte arquivada, excluída ou já enfileirada para expurgo; os metadados da arte mantêm o contrato de prompt/modelo/tamanho/imagens da galeria. Exclusão definitiva de arte usa FK com `SET NULL`, e expurgo do aluno/escola/conta usa cascata, preservando a limpeza existente.

O worker existente aciona a API e permite fechar a aba. `fly.toml` mantém a API com desligamento automático e seus recursos; `http_service.http_options.idle_timeout=600` permite a requisição longa ([documentação oficial Fly](https://fly.io/docs/reference/configuration/)). A migration `iaschool_generation_batches`, versão `20261012194454`, foi aplicada pelo MCP local em 12/10/2026. API release `v6`, imagem `deployment-01M4RTBMYW3TH4S7B2XYVC1PTQ`, foi publicada na mesma máquina de 1 CPU compartilhada/512 MB. Timeout 600 confirmado na configuração efetiva; health real 200 e check Fly passando. `eligibility` e lista recusaram chamadas sem sessão com 401. Testes locais: 49 testes da API e typecheck/build passaram. A verificação autenticada pela sessão do app fica na validação integrada; nenhum lote ou chamada nova à OpenAI foi criado nesta publicação.

## Entrada
- Pacote `@workspace/api-server`. Rotas em `src/routes/` (`health`, `generation`, `generation-logs`).
- Auth: `src/middlewares/supabase-auth.ts`.
- Sobe na Fly como `iaschool-api`. O `Dockerfile` e o `fly.toml` da raiz do repositório são deste módulo. Deploy: `fly deploy --remote-only --ha=false` a partir da raiz.
- O app alcança este servidor pelo rewrite `/api`. Renomear o app na Fly e o rewrite no mesmo commit.

## Depende de
- `contrato` (`@workspace/api-zod`).
- Supabase com `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY`, só no servidor.

## Quem depende
- A tela de geração do `app`. O fluxo, o portão do menor e o que esta API não confere estão em `.context/modules/geracao-arte/AGENTS.md`.

## Sensível
- A service role não volta em resposta, log ou variável `VITE_`.
- Cota diária e log de geração são regra de domínio: mudança pede teste.
- `src/lib/art-protection.ts` prepende a regra fixa de preservação da pessoa ao prompt recebido (`ensureProtectionRule`), mesmo em chamada fora da tela. O texto precisa ser idêntico ao de `prompt-template.ts` no `app`; há teste em `tests/art-protection.unit.test.ts`.

## Comandos
- Dev: `pnpm --filter @workspace/api-server run dev` (porta 5000 no fluxo documentado).
- Teste: `pnpm --filter @workspace/api-server run test`

## Fora deste módulo
- Upload, miniatura, reconhecimento e expurgo de arquivo não passam por aqui.

## Geração simples (decisão do usuário em 12/10/2026)

`mode=photo_prompt` recebe exatamente uma foto de referência e prompt não vazio, sem composição. Antes da cota, o servidor decodifica os pixels, normaliza a orientação e converte para PNG sem EXIF/GPS, preservando a foto inteira e suas dimensões orientadas. PNG normalizado acima de 8 MB é rejeitado sem consumir geração. Envia esse PNG à OpenAI com MIME e extensão correspondentes, instruindo preservar identidade e traços sem garantir pixels originais. Normaliza também a saída em PNG. Auth, cota, maxRetries zero, timeout e auditoria sanitizada continuam. Testes em `generation-original.unit.test.ts` cobrem foto única, prompt, ausência de recorte, JPEG com metadados e imagem truncada rejeitada antes da cota.

## Composição original legada (S02, API publicada em 12/10/2026)

`POST /generation/post-image` exige dois anexos `images` ordenados (modelo de estilo e foto original sem recompressão) e `composition` JSON: versão `original-pixels-v1`, `photoId`, contorno `points` normalizado, `protectedHead` normalizado cobrindo cabeça/cabelo/orelhas/pescoço e `reviewed: true`. `original-composition.ts` rasteriza a máscara com sharp e verifica todos os pixels do retângulo protegido antes de consumir cota. A escola confere que o retângulo corresponde à pessoa; não é detecção automática. Recorte inválido ou pedido explícito de mudar a pessoa retorna 400 recuperável sem chamada de imagem.

Só o modelo de estilo entra no provedor; a foto original nunca entra. O servidor instrui gerar somente fundo/elementos, aplica o contorno aos pixels originais, reduz proporcionalmente apenas quando necessário e compõe por cima de todos os elementos no centro de 1024 × 1024. Nenhuma camada gerada cobre cabeça ou roupa. Logs novos guardam hashes do template/prompt, origem declarada pelo cliente, versões e contagens; não guardam nome do aluno, prompt, miniatura nem bytes das imagens. Histórico anterior não é alterado. Testes unitários `original-composition.unit.test.ts` e `generation-original.unit.test.ts` usam imagens sintéticas e mock do provedor/cota/log.

O proxy `/guardian-album` confere a origem completa (incluindo protocolo quando `APP_PUBLIC_URL` está configurada), nega navegação de origem cruzada e só repassa cookie de álbum com `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, sem `Domain` e validade máxima de 24 horas. Cookie/Auth da escola não é encaminhado. Nenhum segredo entra no corpo de erro.

- A API usa `APP_PUBLIC_URL=https://iaschool-app.vercel.app` no `[env]` de `fly.toml` (origem pública, não segredo). O proxy de álbum exige essa origem exata; aliases/previews não recebem a sessão de produção. Máquinas/CPU/memória permanecem na configuração existente.

- Publicação Fly de 12/10/2026: API release `v4`, imagem `deployment-01M4RFAM8ZWYQFXPEZP2E291AT`, mesma máquina/CPU/memória. Health check e `/api/healthz` responderam 200. Proxy real sem sessão respondeu 401 na origem canônica e 403 em origem externa; isso não comprova geração nem o fluxo integrado da UI.
- Republicação Fly de 12/10/2026: API release `v5`, imagem `deployment-01M4RKTMCW0PQXK9RXFD8X707P`, adiciona `photo_prompt` com foto única normalizada sem recorte e mantém o contrato legado de duas imagens. Mesma máquina em `gru`, 1 CPU compartilhada e 512 MB; release completa, check Fly passando e `/api/healthz` real 200. Verificação local: 28 testes unitários em cinco arquivos e typecheck da workspace passaram. Nenhuma nova chamada real à OpenAI foi realizada; o novo modo foi validado com mock do provedor.

- Gateway Supabase pode emitir cookies próprios junto da sessão do álbum. O proxy lê `Headers.getSetCookie()` individualmente, exige exatamente um `__Host-iaschool-album` válido e ignora cookies da infraestrutura; não valida o cabeçalho agregado com vírgulas. Regressão com cookie de gateway e data Expires coberta.

- Na release API `v4`, geração configura OpenAI com `maxRetries: 0` e timeout de 150 segundos: o SDK não repete a tentativa autorizada. O proxy usa `headers.getSetCookie()` para validar e repassar somente o cookie do álbum, mesmo quando a resposta contém vários cabeçalhos de cookie. Health real e check Fly passaram após a republicação, sem alterar segredos ou recursos.

## Ensaio real do lote — opt-in

`tests/generation-batch-real-synthetic.integration.test.ts` exige `IASCHOOL_BATCH_REAL_SMOKE=approved_single_synthetic_generation` e autorização explícita de uma geração paga. Cria escola/aluno adulto inteiramente sintéticos, usa `/api/generation/batches` publicado e o ingest real, valida uma tentativa/cota, idempotência, retomada, PNG1024 salvo/baixado e revogação, sem WhatsApp. Cleanup aguarda tentativa terminal e remove apenas conta/escola/Storage/cota/logs próprios, conferindo ausência de resíduos. Não lê a chave OpenAI local nem dispara retry. Em execução em 12/10/2026; resultado registrado no backlog.

### Ensaio posterior do wizard — 12/10/2026

Em 12/10/2026, uma geração sintética adicional autorizada passou pelo domínio do app, API v6 e ingest v4 publicados: lote com um aluno, uma tentativa e uma cota; pedido idempotente, listagem/retomada, PNG 1024×1024 salvo na galeria e download real, revogação bloqueando elegibilidade e nova assinatura. Zero mensagens WhatsApp. O corpo do teste passou; o cleanup inicial falhou ao usar download em cache para conferir remoção. A verificação foi corrigida para metadados do Storage, a limpeza foi concluída sem repetir geração e ausência de conta/escola/aluno/lote/arte/arquivos/cota/logs/filas conferida. 49 testes locais API e typecheck passaram depois da correção; teste pago ficou desativado na segunda rodada.
