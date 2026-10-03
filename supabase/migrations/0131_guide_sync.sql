-- GUIA-T2 · Sincronização de lugares: data da última conferência da nota e agendamento diário.
-- Aditiva e idempotente; sem remoção de dados.

-- Nota, contagem e posição envelhecem (conferidas a cada 30 dias); o resto do cadastro tem a sua
-- própria data (`data_updated_at`). Separar as duas evita que a coleta semanal do OpenStreetMap
-- esconda uma nota velha.
alter table public.venues add column if not exists rating_updated_at timestamptz;
-- Última tentativa de achar a foto oficial do lugar (GUIA-T3): evita repetir a busca todo dia.
alter table public.venues add column if not exists photo_checked_at timestamptz;
create index if not exists venues_rating_refresh_idx
  on public.venues (rating_updated_at nulls first) where place_ids ? 'tripadvisor';

-- pg_cron: uma vez por dia chama a coleta de lugares (2 categorias por execução, volta completa
-- por semana). Mesmo molde da Agenda: sem pg_cron, pg_net ou Vault, o watchdog do GitHub cobre.
create or replace function public.schedule_guide_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre a coleta de lugares)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'guide-venue-sync', '23 3 * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/venues',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  return 'agendado: guide-venue-sync';
end $fn$;
revoke execute on function public.schedule_guide_cron() from public, anon, authenticated, service_role;

select public.schedule_guide_cron();
