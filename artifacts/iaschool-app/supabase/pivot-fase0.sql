-- ------------------------------------------------------------
-- IAschool — Fase 0 da pivotagem: remoção do domínio de futebol
--
-- Aplique em bases já criadas com o setup.sql anterior (R9/IAsport).
-- Bases novas já nascem limpas: o setup.sql atual não cria nada disto.
--
-- ATENÇÃO: este script APAGA dados (posição, altura, peso, uniformes e
-- todas as métricas). Faça backup antes de rodar em produção.
-- ------------------------------------------------------------

-- ---------- 1. Colunas de atleta em students ----------
alter table if exists public.students drop column if exists position;
alter table if exists public.students drop column if exists height_cm;
alter table if exists public.students drop column if exists weight_kg;

-- ---------- 2. Uniformes na identidade da escola ----------
-- A tabela `clubs` é mantida (agora significa "identidade visual da escola":
-- nome, logo e cores). A consolidação numa tabela `schools` real fica para a
-- Fase 1 da pivotagem.
alter table if exists public.clubs drop column if exists uniforms;

-- ---------- 3. Métricas esportivas ----------
drop policy if exists "metrics_select" on public.metrics;
drop policy if exists "metrics_insert" on public.metrics;
drop policy if exists "metrics_delete" on public.metrics;
drop table if exists public.metrics;

alter table if exists public.generated_posts drop column if exists metrics;

-- ---------- 4. Renomeia as policies de Storage ----------
drop policy if exists "r9_storage_insert" on storage.objects;
drop policy if exists "r9_storage_select" on storage.objects;
drop policy if exists "r9_storage_delete" on storage.objects;
-- As novas ("iaschool_storage_*") são criadas pelo setup.sql — reexecute-o
-- depois deste script.
