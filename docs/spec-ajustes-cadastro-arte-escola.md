# Spec — Ajustes de cadastro, arte, escola e entrega

**Data:** 07/10/2026.
**Estado:** proposta. Nada disto está implementado.
**Pedido:** onze ajustes vistos no app em uso (cadastro de aluno, ficha,
criação de arte, primeiro login de escola, gestão da escola e envio do evento).
**Acompanhamento:** [`BACKLOG.md`](../BACKLOG.md), seção "Ajustes de produto
(07/10/2026)". Este documento não fecha a Fase 4 nem substitui
[`spec-whatsapp-api-oficial-entrega-fotos.md`](spec-whatsapp-api-oficial-entrega-fotos.md)
nem [`spec-upload-massa-reconhecimento-facial.md`](spec-upload-massa-reconhecimento-facial.md).

Assessoria técnica de produto, não parecer jurídico.

---

## 0. Como ler

Cada spec tem o mesmo miolo: o que foi pedido, o que o código faz hoje, o
comportamento alvo, regras, fora de escopo e aceite. Onde o pedido esbarra na
regra de imagem de menor, a spec segue a regra e diz o porquê.

Ordem sugerida de implementação, se for codar depois:

1. Spec 1 e spec 2 juntas (o formulário do aluno é um só).
2. Spec 3 e spec 4 (a foto de referência e a animação dela).
3. Spec 5 e spec 8 juntas (o assistente de arte perde o logo e o passo de escola).
4. Spec 6 (bug de primeiro login; investigar antes de "corrigir no escuro").
5. Spec 7 e spec 10 (página da escola e o combobox; a página nova já nasce com o componente).
6. Spec 9 só depois da decisão da §9. Não implementar a leitura recomendada sem essa escolha.
7. Spec 11 por último: a tela de lote já existe; o que falta é a porta de entrada e o envio de verdade (W4).

Nenhuma destas specs autoriza foto real de criança ou adolescente, nem liga o
fluxo comercial de WhatsApp. Vale a regra bloqueante de [`AGENTS.md`](../AGENTS.md).

---

## 0.1 O que não se mistura

Hoje a palavra "autorização" aparece em quatro lugares que fazem coisas
diferentes. As specs 1, 2 e 11 separam isso. Não juntar de novo.

| O quê | Onde está hoje | Quem decide | O que libera | O que não libera |
| --- | --- | --- | --- | --- |
| Declaração do evento | Checkbox ao criar o evento e de novo no detalhe, se ainda não foi declarada | A pessoa da escola, com nome e data | Abrir o upload daquele evento | Reconhecimento, envio, arte |
| Consentimento genérico do formulário | Checkbox obrigatório no cadastro do menor | A escola, gravado em `students.guardian.consentAt` | A geração de arte (`generationBlockers`) | Não vira `biometric_sorting` nem `delivery_whatsapp` |
| Foto para reconhecimento | Toggle na ficha → `authorizations.scope = biometric_sorting` | A escola declara | Cadastrar rosto de referência e guardar embedding | Envio ao responsável |
| Envio por WhatsApp | No código local, pedido ao responsável; na tela publicada que originou o pedido, ainda parece um toggle | Só o responsável, pelo link, no WhatsApp verificado | Entrega da pasta daquele aluno | Deixar o rosto nítido na foto de outra família |

A regra do pixel, já implementada, continua:

> Na foto entregue a um responsável, fica nítido só o filho dele (rosto
> confirmado na revisão) e adulto/equipe confirmado. Todo o resto fica
> desfocado, mesmo que a outra criança tenha autorização própria.

Evidência: `artifacts/ingest-worker/src/delivery-render.ts` (comentário do
arquivo e a composição nítido-sobre-desfocado). Base: Decreto nº 12.880/2026,
art. 35. A frase "se não autorizar, o rosto aparece borrado nas outras fotos"
é o efeito certo. Autorizar não pode ter o efeito inverso.

---

## 1. WhatsApp só do responsável

### Pedido

No cadastro do aluno o WhatsApp é pedido duas vezes: no aluno e no
responsável. O número que importa é o do responsável.

### Estado atual

O schema do formulário exige `whatsapp` do aluno sempre, e `guardianWhatsapp`
quando a data indica menor de 18.

- `artifacts/iaschool-app/src/components/student-form-dialog.tsx` — campo
  "WhatsApp *" no bloco do aluno (por volta da linha 260) e "WhatsApp do
  responsável *" no bloco que só aparece para menor.
- O texto de ajuda do responsável já diz que a imagem só pode ir para aquele
  número.
- A ficha repete os dois: `student-detail.tsx` mostra `s.whatsapp` e
  `s.guardian.whatsapp`.
- A lista de alunos e o passo "Aluno" de criar arte mostram o WhatsApp do
  aluno mascarado (`students.tsx`, `generate.tsx`).
- `lib/eca.ts`, `allowedShareTarget`: menor de 18 só pode receber no
  WhatsApp verificado do responsável; maior de 18 usa `student.whatsapp`.
- No banco real, `public.students.whatsapp` é `text not null` (conferido em
  07/10/2026). O SQL de referência está em `supabase/setup.sql`.

### Comportamento alvo

O formulário de aluno, novo ou edição, não tem campo de WhatsApp do aluno.

Para menor de 18, nome e WhatsApp do responsável continuam obrigatórios para
salvar. Sem isso não há canal nenhum. Isso não é autorização: é o cadastro
de quem responde pela criança (Lei nº 15.211/2025, art. 24, na leitura
conservadora que o produto já adotou em `lib/eca.ts`).

Para maior de 18, o bloco do responsável não aparece, como hoje, e também
não há WhatsApp do aluno.

Onde a interface citava o número do aluno (lista, ficha, passo da arte),
passa a mostrar turma ou, se houver responsável, o número dele mascarado.
Não mostrar os dois.

