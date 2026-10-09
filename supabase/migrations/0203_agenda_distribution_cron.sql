-- ARD-T1 (spec §3): dois jobs pg_cron no molde de `agenda-collect` (0053). Sem pg_cron, pg_net ou
-- Vault (app_url e cron_secret) nada é agendado (o watchdog do GitHub não chama estas rotas).
--   newsletter-agenda        quinta 15h45 UTC (11h45 Cuiabá)  POST /api/jobs/newsletter-agenda
--   newsletter-agenda-retry  sexta 14h45 UTC (10h45 Cuiabá)   mesma rota (ARD-T5): nova tentativa
--                            de envio da edição do fim de semana; idempotente, pula a já enviada.
--   social-agenda      segunda 12h UTC                  POST /api/jobs/social-agenda
create or replace function public.schedule_agenda_distribution_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'newsletter-agenda', '45 15 * * 4', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/newsletter-agenda',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  execute format('select cron.schedule(%L, %L, %L)', 'newsletter-agenda-retry', '45 14 * * 5', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/newsletter-agenda',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  execute format('select cron.schedule(%L, %L, %L)', 'social-agenda', '0 12 * * 1', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/social-agenda',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  return 'agendado: newsletter-agenda, newsletter-agenda-retry, social-agenda';
end $fn$;
revoke execute on function public.schedule_agenda_distribution_cron() from public, anon, authenticated, service_role;

select public.schedule_agenda_distribution_cron();
