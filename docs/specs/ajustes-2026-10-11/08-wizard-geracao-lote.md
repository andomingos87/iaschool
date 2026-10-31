# Wizard de geração por aluno e turma

**Atualizado em:** 25/10/2026 (documentação; código de 16/10).
**Estado:** alunos → modelo → confirmar está implementado. Os registros de publicação abaixo são históricos; não houve nova checagem remota. O SQL de referência inclui modelo e rosto de referência. A migration `iaschool_generation_batch_reference` (`20261016192755`) foi aplicada no projeto em 16/10/2026. A API `iaschool-api` v7 foi publicada na Fly no mesmo dia. O app de produção passou a ser esse wizard em 16/10/2026 (`a656cca`, `dpl_4wmzoWgVmJUxn8qk1ft66H51aDmp`). Não houve geração paga.

## Atualização de 15/10/2026

1. Etapa 1 lista turmas sempre visíveis e os alunos escolhidos em ordem alfabética, por turma, com remoção individual.
2. Etapa 2 mostra só modelos da escola ativa, 8 por página, com envio de modelo, texto opcional, ideias prontas e os atalhos Remover logo e Remover texto.
3. Etapa 3 mostra o modelo à esquerda e as fotos à direita. O modal tem Perfil, Rosto de referência e Eventos.
4. A espera do lote explica que a página pode ser fechada. A geração continua no servidor.

**Atualizado em:** 12/10/2026.
**Estado da publicação anterior:** implementado, testado localmente e publicado em 12/10/2026; uma geração real sintética adicional verificada, com fixture removida.
**Origem:** decisões do usuário na entrevista `grill-me` da conversa de 12/10/2026.
**Módulos:** app, api, ingest; tabelas/RPCs novas em SQL de referência no módulo app.

## Decisões confirmadas (reconciliadas com 16/10)

1. Seleção por dropdown com busca/autocomplete, permitindo um ou mais alunos e uma ou mais turmas. Escolher turma inclui todos os alunos aptos dela. A união não duplica alunos e o rótulo mostra disponibilidade, como “18 de 22 alunos”. Seleção restrita à escola ativa.
2. Aluno sem foto principal ou autorização necessária não aparece na pesquisa nem entra pela turma. A regra é revalidada no servidor; não basta filtrar no navegador.
3. Uma arte por aluno, todas com o mesmo prompt. A foto principal do perfil é o padrão. A ficha atual usa a primeira foto cadastrada como foto principal; o wizard segue essa fonte existente.
4. Clicar na foto abre um modal para escolher outra, com Perfil, Rosto de referência e Eventos. O usuário confirmou fotos de evento revisadas em que o aluno aparece sozinho; não enviar fotos coletivas nem pedir recorte.
5. O lote continua no servidor quando a tela fecha. Ao voltar, o usuário acompanha progresso e resultados salvos. Reutilizar API e ingest existentes, sem serviço ou credencial nova.
6. Falha de um aluno não interrompe os demais. A escola pode pedir nova tentativa somente dos que falharam. Não repetir a chamada ao provedor automaticamente. Resultado já recebido mas ainda não persistido é reutilizado no salvamento, sem gerar novamente.

## Fluxo vigente

- Etapa 1: alunos e turmas, chips de seleção removíveis, busca por nome/rótulo e deduplicação.
- Etapa 2: modelo obrigatório da escola, texto opcional e atalhos Remover logo/Remover texto; modelos globais ficam fora.
- Etapa 3: modelo escolhido, fotos dos alunos com troca pelo modal e confirmação da quantidade/cota.
- Acompanhamento: pendente, gerando, concluído e falhou; arte salva na galeria do aluno. Recuperação do lote pela conta/escola, sem depender do estado da aba.

## Invariantes

- Autorização `biometric_sorting` ativa, foto principal e data válida para elegibilidade; requisitos adicionais de responsável para menores preservados. Revogação durante o lote barra a próxima chamada e a entrega do resultado. Não autorizar pela marca antiga `guardian.consentAt`.
- Identidade é uma instrução à IA, não uma promessa de igualdade de pixels. Nenhum recorte manual obrigatório retorna ao wizard.
- Snapshot de aluno/foto/modelo/prompt e chave idempotente no pedido: repetição por resposta perdida não cria outro lote nem consome cota duas vezes.
- Reserva atômica da cota para o lote. Rejeitar seleção maior que a cota antes de qualquer chamada externa; não truncar silenciosamente a seleção.
- Job com lease e proteção de concorrência. Uma chamada incerta após queda do processo exige nova tentativa manual, não regeneração automática.
- Fotos são resolvidas a partir dos IDs e vínculo escolar no banco. Não aceitar URL fornecida pelo cliente para download privilegiado.
- RLS e privilégios específicos; funções privadas em `public` revogam execução de `public`/`anon` na própria migration. Chaves somente nos processos de servidor.
- Nenhuma alteração ou ativação de WhatsApp comercial. Não usar a foto real anexada à conversa para geração, fixture ou teste.

## Verificação — histórico da versão de 12/10

Testes de busca/seleção, união de alunos e turmas, elegibilidade, troca de foto, contratos, erros e retomada; testes API/worker com imagens sintéticas e provedor simulado. PostgreSQL descartável para quota, idempotência, concorrência, leases, isolamento e revogação. Typecheck/build e interface em tela pequena. Publicação autorizada na conversa; uma geração real paga adicional depende da resposta do usuário e não está incluída na verificação local.

Executados: 313 testes do app, 49 da API e 58 do ingest, PostgreSQL descartável, typecheck e build verdes. Interface sintética conferida: autocomplete com teclado e sem acentos, turma com dois alunos, modal de evento individual, falha parcial e retry manual, recuperação após recarregar e galeria sem duplicatas. Nenhuma chamada ao provedor ou envio WhatsApp nesses testes.

## Publicação anterior e limites — 12/10

Publicado em 12/10/2026: app Vercel `dpl_5pRkJ2TuKri1r6FGRYZSTaBUkU7f` promovido em `https://iaschool-app.vercel.app`, API v6 e ingest v4 saudáveis na Fly. Migration `iaschool_generation_batches` (20261012194454) aplicada via MCP local. Sessão do app carregou wizard e autocomplete sem erro; endpoints sem sessão retornaram 401. Privilégios das tabelas internas e helpers privados conferidos no banco real. Sem nova geração OpenAI; teste do lote com provedor simulado não comprova uma geração real remota. WhatsApp comercial permanece desligado; nenhuma Edge Function mudou neste wizard.

## Ensaio real adicional autorizado

Em 12/10/2026, uma geração sintética adicional autorizada passou pelo domínio do app, API v6 e ingest v4 publicados: lote com um aluno, uma tentativa e uma cota; pedido idempotente, listagem/retomada, PNG 1024×1024 salvo na galeria e download real, revogação bloqueando elegibilidade e nova assinatura. Zero mensagens WhatsApp. O corpo do teste passou; o cleanup inicial falhou ao usar download em cache para conferir remoção. A verificação foi corrigida para metadados do Storage, a limpeza foi concluída sem repetir geração e ausência de conta/escola/aluno/lote/arte/arquivos/cota/logs/filas conferida. 49 testes locais API e typecheck passaram depois da correção; teste pago ficou desativado na segunda rodada. Não representa aceite com foto de pessoa real ou liberação comercial.