### Regras

- Parar de gravar número novo em `students.whatsapp`.
- Migration: `students.whatsapp` deixa de ser `not null`. Linhas antigas
  permanecem; a tela não as exibe. Não apagar o dado antigo nesta leva (é
  dado pessoal; exclusão pede fluxo próprio).
- `allowedShareTarget` de menor não muda: destino continua sendo o
  responsável verificado.
- Maior de 18 fica sem destino de WhatsApp até uma decisão posterior. A
  geração de arte dele não depende desse número. Não inventar um campo
  "WhatsApp do aluno adulto" nesta spec.
- Atualizar o SQL de referência no mesmo commit da migration.
- Testes que montam aluno com `whatsapp` obrigatório passam a usar o número
  do responsável.

### Fora de escopo

Verificação do número (OTP), termo de envio e a tela de entregas.

### Aceite

- Novo aluno menor salva com um único WhatsApp, o do responsável.
- Novo aluno não grava `students.whatsapp`.
- Lista, ficha e criar arte não mostram número do aluno.
- Aluno antigo continua abrindo; o número antigo não aparece.
- Typecheck e os testes do formulário / `lib/eca.ts` verdes.

### Conformidade

[CORRIGIR] Coleta de WhatsApp do aluno sem finalidade
Base: Lei 15.211/2025, art. 7º, § 2º; LGPD, art. 6º, III e art. 14, § 3º
Evidência: `student-form-dialog.tsx` (campo obrigatório) e `students.whatsapp not null`
Risco: número de contato da criança guardado e exibido sem servir ao envio, que já tem o canal do responsável
Correção mínima: a desta spec

---

## 2. Cadastrar o aluno sem autorização, e desfocar quem não autorizou

### Pedido

