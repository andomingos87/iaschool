-- ------------------------------------------------------------
-- R9 Escolinhas — logs de geração de imagem (tela /admin/logs)
-- Rode este script no SQL Editor do painel Supabase.
-- Pode ser executado mais de uma vez sem quebrar (idempotente).
--
-- A tabela é escrita e lida SOMENTE pelo api-server (service_role).
-- Clientes autenticados não têm nenhuma política — a RLS bloqueia tudo.
-- A tela /admin/logs consulta via API, que exige super_admin com o
-- e-mail exato do administrador da IAsport.
-- ------------------------------------------------------------

create table if not exists public.generation_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Quem gerou (sem FK para auth.users: o log sobrevive à remoção da conta).
  user_id uuid,
  user_email text,
  user_name text,
  school_name text,
  student_name text,
  status text not null check (status in ('success', 'error')),
  duration_ms integer,
  -- Prompt completo enviado à OpenAI.
  prompt text,
  -- Parâmetros do payload (modelo, tamanho, flags, métricas, prompt auxiliar).
  payload jsonb,
  -- Anexos enviados: [{role, fileName, mimeType, sizeBytes, thumbPath}].
  attachments jsonb not null default '[]'::jsonb,
  -- Resposta (metadados) ou erro da OpenAI — nunca o base64 da imagem.
  openai_response jsonb,
  server_status integer,
  -- Resposta enviada ao cliente (imagem resumida como "<N bytes>").
  server_response jsonb,
  -- Miniatura do resultado no bucket generation-logs.
  result_thumb_path text,
  -- URL do post salvo no Storage (vinculada pelo app após salvar).
  result_url text
);

create index if not exists generation_logs_created_at_idx
  on public.generation_logs (created_at desc);
create index if not exists generation_logs_status_idx
  on public.generation_logs (status);

-- RLS ligada e SEM políticas: nenhum cliente (anon/authenticated) lê ou
-- escreve; apenas o service_role (api-server), que ignora RLS.
alter table public.generation_logs enable row level security;

-- Bucket privado para as miniaturas dos anexos e do resultado.
-- Sem políticas de Storage para clientes: somente o service_role acessa;
-- a tela recebe URLs assinadas geradas pelo api-server.
insert into storage.buckets (id, name, public)
values ('generation-logs', 'generation-logs', false)
on conflict (id) do update set public = false;
