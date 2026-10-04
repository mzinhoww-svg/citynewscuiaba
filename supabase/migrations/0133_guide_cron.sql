-- GUIA-T4/T7 · Agendamento das propostas (3 por semana) e da atualização de 90 dias.
-- Aditiva e idempotente. Mesmo molde de `schedule_agenda_cron` (0053): sem pg_cron, pg_net ou
-- Vault, o watchdog do GitHub cobre. As duas chamadas vão à mesma rota autenticada por CRON_SECRET.
create or replace function public.schedule_guide_proposals_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre as propostas do Guia)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  -- Segunda, quarta e sexta, 05h11 em Cuiabá (09h11 UTC): uma proposta por chamada, 3 por semana.
  execute format('select cron.schedule(%L, %L, %L)', 'guide-propose', '11 9 * * 1,3,5', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/guide?mode=propose',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  -- Todo dia, 04h41 em Cuiabá: atualiza as listas com mais de 90 dias.
  execute format('select cron.schedule(%L, %L, %L)', 'guide-refresh', '41 8 * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/guide?mode=refresh',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);
  return 'agendado: guide-propose e guide-refresh';
end $fn$;
revoke execute on function public.schedule_guide_proposals_cron() from public, anon, authenticated, service_role;

select public.schedule_guide_proposals_cron();