A autorização está obrigatória no cadastro. As autorizações parecem
repetidas. A escola precisa poder cadastrar o aluno. Se não houver
autorização de imagem e de envio, o rosto dele sai borrado nas outras fotos.
As telas citadas são o checkbox do evento ("Declaro que a escola possui
autorização de uso de imagem…") e o cartão da ficha (responsável com
"Autorização registrada" / "WhatsApp não verificado", mais "Foto para
reconhecimento" e "Envio por WhatsApp").

### Estado atual

Cinco travas, contadas no código local de 07/10/2026:

1. **Formulário.** Menor de 18 não salva sem o checkbox "O responsável
   autorizou o uso da foto…". `student-form-dialog.tsx`, `superRefine` em
   `guardianConsent`. O texto ameaça bloquear a geração. `buildGuardian`
   grava ou apaga `consentAt`. Desmarcar revoga também a verificação do
   canal.
2. **Geração de arte.** `generationBlockers` em `lib/eca.ts` exige
   responsável e `consentAt` para menor. O passo 1 de `/gerar` não avança
   sem isso.
3. **Ficha, reconhecimento.** Toggle "Foto para reconhecimento" grava
   `biometric_sorting` como declaração da escola. Sem ele, a aba de rosto
   recusa o upload, e o banco também (`student_reference_faces_check`).
4. **Ficha, envio.** No código local, `delivery_whatsapp` não é mais toggle:
   o botão pede o aceite ao responsável verificado
   (`student-authorizations-card.tsx`). A captura enviada ainda mostra um
   interruptor. Isso combina com o frontend publicado antes do W2
   (05/10/2026): o backlog registra que a tela de consentimento ainda
   dependia de deploy. Tratar a captura como o que o usuário viu, e o
   arquivo local como o comportamento a preservar.
5. **Evento.** O checkbox da captura 1 é obrigatório para criar o evento e
   para abrir o upload (`event-new.tsx`, `event-detail.tsx`). O próprio
   texto diz que não substitui o termo do responsável. Fica registrado com
   nome e data.

O desfoque por destinatário já existe e já borra as outras crianças sempre,
com ou sem autorização delas (`delivery-render.ts`).

### Comportamento alvo

Cadastrar o aluno não pede e não exige autorização.

O checkbox do formulário sai. `consentAt` deixa de ser escrito por esse
formulário. Aluno menor salva com nome, nascimento, responsável (nome e
WhatsApp) e o resto opcional (turma, matrícula, observações, foto).

Na ficha, um bloco só, com duas linhas e uma frase de efeito:

- **Reconhecer o rosto.** Interruptor da escola. Ligado: pode haver rosto de
  referência e o aluno entra na sugestão da revisão. Desligado: não se
  cadastra referência, não se persiste embedding, e qualquer rosto dele numa
  foto de evento permanece sem atribuição e sai desfocado em toda entrega.
- **Enviar ao responsável.** Sem interruptor da escola. Estado visível
  (não pedido, aguardando, aceito, recusado, expirado, revogado) e o botão
  de pedir aceite, como o código local já faz. Sem aceite no número
  verificado, nada é enviado.

Abaixo das duas linhas, uma frase fixa:

> Sem reconhecimento, o rosto não é separado. Sem o aceite do responsável,
> nada é enviado. Na foto que vai para uma família, as outras crianças saem
> desfocadas.

O selo "Autorização registrada" ao lado do responsável, hoje amarrado a
`consentAt`, sai. No lugar: "WhatsApp verificado" ou "WhatsApp não
verificado", que já existe.

A declaração do evento **permanece obrigatória** para abrir o upload. Não é
a mesma coisa que o aceite do responsável. Ajustar só a frase, para a pessoa
não achar que já autorizou o aluno:

> Declaro que a escola tem autorização para fotografar os alunos neste
> evento e subir as fotos aqui. Isso não autoriza reconhecimento nem envio.
> Cada aluno é autorizado na ficha dele.

### Gerar arte de menor

Tirar o checkbox do cadastro não pode liberar gerar imagem de menor sem
registro nenhum (Lei nº 15.211/2025, arts. 6º e 7º, § 2º; LGPD, art. 14,
§ 1º).

Decisão recomendada, já escrita nesta spec para não travar as specs 5 e 8:
gerar arte de menor exige responsável cadastrado **e** `biometric_sorting`
ativo. A escola, ao ligar "Reconhecer o rosto", declara que pode tratar a
imagem daquele aluno para separar fotos e para montar a arte. O envio da
arte continua exigindo o aceite de `delivery_whatsapp` e o canal verificado
(`shareBlockers` não afrouxa).

Se essa leitura for recusada, a alternativa é um terceiro registro só para
arte (`internal_use` na ficha, desligado por padrão). Não voltar o checkbox
para o formulário de cadastro.

`generationBlockers` passa a olhar `biometric_sorting` ativo, não
`guardian.consentAt`. Aluno antigo que só tem `consentAt` / `internal_use`
herdado **não** ganha reconhecimento de graça: a geração dele fica bloqueada
até alguém ligar o interruptor na ficha. O selo de herança de `internal_use`
continua só de leitura.

### Regras do desfoque

Não mudar `renderDeliveryAsset`. Autorização de um aluno não deixa o rosto
dele nítido na entrega de outro responsável.

Sem `biometric_sorting`, o worker continua sem gravar embedding (já é a
regra do M5). O rosto cai em não atribuído e o derivado o deixa desfocado.

### Fora de escopo

Texto jurídico versionado do termo (continua pendência do backlog). Portal
do responsável. Mudar o sigma do desfoque.

### Aceite

- Menor salva sem nenhum checkbox de autorização.
- Ficha mostra duas linhas, não três interruptores.
- Desligar reconhecimento impede nova referência (tela e banco).
- Pedir envio sem WhatsApp verificado continua bloqueado.
- Declaração do evento continua obrigatória para o upload, com o texto novo.
- Entrega para a família A não traz nítida a criança B, mesmo com B
  autorizado.
- Gerar arte de menor sem reconhecimento ativo é recusado na tela e na
  função `generationBlockers`.
- Testes de `lib/eca.ts`, do formulário e de `delivery-render` atualizados e
  verdes.

### Conformidade

[CORRIGIR] Checkbox único no cadastro trata de finalidades diferentes e
impede o registro do aluno
Base: LGPD, art. 14, § 1º (consentimento específico); Lei 15.211/2025, art. 7º, § 2º
Evidência: `student-form-dialog.tsx` (`guardianConsent` obrigatório) e o cartão em `student-authorizations-card.tsx`
Risco: a escola ou não cadastra a criança, ou marca um texto genérico que o produto depois não consegue separar de reconhecimento e de envio
Correção mínima: cadastro sem autorização; duas finalidades na ficha; evento continua sendo só a declaração de subida

[OBSERVAR] Não afrouxar o desfoque entre famílias
Base: Decreto 12.880/2026, art. 35
Evidência: `delivery-render.ts`
Risco: a foto nítida de uma criança chegar ao WhatsApp de outra família
Correção mínima: manter a regra de pixel atual

---

## 3. Foto de perfil como rosto de referência

### Pedido

A foto de perfil já pode servir de referência. Dá para acrescentar outras na
aba "Rosto de referência".

### Estado atual

São dois acervos que não se falam.

- "Fotos do aluno" (`MultiUpload` no formulário, bucket de alunos) alimentam
  a galeria da ficha e a escolha de foto em `/gerar`. A primeira foto é o
  avatar da lista e do passo da arte.
- "Rosto de referência" (`student-reference-faces.tsx`) sobe outro arquivo
  para `student-refs`, exige `biometric_sorting` ativo e entra na fila
  `student_reference_jobs`. O `face-worker` só aceita foto com exatamente um
  rosto. Uma foto já matricula; a segunda reduz a fila manual (aviso de
  cobertura baixa). O vetor não volta para o navegador.

A captura 3 mostra a aba "Fotos e artes" com uma foto cadastrada e as abas
"Fotos de eventos" e "Rosto de referência" ao lado. Nada copia uma para a
outra.

### Comportamento alvo

A primeira foto do aluno é a foto de perfil. Com "Reconhecer o rosto"
ligado, salvar o aluno (ou ligar o interruptor depois, se a foto já
existir) enfileira essa foto como referência, sem a pessoa subir de novo.

A aba "Rosto de referência" lista essa foto junto com as outras e continua
com "Adicionar foto" para as seguintes. O aviso de cobertura baixa permanece
até haver duas referências processadas.

Se o reconhecimento estiver desligado, a foto de perfil fica só na galeria.
A aba explica que é preciso ligar o interruptor. Ao ligar, se já houver
foto de perfil, a tela oferece "Usar a foto de perfil" em vez de exigir um
upload novo. Não enfileirar no escuro no momento em que o interruptor liga
sem esse passo visível: biometria pede ato explícito.

### Regras

- Não criar um terceiro bucket. A referência continua em `student-refs`, com
  `authorization_id` de `biometric_sorting` ativo. A foto de perfil é copiada
  para esse fluxo (o cliente já prepara JPEG sem EXIF em
  `prepareReferencePhoto`); o original da galeria não vira embedding.
- Deduplicar por hash do arquivo preparado. Salvar o aluno de novo, ou
  clicar duas vezes, não cria duas referências da mesma foto.
- Vale a regra do worker: zero rostos ou mais de um rosto volta como falha,
  com "Tentar de novo" e "Descartar", como hoje. A galeria não é apagada
  por causa dessa falha.
- Remover a referência não remove a foto de perfil. Remover a foto de perfil
  não apaga uma referência já processada; a aba mostra que a origem foi
  removida da galeria.
- Trocar a foto de perfil enfileira a nova só se o reconhecimento estiver
  ligado e o hash for outro. A referência antiga permanece até alguém
  remover.
- Aluno sem reconhecimento não ganha job.

### Fora de escopo

Escolher automaticamente "a melhor" entre várias fotos da galeria. Usar foto
de evento como referência. Medir acurácia (continua a pendência do §12.2 da
spec facial).

### Aceite

- Com reconhecimento ligado, salvar um aluno com uma foto cria um job de
  referência dessa foto e a aba mostra "aguardando processamento".
- Salvar de novo não duplica.
- Sem reconhecimento, nenhum job nasce, e a aba diz por quê.
- Adicionar outra foto na aba continua funcionando.
- Foto com dois rostos falha o job e a galeria segue intacta.
- Teste do hook de referência cobre o dedupe; o caso ao vivo, se rodado, usa
  só material de adulto.

### Conformidade

[OBSERVAR] Foto de perfil não entra no motor facial sem o escopo
Base: Lei 15.211/2025, art. 7º, § 2º; finalidade única do embedding já
registrada na spec facial (escopo separado de envio)
Evidência: trigger `student_reference_faces_check` e `StudentReferenceFaces`
Risco: embedding de criança a partir de uma foto que a escola subiu só para a ficha
Correção mínima: só enfileirar com `biometric_sorting` ativo e ação visível

---

## 4. Animação de scanner enquanto a referência processa

### Pedido

Enquanto a foto de referência está sendo processada, uma animação de
scanner moderno sobe e desce na foto.

### Estado atual

O job pendente é um cartão de 128px com a foto a 60% de opacidade e um
ícone de relógio no centro (`student-reference-faces.tsx`, bloco
"Aguardando processamento"). Não há progresso real: a fila não publica
percentual, só `pending` / `failed` / processado.

### Comportamento alvo

No lugar do relógio, uma linha luminosa horizontal percorre a foto de cima
a baixo e volta, em loop, enquanto o job não for `failed` nem virar
referência processada. A foto continua visível por baixo. O texto
"Aguardando processamento" e o botão "Descartar" ficam.

A animação é indeterminada. Não sugere percentual que o sistema não tem.

`prefers-reduced-motion: reduce` deixa a linha parada no meio, sem loop.

### Regras

- CSS no componente da miniatura. Sem biblioteca de animação, sem canvas,
  sem vídeo.
- Só nesse estado. Foto processada, falha e galeria comum não animam.
- Contraste da linha sobre foto clara e escura (a linha leva um traço
  escuro fino por baixo do traço claro).
- Não piscar o tempo todo a página: uma instância por miniatura pendente.

### Fora de escopo

Animar o processamento das fotos do evento na grade. Barra de progresso
real do `face-worker`.

### Aceite

- Job pendente mostra a linha em movimento.
- Ao concluir ou falhar, a linha some e vale o estado que já existe.
- Com redução de movimento do sistema, a linha não se move.
- Verificado no navegador, desktop e largura de celular, na aba do aluno.

---

## 5. Tirar a etapa de logo ao criar arte

### Pedido

No passo a passo de criar arte, remover a etapa de logo. Nunca vamos
colocar logo.

### Estado atual

`/gerar` tem quatro passos (`generate.tsx`, `STEP_META`): Aluno, Escola,
Logo, Modelo de arte.

O passo Logo (índice 2) pergunta "Exibir logo da escola?" e oferece
"Exibir logo" / "Não exibir". Se a escola não tem logo, a tela avisa e
deixa seguir. A captura 4 é esse estado, no Colégio Aurora (demo).

`generate()` manda `showSchoolLogo: hasSchoolLogo && showSchoolLogo`. O
template padrão tem o bloco `{{#logo_escola}}` (`lib/prompt-template.ts`) e
`openai-generation.ts` anexa a imagem do logo quando a flag está ligada.
As cores da escola são independentes do logo e continuam no prompt.

A página Escola e o passo Escola ainda dizem que o logo entra na arte.

### Comportamento alvo

O passo Logo deixa de existir. O assistente fica com Aluno, Escola (quando
a spec 8 mandar mostrar) e Modelo.

Toda geração manda `showSchoolLogo: false`. O bloco do logo não entra no
prompt. A imagem do logo não é enviada ao modelo.

Cores da escola continuam, quando a escola selecionada tiver cores.

Textos que prometem logo na arte são reescritos: página Escola, passo
Escola, exemplo do prompt em `/admin/prompt`. O campo de upload do logo
pode permanecer no cadastro da escola nesta leva (não há decisão de apagar
o arquivo), mas a interface não diz que ele será impresso na arte.

### Regras

- Não apagar `schools.logo` nem os arquivos já gravados.
- Não remover o token `{{#logo_escola}}` dos templates salvos. Com a flag
  sempre falsa, o bloco não renderiza. Tirar o token do template padrão
  novo, para o próximo restore não reintroduzir a frase.
- Teste existente "omite o logo quando a opção está desligada" ganha um
  caso em que a geração nem oferece a opção.

### Fora de escopo

Marca d'água "IMAGEM GERADA POR IA", que fica (`lib/eca.ts`,
`AI_DISCLOSURE_LABEL`). Logo do próprio IAschool na tela de login.

