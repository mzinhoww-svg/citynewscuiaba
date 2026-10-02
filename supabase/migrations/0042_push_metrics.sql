-- 0042 · Funil do app (spec 2026-09-28 §9.3, §9.4, §10.6; PW-T14).
-- Etapas 1–4 vêm de `events` (só de quem permite métricas: sem consentimento nada é gravado),
-- 5 de `push_deliveries` (`sent` e `measurable`), 6 e 7 de `push_send_counters`. Tudo é contagem
-- de eventos, nunca de pessoas: não há id na tabela diária nem na RPC.

create table if not exists push_funnel_daily (
  day date not null,
  stage text not null,
  device_class text not null,
  browser text not null,
  n int not null default 0,
  primary key (day, stage, device_class, browser)
);
alter table push_funnel_daily enable row level security;
revoke all on push_funnel_daily from public, anon, authenticated;

-- Contagens por etapa num intervalo (fechado no início, aberto no fim). Usada pelo fechamento
-- diário e pelo dia corrente ao vivo. Etapas: install_prompt_shown, app_installed (via prompt ou
-- ios_steps), notif_preprompt_shown, notif_permission_granted (gatilho ≠ settings),
-- sent_measurable, delivered, clicked; auxiliares: out_install (via browser/unknown),
-- out_permission (gatilho settings), denied, sent_total.
create or replace function public.push_funnel_compute(p_from timestamptz, p_to timestamptz)
returns table (stage text, device_class text, browser text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select
      case
        when e.name = 'install_prompt_shown' then 'install_prompt_shown'
        when e.name = 'app_installed' and coalesce(e.props->>'via', '') in ('prompt', 'ios_steps') then 'app_installed'
        when e.name = 'app_installed' then 'out_install'
        when e.name = 'notif_preprompt_shown' then 'notif_preprompt_shown'
        when e.name = 'notif_permission_granted' and coalesce(e.props->>'trigger', '') <> 'settings' then 'notif_permission_granted'
        when e.name = 'notif_permission_granted' then 'out_permission'
        when e.name = 'notif_permission_denied' then 'denied'
      end as stage,
      coalesce(e.session->>'device', 'other') as device_class,
      coalesce(e.props->>'browser', 'other') as browser
    from events e
    where e.received_at >= p_from and e.received_at < p_to
      and e.name in ('install_prompt_shown', 'app_installed', 'notif_preprompt_shown',
                     'notif_permission_granted', 'notif_permission_denied')
  ),
  del as (
    select
      case when d.measurable then 'sent_measurable' else null end as stage_m,
      coalesce(d.device_class, 'other') as device_class,
      coalesce(d.browser, 'other') as browser
    from push_deliveries d
    where d.status = 'sent' and d.sent_at >= p_from and d.sent_at < p_to
  ),
  cnt as (
    select c.device_class, c.browser, c.delivered, c.clicked
    from push_send_counters c
    join push_sends s on s.id = c.send_id
    where s.started_at >= p_from and s.started_at < p_to
  )
  select stage, device_class, browser, count(*)::bigint from ev where stage is not null
    group by stage, device_class, browser
  union all
  select 'sent_total', device_class, browser, count(*)::bigint from del group by device_class, browser
  union all
  select 'sent_measurable', device_class, browser, count(*)::bigint from del where stage_m is not null
    group by device_class, browser
  union all
  select 'delivered', device_class, browser, sum(delivered)::bigint from cnt group by device_class, browser
  union all
  select 'clicked', device_class, browser, sum(clicked)::bigint from cnt group by device_class, browser
$$;
revoke execute on function public.push_funnel_compute(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.push_funnel_compute(timestamptz, timestamptz) to service_role;

-- Fecha um dia (idempotente). Só o serviço (pg_cron ou operação).
create or replace function public.push_funnel_refresh(p_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from push_funnel_daily where day = p_day;
  insert into push_funnel_daily (day, stage, device_class, browser, n)
  select p_day, c.stage, c.device_class, c.browser, c.n
    from push_funnel_compute(p_day::timestamptz, (p_day + 1)::timestamptz) c
   where c.n > 0;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.push_funnel_refresh(date) from public, anon, authenticated;
grant execute on function public.push_funnel_refresh(date) to service_role;

-- Funil no período: dias fechados da tabela diária + dia corrente ao vivo. Só push.metrics.
create or replace function public.push_funnel(
  p_from date, p_to date, p_device text default null, p_browser text default null
)
returns table (stage text, n bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_to date := least(p_to, current_date);
  v_closed_to date := least(p_to, current_date - 1);
begin
  if not push_can(auth.uid(), 'push.metrics') then
    raise exception 'sem permissão (push.metrics)' using errcode = '42501';
  end if;
  return query
  with closed as (
    select f.stage, f.n::bigint as n
      from push_funnel_daily f
     where f.day >= p_from and f.day <= v_closed_to
       and (p_device is null or f.device_class = p_device)
       and (p_browser is null or f.browser = p_browser)
  ),
  live as (
    select c.stage, c.n
      from push_funnel_compute(current_date::timestamptz, (current_date + 1)::timestamptz) c
     where v_to >= current_date and p_from <= current_date
       and (p_device is null or c.device_class = p_device)
       and (p_browser is null or c.browser = p_browser)
  ),
  allrows as (select * from closed union all select * from live)
  select a.stage, sum(a.n)::bigint from allrows a group by a.stage;
end
$$;
revoke execute on function public.push_funnel(date, date, text, text) from public, anon;
grant execute on function public.push_funnel(date, date, text, text) to authenticated, service_role;

-- Inscrições ativas por família de navegador (cadastro do serviço, sem consentimento de métricas).
create or replace function public.push_active_by_browser()
returns table (browser text, n bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not push_can(auth.uid(), 'push.metrics') then
    raise exception 'sem permissão (push.metrics)' using errcode = '42501';
  end if;
  return query
    select coalesce(s.browser, 'other') as browser, count(*)::bigint
      from push_subscriptions s
     group by coalesce(s.browser, 'other')
     order by 2 desc;
end
$$;
revoke execute on function public.push_active_by_browser() from public, anon;
grant execute on function public.push_active_by_browser() to authenticated, service_role;

-- Fechamento diário às 04:40 UTC (depois da retenção de events, 03:40), só com pg_cron.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'push-funnel'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'push-funnel', '40 4 * * *',
      'select public.push_funnel_refresh(current_date - 1)');
  end if;
end $$;
