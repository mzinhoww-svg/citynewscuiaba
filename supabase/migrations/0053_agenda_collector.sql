-- AGE-T1 (R37): coletor de eventos da internet. Eventos coletados trazem o link do original, a
-- fonte, a chave de duplicidade e se o preço é desconhecido (a listagem não informa); preço
-- desconhecido nunca vale como gratuito.

alter table event_listings
  add column if not exists source_url text,
  add column if not exists source_id text,
  add column if not exists dedupe_key text,
  add column if not exists price_unknown boolean not null default false,
  add column if not exists collected_at timestamptz;

alter table event_listings drop column is_free;
alter table event_listings
  add column is_free boolean generated always as (coalesce(price_cents, 0) = 0 and not price_unknown) stored;

create unique index if not exists event_listings_dedupe_key_uidx on event_listings (dedupe_key);
create index if not exists event_listings_source_idx on event_listings (source_id) where source_id is not null;

-- Execuções da coleta (limite de frequência e histórico). Só a service role lê e escreve.
create table if not exists agenda_collect_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  report jsonb
);
create index if not exists agenda_collect_runs_started_idx on agenda_collect_runs (started_at desc);
alter table agenda_collect_runs enable row level security;

-- pg_cron: a cada 6 h chama a rota de coleta (mesmo molde do tick; sem pg_cron, pg_net ou Vault o
-- watchdog do GitHub cobre).
create or replace function public.schedule_agenda_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre a coleta)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'agenda-collect', '17 */6 * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/agenda',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  return 'agendado: agenda-collect';
end $fn$;
revoke execute on function public.schedule_agenda_cron() from public, anon, authenticated, service_role;

select public.schedule_agenda_cron();
