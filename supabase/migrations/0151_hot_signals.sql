-- HOT-T1 · Sinal de destaque dos portais e pauta quente (spec 2026-10-03-destaques-e-profundidade,
-- emenda "pauta quente", R8 a R11; plano 2026-10-04-retomada-ui-e-pauta-quente). Aditiva e
-- idempotente, sem DELETE (o conector Supabase retém DELETE): a limpeza de `front_signals` fica na
-- 0152, aplicada pelo dono. Numeração: o plano previa 0148/0149, já ocupadas na main por
-- 0148_source_activation_without_terms, 0149_single_approver e 0150_reviewer_skips_ai_fallback.
--
-- 1. `featured_items.topic_id` (assunto que gerou o pino quente) e `dismissed_at` (admin dispensou
--    o quente; o mesmo sinal não volta). `kind` ('manual' | 'hot') já existe desde a 0090.
-- 2. `front_signals`: posição de um link no topo da página inicial de uma fonte (gravado pela
--    HOT-T2). Só URL, posição e hora; nenhum texto da fonte. RLS ligada sem política: só o
--    service role lê e escreve. Toda leitura ignora linhas com mais de 7 dias.
-- 3. Flag `hot_featured_enabled` (ligada) em `feature_flags`; `featured.hot_min_sources` (3) em
--    `app_settings`, porque `feature_flags` só guarda booleano (mesmo mecanismo de
--    `sources.fast_lane_max`), com grade de 2 a 10.
-- 4. Cron `ingest-frontpage` (*/20) para `/api/ingest/frontpage` (rota da HOT-T2), via pg_net com
--    `app_url` e `cron_secret` do Vault, no mesmo formato do `review-tick` (0141).

-- ---------------------------------------------------------------------------
-- 1. featured_items
-- ---------------------------------------------------------------------------
alter table public.featured_items
  add column if not exists topic_id uuid null references public.topics (id) on delete set null;
alter table public.featured_items add column if not exists dismissed_at timestamptz null;
create index if not exists featured_items_topic_idx on public.featured_items (topic_id)
  where topic_id is not null;

-- ---------------------------------------------------------------------------
-- 2. front_signals
-- ---------------------------------------------------------------------------
create table if not exists public.front_signals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  topic_id uuid null,
  item_id uuid null,
  url text not null,
  rank int not null check (rank between 1 and 10),
  seen_at timestamptz not null default now()
);
create index if not exists front_signals_topic_seen_idx on public.front_signals (topic_id, seen_at);

alter table public.front_signals enable row level security;
revoke all on public.front_signals from public, anon, authenticated;
grant all on public.front_signals to service_role;

-- ---------------------------------------------------------------------------
-- 3. Interruptor e limiar
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values ('hot_featured_enabled', true)
on conflict (key) do nothing;

insert into public.app_settings (key, value) values ('featured.hot_min_sources', '3')
on conflict (key) do nothing;

-- Grade da chave nova num gatilho próprio (não redefine `guard_app_settings`, que tem as outras).
create or replace function public.guard_app_settings_hot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key = 'featured.hot_min_sources' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 2 and 10 then
      raise exception 'featured.hot_min_sources deve ser um inteiro entre 2 e 10' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists app_settings_hot_guard on public.app_settings;
create trigger app_settings_hot_guard before insert or update on public.app_settings
  for each row execute function public.guard_app_settings_hot();

-- ---------------------------------------------------------------------------
-- 4. Agendamento: a cada 20 min (sem pg_cron, pg_net ou Vault nada é agendado)
-- ---------------------------------------------------------------------------
create or replace function public.schedule_frontpage_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'ingest-frontpage', '*/20 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/frontpage',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  return 'agendado: ingest-frontpage';
end $fn$;
revoke execute on function public.schedule_frontpage_cron() from public, anon, authenticated, service_role;

select public.schedule_frontpage_cron();
