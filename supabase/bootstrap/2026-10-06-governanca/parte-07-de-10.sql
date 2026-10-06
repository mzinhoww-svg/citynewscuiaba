select 'parte 7 de 10' as inicio;
create or replace function public.publish_counts(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select coalesce(reset_at, '-infinity'::timestamptz) as since,
           hourly_limit, daily_limit, reports_per_hour, ai_failures_per_hour
      from publish_breaker where id
  ), w as (
    select greatest(p_now - interval '1 hour', b.since) as hour_from,
           greatest((date_trunc('day', p_now at time zone 'America/Cuiaba')) at time zone 'America/Cuiaba', b.since) as day_from,
           b.*
      from b
  )
  select jsonb_build_object(
    'publishedLastHour', (select count(*) from articles a, w
                           where a.publish_mode = 'auto' and a.published_at >= w.hour_from and a.published_at <= p_now),
    'publishedToday',    (select count(*) from articles a, w
                           where a.publish_mode = 'auto' and a.published_at >= w.day_from and a.published_at <= p_now),
    'reportsLastHour',   (select count(*) from reports r, w where r.created_at >= w.hour_from and r.created_at <= p_now),
    'aiCallsLastHour',   (select count(*) from ai_calls c, w where c.created_at >= w.hour_from and c.created_at <= p_now),
    'aiFailuresLastHour',(select greatest(0,
                             (select count(*) from ai_calls c
                               where not c.ok and c.created_at >= w.hour_from and c.created_at <= p_now
                                 and coalesce(c.error, '') not in ('budget_exceeded', 'disabled', 'injection'))
                           - (select count(*) from ai_calls c
                               where c.ok and c.fallback_used and c.created_at >= w.hour_from and c.created_at <= p_now))),
    'limits', jsonb_build_object('hourly', w.hourly_limit, 'daily', w.daily_limit,
                                 'reportsPerHour', w.reports_per_hour, 'aiFailuresPerHour', w.ai_failures_per_hour),
    'trippedAt', (select tripped_at from publish_breaker where id))
  from w;
$$;
revoke execute on function public.publish_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_counts(timestamptz) to service_role;
create or replace function public.autonomy_hold_cycle(p_reason text, p_next_action text, p_minutes int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with running as (
    select r.id from ingest_runs r where r.status = 'running'
  ), cycle_articles as (
    select distinct a.id
    from articles a
    join collected_items ci on ci.topic_id = a.topic_id
    join raw_items ri on ri.id = ci.raw_id
    join running r on r.id = ri.run_id
    where a.status in ('draft', 'in_review')
      and a.publish_mode is null
      and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
  ), to_hold as (
    select ca.id
    from cycle_articles ca
    where exists (
      select 1
      from (
        select d.step, d.output ->> 'route' as route
        from decisions d
        where d.object_ref = 'article:' || ca.id::text and d.step in ('rules', 'publish')
        order by d.created_at desc
        limit 1
      ) last
      where last.step = 'rules' and last.route in ('publish', 'publish_notify')
    )
  ), ins as (
    insert into decisions (object_ref, step, input_hash, output, rationale, recommended)
    select 'article:' || t.id::text, 'publish', 'autonomy-hold:' || now()::text,
           jsonb_build_object('published', false, 'hold', p_next_action, 'actor', 'system'),
           p_reason, 'publish'
    from to_hold t
    returning object_ref
  ), upd as (
    update articles a
       set status = 'draft', review_reason = p_reason, next_action = p_next_action,
           next_attempt_at = now() + make_interval(mins => greatest(p_minutes, 1)), updated_at = now()
      from to_hold t
     where a.id = t.id
    returning a.id
  )
  select count(*) into n from upd;
  return coalesce(n, 0);
end
$$;
revoke execute on function public.autonomy_hold_cycle(text, text, int) from public, anon, authenticated;
grant execute on function public.autonomy_hold_cycle(text, text, int) to service_role;
select 'parte 7 de 10 ok' as fim;