### Aceite

- O stepper não tem "Logo".
- Uma geração com escola que tem logo não envia essa imagem e o prompt
  montado não contém a frase do logo.
- Cores da escola continuam no prompt quando existirem.
- Nenhum texto de produto diz que o logo entra na arte.

---

## 6. Erro no primeiro login da escola

### Pedido

Ao cadastrar uma escola para testar, o primeiro login mostrou um erro e
depois o erro sumiu. Verificar esse fluxo.

### Estado atual

Fluxo desenhado:

1. `/` sem sessão mostra o login. "Criar conta" abre `SignupCard`
   (`signup.tsx`): nome da escola, e-mail, senha.
2. `auth.signUp` grava metadados `signup_role=school` e, se o Supabase
   devolver sessão, faz `signOut`. A conta nasce pendente. O trigger
   `handle_new_user` cria `profiles` (`fase1-min-schools-events.sql`).
3. A tela diz para esperar aprovação e voltar ao login.
4. Um administrador aprova em `/aprovacoes`. O trigger
   `ensure_school_on_approval` cria `schools` (id = uid) e
   `school_members` com papel `school_admin`, só se o papel global for
   `user` e ainda não houver vínculo.
5. Login chama `signInWithPassword` e em seguida `toSession`, que lê
   `profiles` e, se `approval_status = approved`, chama `my_schools()`.
