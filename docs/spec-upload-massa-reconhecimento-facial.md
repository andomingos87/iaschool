# Spec — Upload em massa e organização de fotos por reconhecimento facial

**Fases cobertas:** 2 (Upload em massa) e 3 (Reconhecimento facial) do
[`docs/pivotagem-iaschool.md`](pivotagem-iaschool.md), mais o subconjunto da
Fase 1 sem o qual as duas não podem ser construídas.
**Data:** 31/08/2026 · **§4 e §13 revisadas em 16/09/2026**
**Estado do documento:** aprovada — as decisões da §3 foram respondidas em
31/08/2026 (§16), D1/D5 confirmadas pelo spike M0, e as decisões de modelo do
M1 (#2, #3, #5 a #8 do backlog) fechadas em 16/09/2026, reescrevendo a §4.
Acompanhamento por marco em [`BACKLOG.md`](../BACKLOG.md).

---

## 1. Objetivo

Permitir que uma escola suba as fotos de um evento (ordem de 2.000 arquivos),
que o sistema detecte os rostos, sugira a qual aluno cada rosto pertence e
apresente uma **pasta por aluno** — com revisão humana obrigatória antes de
qualquer material chegar a um responsável.

### 1.1 Resultado observável ao fim da implementação

| # | Resultado |
| --- | --- |
| R1 | Professor cria um **evento**, arrasta uma pasta com 2.000 fotos e vê progresso em tempo real, com retomada após queda de rede |
| R2 | Arquivo repetido não vira foto duplicada (dedup por hash) |
| R3 | Cada foto tem miniatura; a galeria do evento abre em menos de 2 s |
| R4 | Cada aluno com rosto de referência cadastrado tem uma "pasta" com as fotos em que aparece |
| R5 | Rostos abaixo do limiar caem numa **fila de revisão**; a escola confirma ou corrige |
| R6 | Uma foto com 5 crianças aparece na pasta das 5, sem cópia de arquivo |
| R7 | Nenhuma atribuição automática é considerada final sem confirmação humana |
| R8 | Nenhum dado biométrico de aluno sai do perímetro do projeto |

### 1.2 Fora de escopo

Geração de arte em lote, envio por WhatsApp, publicação em rede social, portal
do responsável e revogação com efeito retroativo. São Fases 4 e 5. Esta spec
apenas **deixa os ganchos** (`authorizations`, escopos) prontos.

---

## 2. Estado atual verificado

Conferido em 31/08/2026 no repositório e no projeto Supabase `jtyyauivokutperouqyh`.

| Item | Estado |
| --- | --- |
| Tabelas existentes | `profiles`, `students`, `clubs`, `reference_posts`, `generated_posts`, `prompt_settings`, `prompt_template_versions`, `generation_usage`, `generation_logs`, `guardian_verification_codes`, `share_logs` |
| `schools`, `classes`, `events`, `photos`, `photo_faces` | **não existem** |
| Fotos hoje | `students.photos jsonb` — não escala e não modela N:N foto↔aluno |
| RLS | por `owner_id = auth.uid()` — cada usuário é uma ilha; quebra com 8 professoras na mesma escola |
| Buckets | `students`, `clubs`, `references`, `generated`, `generation-logs` |
| Extensão `vector` | disponível (0.8.2), **não instalada** |
| `pg_cron`, `pg_net`, `pgmq` | disponíveis, não instaladas |
| Upload atual | `src/components/multi-upload.tsx` (156 linhas) + `src/hooks/use-image-upload.ts` — laço sequencial, sem fila, sem progresso por arquivo, sem retomada, comprime para 1600px / 0,8 MB |
| Processamento assíncrono | não existe; `api-server` é request/response |
| Reconhecimento facial | nenhuma ocorrência de face/embedding/pgvector no repositório |

---

## 3. Decisões de projeto

Cada decisão traz o motivo. Todas foram aprovadas em 31/08/2026; as marcadas
com ✅ passaram ainda pela verificação do spike M0.

### D1 ✅ — Motor de reconhecimento: InsightFace self-hosted

> **Confirmada em 31/08/2026** pelo spike M0. Todas as metas de §11.1 e §12.2
> foram atingidas em CPU comum. Ver [`docs/spike-reconhecimento-facial.md`](spike-reconhecimento-facial.md).

| Opção | Custo | Latência | Onde fica o dado biométrico do menor |
| --- | --- | --- | --- |
| **InsightFace (buffalo_l) + pgvector** ✅ | infra do worker (~US$ 15–40/mês) | ~200–400 ms/foto em CPU | dentro do Supabase do projeto |
| AWS Rekognition / Azure Face | ~US$ 1 por 1.000 imagens + armazenamento de coleção | ~150 ms | **sai para os EUA**, em coleção biométrica de terceiro |

Recomendação: **InsightFace**, modelo `buffalo_l` (detector SCRFD + ArcFace
512-d), via `onnxruntime`, em contêiner próprio.

Motivo: a apresentação do produto promete que o dado biométrico serve só para
separar fotos e não sai do perímetro. Com Rekognition isso vira transferência
internacional de dado pessoal sensível de criança (LGPD arts. 11, 14 e 33) —
defensável no papel, caro de sustentar num questionamento da ANPD. O ganho de
tempo de implementação (~1 semana) não paga o passivo.

Custo do "não": se a decisão for API externa, esta spec muda em §5.3, §7 e §9
inteiras.

### D2 — Fila: tabela `photo_jobs` com `FOR UPDATE SKIP LOCKED`

Não usar `pgmq` nem Redis no MVP. O progresso precisa ser **consultável e sob
RLS** (a professora vê o andamento do evento dela) e **assinável por Realtime**,
que já é usado no badge de aprovações. Uma fila em tabela é a mesma fonte de
verdade do progresso; `pgmq` exigiria reconciliar dois estados.

Reavaliar se passar de ~50.000 jobs/dia.

### D3 — Resolução de upload: 2560px de lado maior, JPEG q85

O upload atual comprime para 1600px, o que degrada rostos pequenos em foto de
turma. 2560px mantém rosto útil (≥ 80px) mesmo em plano aberto e reduz um JPEG
de 5 MB para ~700 KB — 2.000 fotos ≈ 1,4 GB por evento em vez de 10 GB.

O original **não é guardado por padrão**. Flag `events.keep_originals` para
quem quiser, com aviso de custo.

### D4 — Miniaturas geradas pelo worker (`sharp`), 320px WebP

Alternativa descartada: transformação de imagem do Supabase Storage — depende
de plano pago e cobra por transformação.

### D5 ✅ — Embedding só é persistido para aluno com consentimento

Ver §9.3. O rosto detectado é vetorizado em memória para comparação, mas só
vira linha em `photo_faces.embedding` quando corresponde a um aluno cujo
responsável autorizou o escopo `biometric_sorting`. Rosto sem correspondência
guarda apenas caixa delimitadora e recorte para revisão humana — não entra na
base biométrica.

### D6 — Revisão humana obrigatória no MVP

Nenhum estado `confirmed` sem `reviewed_by`. Atribuição automática produz
`suggested`, nunca `confirmed`. Além de reduzir o risco de entregar a foto da
criança errada, sustenta o direito de revisão de decisão automatizada
(LGPD art. 20).

### D7 — Isolamento por escola em todas as buscas vetoriais

O filtro `school_id` é aplicado **dentro** da função de busca, com `security
definer`, não na aplicação. Rosto de aluno de uma escola nunca é comparado com
referência de outra.

---

## 4. Pré-requisito: Fase 1 mínima

`photos` precisa de `event_id`; `event_id` precisa de `school_id`; e a RLS por
`owner_id` precisa morrer antes, senão tudo o que for escrito aqui é refeito.

> **Escopo revisado em 16/09/2026.** As decisões #2, #3 e #5 a #8 de
> [`BACKLOG.md`](../BACKLOG.md) foram fechadas nesta data e reescreveram esta
> seção: `schools` absorve `clubs`, o responsável vira tabela própria, a série
> vira coluna de `classes`, `profiles.role` passa a papel global, o autocadastro
> de aluno é aposentado e `active_school_id()` deixa de existir. O modelo válido
> é o daqui para baixo; o anterior está no histórico do Git.

Escopo mínimo (não é a Fase 1 inteira — ficam de fora importação CSV, papel
`guardian` e portal do responsável).

### 4.1 Tenant real e papéis

`schools` **absorve `clubs`** (decisão #3): a identidade visual da escola passa
a ser coluna do tenant em vez de entidade à parte. A tabela `clubs` só é
removida depois de um ciclo com `schools` estável — isso é Fase 1 completa, não
M1.

```sql
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cnpj        text unique,
  address     jsonb,
  contact     jsonb,                                 -- telefone, e-mail, responsável institucional
  logo        jsonb,                                 -- herdado de clubs.logo
  colors      jsonb not null default '[]'::jsonb,    -- herdado de clubs.colors
  plan        text not null default 'pilot',
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.school_members (
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('school_admin','school_staff','teacher')),
  created_at  timestamptz not null default now(),
  primary key (school_id, user_id)
);
```

`profiles.role` deixa de ser vínculo e passa a ser **papel global da
plataforma** (decisão #5). O vínculo com escola existe só em `school_members`,
o que é o que permite a mesma pessoa administrar mais de uma escola:

```sql
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('dev','super_admin','user'));
```

| Papel | O que é | O que vê |
| --- | --- | --- |
| `dev` | manutenção da plataforma | tudo do `super_admin` + `face_recognition_settings`, `prompt_settings`, expurgo manual e logs técnicos |
| `super_admin` | operação do produto | todas as escolas, aprovações, suporte |
| `user` | qualquer pessoa da escola | só as escolas em que é membro, no papel de `school_members` |

`is_super_admin()` passa a valer para `dev` **e** `super_admin`; `is_dev()`
nasce aqui para as telas de manutenção. O papel `guardian` da Fase 4 entra
depois como quarto valor deste `check` — estender a constraint é barato, e é
por isso que `guardians.user_id` (§4.3) já existe desde o M1.

### 4.2 Turmas

Sala é a linha; série é coluna (decisão #6). Uma tabela `grades` por escola foi
descartada: a lista é fixa no país e a escola não a edita.

```sql
create table public.classes (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  school_year  int  not null,                 -- ano letivo: 2026
  grade        text not null,                 -- EI, 1EF..9EF, 1EM..3EM (lista fixa no app)
  name         text not null,                 -- "A", "B", "Manhã"
  teacher_id   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (school_id, school_year, grade, name)
);
```

### 4.3 Responsáveis

O responsável vira tabela (decisão #7) e deixa de ser `students.guardian`
(jsonb). Dois motivos: irmãos compartilham o mesmo responsável, e a verificação
de WhatsApp passa a ser **por número**, não por aluno — verificar de novo o
mesmo telefone a cada filho é atrito sem ganho de prova.

```sql
create table public.guardians (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete cascade,
  name                 text not null,
  whatsapp             text not null,                 -- E.164
  relationship         text,                          -- mãe, pai, avó, responsável legal
  whatsapp_verified_at timestamptz,
  -- Reservado para o portal do responsável (Fase 4). Nulo no M1.
  user_id              uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (school_id, whatsapp)
);
```

O número é único **por escola**, não global: a mesma pessoa com filhos em duas
escolas é duas linhas, porque o dado pertence a cada tenant e a RLS é por
`school_id`.

### 4.4 Alunos

```sql
alter table public.students add column if not exists school_id           uuid references public.schools (id) on delete cascade;
alter table public.students add column if not exists class_id            uuid references public.classes (id) on delete set null;
alter table public.students add column if not exists enrollment_number   text;
alter table public.students add column if not exists primary_guardian_id uuid references public.guardians (id) on delete set null;

create index if not exists students_school_idx   on public.students (school_id) where deleted_at is null;
create index if not exists students_class_idx    on public.students (class_id)  where deleted_at is null;
create index if not exists students_guardian_idx on public.students (primary_guardian_id);
create unique index if not exists students_enrollment_idx
  on public.students (school_id, enrollment_number)
  where deleted_at is null and enrollment_number is not null;
```

`enrollment_number` é a chave de casamento da importação CSV (Fase 1 completa).
Nulo é aceito — escola que não usa matrícula não fica travada —, mas quando
preenchido é único na escola.

### 4.5 Evento

```sql
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools (id) on delete cascade,
  class_id              uuid references public.classes (id) on delete set null,
  name                  text not null,
  event_date            date not null,
  status                text not null default 'draft'
                        check (status in ('draft','uploading','processing','review','ready','archived')),
  keep_originals        boolean not null default false,
  photo_retention_until date,
  -- Declaração da escola de que possui autorização de uso de imagem dos
  -- alunos presentes. Sem isso o upload não abre (ver §9.2).
  image_rights_declared_at timestamptz,
  image_rights_declared_by uuid references auth.users (id),
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index events_school_idx on public.events (school_id, event_date desc) where deleted_at is null;
```

### 4.6 Helpers de autorização

```sql
create or replace function public.is_member_of(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_members
    where user_id = auth.uid() and school_id = p_school
  );
$$;

create or replace function public.is_dev()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dev' and approval_status = 'approved'
  );
$$;
```

`is_member_of` é deliberadamente **puro**: não embute `is_super_admin()`. Cada
policy escreve `is_member_of(school_id) or is_super_admin()`, para que o
privilégio de plataforma apareça no texto da policy em vez de ficar escondido
dentro do helper.

> **Não criar `active_school_id()`.** A versão anterior desta spec propunha
> `select school_id from school_members where user_id = auth.uid() limit 1`.
> Com admin de rede — membro de várias escolas — o `limit 1` devolve uma escola
> arbitrária e a RLS passa a depender da ordem de leitura do Postgres. A escola
> "atual" é escolha de interface (um seletor no topo); a RLS é sempre
> `is_member_of(school_id)`.

> **Colisão de nomes:** já existe `public.my_school_id()`, que devolve o `id` do
> *perfil* da escola de um aluno (herança do modelo antigo). Não reaproveite —
> ela morre junto com o autocadastro de aluno (§4.7, item 7).

### 4.7 Migração de `owner_id` para `school_id`

1. Uma `schools` por `profile` com `role = 'school_user'` (`name` =
   `school_name`), já com `logo` e `colors` copiados da `clubs` correspondente.
2. `school_members` recebe esse usuário como `school_admin`.
3. `students.school_id` ← escola do `owner_id`.
4. `students.guardian` (jsonb) → linha em `guardians`, deduplicando por
   `(school_id, whatsapp)`; `students.primary_guardian_id` aponta para ela e
   `guardian->>'whatsappVerifiedAt'` vira `guardians.whatsapp_verified_at`. O
   jsonb permanece na tabela como origem até o fim do M4, sem leitura nova.
5. `profiles.role`: `school_user` → `user`; `super_admin` mantido; `student`
   ver item 7.
6. Trocar as policies de `students`, `reference_posts`, `generated_posts` e dos
   buckets de `owner_id = auth.uid()` para
   `is_member_of(school_id) or is_super_admin()`. `owner_id` permanece como
   coluna de auditoria (quem cadastrou), sem uso em RLS.
7. Aposentar o autocadastro de aluno (decisão #2): menor de 16 não tem conta
   própria (Lei 15.211/2025, art. 24). Saem `role = 'student'`,
   `list_approved_schools()`, `my_school_id()`, `profiles.school_id`,
   `profiles.student_record_id`, a tela `student-area.tsx` e o ramo de aluno de
   `signup.tsx`. O aluno passa a ser só registro em `students`. A constraint de
   `profiles` que exige responsável autorizado para conta de criança perde o
   objeto e sai junto — revisar `src/lib/eca.ts` no mesmo passo.
8. **Refazer o OTP do responsável no novo modelo.** Hoje
   `guardian_verification_codes` é chaveada por `student_id`,
   `confirm_guardian_code` autoriza por `owner_id = auth.uid()` e escreve em
   `students.guardian`
   ([`supabase/eca-digital.sql`](../artifacts/iaschool-app/supabase/eca-digital.sql)),
   e a edge function `send-guardian-code` segue a mesma chave. Os três passam a
   operar sobre `guardian_id`, com autorização por
   `is_member_of(guardians.school_id) or is_super_admin()`, e a confirmação
   grava `guardians.whatsapp_verified_at`. `tests/guardian-verification.integration.test.ts`
   (7 testes) acompanha. **Esta é a parte mais subestimada do M1** — sem ela a
   migração quebra o único fluxo de conformidade que já está no ar.

Ensaiar a migração inteira numa branch do Supabase, com
`tests/rls.integration.test.ts` estendido (membro de A não lê B; admin de A e B
lê as duas; `user` sem vínculo não lê nada), antes do merge.

A migration é `iaschool_fase1_schools_members_classes`, aplicada via
`apply_migration` do MCP — o schema deste projeto muda por migration, nunca pelo
SQL Editor. O SQL de referência correspondente
(`artifacts/iaschool-app/supabase/fase1-min-schools-events.sql`) **ainda não
existe**: nasce no mesmo commit da migration.

---

## 5. Modelo de dados — Fases 2 e 3

### 5.1 Fotos

```sql
create table public.photos (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  storage_path      text not null,          -- bucket event-photos
  thumb_path        text,                   -- bucket event-thumbs
  content_hash      text not null,          -- sha-256 do arquivo enviado
  original_filename text not null,
  bytes             int  not null,
  width             int,
  height            int,
  taken_at          timestamptz,            -- EXIF DateTimeOriginal, quando houver
  status            text not null default 'pending'
                    check (status in ('pending','processing','processed','failed')),
  faces_count       int,
  error             text,
  uploaded_by       uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (event_id, content_hash)           -- dedup (R2)
);
create index photos_event_idx on public.photos (event_id, created_at) where deleted_at is null;
create index photos_status_idx on public.photos (status) where status in ('pending','processing');
```

`unique (event_id, content_hash)` é o que torna o upload **idempotente**: a
professora pode arrastar a mesma pasta duas vezes; o segundo insert falha com
conflito e o cliente conta como "já enviada".

### 5.2 Fila

```sql
create table public.batch_jobs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  event_id    uuid references public.events (id) on delete cascade,
  kind        text not null check (kind in ('ingest','recognize','reference')),
  status      text not null default 'queued'
              check (status in ('queued','running','done','failed','cancelled')),
  total       int not null default 0,
  processed   int not null default 0,
  failed      int not null default 0,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table public.photo_jobs (
  id           bigint generated always as identity primary key,
  batch_id     uuid not null references public.batch_jobs (id) on delete cascade,
  photo_id     uuid not null references public.photos (id) on delete cascade,
  kind         text not null,
  status       text not null default 'queued'
               check (status in ('queued','leased','done','failed')),
  attempts     int not null default 0,
  leased_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index photo_jobs_claim_idx on public.photo_jobs (kind, status, id)
  where status in ('queued','leased');
```

Reserva de lote pelo worker, sem corrida entre réplicas:

```sql
create or replace function public.claim_photo_jobs(
  p_kind text, p_limit int, p_lease_seconds int
) returns setof public.photo_jobs
language sql security definer set search_path = public as $$
  with c as (
    select id from public.photo_jobs
    where kind = p_kind
      and (status = 'queued' or (status = 'leased' and leased_until < now()))
      and attempts < 5
    order by id
    limit p_limit
    for update skip locked
  )
  update public.photo_jobs j
     set status = 'leased',
         attempts = j.attempts + 1,
         leased_until = now() + make_interval(secs => p_lease_seconds)
    from c where j.id = c.id
  returning j.*;
$$;
revoke all on function public.claim_photo_jobs(text,int,int) from public, authenticated, anon;
grant execute on function public.claim_photo_jobs(text,int,int) to service_role;
```

Job que estoura 5 tentativas fica `failed` com `last_error` e aparece na tela
do evento como "N fotos não processadas — tentar de novo".

### 5.3 Biometria

> Ordem de criação: `authorizations` (§5.4) precisa existir antes desta seção —
> `student_reference_faces.authorization_id` aponta para ela.

```sql
create extension if not exists vector with schema extensions;

-- Rosto de referência do aluno (a base contra a qual se compara).
create table public.student_reference_faces (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  embedding         extensions.vector(512) not null,
  source_photo_path text,                  -- recorte guardado p/ re-embedding
  quality           real,
  authorization_id  uuid not null references public.authorizations (id),
  retention_until   date not null,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now()
);
create index srf_vec_idx on public.student_reference_faces
  using hnsw (embedding extensions.vector_cosine_ops);
create index srf_student_idx on public.student_reference_faces (school_id, student_id);

-- Rostos detectados nas fotos do evento.
create table public.photo_faces (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete cascade,
  photo_id             uuid not null references public.photos (id) on delete cascade,
  bbox                 jsonb not null,     -- {x,y,w,h} em px da imagem processada
  crop_path            text,               -- recorte p/ a fila de revisão
  det_score            real not null,
  quality              real,
  -- Nulo quando o rosto não corresponde a aluno consentido (ver D5).
  embedding            extensions.vector(512),
  student_id           uuid references public.students (id) on delete set null,
  match_score          real,
  runner_up_student_id uuid references public.students (id) on delete set null,
  runner_up_score      real,
  state                text not null default 'unassigned'
                       check (state in ('unassigned','suggested','confirmed','rejected','not_a_student')),
  reviewed_by          uuid references auth.users (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index pf_vec_idx on public.photo_faces
  using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index pf_review_idx  on public.photo_faces (school_id, state, created_at);
create index pf_student_idx on public.photo_faces (student_id) where state = 'confirmed';
create index pf_photo_idx   on public.photo_faces (photo_id);
```

### 5.4 Autorizações por escopo

Substitui o booleano de hoje (`students.guardian->>'consentAt'`), mantendo-o
como origem na migração.

```sql
create table public.authorizations (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references public.schools (id) on delete cascade,
  student_id               uuid not null references public.students (id) on delete cascade,
  scope                    text not null check (scope in (
                             'biometric_sorting',   -- separar fotos por rosto
                             'delivery_whatsapp',   -- enviar ao responsável
                             'internal_use',        -- uso interno da escola
                             'social_media')),      -- publicação externa
  granted_at               timestamptz,
  -- Quem autorizou. A FK é a fonte; o nome fica desnormalizado como prova
  -- congelada no momento do aceite, mesmo que o cadastro mude depois.
  guardian_id              uuid references public.guardians (id) on delete set null,
  granted_by_guardian_name text,
  guardian_channel         text,          -- WhatsApp verificado, como estava no aceite
  revoked_at               timestamptz,
  evidence                 jsonb,         -- termo aceito, IP, timestamp, versão do texto
  created_by               uuid not null references auth.users (id),
  created_at               timestamptz not null default now()
);
create unique index authorizations_active_idx
  on public.authorizations (student_id, scope) where revoked_at is null;

create or replace view public.v_biometric_consent as
  select student_id, school_id, granted_at
    from public.authorizations
   where scope = 'biometric_sorting' and revoked_at is null and granted_at is not null;
```

Sem `delete` policy: revogar é preencher `revoked_at`, não apagar a prova.

Os quatro escopos são fixos. `internal_use` (uso da foto dentro da escola —
mural, portfólio pedagógico, comunicação interna) não é exercido por nenhum
marco desta spec, mas existe desde já porque separar escopos depois exige
recolher o consentimento outra vez.

---

## 6. Storage

| Bucket | Público | Caminho | Conteúdo |
| --- | --- | --- | --- |
| `event-photos` | não | `{school_id}/{event_id}/{photo_id}.jpg` | foto processada (2560px) |
| `event-thumbs` | não | `{school_id}/{event_id}/{photo_id}.webp` | miniatura 320px |
| `event-originals` | não | `{school_id}/{event_id}/{photo_id}.orig` | só se `keep_originals` |
| `face-crops` | não | `{school_id}/{event_id}/{face_id}.jpg` | recorte para a fila de revisão |
| `student-refs` | não | `{school_id}/{student_id}/{ref_id}.jpg` | foto de referência do aluno |

Política de todos, no mesmo padrão das `iaschool_storage_*` existentes:

```sql
create policy "event_photos_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'event-photos'
         and public.is_member_of((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'event-photos'
         and public.is_member_of((storage.foldername(name))[1]::uuid));
```

O primeiro segmento do caminho é sempre `school_id` — é o que dá isolamento de
tenant no Storage sem depender do app.

---

## 7. Pipeline

```
NAVEGADOR                     SUPABASE                     WORKERS
──────────                    ────────                     ───────
seleciona pasta
  ├─ filtra por mime
  ├─ SHA-256 (WebCrypto)
  ├─ redimensiona 2560px  ──► Storage (upload direto)
  └─ insert photos ──────────► photos(status=pending)
                               photo_jobs(kind=ingest)
                                       │
                                       ├──── claim_photo_jobs ──► ingest-worker (Node + sharp)
                                       │                            ├─ lê EXIF (w,h,taken_at)
                                       │                            ├─ gera miniatura 320 webp
                                       │                            └─ enfileira recognize
                                       │
                                       └──── claim_photo_jobs ──► face-worker (Python + InsightFace)
                                                                    ├─ detecta N rostos (SCRFD)
                                                                    ├─ embedding 512-d (ArcFace)
                                                                    ├─ busca vetorial na escola
                                                                    ├─ aplica limiares (§7.3)
                                                                    └─ grava photo_faces
Realtime em batch_jobs ◄────── processed/failed ◄────────────────────┘
```

### 7.1 Upload (cliente)

| Regra | Valor |
| --- | --- |
| Concorrência | 6 uploads simultâneos |
| Retentativa | 3, com backoff exponencial (1s, 4s, 16s) |
| Dedup | SHA-256 do arquivo **antes** do redimensionamento, calculado com `crypto.subtle.digest` num Web Worker |
| Retomada | fila persistida em IndexedDB por `event_id`; ao reabrir a tela, o que ficou pendente volta a ser oferecido |
| Formatos | `image/jpeg`, `image/png`, `image/heic` (HEIC convertido no cliente) |
| Limite por lote | 5.000 arquivos; acima disso, o cliente pede para dividir |
| Progresso | contador local + `batch_jobs` via Realtime |

Substitui `useImageUpload` no fluxo de evento — o hook atual (laço sequencial,
`setUploading` global) fica como está para logo e modelos de arte.

### 7.2 `ingest-worker` (Node + `sharp`)

Um processo, concorrência 8. Para cada job: baixa a foto, lê dimensões e EXIF,
grava miniatura WebP 320px, atualiza `photos`, enfileira `recognize`.

### 7.3 `face-worker` (Python + InsightFace)

Serviço novo, contêiner próprio, `service_role`. Modelos `buffalo_l` embutidos
na imagem (sem download em runtime).

Para cada foto:

1. Detecta rostos (SCRFD) com **`det_size` = 1600** — medido: a 640, um rosto de
   70px (a criança na terceira fileira) só é achado em 35% das vezes; a 1600,
   em 100%. Descarta `det_score < 0.5` e caixa com lado < 40px.
2. Calcula embedding ArcFace 512-d, normalizado (L2), para cada rosto — **em memória**.
3. Busca os 5 vizinhos mais próximos entre as referências **da mesma escola**:

```sql
select r.student_id, 1 - (r.embedding <=> $1) as sim
  from public.student_reference_faces r
 where r.school_id = $2
   and r.retention_until >= current_date
 order by r.embedding <=> $1
 limit 5;
```

4. Aplica os limiares:

| Condição | `state` | Persiste embedding? |
| --- | --- | --- |
| `sim ≥ 0.52` **e** `sim − sim₂ ≥ 0.10` **e** rosto ≥ 60px | `suggested` com `student_id` | sim |
| passa no limiar mas rosto < 60px | `unassigned` com `runner_up_*` preenchido | **não** |
| `sim < 0.52` ou margem `< 0.10` | `unassigned` com `runner_up_*` preenchido | **não** |

5. Grava `photo_faces` e o recorte em `face-crops`.
6. `photos.status = 'processed'`, `faces_count = N`.

> Os números 0,52 / 0,10 / 60px vêm do spike M0, medidos sobre LFW: precisão
> 0,993, cobertura 0,954, 4,6% dos rostos para revisão, e **zero** casos de
> "aluno errado". A margem de 0,10 é o que zera o erro grave — sem ela, seria
> preciso subir o limiar para 0,62 e perder 15 pontos de cobertura.
>
> O conjunto é de **adultos** (§9.5 proíbe foto de criança nesta fase), então
> estes valores são limite superior, não previsão. Ficam em
> `face_recognition_settings` (linha única, editável pelo papel `dev` — §4.1)
> para serem recalibrados com o dado do piloto, sem deploy.

Nunca há atribuição automática final: `suggested` é sugestão (D6).

### 7.4 Rosto de referência do aluno

Cadastro em `/alunos/:id`. O worker gera um embedding por foto **com
`det_size` = 640**; a busca compara contra todos. Sem autorização
`biometric_sorting` ativa, a tela não deixa cadastrar.

**Uma foto basta para matricular** (decisão #8, 16/09/2026): a escola cadastra
dezenas de alunos num dia e exigir duas fotos frontais de cada um trava a
matrícula por um requisito de qualidade, não de conformidade. Com uma única
referência a tela marca o aluno como **cobertura baixa** e o aviso só some na
segunda. O spike mediu a cobertura de 0,954 com **duas** referências (spike §7,
item 5) — com uma, o número é desconhecido e provavelmente menor, o que
significa mais rostos na fila de revisão, nunca mais erro de atribuição (o
limiar e a margem não mudam).

> `det_size` é por tipo de trabalho, não global. Ampliar um retrato para 1600
> põe o rosto acima da maior âncora do SCRFD e a detecção falha — medido: 14 de
> 15 retratos perdidos a 1024. O embedding é indiferente ao `det_size` (mesmo
> rosto a 640 e a 1024: similaridade 0,990), então misturar é seguro.

### 7.5 Fila de revisão

`photo_faces.state = 'unassigned'` ou `'suggested'`. A tela mostra o recorte,
a foto inteira e os 3 candidatos mais prováveis. Ações:

| Ação | Efeito |
| --- | --- |
| Confirmar | `state='confirmed'`, `reviewed_by/at`; embedding é persistido se ainda não estava |
| Corrigir para outro aluno | idem, com o `student_id` escolhido |
| Não é aluno da escola | `state='not_a_student'`, embedding e recorte apagados |
| Ignorar | `state='rejected'` |

RPCs `confirm_face(p_face_id, p_student_id)` e `reject_face(p_face_id, p_reason)`,
`security definer`, checando `is_member_of` e autorização do aluno.

### 7.6 Pasta do aluno (R6)

Consulta, não cópia:

```sql
select p.id, p.thumb_path, p.storage_path, p.taken_at
  from public.photo_faces f
  join public.photos p on p.id = f.photo_id
 where f.student_id = $1
   and f.state = 'confirmed'
   and p.deleted_at is null
 order by p.taken_at nulls last, p.created_at;
```

Uma foto com 5 crianças confirmadas gera 5 linhas em `photo_faces` e aparece
nas 5 pastas, com um único arquivo no Storage.

---

## 8. RLS

"Membro" abaixo é sempre `is_member_of(school_id)` (§4.6), e toda policy de
leitura leva `or is_super_admin()` — que cobre `dev` e `super_admin` (§4.1).

| Tabela | `select` | `insert` / `update` | Observação |
| --- | --- | --- | --- |
| `schools` | membro | `school_admin` | identidade visual da escola mora aqui (§4.1) |
| `school_members` | membro | `school_admin` | |
| `classes`, `events` | membro | membro | `teacher` só a própria turma em `events` |
| `guardians` | membro | membro; `whatsapp_verified_at` **só pela RPC** | número é único por escola |
| `photos` | membro da escola | membro; `update` só de `deleted_at` | worker usa `service_role` |
| `batch_jobs`, `photo_jobs` | membro (`batch_jobs`) | **nenhuma** para `photo_jobs` | fila só pelo `service_role` |
| `photo_faces` | membro, **sem a coluna `embedding`** | só via RPC | ver abaixo |
| `student_reference_faces` | **nenhuma policy** | nenhuma | igual a `guardian_verification_codes`: só `service_role` e RPC |
| `authorizations` | membro | insert/update; **sem delete** | revogação é `revoked_at` |

O embedding é bloqueado por privilégio de coluna, não por RLS:

```sql
revoke select on public.photo_faces from authenticated;
grant  select (id, school_id, photo_id, bbox, crop_path, det_score, quality,
               student_id, match_score, runner_up_student_id, runner_up_score,
               state, reviewed_by, reviewed_at, created_at)
  on public.photo_faces to authenticated;
```

Assim, nem um cliente com token válido e consulta arbitrária consegue extrair
o vetor biométrico.

---

## 9. Conformidade — ECA Digital e LGPD

Base: Lei nº 15.211/2025, Decreto nº 12.880/2026 e
[`.claude/skills/eca-digital/`](../.claude/skills/eca-digital/).

### 9.1 Enquadramento do dado

O embedding facial é **dado pessoal sensível** (LGPD art. 11, II) de **criança
ou adolescente** (LGPD art. 14 + Lei art. 13, finalidade única). Não cabe
legítimo interesse: exige **consentimento específico e destacado do responsável
legal**, por finalidade.

| Exigência | Como esta spec atende |
| --- | --- |
| Base legal registrada | `authorizations` escopo `biometric_sorting`, com `evidence` (termo, versão, data) |
| Finalidade única | escopo separado de `delivery_whatsapp` e `social_media`; nenhuma outra leitura do embedding no código |
| Minimização | 512 floats, sem imagem-mestre; recorte de rosto só enquanto há revisão pendente |
| Isolamento | busca vetorial filtrada por `school_id` dentro de função `security definer` (D7) |
| Não sai do perímetro | motor self-hosted (D1); nenhuma chamada a API de face de terceiro |
| Sem perfilamento nem publicidade | embedding não alimenta prompt, métrica, ranking ou recomendação |
| Sem inferência acessória | `genderage` e os modelos de landmark do `buffalo_l` são **apagados da imagem** do worker: inferir idade e gênero do rosto de uma criança é tratamento sem finalidade (Lei, art. 13). Custariam ainda 82% de tempo |
| Prazo de guarda | `retention_until` obrigatório; expurgo diário por `pg_cron` |
| Revisão humana | D6 — nenhuma decisão automatizada final sobre a criança |
| Trilha | `biometric_events` append-only (§9.4) |

### 9.2 Autorização de uso de imagem no evento

Subir a foto de um aluno já é tratamento de imagem de menor, antes de qualquer
biometria. `events.image_rights_declared_at/by` registra a declaração da escola
de que possui autorização dos responsáveis dos alunos presentes. Sem essa
declaração o upload não abre. É registro de responsabilidade, não substituto do
termo — o termo em si vive em `authorizations`.

### 9.3 A questão do rosto sem consentimento

Para saber de quem é um rosto é preciso vetorizá-lo — inclusive o de uma
criança cujo responsável não autorizou. Tratamento inevitável para cumprir a
finalidade, mas contido assim:

1. O embedding de rosto não correspondido existe **só em memória**, pelo tempo
   da comparação (D5). Nunca vira linha.
2. O que persiste é caixa delimitadora + recorte, para revisão humana, com
   expurgo ao fim da revisão.
3. Rosto marcado como `not_a_student` tem recorte e vetor apagados na hora.
4. Aluno sem `biometric_sorting` ativo simplesmente não tem referência: seus
   rostos caem em `unassigned` e são tratados manualmente, sem base biométrica.

**Decisão de produto ainda aberta** (§9.4 da pivotagem): o que fazer com foto
em que aparece criança sem autorização, na hora da **entrega**. Fora do escopo
desta spec — a entrega é a Fase 5 —, mas `authorizations` já tem o escopo para
implementar a trava.

### 9.4 Trilha e expurgo

```sql
create table public.biometric_events (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  kind       text not null check (kind in (
               'consent_granted','consent_revoked','reference_created',
               'reference_purged','face_confirmed','face_purged')),
  detail     jsonb,
  actor      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
```

Append-only por RLS (policy de `insert` e `select`, nenhuma de `update`/`delete`),
no mesmo padrão de `share_logs`.

Expurgo diário via `pg_cron`, função `purge_expired_biometrics()`:

| Gatilho | Efeito |
| --- | --- |
| `retention_until < current_date` | apaga referência e embeddings do aluno |
| `authorizations.revoked_at` preenchido | apaga referências, zera `photo_faces.embedding`, mantém `student_id` das fotos já confirmadas (a foto continua sendo do aluno; a biometria some) |
| `students.deleted_at` expurgado | apaga tudo do aluno |
| `events.photo_retention_until` vencido | apaga fotos, miniaturas, recortes e faces do evento |

### 9.5 Dado de teste

Enquanto valerem as pendências de
[`docs/pendencias-producao.md`](pendencias-producao.md), **nenhuma foto real de
criança ou adolescente entra no produto**, inclusive em desenvolvimento e nos
testes de acurácia. Ver §12.1.

### 9.6 Pendente antes de ligar com dado real

- Avaliação de impacto (Lei art. 8º, I; Decreto art. 47), incluindo a decisão D1.
- Termo de consentimento do responsável para `biometric_sorting`, versionado.
- Política de privacidade descrevendo o tratamento biométrico e o prazo de guarda.
- Pendência #7 de `pendencias-producao.md` (WhatsApp oficial + OTP), que continua
  bloqueando a entrega ao responsável — não esta spec.

---

## 10. Interface

| Tela | Rota | Conteúdo |
| --- | --- | --- |
| Eventos | `/eventos` | lista por data, status, contagem de fotos e pendências de revisão |
| Novo evento | `/eventos/novo` | nome, data, turma, retenção, declaração de direito de imagem (§9.2) |
| Evento | `/eventos/:id` | dropzone de pasta, progresso em tempo real, galeria virtualizada de miniaturas |
| Revisão | `/eventos/:id/revisao` | fila de rostos: recorte, foto inteira, 3 candidatos, atalhos de teclado |
| Aluno → Fotos | `/alunos/:id` (aba) | pasta do aluno (§7.6) |
| Aluno → Rosto de referência | `/alunos/:id` (aba) | cadastro das fotos (1 aceita, aviso de cobertura baixa até 2 — §7.4), estado do consentimento, botão de revogar |

As telas do M1 — cadastro de escola, séries e salas, ficha do aluno com
matrícula, sala e responsável — estão no [`BACKLOG.md`](../BACKLOG.md), não
aqui: esta seção cobre Fases 2 e 3.

Notas de implementação:

- Galeria de 2.000 miniaturas exige virtualização (`@tanstack/react-virtual`) e
  URLs assinadas em lote (`createSignedUrls`, 100 por chamada, TTL 1 h).
- Progresso: contador otimista no cliente + assinatura Realtime em `batch_jobs`
  para o que acontece no servidor.
- A fila de revisão precisa ser rápida no teclado (`←/→` navegar, `1..3`
  escolher candidato, `Enter` confirmar, `N` não é aluno) — é a tela onde a
  escola vai passar horas.
- Componentes do design system `@workspace/iaschool-ui`; nada de CSS novo solto.

---

## 11. Operação

| Item | Definição |
| --- | --- |
| `ingest-worker` | Node 24, `sharp`, concorrência 8, contêiner próprio |
| `face-worker` | Python 3.12, `onnxruntime` + `insightface`, modelos na imagem, **1 processo por máquina** |
| Deploy | Fly.io (já há `fly.toml` e `Dockerfile` na raiz), um app por worker, escala manual. **Escalar com mais máquinas, não com mais processos**: o `onnxruntime` já satura os núcleos numa sessão — 1, 4 e 8 processos dão a mesma vazão agregada |
| Segredos | `SUPABASE_SERVICE_ROLE_KEY` só nos workers; nunca no cliente nem no `api-server` |
| Health | `/health` em cada worker + `batch_jobs` parado há > 10 min dispara alerta |
| Observabilidade | log estruturado (`src/lib/logger.ts` como padrão), com `batch_id`, `photo_id`, duração e resultado; **nunca** logar embedding, recorte ou nome de aluno |
| Custo | ~1,4 GB de Storage por evento de 2.000 fotos; worker mais barato que o egress |

### 11.1 Metas de desempenho

| Métrica | Meta |
| --- | --- |
| Upload de 2.000 fotos (50 Mbps up) | ≤ 20 min |
| Miniatura por foto | ≤ 300 ms |
| Detecção + embedding por foto (CPU, ~3 rostos, `det_size` 1600) | ≤ 0,5 s (medido 0,21 s em Apple M4) |
| Evento de 2.000 fotos processado (1 face-worker) | ≤ 60 min (medido ~7 min em Apple M4) |
| Busca vetorial (500 referências na escola) | ≤ 10 ms |
| Abertura da galeria do evento | ≤ 2 s |

Os números de detecção foram medidos no spike M0, **em Apple M4 de 15 núcleos**.
Um vCPU compartilhado de nuvem é mais lento e isso não foi medido: rode
`scripts/spike-face/src/bench_throughput.py` **na máquina alvo** antes de dimensionar
o M5.

---

## 12. Testes e critérios de aceite

### 12.1 Conjunto de dados

Proibido usar foto real de criança (§9.5). Para medir acurácia:

| Uso | Conjunto |
| --- | --- |
| Acurácia de reconhecimento | LFW / VGGFace2 (subconjunto de **adultos**, público) |
| Ponta a ponta e carga | rostos sintéticos gerados, 2.000 imagens compostas em cenas de grupo |
| Casos de borda | foto de costas, rosto parcialmente coberto, contraluz, gêmeos sintéticos, foto sem rosto nenhum |

### 12.2 Metas de qualidade do reconhecimento

| Métrica | Meta | Por quê |
| --- | --- | --- |
| Precisão da faixa `suggested` | **≥ 0,99** | atribuir a criança errada é o pior defeito do produto |
| Cobertura (rostos que recebem sugestão) | ≥ 0,85 | abaixo disso a revisão manual inviabiliza o uso |
| Fila de revisão | ≤ 15% dos rostos | idem |
| Falso positivo entre escolas | **0** | teste dedicado com duas escolas de referência |

### 12.3 Testes automatizados

| Nível | Cobertura |
| --- | --- |
| Unit | limiares e regra de margem; hash e dedup; parser de EXIF; máquina de estados de `photo_faces` |
| Integração (Supabase) | `claim_photo_jobs` sem corrida com 4 workers simultâneos; dedup por `unique(event_id, content_hash)`; RPCs de revisão |
| RLS | membro de escola A não lê `photos`, `photo_faces` nem Storage da escola B; `authenticated` não lê a coluna `embedding`; `student_reference_faces` inacessível fora do `service_role` |
| Conformidade | rosto `not_a_student` some do banco e do Storage; revogação zera embeddings; `purge_expired_biometrics()` respeita `retention_until` |
| E2E | upload de 200 fotos → processamento → revisão → pasta do aluno |
| Carga | 2.000 fotos, medindo as metas da §11.1 |

### 12.4 Aceite

A entrega é aceita quando R1–R8 (§1.1) forem demonstráveis num evento de 2.000
fotos sintéticas, com as metas de §12.2 medidas e registradas, e com os testes
de RLS e de conformidade passando.

---

## 13. Plano de entrega

| Marco | Entrega | Prazo | Risco |
| --- | --- | --- | --- |
| M0 | ✅ **concluído em 31/08/2026** — ver [`docs/spike-reconhecimento-facial.md`](spike-reconhecimento-facial.md) | — | — |
| M1 | Fase 1 mínima: `schools` (absorvendo `clubs`), `school_members`, `classes`, `guardians`, `events`, papéis globais, migração de RLS e **do OTP do responsável** (§4.7, item 8) | 2–2,5 semanas | médio (migração de RLS mexe em tudo) |
| M2 | `photos`, buckets, upload em massa no cliente, dedup, retomada | 2 semanas | médio |
| M3 | Fila + `ingest-worker` + miniaturas + galeria virtualizada + progresso Realtime | 1,5 semanas | baixo |
| M4 | `authorizations`, termo de consentimento, cadastro de rosto de referência | 1 semana | médio (depende do texto jurídico) |
| M5 | `face-worker`, `photo_faces`, atribuição, pasta do aluno | 2,5 semanas | **alto** |
| M6 | Fila de revisão, RPCs, expurgo, `biometric_events`, testes de conformidade | 2 semanas | médio |
| **Total** | | **11–12 semanas** | |

Consistente com a estimativa da pivotagem (Fase 2: 3–4 semanas; Fase 3: 4–6),
somando o pré-requisito da Fase 1 e o marco de conformidade que a pivotagem não
orçava separadamente.

O M1 subiu meia semana em 16/09/2026: o escopo revisado (§4) acrescentou
`guardians`, a consolidação de `clubs`, o papel global e — o que ninguém
orçava — refazer `guardian_verification_codes`, `confirm_guardian_code` e a
edge function `send-guardian-code` sobre o novo modelo.

M0 pode rodar em paralelo com M1.

---

## 14. Spike M0 — concluído

Código em [`scripts/spike-face/`](../scripts/spike-face/), resultados em
[`docs/spike-reconhecimento-facial.md`](spike-reconhecimento-facial.md).

D1 confirmada. Os parâmetros de §7.3, §7.4, §11 e §11.1 acima já refletem o
medido. Dois itens do plano original ficaram em aberto e estão registrados no
relatório:

| Item | Situação |
| --- | --- |
| Medição em GPU | não feita — desnecessária, a CPU já cumpre a meta com folga |
| Comparação com AWS Rekognition | **não executada** — sem credencial AWS no ambiente; virou opcional, já que o motor local atingiu todas as metas |

O risco que o spike **não** conseguiu medir — acurácia em rosto de criança de 4
a 10 anos — está na §7 do relatório e é o que sustenta a revisão humana
obrigatória (D6).

---

## 15. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Atribuir a foto ao aluno errado | **Grave** — foto de criança para a família errada | limiar conservador + margem sobre o 2º + revisão humana obrigatória (D6) |
| Acurácia baixa em criança pequena | fila de revisão inviabiliza o uso | ArcFace é treinado majoritariamente em adulto; medido no spike (§7 do relatório: adultos apenas), 2 fotos de referência recomendadas (§7.4) e recadastro por ano letivo |
| Migração de `owner_id` → `school_id` | quebra o produto inteiro | migração ensaiada em branch do Supabase, com teste de RLS antes do merge |
| Custo de Storage | surpresa na fatura | D3 (2560px), retenção por evento, expurgo automático |
| Vazamento de embedding | incidente com dado sensível de menor | privilégio de coluna (§8), `service_role` só nos workers, nunca logar vetor |
| Escopo virar "entrega ao responsável" | Fase 5 entra pela porta dos fundos, sem WhatsApp oficial | §1.2 explícito; a pendência #7 continua bloqueando dado real |

---

## 16. Decisões

Respondidas em 31/08/2026:

| Decisão | Resposta |
| --- | --- |
| **D1** — motor | InsightFace self-hosted. Confirmada pelo spike M0 |
| **D5** — persistência do embedding | só de aluno com `biometric_sorting` ativo |
| **Escopo do M1** | Fase 1 mínima (§4), não a Fase 1 completa |

Decisões de modelo do M1, fechadas em 16/09/2026 (numeração de
[`BACKLOG.md`](../BACKLOG.md)):

| # | Decisão | Resposta | Onde |
| --- | --- | --- | --- |
| 2 | Perfil `student` | aposentado: menor de 16 não tem conta própria, aluno é só registro em `students` | §4.7, item 7 |
| 3 | `clubs` × `schools` | consolidar já no M1; `clubs` removida depois de um ciclo estável | §4.1 |
| 5 | Papel `dev` | tudo do `super_admin` + motor, prompt, expurgo manual e logs técnicos | §4.1 |
| 6 | Série | coluna `grade` em `classes`, lista fixa no app | §4.2 |
| 7 | Responsável | tabela `guardians`, verificação de WhatsApp por número | §4.3, §4.7 item 8 |
| 8 | Fotos de referência | 1 aceita no cadastro, aviso de cobertura baixa até 2 | §7.4 |

Duas consequências que não estavam em nenhuma das propostas e foram decididas
junto: `guardians.user_id` nasce nulo no M1 para que o papel `guardian` da Fase
4 seja só mais um valor no `check` de `profiles.role`; e `authorizations` ganha
`guardian_id` (§5.4), já que o canal verificado passou a ter dono.

Próxima decisão em aberto, e ela é de produto, não de engenharia: o que fazer
com foto em que aparece criança sem autorização, **na hora da entrega** (§9.3).
Não bloqueia M1–M6.
