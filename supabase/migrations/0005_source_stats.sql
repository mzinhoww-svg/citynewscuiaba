-- Estatísticas de fontes para o ranking (P2-T5, A-028; spec §7; tracking-plan §4).
--
-- `refresh_source_stats_daily(dia)` consolida `events` do dia (fuso de Cuiabá) em
-- `source_stats_daily`, uma linha por fonte, de forma idempotente (reprocessar o mesmo dia
-- substitui a linha). Um job `pg_cron` roda todo dia às 3h de Cuiabá (07:00 UTC) para o dia
-- anterior, quando a extensão existe (local e Supabase); sem pg_cron, nada é agendado.
--
-- `source_item_stats` e `source_fetch_health` alimentam recência e qualidade operacional.
-- Nada disto é público: o servidor lê com service role e só mostra valores aproximados.

create index if not exists events_source_received_idx on events (source_slug, received_at)
  where source_slug is not null;
create index if not exists pipeline_events_fetch_idx on pipeline_events (item_ref, at desc)
  where step = 'fetch';
create index if not exists collected_items_source_published_idx on collected_items (source_id, published_at desc);

create or replace function refresh_source_stats_daily(
  p_day date default ((now() at time zone 'America/Cuiaba')::date - 1)
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := p_day::timestamp at time zone 'America/Cuiaba';
  v_to timestamptz := (p_day + 1)::timestamp at time zone 'America/Cuiaba';
  n int;
begin
  with ev as (
    select e.source_slug, e.name, e.anon_id, coalesce(e.session->>'id', '-') as sid, e.props
    from events e
    where e.received_at >= v_from and e.received_at < v_to and e.source_slug is not null
  ),
  agg as (
    select s.id as source_id,
           s.locality,
           -- Sessão identificada conta uma vez; evento só com métricas (sessão '-') conta por abertura.
           (count(distinct ev.sid) filter (where ev.name in ('article_opened', 'source_viewed') and ev.sid <> '-')
             + count(*) filter (where ev.name = 'article_opened' and ev.sid = '-'))::int as sessions,
           count(*) filter (where ev.name in ('article_opened', 'recommendation_clicked'))::int as clicks,
           count(*) filter (where ev.name = 'article_read')::int as reads,
           round(avg(least((ev.props->>'seconds')::numeric, 3600))
                 filter (where ev.name = 'article_read' and jsonb_typeof(ev.props->'seconds') = 'number'), 1)
             as avg_read_seconds,
           count(*) filter (where ev.name = 'article_saved')::int as saves,
           count(*) filter (where ev.name = 'article_shared')::int as shares,
           count(*) filter (where ev.name = 'source_followed')::int as follows
    from ev
    join sources s on s.slug = ev.source_slug
    group by s.id, s.locality
  ),
  ret as (
    -- Retorno: leitor (com Personalização) que já tinha aberto a fonte nos 30 dias anteriores.
    select s.id as source_id, count(distinct e.anon_id)::int as returns
    from events e
    join sources s on s.slug = e.source_slug
    where e.received_at >= v_from and e.received_at < v_to
      and e.anon_id is not null and e.name = 'article_opened'
      and exists (
        select 1 from events p
        where p.anon_id = e.anon_id and p.source_slug = e.source_slug and p.name = 'article_opened'
          and p.received_at >= v_from - interval '30 days' and p.received_at < v_from
      )
    group by s.id
  )
  insert into source_stats_daily as d
    (day, source_id, locality, sessions, clicks, reads, avg_read_seconds, saves, shares, returns, follows)
  select p_day, a.source_id, a.locality, a.sessions, a.clicks, a.reads, a.avg_read_seconds,
         a.saves, a.shares, coalesce(r.returns, 0), a.follows
  from agg a
  left join ret r using (source_id)
  on conflict (day, source_id) do update
    set locality = excluded.locality, sessions = excluded.sessions, clicks = excluded.clicks,
        reads = excluded.reads, avg_read_seconds = excluded.avg_read_seconds, saves = excluded.saves,
        shares = excluded.shares, returns = excluded.returns, follows = excluded.follows;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function refresh_source_stats_daily(date) from public, anon, authenticated;
grant execute on function refresh_source_stats_daily(date) to service_role;

-- Recência: itens de cada fonte nas últimas 24 h, hoje (Cuiabá) e o mais recente.
create or replace view source_item_stats as
  select ci.source_id,
         count(*) filter (where ci.published_at >= now() - interval '24 hours')::int as items_24h,
         count(*) filter (
           where ci.published_at >= (date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba')
         )::int as items_today,
         max(ci.published_at) as last_item_at
  from collected_items ci
  where ci.duplicate_of is null and ci.published_at is not null and ci.published_at <= now() + interval '5 minutes'
  group by ci.source_id;

-- Qualidade operacional: coletas (`pipeline_events`, etapa fetch) dos últimos 30 dias.
-- Falhas seguidas = tentativas sem sucesso depois do último sucesso.
create or replace view source_fetch_health as
  with f as (
    select substr(p.item_ref, 8) as slug, p.level, p.at
    from pipeline_events p
    where p.step = 'fetch' and p.item_ref like 'source:%' and p.at >= now() - interval '30 days'
  ),
  last_ok as (
    select slug, max(at) as at from f where level = 'info' group by slug
  )
  select f.slug,
         count(*) filter (where f.level = 'info')::int as ok,
         count(*)::int as total,
         count(*) filter (where f.level <> 'info' and f.at > coalesce(l.at, '-infinity'::timestamptz))::int
           as consecutive_failures
  from f
  left join last_ok l using (slug)
  group by f.slug;

revoke all on source_item_stats, source_fetch_health from public, anon, authenticated;
grant select on source_item_stats, source_fetch_health to service_role;

-- Todo dia às 3h de Cuiabá (07:00 UTC), para o dia anterior. Sem pg_cron, nada é agendado.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'source-stats-daily'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'source-stats-daily', '0 7 * * *',
      'select refresh_source_stats_daily()');
  end if;
end $$;