6. Se `toSession` lança, `signIn` faz `signOut` e o login mostra um toast
   de erro (`login.tsx`). O toast some sozinho.
7. `useAuth.signIn` ignora a sessão que `signIn` devolve. Quem atualiza a
   tela é `onAuthStateChange`, que também chama `toSession`. Se essa
   chamada falha, o listener entrega `null` e não explica nada.
8. `getSession`, na abertura, trata qualquer falha de perfil como
   "deslogado" e também faz `signOut`.
9. Conta pendente ou recusada não é erro: `AuthGate` mostra
   `PendingApprovalPage`. Conta aprovada entra no app.

Isto não foi reproduzido nesta análise. Não há mensagem capturada. O que
dá para afirmar é que o código tem três caminhos em que uma falha
transitória desloga e, no máximo, pisca um toast.

Hipóteses, da mais plausível para a menos:

1. **Confirmação de e-mail.** `signIn` só traduz "Invalid login
   credentials". "Email not confirmed" aparece cru, em inglês, e some com
   o toast. Depois que a pessoa confirma (ou tenta de novo com a sessão já
   existente), o segundo login funciona. Bate com "deu erro e depois
   sumiu".
2. **Corrida no primeiro `SIGNED_IN`.** `signIn` e o listener chamam
   `toSession` juntos. Se a leitura de `profiles` ou `my_schools()` falha
   uma vez (trigger ainda não visível, erro de rede), `signIn` desloga e
   mostra o toast. A tentativa seguinte funciona.
3. **Aprovação sem vínculo.** Se `ensure_school_on_approval` não rodar
   (papel diferente de `user`, ou o update não disparar o trigger), o
   login entra com `schools: []`. As telas dizem "Sua conta ainda não está
   vinculada a uma escola" (`school-brands.tsx`, `requireActiveSchool`).
   Isso não é um toast que some; só entra nesta lista se a falha for a
   RPC `my_schools()` e não a ausência de linha.
4. **Conta ainda pendente.** Não deve mostrar erro. Se a pessoa viu a
   página "aguardando aprovação", o fluxo está certo e o relato é outro.

### Comportamento alvo

Reproduzir antes de corrigir: cadastro de escola novo, aprovação, primeiro
login, com o texto exato do toast ou da tela. Conferir no projeto se a
confirmação de e-mail do Auth está ligada.

Corrigir a causa achada. Além dela, fechar os buracos que a leitura já
mostra, porque eles produzem o mesmo sintoma:

- Uma falha ao ler perfil ou escolas no login não faz `signOut` se a
  senha estava certa. Mostra o erro e deixa a sessão para um "Tentar de
  novo".
- `signIn` e o listener não disputam `toSession`. Uma função só publica a
  sessão na tela.
- Mensagens do Auth que o produto conhece saem em português, inclusive
  e-mail não confirmado e credencial inválida.
- Conta pendente continua na página de espera, sem toast de erro.
- Conta aprovada sem `school_members` não entra num app vazio: explica que
  a escola não foi vinculada e aponta para o administrador. Não desloga.

### Fora de escopo

Trocar o provedor de e-mail (Resend segue em
[`pendencias-producao.md`](pendencias-producao.md)). Redesenhar o cadastro
público.

### Aceite

- O fluxo cadastro → aprovação → primeiro login entra no app sem toast de
  erro, numa conta de teste.
- Se a confirmação de e-mail estiver ligada, o login antes do clique diz
  em português que falta confirmar, e não desloga uma sessão válida.
- Falha forçada de `my_schools()` no primeiro login mostra erro
  persistente até a pessoa dispensar, e a segunda tentativa não exige
  senha de novo se a sessão do Auth ainda existe.
- Conta pendente vê a página de espera.
- O relatório da correção diz qual hipótese era a verdadeira. Se nenhuma
  se reproduzir, a spec 6 fica aberta e as outras seguem.

---

## 7. Gestão da escola

### Pedido

Melhorar a página de gestão da escola, com mais detalhes e interface melhor.

### Estado atual

`/escolas` (`school-brands.tsx`) é uma grade de cartões. Cada cartão tem
logo ou ícone, nome, "Logo cadastrado" / "Sem logo", CNPJ, cidade, um
contato (telefone ou e-mail) e as bolinhas de cor. Um menu de três pontos
só tem "Editar". Sem CNPJ, um aviso pede para completar antes do piloto.

O que a pessoa só vê abrindo o diálogo (`school-brand-form-dialog.tsx`):
nome, CNPJ, CEP, logradouro, número, complemento, bairro, cidade, UF,
telefone, e-mail, responsável pela conta, upload de logo, até 3 cores.

No banco, `schools` também tem `plan` (`text not null`). O tipo
`SchoolBrand` do app não carrega esse campo. Não mostrar plano nem deixar
editar até existir produto de plano.

A página fala em "logo e cores aplicados nas artes". A spec 5 acaba com o
logo na arte. As cores continuam.

Para quem tem uma escola, a grade de cartões é o formato errado: é uma
ficha, não uma coleção.

### Comportamento alvo

Quem é membro de uma escola vê a ficha dessa escola, não um cartão perdido
numa grade. Quem é membro de várias, ou administrador da plataforma com
mais de uma na lista, vê a lista e abre uma ficha.

A ficha tem quatro blocos, de cima para baixo:

