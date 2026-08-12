-- ============================================================
-- Cota diária de gerações de imagem (persistida no banco)
--
-- Rode este script no SQL Editor do Supabase (bases criadas antes desta
-- funcionalidade). Bases novas já recebem o mesmo bloco via setup.sql.
--
-- O api-server chama a função consume_generation_quota() com a chave
-- service_role a cada geração. A contagem é feita por usuário/dia de forma
-- atômica, então a cota resiste a reinícios do servidor e vale entre
-- múltiplas instâncias.
-- ============================================================

create table if not exists public.generation_usage (
  user_id    uuid        not null,
  day        date        not null,
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Somente o backend (service_role, que ignora RLS) acessa esta tabela.
alter table public.generation_usage enable row level security;

-- Consome 1 geração da cota do dia (UTC). Retorna o total do dia após o
-- consumo, ou NULL se a cota (p_limit) já foi atingida — nada é consumido
-- nesse caso. Operação atômica (INSERT ... ON CONFLICT com condição).
create or replace function public.consume_generation_quota(
  p_user_id uuid,
  p_limit   integer
)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.generation_usage as gu (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update
    set count = gu.count + 1, updated_at = now()
    where gu.count < p_limit
  returning count;
$$;

-- Apenas o service_role pode executar (o backend); nunca o cliente.
revoke execute on function public.consume_generation_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid, integer)
  to service_role;
