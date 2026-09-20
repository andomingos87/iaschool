# IASchool — Plano de pivotagem do sistema

**De:** app de geração de cards de desempenho para escolinha de futebol (R9 / IAsport)
**Para:** plataforma de gestão e distribuição de fotos escolares (educação infantil, fundamental e médio)
**Data:** 30/08/2026
**Escopo deste documento:** o que precisa mudar no sistema existente — comunicação, modelo de dados, funcionalidades e arquitetura.

---

## 1. Resumo executivo

O sistema atual é um gerador de **1 imagem por vez, para 1 aluno por vez**, com vocabulário de futebol. O produto novo é um **pipeline de massa**: sobe 2.000 fotos → reconhecimento facial separa por aluno → gera/envia em lote.

São três frentes de trabalho, em ordem de esforço:

| Frente | Esforço | O que é |
| --- | --- | --- |
| **A. Comunicação e nomenclatura** | Baixo (1–2 dias) | Trocar termos de futebol por termos de escola. Superficial, mas bloqueia qualquer demo. |
| **B. Modelo de dados e arquitetura** | Médio (1–2 semanas) | Remover entidades de futebol, criar Escola/Turma/Evento, corrigir multi-tenancy. |
| **C. Funcionalidades novas** | Alto (2–3 meses) | Upload em massa, reconhecimento facial, geração e envio em lote. **Não existe nada disso hoje.** |

> **Nota importante:** o núcleo das duas funcionalidades descritas na pivotagem (reconhecimento facial e processamento em lote) **não existe no código atual, nem parcialmente**. O sistema atual é um bom ponto de partida para cadastro, autenticação, conformidade ECA e geração unitária — mas o produto novo é majoritariamente construção nova, não renomeação.

---

## 2. Diagnóstico — o que existe hoje

### 2.1 Aproveitável quase sem mudança

| Módulo | Onde | Observação |
| --- | --- | --- |
| Autenticação + aprovação de cadastro | `src/hooks/use-auth.tsx`, `src/pages/login.tsx`, `signup.tsx`, `approvals.tsx` | Fluxo escola/aluno com aprovação pelo admin já pronto |
| Conformidade ECA Digital | `src/lib/eca.ts`, `supabase/eca-digital.sql` | Faixa etária, consentimento do responsável, verificação de WhatsApp, trilha de auditoria (`share_logs`) — **é o maior ativo do produto** |
| Marca d'água de IA | `src/lib/watermark.ts` | Obrigatória por lei, já implementada |
| Upload com compressão no cliente | `src/components/multi-upload.tsx`, `src/hooks/use-image-upload.ts` | Base para o upload em massa (mas hoje é dezenas, não milhares) |
| Lixeira 30 dias + expurgo | `contract.ts`, `supabase/setup.sql` | Retenção já modelada |
| Design system | `artifacts/iaschool-ui/` | Componentes ok; só a marca precisa mudar |
| Cota e rate limit de geração | `artifacts/api-server/src/lib/generation-quota.ts` | Reaproveitável, mas os limites precisam subir muito |

### 2.2 Herança direta do futebol (remover ou converter)

| Item | Onde |
| --- | --- |
| `POSITIONS` — 11 posições de futebol | `src/lib/constants.ts:4` |
| Entidade `Club` (brasão, uniformes, cores) | `src/lib/data/types.ts`, `supabase/setup.sql:105` |
| `Student.position`, `heightCm`, `weightKg` | `src/lib/data/types.ts`, `supabase/setup.sql:60-62` |
| Métricas esportivas pré-definidas (Gols, Dribles, Desarmes…) | `src/lib/data/mock/seed.ts:31`, `src/pages/metrics.tsx` |
| `plausibleMetricValue()` — gera nº de gols/assistências fake | `src/lib/constants.ts` |
| Prompt padrão: *"arte para uma escolinha de futebol"* | `src/lib/prompt-template.ts:11` |
| Blocos de prompt `{{#brasao}}`, `{{#uniforme}}`, `{{#logo_r9}}`, `{{#cores_clube}}` | `src/lib/prompt-template.ts` |
| Contexto de exemplo: *"R9 Osasco FC", "Atacante", "Gols: 12"* | `src/lib/prompt-template.ts:288` |
| Textos: "atleta", "escolinha", "seu primeiro atleta" | `students.tsx:578,605`, `dashboard.tsx:89`, `signup.tsx:229`, `student-area.tsx:143`, `generation-loader.tsx:7` |
| Comentários de código "R9 Escolinhas" | `api-server/src/routes/generation.ts:13`, `middlewares/supabase-auth.ts:13` |
| Nomes de pacote `r9-app` / `iasport` | `artifacts/iaschool-app/package.json`, `artifacts/iaschool-ui/package.json` |
| Buckets/policies `r9_storage_*` | `supabase/setup.sql:707+` |
| Chaves `r9:aux-prompt-prefill` | `src/lib/constants.ts` |

