# S02 — Criar uma arte com foto e pedido simples

**Atualizado em:** 12/10/2026.
**Estado:** fluxo simples publicado e conferido em 12/10/2026. App `dpl_9J6hZtidZJ3anDbcduFJANTSHNK9`, API v5. 298 testes app, 28 API, typecheck/build verdes. Foto + prompt → resultado → autosave → galeria e ampliar validados na fixture sintética local; tela pequena conferida. Interface autenticada publicada sem contorno/etapas conferida. Nenhuma nova chamada real à OpenAI nesta correção; a geração real anterior valida somente o caminho legado.
**Módulos:** `app`, `api`; contrato de geração manual em `src/lib/data/`.

## Decisão posterior — wizard em lote

O fluxo seguinte foi confirmado na entrevista de 12/10/2026 e está em implementação local: [wizard de alunos/turmas, fotos e prompt comum](08-wizard-geracao-lote.md). Substitui a tela única abaixo quando for publicado; mantém a remoção de contorno/recorte manual e checkbox obrigatório. A publicação da tela única acima não comprova a nova fila.

## Decisão anterior — tela única publicada

O usuário rejeitou o assistente com etapas, contorno manual, coordenadas e
confirmação obrigatória da montagem. Pediu **uma foto de referência e um campo
para explicar a arte**, de forma fácil para a equipe da escola.

Esta decisão substitui, para S02, os requisitos anteriores de segundo modelo
de estilo, quatro atalhos, recorte conferido e composição determinística.
“Foto de referência” neste fluxo é a foto do aluno. O contrato anterior fica
somente como compatibilidade temporária de clientes antigos; não é uma etapa
ou opção da interface atual. Não há promessa de preservar pixels exatamente:
a IA recebe a foto e pode alterar detalhes. A escola confere o resultado antes
de usá-lo, sem checkbox ou outro portão manual de montagem.

## Resultado e critérios vigentes

- Uma tela: foto, “Como você quer a arte?” e “Gerar arte”. Aluno e escola são
  contexto leve, sem etapas. `/gerar?aluno=<id>` preenche aluno e primeira foto;
  ao abrir diretamente, uma seleção simples permite escolher o aluno.
- Mostrar as fotos existentes; uma nova foto só pode ser enviada e associada
  ao aluno escolhido. Não criar foto sem aluno nem trocar o contexto durante
  o envio. Falha de associação mantém o arquivo para repetir sem novo upload;
  consulta o aluno antes de repetir para não duplicar após resposta perdida.
- Campo livre com exemplo escolar, obrigatório e até 3.000 caracteres. Sem
  modelo de estilo obrigatório, atalhos, template administrativo, polígono,
  coordenadas ou checkbox de montagem.
- Uma imagem no multipart, `mode=photo_prompt` e o pedido livre. Manter sessão,
  permissão da escola, guardas de autorização/idade, cota e tamanho de saída.
- Salvar o resultado automaticamente no histórico. Falha de salvamento mantém
  a imagem visível e permite nova tentativa com o mesmo snapshot, reutilizando
  upload concluído e sem outra geração ou consumo de cota.
- Resultado com ampliar, baixar e WhatsApp. Envio continua condicionado ao
  registro salvo, autorização, responsável/número verificado e trilha de
  auditoria. Arquivos históricos não são alterados; nenhuma faixa nova é
  aplicada.
- Carregando, envio, geração, salvamento, erro, vazio e cota esgotada têm estados
  recuperáveis. Fotos reais de crianças/adolescentes continuam sob os gates do
  projeto; o arquivo real anexado na conversa não é material de teste autorizado.

## Contrato e arquivos

`PhotoPromptGenerationRequest`: `mode: 'photo_prompt'`, `student`,
`studentPhoto`, `schoolBrand?` e `prompt`. `ImageGenerationService.generate`
aceita esse contrato ou o legado `GenerationRequest` para compatibilidade.
O cliente simples não lê template nem envia composição/atalhos/metadados de
aluno; anexa apenas a foto.

- `artifacts/iaschool-app/src/pages/generate.tsx`: tela única e resultado.
- `src/lib/data/openai-generation.ts`: envio simples e ramo legado isolado.
- `src/lib/generated-art-save.ts`: persistência automática/retry idempotente.
- `src/lib/photo-prompt.ts`: validação e associação segura da nova foto.
- `src/components/multi-upload.tsx`: teclado e trava de operação; modo single
  limita o envio a um arquivo também quando a pessoa arrasta várias imagens.
- `src/components/original-person-crop.tsx` e `src/lib/reviewed-art.ts` foram
  removidos; não são usados pela interface atual.
- Registros de histórico continuam em `public.generated_posts`, fotos na
  coluna `public.students.photos` e templates legados em
  `public.prompt_settings`, todos descritos em
  `artifacts/iaschool-app/supabase/setup.sql`.

## Aceite e evidência

- [x] Cliente envia exatamente uma foto e prompt com `mode=photo_prompt`, sem
  template, modelo adicional, atalhos ou composição; testes do serviço.
- [x] Prompt vazio/limite e erro de geração têm validação recuperável; testes.
- [x] Nova foto é associada somente ao aluno escolhido; resposta perdida não
  duplica a foto e aluno indisponível não recebe associação; testes.
- [x] Salvamento dispensa confirmação, mantém snapshot e reutiliza upload em
  retry; concorrência não duplica registro; testes.
- [~] Ensaio no navegador: abertura pelo perfil/direta, upload sintético,
  geração simulada, salvamento/retry, teclado e celular; responsável da entrega
  consolida o resultado após executar.
- [~] Publicação e verificação do fluxo novo em produção, sem usar foto real de
  criança ou repetir uma geração paga sem autorização.

Os 16 testes direcionados do novo fluxo passaram. A geração real sintética
anterior confirmou o pipeline antigo de composição; **não valida** este fluxo
novo de edição por foto e prompt. Nenhuma geração real foi feita nesta mudança
nem o anexo real de criança foi usado.

Não há migration ou Edge Function adicional para S02. App e API precisam ser
publicados juntos para habilitar o contrato novo; a publicação é coordenada
pelo responsável da entrega dentro da autorização da sessão.