1. **Identificação.** Nome, CNPJ mascarado, cidade/UF, papel da pessoa
   naquela escola. Ação "Editar cadastro" abre o formulário que já existe.
2. **Pendências.** Some quando CNPJ, endereço (cidade e UF no mínimo) e
   contato (telefone ou e-mail, mais o nome do responsável pela conta)
   estão preenchidos. Cada item faltante é um link para o campo, não um
   parágrafo genérico.
3. **Operação.** Quatro números com link: alunos, turmas, eventos,
   eventos com revisão aberta. Os dados já existem nas listas do app; a
   ficha só conta. Não criar métrica nova.
4. **Cadastro completo.** Endereço em linhas legíveis e contato com nome,
   telefone e e-mail. Cores da escola num bloco "Cores usadas nas artes".
   Logo, se houver, fica nesse bloco com a legenda "Não é colocado na
   arte". Sem logo, o bloco não pede upload como se fosse obrigatório.

Estado vazio (aprovado sem vínculo) continua o texto atual, que manda
falar com o administrador. Isso conversa com a spec 6.

### Regras

- Não criar escola por esta página. Escola nasce na aprovação.
- Não listar outros usuários da escola nesta leva. `school_members` guarda
  papel, mas o nome depende de `profiles`, e esta spec não abre política
  de leitura nova.
- Não exibir `plan`.
- Formulário de edição reaproveitado. Não duplicar campos.
- Desktop: ficha em uma coluna até `max-w-3xl`, números em grade de
  quatro. Celular: números em duas colunas, endereço empilhado.

### Fora de escopo

Convidar professor, trocar papel, excluir escola, plano, cobrança.

### Aceite

- Conta com uma escola abre a ficha, não a grade.
- CNPJ, endereço e contato completos aparecem sem abrir o diálogo.
- Faltando CNPJ, a pendência leva ao campo.
- Os números batem com as listas de alunos, turmas e eventos da mesma
  escola.
- Nenhum texto diz que o logo entra na arte.
- Verificado no navegador, desktop e celular, inclusive o vazio "sem
  escola".

---

## 8. Escola já selecionada ao criar arte

### Pedido

No passo a passo, o passo de escolher escola não faz sentido para quem é a
escola: já deve vir selecionada. Para um administrador, escolher a escola
faz sentido.

### Estado atual

O passo Escola (índice 1) lista todas as escolas que `useSchoolBrands`
devolve, mais a opção "Sem escola" ("Gerar sem logo e sem cores"). Ao
escolher o aluno, `selectedBrandId` recebe `student.schoolId`. A pessoa
pode trocar ou limpar.

"Administrador" neste produto são dois papéis: `school_admin` (admin
daquela escola) e plataforma (`super_admin` / `dev`, `isPlatformAdmin`).
O pedido trata "usuário escola" contra "admin". Leitura usada aqui:
quem opera uma escola não escolhe; quem é da plataforma, e pode ver mais
de uma, escolhe. `school_admin` é usuário da escola, não o admin do passo.

A lista vem de `schools` com RLS. O app não tem uma query paralela.

### Comportamento alvo

Junto com a spec 5, os passos ficam:

- **Uma escola na sessão** (o caso da escola e do `school_admin`): Aluno →
  Modelo. A escola ativa entra sozinha. Não há "Sem escola". As cores
  dessa escola seguem para o prompt.
- **Mais de uma escola, ou papel de plataforma:** Aluno → Escola → Modelo.
  A escola ativa, ou a do aluno quando ele já tem `schoolId`, vem
  pré-selecionada. Dá para trocar. Não há "Sem escola": arte sem escola
  não tem cor nem tenant, e o logo já não existe.

O aluno listado no passo 1 é o da escola selecionada. Para quem tem uma
escola, é a escola ativa. Para a plataforma, trocar a escola no passo 2
refiltra os alunos se a pessoa voltar ao passo 1. Não gerar arte de aluno
de uma escola com as cores de outra.

### Regras

- A decisão usa `session.user.schools` e `isPlatformAdmin`. Não criar papel
  novo.
- Pré-seleção não é edição de cadastro. Não abre o diálogo de escola dentro
  do assistente (o lápis de editar sai deste passo). Editar a escola fica
  em `/escolas`.
- Deep link `/gerar?aluno=<id>` continua escolhendo o aluno e a escola
  dele. Se essa escola não está na sessão, o passo não avança e a tela diz
  isso. Não alargar o RLS para "consertar".

### Fora de escopo

Spec 9 (vários alunos). Cota, prompt e modelo de arte.

### Aceite

- Conta com uma escola não vê o passo Escola e a geração sai com o
  `schoolId` dessa escola.
- Conta de plataforma com duas escolas vê o passo, com uma já marcada, e
  consegue trocar.
- Não existe ação "Sem escola".
- Aluno e escola da requisição são o mesmo `schoolId`.

---

## 9. Vários alunos no primeiro passo — análise, sem implementação

### Pedido

O passo 1 pode ser multisseleção, com "selecionar todos", para montar a
arte em massa. Analisar o requisito antes de fechar a spec.

### O que o código faz hoje

`/gerar` guarda um `student` e uma `photo`. `generate()` faz uma chamada.
A cota é diária por usuário (`consume_generation_quota`, saldo mostrado no
botão). Cada imagem de menor passa por `generationBlockers` e, no
compartilhamento, por `shareBlockers`. O resultado é um post, com selo de
IA aplicado antes de salvar. Não há fila de geração nem tela de lote de
arte. A spec de WhatsApp deixa "geração de artes em lote" fora de escopo
de propósito.

"Selecionar todos" numa escola de verdade são dezenas ou centenas de
chamadas de imagem, cada uma com foto de criança saindo para o modelo.

### Requisito que dá para afirmar