**Volume medido:** 184 ocorrências de `iasport`, 101 de `clube`, 100 de `r9`, 45 de `uniforme`, 50 de `brasão`, 8 de `escolinha`, 6 de `atleta`.

### 2.3 O que não existe

- Upload em massa (milhares de arquivos, fila, retomada, progresso)
- Reconhecimento facial / vetorização de rostos / agrupamento
- Conceito de **Evento** (Dia do Índio, Festa Junina, formatura)
- Conceito de **Turma**
- Pasta/álbum por aluno
- Geração em lote (1 arte → 200 alunos)
- Envio em lote para WhatsApp (hoje é `wa.me` manual, um a um)
- Fila de revisão de rostos não identificados
- Foto de referência do aluno (o "rosto cadastrado" para comparação)
- Multi-tenancy real de escola (ver §5)

---

## 3. Camada A — Comunicação e nomenclatura

### 3.1 De-para de vocabulário

| Hoje (futebol) | Novo (escola) |
| --- | --- |
| Atleta / jogador | Aluno / estudante |
| Escolinha | Escola |
| Clube | Escola (instituição) — **ver alerta abaixo** |
| Brasão do clube | Logo da escola |
| Uniforme | Uniforme escolar (opcional) ou remover |
| Posição (Goleiro, Atacante…) | Turma / Série / Ano |
| Métricas (Gols, Dribles) | Remover — não há métrica de desempenho |
| Card de desempenho | Arte do evento / Foto tratada |
| Técnico / treinador | Professor / coordenação |
| Gerar post | Criar arte / Preparar envio |
| Referência (post de Instagram) | Modelo de arte / Template do evento |

### 3.2 Alerta: colisão de nomes já introduzida

O sistema **já renomeou a entidade `Club` para "Escolas" na interface**, mas o banco continua `clubs` e o conceito de escola-instituição já existe em outro lugar (`profiles.school_name`, `profiles.school_id`). Hoje há **duas coisas chamadas "escola"**:

- `profiles` com `role = 'school_user'` → o tenant (quem loga)
- tabela `clubs`, exibida como "Escolas" → só identidade visual (logo + cores)

Isso vai gerar bug e confusão. **Decisão necessária antes de escrever código:** consolidar em uma entidade `schools` real (§5) e rebaixar `clubs` a um campo de branding dentro dela.

### 3.3 Público-alvo da comunicação

A interface hoje fala com "quem gerencia atletas". Precisa falar com três perfis:

| Perfil | Tom | O que precisa ver primeiro |
| --- | --- | --- |
| **Professor(a)** | Simples, sem jargão, poucos cliques | "Subir fotos do meu evento" e "Enviar para os pais" |
| **Coordenação / diretoria** | Controle e prova | Quantos pais receberam, o que falta autorizar, relatório |
| **Secretaria / funcionários** | Operacional | Cadastro de alunos, responsáveis, autorizações |
| **Responsável (pai/mãe)** | Confiança | O que autorizei, como revogo, minhas fotos |

**Ação:** revisar toda a copy de `dashboard.tsx`, `students.tsx`, `generate.tsx`, `signup.tsx`, `login.tsx` para linguagem escolar. Substituir "Gerar imagem" por algo orientado a tarefa ("Novo evento", "Enviar aos pais").

### 3.4 Marca e identidade

- Renomear pacote `@workspace/iaschool-ui` → `@workspace/iaschool` (184 ocorrências)
- Renomear `artifacts/iaschool-app` → `artifacts/iaschool-app`
- Revisar paleta: `#2563eb` / `#be123c` em `src/config/iaschool.ts` (herdada, não escolhida)
- `BrandLogo` já é neutro — ok
- Atualizar `AGENTS.md` e `README.md`, que ainda descrevem "o IAsport"
- Renomear policies e buckets `r9_storage_*`

---

## 4. Camada B — Modelo de dados

### 4.1 Remover

