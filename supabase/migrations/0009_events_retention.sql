-- Eventos do leitor (P2-T3, ADR-007/ADR-008, spec §10): índice por anonId e retenção.
--
-- A API /api/events grava com service role (sem política de insert para anon/authenticated).
-- O IP nunca é gravado: só vira chave de limite de uso (hash com sal diário, 0003_rate_limits).
-- Retenção: eventos individuais valem 90 dias; depois perdem tudo que identifica o leitor
-- (anonId, userId, id da sessão, referência e props pessoais) e ficam só para contagem.

create index if not exists events_anon_idx on events (anon_id, received_at)
  where anon_id is not null;
create index if not exists events_name_received_idx on events (name, received_at desc);

create or replace function anonymize_old_events(p_days int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  update events
     set anon_id = null,
         user_id = null,
         session = jsonb_build_object(
           'id', '-',
           'page', session->'page',
           'referrer', null,
           'device', session->'device'
         ),
         props = props - 'query'
   where received_at < now() - make_interval(days => greatest(p_days, 1))
     and (anon_id is not null or user_id is not null or session->>'id' <> '-'
          or session->>'referrer' is not null or props ? 'query');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function anonymize_old_events(int) from public, anon, authenticated;
grant execute on function anonymize_old_events(int) to service_role;

-- Diariamente às 3h40 (UTC) quando há pg_cron. Não depende de segredo nem de rede.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'events-retention'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'events-retention', '40 3 * * *',
      'select anonymize_old_events(90)');
  end if;
end $$;