A pessoa quer produzir a mesma arte (mesmo modelo, mesmas cores, mesmas
instruções) para muitos alunos, sem repetir o assistente. "Todos" significa
todos os alunos elegíveis da escola ativa, não todos os alunos do banco.

Elegível, nesta leitura: tem foto, passa em `generationBlockers` (depois
da spec 2, menor com reconhecimento ligado e responsável cadastrado) e
cabe na cota que ainda resta. Quem não é elegível aparece na lista,
desmarcado e sem poder marcar, com o motivo numa linha.

### O que a massa não pode ser

- Um botão que dispara N gerações em paralelo no clique, sem teto e sem
  revisão. Estoura a cota, a fila do modelo e o custo, e manda foto de
  menor em rajada.
- Reusar a entrega de fotos do evento. Arte gerada e foto de evento são
  produtos diferentes, com cota e consentimento diferentes.
- "Selecionar todos" incluindo aluno sem foto ou sem a autorização da
  spec 2.

### Três desenhos

1. **Recomendado.** O passo 1 passa a aceitar vários alunos, com
   "Selecionar elegíveis". A confirmação mostra a conta: quantos vão,
   quantos ficam de fora e por quê, e quantas cotas serão consumidas.
   Um job por aluno, em série, com teto de 20 por ação. Dá para cancelar
   o que ainda não começou. Cada imagem nasce com o selo de IA e um post
   próprio. Falha de um não desfaz os outros; a tela lista o que falhou
   para tentar de novo. Acima de 20, a pessoa repete a ação. Não envia
   WhatsApp neste passo.
2. **Só a seleção, uma arte por vez.** Multisseleção vira uma fila visual
   e o botão gera o próximo aluno. Não é massa: é um atalho para não
   reescolher modelo. Mais simples, não atende "em massa".
3. **Fila de verdade, sem teto de 20.** Tabela de jobs, retoma, progresso
   global, o mesmo desenho de `photo_jobs`. É o desenho certo se a massa
   for promessa do piloto, e é grande demais para entrar junto com as
   outras specs. Depende de custo por aluno
   ([`estimativa-custos-por-aluno.md`](estimativa-custos-por-aluno.md)) e
   de um teto de produto explícito.

Esta spec não autoriza implementar nenhum dos três até a escolha. A
recomendação é a opção 1 porque entrega a massa que o pedido descreve e
segura cota, falha parcial e foto de menor sem abrir uma fila nova.

### Fora de escopo até a decisão

Migration, botão, alteração de `GenerationRequest`.

### Aceite (vale só se a opção 1 for a escolhida)

- "Selecionar elegíveis" marca só quem tem foto e passa na trava.
- A confirmação mostra quantidade, exclusões e cotas.
- A ação para em 20, em cota zero ou em cancelar.
- Cada arte salva tem selo de IA e o aluno certo.
- Um erro no meio deixa as artes já feitas na galeria e lista o restante.

### Conformidade

[OBSERVAR] Rajada de geração com foto de menor
Base: Lei 15.211/2025, arts. 6º e 7º, § 2º; Decreto 12.880/2026, art. 11
Risco: dezenas de imagens sintéticas de crianças numa ação, sem trava por aluno e sem o selo
Correção mínima: elegibilidade por aluno, teto, selo em cada arquivo, e a regra bloqueante de foto real continua valendo

---

## 10. Um dropdown com pesquisa

### Pedido

Padronizar todos os dropdowns num componente com pesquisa e autocomplete.

### Estado atual

Não existe combobox no design system. Os seletores são o `Select` do Radix,
em `artifacts/iaschool-ui`, sem campo de busca. O preview tem demo
(`src/preview/demos/select.tsx`) e registro no `registry.tsx`.

Ocorrências no app:

| Arquivo | O que escolhe | Lista cresce? |
| --- | --- | --- |
| `student-form-dialog.tsx` | Turma do aluno | Sim |
| `event-new.tsx` | Turma do evento | Sim |
| `class-form-dialog.tsx` | Ano letivo e série | Não (lista fixa) |
| `review-face-queue.tsx` | Aluno para corrigir um rosto | Sim |
| `app-shell.tsx` | Escola ativa | Só com 2+ escolas |
| `admin-logs.tsx` | Status e período | Não |

`DropdownMenu` (o menu de "Editar" da escola, por exemplo) não é seletor.
Fica como está.

### Comportamento alvo

Um componente `Combobox` em `@workspace/iaschool-ui`, e só ele. O app não
copia o markup.

Comportamento:

- Fecha e abre pelo teclado como o `Select` atual (Enter, Esc, setas).
- Campo de pesquisa dentro do painel, focado ao abrir, quando a lista tem
  mais de 7 itens. Com 7 ou menos, o campo não aparece: ano, série, status
  e período não ganham uma busca inútil. O componente é o mesmo.
- A pesquisa ignora maiúsculas e acentos ("3 ano" acha "3º ano").
- Lista vazia depois do filtro: "Nenhum resultado".
- Valor atual visível no gatilho. Sem valor: o placeholder de hoje.
- Opção especial ("Sem turma", "Toda a escola") continua no topo e não
  some quando o filtro não a contém, se for a única forma de limpar.
- Largura do painel acompanha o gatilho, com mínimo para o texto não
  cortar o nome do aluno.
- Toque: o campo de pesquisa não dispara zoom (fonte de 16px no input).

Trocar os seis pontos da tabela. Manter os `data-testid` atuais no gatilho,
para os testes que já apontam neles.

História nova em `artifacts/iaschool-ui/src/preview/demos/` e registro no
`registry.tsx`. Tokens só os que já existem. Sem cor nova.

### Fora de escopo

Autocomplete que cria valor (turma nova a partir do texto). Busca no
servidor. Menus de ação.

### Aceite

- Os seis seletores usam `Combobox`.
- Na revisão, digitar parte do nome do aluno filtra.
- Série e status não mostram campo de busca.
- Teclado percorre e escolhe sem mouse.
- História do design system abre e o `Select` antigo não é mais usado no
  app. O demo do `Select` pode ficar.