| Campo/tabela | Ação |
| --- | --- |
| `students.position` | Remover (ou converter em `class_id`) |
| `students.height_cm`, `weight_kg` | Remover |
| `clubs.uniforms` | Remover |
| `clubs.colors` | Manter só se houver branding de arte por escola |
| `metrics`, `metric_values`, `generated_posts.metrics` | Remover a entidade inteira |
| `POSITIONS`, `plausibleMetricValue()` | Remover |
| Blocos de prompt `brasao`, `uniforme`, `cores_clube`, `logo_r9` | Reescrever para tema de evento |

### 4.2 Criar

| Entidade | Campos essenciais | Por quê |
| --- | --- | --- |
| `schools` | id, nome, cnpj, logo, cores, plano | Tenant real; hoje é um `profile` |
| `classes` (turmas) | id, school_id, nome, ano_letivo, professor_id | Organizar alunos; filtro de envio em lote |
| `students.class_id` | FK | Substitui `position` |
| `events` | id, school_id, nome, data, tema, status | "Dia do Índio 2026" — agrupa upload, fotos e artes |
| `photos` | id, event_id, storage_path, hash, status_processamento | A foto **crua** subida (hoje as fotos moram num `jsonb` dentro de `students`) |
| `photo_faces` | id, photo_id, bbox, embedding, student_id, confiança, revisado_por | O resultado do reconhecimento facial; N faces por foto |
| `student_reference_faces` | id, student_id, embedding, foto_origem | O "rosto cadastrado" contra o qual comparar |
| `batch_jobs` | id, tipo, status, total, processados, erros | Fila de upload/processamento/geração/envio |
| `delivery_queue` | id, student_id, guardian_id, photo_id/post_id, canal, status, tentativas | Envio em lote com retry |
| `authorizations` | student_id, escopo (whatsapp / rede_social / interno), concedido_em, revogado_em | Hoje é um booleano só (`guardian.consentAt`) — precisa ser **por escopo** |

### 4.3 Mudança estrutural crítica: fotos

Hoje: `students.photos` é um `jsonb` dentro da linha do aluno.
Isso **não escala** para 2.000 fotos/evento e não modela "1 foto com 5 crianças aparece na pasta das 5".

Novo: tabela `photos` (a foto existe uma vez) + `photo_faces` (relação N:N foto↔aluno). A "pasta do aluno" vira uma **query**, não uma cópia de arquivo.

---

## 5. Camada C — Arquitetura e multi-tenancy

### 5.1 Problema atual

Todas as RLS do Supabase usam `owner_id = auth.uid()` (`supabase/setup.sql:546+`). Ou seja: **cada usuário tem sua própria ilha de alunos**.

Numa escola real com 8 professoras, cada uma veria só os alunos que ela cadastrou. Isso quebra o produto no primeiro cliente.

**Ação:** trocar `owner_id` por `school_id` em todas as políticas de `students`, `clubs`, `reference_posts`, `generated_posts` e nos buckets do Storage, com papéis dentro da escola (`diretor`, `coordenador`, `professor`, `secretaria`).

### 5.2 Papéis

Hoje: `super_admin | school_user | student`.
Novo mínimo:

```
super_admin        → plataforma
school_admin       → diretoria/mantenedora (vê tudo da escola, relatórios)
school_staff       → coordenação/secretaria (cadastro, autorizações)
teacher            → professor (sobe fotos da sua turma, envia)
guardian           → responsável (vê e autoriza as fotos do filho)  ← NOVO
student            → aluno (manter, mas é o perfil menos usado)
```

**`guardian` é um papel novo e necessário** — o produto promete "responsável revoga e o material sai do ar", o que exige que o responsável tenha acesso a algo.

### 5.3 Processamento assíncrono

Não existe hoje. O `api-server` é síncrono, request/response, com rate limit de 10 req/10min e cota diária de 50 gerações.

Necessário:

- **Fila** (Supabase Queues, Redis ou similar) para upload, reconhecimento e envio
- **Workers** separados do request HTTP — 2.000 fotos não cabem numa requisição
- **Progresso em tempo real** (Supabase Realtime, já usado no badge de aprovações)
- **Retomada** de upload interrompido
- **Idempotência** por hash de arquivo (a professora vai subir a mesma pasta duas vezes)
- Rever os limites: `MAX_IMAGES = 6` e `DAILY_MAX_REQUESTS = 50` (`api-server/src/routes/generation.ts`) são incompatíveis com lote

### 5.4 Storage

- Buckets por escola, com política de path (`school_id/event_id/...`)
- Originais + thumbnails (uma galeria de 2.000 fotos não carrega originais)
- Política de retenção por evento (custo)

