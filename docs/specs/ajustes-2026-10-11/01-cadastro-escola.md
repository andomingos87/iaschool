# S01 — Cadastro da escola: CEP e retirada de logo/cores

**Atualizado em:** 12/10/2026.
**Estado:** implementação e verificação locais concluídas; app publicado em 12/10/2026. Aceites externos ainda não executados estão indicados abaixo.
**Origem:** T05, T06 e N-D6 do [Notion](https://app.notion.com/p/3f6a7bf7087d80ec83faefcd183bc0fe).
**Contexto comum:** [overview do lote](overview.md).
**Módulos:** `app`; `api` e `contrato` somente se houver uso afetado.

## Resultado esperado

A escola preenche o endereço com ajuda do CEP, corrige o que precisar e salva
sem perder os dados. Logo e configuração de cores da escola deixam de aparecer
e de influenciar qualquer geração. A identidade visual do IAschool e as cores
do modelo de arte continuam; não são configurações da escola.

## Estado local e referências

- `artifacts/iaschool-app/src/components/school-brand-form-dialog.tsx`: formulário
  compartilhado; CEP é mascarado, sem consulta de endereço; logo e cores ainda
  têm campos e fluxos próprios.
- `artifacts/iaschool-app/src/pages/school-brands.tsx`, `src/lib/format.ts`,
  `src/lib/data/types.ts`, `src/lib/data/supabase/index.ts` e
  `src/hooks/use-school-brands.ts`: apresentação, validação e persistência.
- `artifacts/iaschool-app/src/lib/data/openai-generation.ts` e
  `src/lib/prompt-template.ts`: mapear anexação de logo e injeção de cores.
- `public.schools` e os campos de marca são definidos em
  `artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`; conferir esse
  arquivo antes de propor alteração. Nenhuma coluna ou arquivo antigo é
  excluído por esta spec.

Essas referências são locais. Valores/configuração do banco real não foram
consultados. A retirada do passo de logo em 07/10 não retirou toda a configuração
da escola; T06 amplia esse alvo.

## Requisitos

- **ESC-01 — Consulta por CEP.** Consultar somente oito dígitos completos,
  usando ViaCEP como única fonte no MVP. Manter máscara na tela e somente
  dígitos na consulta. Evitar consultas repetidas ao mesmo CEP no mesmo fluxo.
- **ESC-02 — Preenchimento controlado.** Preencher logradouro, bairro, cidade
  e UF. Não preencher/apagar número e complemento; permitir edição manual dos
  demais campos. Guardar quais campos pertencem à associação automática atual.
- **ESC-03 — Respostas atrasadas.** Trocar o CEP invalida a associação anterior
  e informa quais campos precisam de revisão. Resposta antiga ou tardia nunca
  sobrescreve outro CEP nem correções manuais feitas durante a consulta.
- **ESC-04 — Falha recuperável.** Mostrar “Buscando endereço…”, CEP inválido,
  não encontrado, resposta sem rua/bairro e indisponibilidade. Toda falha permite
  preenchimento manual, sem perder o formulário ou impedir salvamento válido.
- **ESC-05 — Produto sem marca da escola.** Remover upload, edição, prévia,
  exibição, validação de logo/cores e a gravação desses campos pelo formulário.
  Abrange ficha/lista, escola sem dados e escola que já possui marca salva.
- **ESC-06 — Geração sem usos legados.** Nenhuma geração anexa logo nem usa cores
  configuradas da escola. Remover lógica, textos, exemplos e placeholders que
  reativem essa configuração, inclusive no caminho de template antigo/fallback.
  Isso não impede usar logos do próprio modelo de arte quando o atalho de S02
  “Não usar logo” estiver desligado.
- **ESC-07 — Cadastro preservado.** Nome, identificação, endereço, contato e
  regras de acesso existentes continuam funcionando. Não criar escola, plano,
  papel, campo obrigatório ou padrão visual novo por esta mudança.

## Plano técnico inicial

Reaproveitar o formulário, validação e componentes existentes. Separar consulta
de CEP da gravação do cadastro; permitir cancelamento/descarte de resposta e
proteger campos editados pela pessoa. Consultar a
[documentação oficial do ViaCEP](https://viacep.com.br/) antes da implementação,
inclusive erro de formato e indicador de CEP inexistente; não fazer consulta
massiva nem acrescentar biblioteca só para essa chamada.

Mapear leitura, escrita e uso de logo/cores em `app`/`api` antes de retirar tipos
ou parâmetros. Quando um contrato gerado for afetado, alterar a fonte e usar
o comando de codegen previsto no projeto. Compatibilidade com dados antigos
não autoriza voltar a exibi-los ou usá-los.

Não apagar colunas, objetos ou valores remotos. A eliminação de dados antigos
é trabalho separado, com análise de uso e autorização. S02 deve consumir esta
mesma remoção, sem implementar outra regra concorrente.

## Tarefas de implementação

- [x] Mapear campos/usos de marca, validação e salvamento; conferir SQL e
  compatibilidade com escolas antigas (ESC-05–ESC-07).
- [x] Implementar consulta de CEP, associação de campos e proteção contra
  respostas antigas/correções manuais (ESC-01–ESC-04).
- [x] Remover controles e usos legados de logo/cores; conferir template antigo,
  fallback e geração sem marca da escola (ESC-05, ESC-06; interface com S02).
- [x] Verificar cenários abaixo na interface e testes de lógica necessários;
  atualizar `.context/modules/app/AGENTS.md` e demais módulos realmente afetados.

## Cenários de aceite

- [x] **C01 (ESC-01, ESC-02):** dado CEP completo válido, ao consultar, preencher
  os quatro campos de endereço; número/complemento continuam iguais e a edição
  manual é salva junto do cadastro.
- [x] **C02 (ESC-01, ESC-04):** dado CEP incompleto ou inválido, não fazer consulta
  prematura; ao não encontrar endereço ou receber falha, orientar e permitir
  salvar preenchimento manual válido.
- [x] **C03 (ESC-03):** ao digitar CEP A e rapidamente B, resposta tardia de A
  não altera B; editar uma rua durante a consulta não perde a correção.
- [x] **C04 (ESC-02–ESC-04):** resposta sem rua/bairro mantém campos editáveis;
  troca de CEP sinaliza revisão sem apagar número/complemento ou dados manuais.
- [x] **C05 (ESC-05–ESC-07):** escola com logo/cores salvos abre ficha e edição
  sem esses controles; salvar endereço/contato não altera os demais dados nem
  requer novo envio de arquivo.
- [x] **C06 (ESC-06):** gerar com dados antigos e template que menciona marca
  da escola não anexa logo nem injeta suas cores. Cores do modelo de arte e
  identidade visual do app continuam disponíveis.
- [~] **C07 (ESC-04, ESC-07):** carregando, erro, escola ausente e salvamento
  pendente têm estados claros; teclado e celular permitem preencher/corrigir.

## Verificação e publicação

Implementação local verificada em 12/10/2026. Testes de CEP cobrem entrada
incompleta, ausência/erro, campos ausentes e respostas antigas sem sobrescrever
edição manual. Os testes de geração cobrem dados e template antigos sem
anexar logo nem injetar cores da escola.

Na interface de demonstração, CEPs válidos preencheram endereço mantendo
número/complemento; correção manual foi salva. Escola com logo/cores históricos
abre sem esses controles. Carregando e endereço não encontrado foram conferidos.
O ensaio completo com leitor de tela e cadastro em dispositivo físico permanece
pendente; isso não comprova publicação ou dados reais.

Nenhuma migration ou Edge Function de S01. App/API publicados em 12/10/2026 após autorização. Os dados históricos de marca permanecem preservados.