- Verificado no navegador: formulário do aluno, evento novo e fila de
  revisão, desktop e celular.

---

## 11. Enviar em massa depois de reconhecer e confirmar

### Pedido

Depois de criar o evento, subir as fotos, reconhecer os rostos e confirmar,
deve haver a opção de enviar em massa para os responsáveis dos alunos
autorizados daquele evento.

### Estado atual

O miolo do lote já está em `/eventos/:id/entregas`
(`event-deliveries.tsx`), marco W3, aplicado em 05/10/2026:

- Preflight por responsável, com motivo de bloqueio.
- "Criar lote" para os aptos, todos marcados por padrão, com como tirar
  alguém.
- Render com desfoque por destinatário.
- Aprovação do lote por `school_admin` ou `school_staff`, que enfileira o
  envio.
- O comentário da página diz que o envio em si é o W4.

A revisão (`/eventos/:id/revisao`) confirma rostos e avisa que a pasta do
aluno foi atualizada. Não aponta para entregas. O pedido é essa porta,
mais a garantia de que "enviar" chega no responsável autorizado.

Quem é apto hoje já é filtrado pelo preflight: aceite de `delivery_whatsapp`,
número verificado, fotos confirmadas. A spec 2 não afrouxa isso.

O envio real continua fechado: sem `WHATSAPP_MODE` as funções respondem
503; o modo `controlled_zapi` é uma escola, uma a quatro pessoas na
allowlist, teto diário, kill switch, e só material sintético ou de adulto.
Foto real de menor continua proibida. O comercial espera a Meta Cloud API
(spec de WhatsApp, §§9.5, 18.1 e 19).

### Comportamento alvo

Na revisão, quando não há mais rosto sugerido nem não atribuído pendente
de decisão (a fila daquele evento está vazia no que depende da pessoa),
a página mostra um bloco:

> Revisão deste evento concluída. Dá para preparar o envio aos
> responsáveis que autorizaram.

Botão: "Preparar envio". Leva a `/eventos/:id/entregas`. Não envia no
clique.

Se ainda há rosto sem decisão, o bloco não aparece. Não empurrar envio no
meio da revisão.

Na página de entregas, o rótulo da ação principal deixa claro o que ela
faz hoje: "Preparar lote" enquanto o W4 não envia de verdade, e "Enviar"
quando o provedor estiver no modo permitido e o lote aprovado. Não usar
"Enviar" num botão que só gera o derivado.

O lote continua um por responsável (não um por aluno), no máximo um lote
ativo por evento, só com fotos de rosto confirmado, outras crianças
desfocadas. Isso já é a spec de WhatsApp (R4, R5). Esta spec não reabre.

Aluno sem aceite, sem número verificado ou sem foto confirmada aparece na
lista como não apto, com o motivo que o preflight já devolve. Não entra
marcado.

### Regras

- Não criar segunda tela de envio.
- Não chamar o provedor a partir do navegador.
- Não marcar "enviado" em HTTP 200 do preparo. Os estados continuam os da
  spec de WhatsApp (na fila, aceita, enviada, entregue, lida, falhou).
- Allowlist, teto e kill switch do modo controlado continuam no servidor.
  A tela não ganha um jeito de contorná-los.
- Enquanto o W4 não estiver aceito no ambiente, o botão da revisão leva à
  preparação e a página diz que o envio ao WhatsApp ainda não está ligado.
  Não simular sucesso.

### Fora de escopo

Template novo de mensagem, portal do responsável, reenvio automático,
cobrança. Tudo isso segue a spec de WhatsApp.

### Aceite

- Evento com revisão ainda aberta não mostra "Preparar envio".
- Evento com a fila zerada mostra, e o link abre a página de entregas
  daquele evento.
- O preflight marca só responsáveis com aceite, número verificado e foto
  confirmada.
- Criar o lote não dispara WhatsApp enquanto `WHATSAPP_MODE` estiver
  ausente; a tela diz isso.
- Com o modo controlado ligado num ambiente de teste, o lote aprovado só
  alcança número da allowlist, e um ensaio não usa foto de criança.
- Teste de interface do bloco na revisão; o teste de integração do lote
  que já existe continua verde.

### Conformidade

[OBSERVAR] "Enviar em massa" não antecipa o canal
Base: Decreto 12.880/2026, art. 35; Lei 15.211/2025, arts. 6º, V e 7º, § 2º
Evidência: `event-deliveries.tsx` (W3 prepara; W4 não enviou) e a regra de `controlled_zapi` em `AGENTS.md`
Risco: foto de menor sair para número não verificado, ou a escola achar que o lote já foi entregue
Correção mínima: a porta de entrada desta spec, sem mudar o gate de envio

---

## 12. O que esta leva não muda

- Upload do evento continua atrás da declaração da escola.
- Embedding só com `biometric_sorting` ativo.
- Desfoque por destinatário, trilha `biometric_events`, expurgo.
- Cota diária de geração, selo de imagem sintética.
- OTP, allowlist, teto, kill switch e a Meta como destino comercial.
- Foto real de menor fora do produto enquanto
  [`pendencias-producao.md`](pendencias-producao.md) não fechar.

## 13. Migrations, funções e deploy

Nesta spec, escrita e não aplicada:

- Uma migration, só se a spec 1 for implementada: `students.whatsapp`
  passa a aceitar nulo. SQL de referência no mesmo commit. Aplicação pelo
  MCP `supabase-iaschool`, não pelo SQL Editor.
- Nenhuma Edge Function nova.
- Nenhum deploy.

As specs 2, 3, 5, 6, 8, 10 e 11 são aplicação e, na 6, leitura do fluxo de
Auth. A spec 9 não tem implementação até a escolha da §9.