---

## 6. Camada C — Funcionalidades novas

### 6.1 Funcionalidade 1 — Separar as fotos por aluno

| Etapa | O que construir | Estado |
| --- | --- | --- |
| Cadastro do rosto de referência | Foto do aluno na matrícula → gera embedding | ❌ Não existe |
| Upload em massa | Drag de pasta inteira, fila, progresso, retomada, dedup por hash | ⚠️ Existe upload simples |
| Detecção de faces | Serviço de detecção por foto (N faces) | ❌ |
| Vetorização + comparação | Embedding + busca vetorial (pgvector) contra os alunos da escola | ❌ |
| Atribuição | Foto ↔ aluno com score de confiança; foto com 5 crianças entra nas 5 | ❌ |
| Fila de revisão | Rostos abaixo do limiar → a escola confirma/corrige manualmente | ❌ |
| Visualização por aluno | "Pasta" do aluno = query em `photo_faces` | ❌ |

**Decisões pendentes:**

1. **Motor de reconhecimento** — API externa (AWS Rekognition, Azure Face) vs. modelo próprio (InsightFace + pgvector). Impacta custo, latência e — principalmente — onde o dado biométrico de menor vai parar.
2. **Onde ficam os embeddings** — dado biométrico de criança é dado pessoal sensível (LGPD art. 11 + Lei 15.211). A apresentação promete: *"dado biométrico usado só para separar as fotos, nunca para perfil ou publicidade"*. Isso precisa ser **arquitetura**, não política: embedding no banco da escola, isolado, com prazo de expurgo.
3. **Limiar de confiança** — errar identificando a criança errada é pior do que mandar para revisão. Começar conservador.

### 6.2 Funcionalidade 2 — Criar e enviar em lote

| Etapa | O que construir | Estado |
| --- | --- | --- |
| Templates de evento | Biblioteca de artes temáticas (Dia do Índio, Festa Junina, formatura) | ⚠️ Existe `reference_posts` (referência de estilo), precisa virar template reutilizável |
| Geração em lote | 1 template × N alunos → N imagens, com fila e progresso | ❌ Hoje é 1 por vez |
| Envio de foto crua | Selecionar fotos do aluno → enviar ao responsável | ❌ |
| Envio em lote via WhatsApp | Integração real com WhatsApp Business API | ❌ Hoje é link `wa.me` manual, um a um |
| Publicação em rede social | Fila de aprovação + export com autorização verificada | ❌ |
| Trava de autorização por escopo | Bloquear envio/publicação conforme o que o responsável autorizou | ⚠️ Existe trava binária, falta o escopo |

**Decisão pendente:** WhatsApp Business API (Meta) é o único caminho para envio em massa legítimo. Implica: conta business verificada, templates de mensagem aprovados pela Meta, custo por conversa, janela de 24h. **É um projeto próprio, não uma integração de uma semana.**

---

## 7. Conformidade ECA Digital nos fluxos novos

O que já existe (`src/lib/eca.ts`) é sólido e deve ser **estendido**, não reescrito. Mas cada funcionalidade nova abre uma frente de conformidade:

| Fluxo novo | Exigência | Estado |
| --- | --- | --- |
| Embedding facial de menor | Dado biométrico sensível — finalidade única, isolamento, expurgo, base legal registrada | ❌ A construir |
| Foto com 5 crianças | Se 1 dos 5 responsáveis não autorizou, a foto **não pode** ser publicada / precisa de recorte ou desfoque | ❌ Regra não existe |
| Envio em lote | Cada envio individual precisa entrar em `share_logs` (já existe a tabela) | ⚠️ Adaptar ao lote |
| Publicação em rede social | Escopo de autorização distinto de WhatsApp | ⚠️ Autorização hoje é binária |
| Revogação | Responsável revoga → material sai do ar, inclusive o já gerado | ❌ Não implementado |
| Retenção | Prazo de guarda das fotos de menores por evento | ⚠️ Existe lixeira 30 dias, falta política de evento |
| Portal do responsável | Ver, autorizar, revogar, baixar | ❌ Papel `guardian` não existe |

> A regra da **foto com múltiplas crianças** é o ponto mais delicado do produto e não tem solução no código atual. Precisa de decisão de produto antes de decisão técnica.

---

## 8. Roadmap sugerido

