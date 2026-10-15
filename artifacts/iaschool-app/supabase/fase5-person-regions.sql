-- ------------------------------------------------------------
-- IAschool — Ajustes 11/10/2026, S05: máscara revisada da pessoa inteira
-- Migration: iaschool_s05_photo_person_regions
--
-- Spec: docs/specs/ajustes-2026-10-11/05-protecao-localizada.md
--       (PROT-01 a PROT-07: cena nítida, proteção localizada da pessoa inteira,
--        máscara ajustável, pendência por foto e versionamento do ativo).
-- Backlog: BACKLOG.md → Ajustes de produto (11/10/2026) → S05.
--
-- Aplicar via `apply_migration` do MCP `supabase-iaschool` (nunca pelo SQL
-- Editor). Este arquivo é o SQL de referência; roda mais de uma vez sem quebrar.
--
-- O que entra:
--   1. `public.photo_person_regions` — as regiões da PESSOA INTEIRA que a
--      escola conferiu/ajustou. Não é a caixa do rosto (`photo_faces.bbox`):
--      cobre corpo, roupa e sobreposição. A ausência de uma região para um
--      rosto confirmado é tratada como "proteger" pelo render (fail-closed).
--   2. `public.photos.regions_version` + trigger de versão — qualquer mudança
--      de região invalida a versão do ativo; o render e a aprovação comparam
--      essa versão (PROT-06).
--   3. `public.delivery_items.rendered_regions_version` — a versão de regiões
--      que produziu o derivado. A aprovação só libera quando bate com a versão
--      atual da foto; um render atrasado não recoloca versão antiga.
--   4. RPCs `security definer`: leitura por evento e gravação por foto, com
--      `is_member_of`/`is_super_admin` por dentro. A tabela não tem policy.
--
-- Regra de autorização (PROT-02/PROT-03): só o filho confirmado do próprio
-- responsável e adulto/equipe com classificação humana ficam nítidos. Outra
-- criança, desconhecido e ausência de detecção ficam protegidos. Não existe
-- escopo de exposição a outras famílias no produto; nada aqui o presume.
--
-- Não entra neste arquivo (código, depois): o render localizado no
-- `ingest-worker`, a marcação/conferência na tela de entrega e o guard de
-- versão em `approve_delivery_batch`.
-- ------------------------------------------------------------

-- ============================================================
-- 1. photo_person_regions
-- ============================================================

create table if not exists public.photo_person_regions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  photo_id     uuid not null references public.photos (id) on delete cascade,
  -- Rosto que originou a marcação, quando houve detecção. Sem detecção
  -- (criança de costas, rosto parcial), a região nasce sem `face_id`.
  face_id      uuid references public.photo_faces (id) on delete set null,
  -- Classificação humana. `own_child` só vale para o filho do destinatário no
  -- momento do render; `adult_or_staff` exige confirmação humana (não é
  -- inferência de idade). Os demais são protegidos por inteiro.
  kind         text not null check (kind in (
                 'protected_unknown','other_child','own_child','adult_or_staff')),
  -- Aluno da região quando ela é de aluno; nulo em adulto/desconhecido.
  student_id   uuid references public.students (id) on delete set null,
  -- `polygon`: `points` é uma lista de [x, y]. `rect`: `points` é [x, y, w, h].
  -- Coordenadas em pixels da imagem ORIENTADA — a mesma referência de
  -- `photo_faces.bbox`.
  shape        text not null default 'polygon' check (shape in ('polygon','rect')),
  points       jsonb not null,
  reviewed_by  uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists photo_person_regions_photo_idx
  on public.photo_person_regions (photo_id);
create index if not exists photo_person_regions_school_idx
  on public.photo_person_regions (school_id);

drop trigger if exists photo_person_regions_touch on public.photo_person_regions;
create trigger photo_person_regions_touch
  before update on public.photo_person_regions
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 2. Versão das regiões (PROT-06)
-- ============================================================

alter table public.photos
  add column if not exists regions_version int not null default 0;
alter table public.delivery_items
  add column if not exists rendered_regions_version int;

-- Uma linha alterada de região muda a versão da foto. O render grava a versão
-- usada em `delivery_items.rendered_regions_version`; a aprovação exige que as
-- duas batam, invalidando ativo e miniatura antigos.
create or replace function public.photo_person_regions_bump_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo uuid := coalesce(new.photo_id, old.photo_id);
begin
  update public.photos
     set regions_version = regions_version + 1
   where id = v_photo;
  return null;
end;
$$;
revoke all on function public.photo_person_regions_bump_version() from public, anon, authenticated;
drop trigger if exists photo_person_regions_bump_version on public.photo_person_regions;
create trigger photo_person_regions_bump_version
  after insert or update or delete on public.photo_person_regions
  for each row execute function public.photo_person_regions_bump_version();

-- ============================================================
-- 3. RLS: tabela sem policy (só service_role e as RPCs definer)
-- ============================================================

alter table public.photo_person_regions enable row level security;
revoke all on table public.photo_person_regions from public, anon, authenticated;

-- ============================================================
-- 4. RPCs de leitura e gravação
-- ============================================================

-- Regiões revisadas das fotos de um evento (tela de entrega/revisão).
create or replace function public.photo_person_regions_for_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_result jsonb;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'event not found'; end if;
  if not (public.is_member_of(v_event.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'photo_id', r.photo_id,
    'face_id', r.face_id,
    'kind', r.kind,
    'student_id', r.student_id,
    'shape', r.shape,
    'points', r.points,
    'reviewed_at', r.reviewed_at
  )), '[]'::jsonb) into v_result
    from public.photo_person_regions r
    join public.photos p on p.id = r.photo_id
   where p.event_id = p_event_id and p.deleted_at is null;
  return v_result;
end;
$$;
revoke all on function public.photo_person_regions_for_event(uuid) from public, anon;
grant execute on function public.photo_person_regions_for_event(uuid) to authenticated, service_role;

-- Substitui as regiões de UMA foto pela lista revisada. Cada item:
-- { face_id?, kind, student_id?, shape?, points }. Grava autoria e carimbo.
create or replace function public.save_photo_person_regions(
  p_photo_id uuid,
  p_regions  jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_photo public.photos%rowtype;
  v_item  jsonb;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_photo from public.photos
   where id = p_photo_id and deleted_at is null;
  if not found then raise exception 'photo not found'; end if;
  if not (public.is_member_of(v_photo.school_id) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;
  if p_regions is null or jsonb_typeof(p_regions) <> 'array' then
    raise exception 'regions must be a json array';
  end if;

  delete from public.photo_person_regions where photo_id = p_photo_id;

  for v_item in select * from jsonb_array_elements(p_regions) loop
    insert into public.photo_person_regions
      (school_id, photo_id, face_id, kind, student_id, shape, points,
       reviewed_by, reviewed_at)
    values (
      v_photo.school_id,
      p_photo_id,
      nullif(v_item->>'face_id', '')::uuid,
      coalesce(v_item->>'kind', 'protected_unknown'),
      nullif(v_item->>'student_id', '')::uuid,
      coalesce(v_item->>'shape', 'polygon'),
      v_item->'points',
      v_uid,
      now()
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.save_photo_person_regions(uuid, jsonb) from public, anon;
grant execute on function public.save_photo_person_regions(uuid, jsonb) to authenticated, service_role;