### Fase 0 — Descontaminação ✅ **CONCLUÍDA (30/08/2026)**
Vocabulário, entidades de futebol, prompt padrão, marca e nomes de pacote.
Ver [Anexo A](#anexo-a--o-que-a-fase-0-entregou).

### Fase 1 — Fundação escolar (2–3 semanas)
`schools`, `classes`, `events`, papéis novos, RLS por escola em vez de por usuário, importação de lista de alunos e responsáveis (CSV).

### Fase 2 — Upload em massa (3–4 semanas)
Tabela `photos`, fila, workers, progresso em tempo real, dedup, thumbnails, galeria de evento.

### Fase 3 — Reconhecimento facial (4–6 semanas)
Rosto de referência, detecção, embeddings, pgvector, atribuição, fila de revisão manual, "pasta do aluno". **Maior risco técnico e de conformidade.**

### Fase 4 — Autorização granular + portal do responsável (2–3 semanas)
Escopos de autorização, revogação com efeito retroativo, papel `guardian`.

### Fase 5 — Criação e envio em lote (4–6 semanas)
Templates de evento, geração em lote, WhatsApp Business API, publicação com trava de autorização.

---

## 9. Decisões que precisam ser tomadas antes de codar

1. **Motor de reconhecimento facial** — externo (rápido, caro, dado sai) vs. próprio (lento, controlado, dado fica)
2. **`clubs` vira `schools` ou coexistem?** — hoje há colisão de nome
3. **Foto com múltiplas crianças sem autorização de todas** — bloquear a foto inteira, desfocar quem não autorizou, ou só permitir envio individual?
4. **WhatsApp** — Business API oficial (custo por mensagem, meses de setup) vs. manter link manual no MVP
5. **Métricas** — remover de vez, ou reaproveitar o conceito para algo escolar (presença, participação)? Recomendação: **remover** — não há demanda na descrição da pivotagem
6. **Perfil `student`** — o produto novo é para professores e pais; o aluno menor de 16 não deveria ter conta própria. Considerar remover ou restringir muito

---

## 10. Estimativa consolidada

| Fase | Prazo | Risco |
| --- | --- | --- |
| 0 — Descontaminação | ✅ concluída | — |
| 1 — Fundação escolar | 2–3 semanas | Baixo |
| 2 — Upload em massa | 3–4 semanas | Médio |
| 3 — Reconhecimento facial | 4–6 semanas | **Alto** |
| 4 — Autorização + portal | 2–3 semanas | Médio |
| 5 — Lote e WhatsApp | 4–6 semanas | **Alto** (dependência da Meta) |
| **Restante** | **4–5 meses** | — |

**MVP demonstrável para piloto em 1 escola:** Fases 0 + 1 + 2 + 3 simplificada (reconhecimento com revisão manual obrigatória) ≈ **2,5 a 3 meses**.


---

## Anexo A — O que a Fase 0 entregou

Executada em 30/08/2026. Typecheck, build e 84 testes unitários passando.

### Entidades removidas

| Removido | Onde |
| --- | --- |
| `POSITIONS` (11 posições) + `plausibleMetricValue()` | `lib/constants.ts` |
| `Student.position`, `heightCm`, `weightKg` | tipo, form, listagem, detalhe, área do aluno, SQL |
| Entidade `Metric` / `MetricValue` inteira | tipos, contrato, mock, Supabase, hooks, página `/metricas`, rota, menu, SQL, RLS, seed |
| `Club.uniforms` + passo "Uniforme" do wizard | tipo, dialog, wizard, geração, SQL |
| `GeneratedPost.metrics` | tipo, repositórios, SQL |

### Renomeações de domínio

| Antes | Depois |
| --- | --- |
| `Club` / `ClubRepository` / `useClubs` | `SchoolBrand` / `SchoolBrandRepository` / `useSchoolBrands` |
| `Student.clubId` | `Student.schoolBrandId` |
| `showClubLogo` | `showSchoolLogo` |
| `includeR9Logo` | *removido* |
| `pages/clubs.tsx` | `pages/school-brands.tsx` ("Identidade da escola") |
| `components/club-form-dialog.tsx` | `components/school-brand-form-dialog.tsx` |
| Chaves `r9app:` / `r9:` no localStorage | `iaschool:` |

> A tabela do banco continua `clubs` de propósito — a consolidação numa entidade
> `schools` real é decisão da Fase 1 (§9, item 2). O código agora nomeia a
> entidade pelo que ela de fato é hoje: identidade visual da escola.

### Prompt de geração

Placeholders e blocos reescritos:

| Antes | Depois |
| --- | --- |
| `{{posicao}}`, `{{metricas}}` | *removidos* |
| `{{nome_clube}}`, `{{cores_clube}}` | `{{nome_escola}}`, `{{cores_escola}}` |
| `{{#brasao}}`, `{{#uniforme}}` | `{{#logo_escola}}` |
| `{{#logo_r9}}` | *removido* |

Template padrão: *"arte de post para redes sociais de uma escola (…) ambiente
escolar, tom acolhedor e adequado a crianças e adolescentes"* — no lugar de
*"arte de post de Instagram para uma escolinha de futebol"*.

### Wizard de geração: 7 → 4 passos

`Aluno → Escola → Logo da escola → Modelo de arte`
(removidos "Uniforme", "Métricas" e "Logo IAschool"; as instruções livres
viraram **"Tema do evento e instruções"** e migraram para o último passo).

O selo da plataforma foi removido por completo — não é nem opcional: saíram o
passo do wizard, o campo `includePlatformLogo`, o bloco `{{#logo_plataforma}}`
do prompt, o envio do arquivo à OpenAI e os PNGs em `public/`.

### Comunicação

| Antes | Depois |
| --- | --- |
| "Gerar imagem" | "Criar arte" |
| "Referências" | "Modelos de arte" |
| "Posts gerados" / "Posts recentes" | "Artes geradas" / "Artes recentes" |
| "Cadastre e gerencie os atletas da escolinha" | "Cadastre e gerencie os alunos da escola" |
| "Visão geral da sua escolinha" | "Visão geral da sua escola" |
| Obs. do aluno: "Pé dominante, características, evolução…" | "Turma, série, observações da coordenação…" |
| Loader: "Recortando a foto do atleta…" | "Recortando a foto do aluno…" |
| Cadastro: "gero posts da minha escolinha" | "crio artes da minha escola" |

### Marca e estrutura

- `artifacts/r9-app` → `artifacts/iaschool-app` (`@workspace/iaschool-app`)
- `artifacts/iasport` → `artifacts/iaschool-ui` (`@workspace/iaschool-ui`)
- `public/iasport-logo-*.png` → `iaschool-logo-*.png`
- `scripts/replit-compat/smoke-r9-app.mjs` → `smoke-web-app.mjs`
- Policies de Storage `r9_storage_*` → `iaschool_storage_*`
- Templates de e-mail: marca "R9 Escolinhas" → IAschool; verde neon `#39ff14` → azul `#2563eb`
- `README.md`, `AGENTS.md`, `SUPABASE.md`, `.claude/launch.json`, workflow do GitHub

### Banco

- `supabase/setup.sql` — limpo (bases novas já nascem sem o domínio de futebol)
- **`supabase/pivot-fase0.sql`** — migration nova para bases existentes.
  ⚠️ Apaga dados (posição, altura, peso, uniformes, métricas). **Ainda não foi
  executada em nenhum ambiente.**

### Deixado de propósito

| Item | Por quê |
| --- | --- |
| `fly.toml` → `app = "iasport-image-api-r9"` | Nome de app já provisionado na Fly; renomear aponta para um app inexistente |
| `LOGS_ADMIN_EMAIL = "iasport@..."` | E-mail real que controla o acesso a `/admin/logs`; trocar bloqueia o admin |
| `IASPORT_TEST_EMAIL` / `IASPORT_TEST_PASSWORD` (AGENTS.md) | Variáveis de ambiente locais da máquina do dev |
| Tabela `clubs` no banco | Decisão da Fase 1 (§9, item 2) |


---

## Anexo B — Geração de imagens estava quebrada (30/08/2026)

Investigado após a Fase 0. **Não é regressão da pivotagem** — é anterior.

Na manhã de 30/08/2026 o projeto Supabase apontado pelo app não existia mais
(NXDOMAIN) e o backend na Fly respondia `503 supabase_unavailable`. **Esse
problema foi superado no mesmo dia**: o banco foi provisionado do zero em 7
migrations via MCP (ver `artifacts/iaschool-app/SUPABASE.md`).

Ficaram sem verificação dois problemas de código apontados no mesmo
diagnóstico: o modo demonstração chamar o backend real sem token, e o erro
real chegar ao usuário mascarado como falha de rede (a resposta é enviada antes
de o corpo do upload ser lido). Estão como item de higiene da Fase 0 em
[`BACKLOG.md`](../BACKLOG.md).

Diagnóstico completo, com as evidências: [`diagnostico-geracao-imagens.md`](./diagnostico-geracao-imagens.md).
