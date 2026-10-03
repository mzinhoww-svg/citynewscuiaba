-- AUT-T4 · Disjuntor de volume e de erro da publicação automática (A8) e motivo de matéria curta
-- (R41). Numeração 0070+ (acordo com os outros agentes). Aditiva e idempotente; nenhuma função
-- nova usa DELETE.
--
-- O disjuntor NÃO é freio editorial: protege contra erro de pipeline (60 publicações por hora,
-- 800 por dia, pico de denúncias, falha de IA). Ao abrir, desliga `auto_publish` (religar exige
-- duas pessoas, 0035) e manda para revisão o que o ciclo em andamento já tinha liberado.

-- 1) Motivo de matéria curta: só publica com menos de 30 linhas quando a fonte não traz conteúdo.
alter table public.articles add column if not exists short_reason text
  check (short_reason in ('insufficient_source'));

create index if not exists articles_auto_published_idx
  on public.articles (published_at) where publish_mode = 'auto';

-- 2) Configuração e estado do disjuntor (uma linha).
create table if not exists public.publish_breaker (
  id boolean primary key default true check (id),
  hourly_limit int not null default 60 check (hourly_limit between 1 and 100000),
  daily_limit int not null default 800 check (daily_limit between 1 and 1000000),
  reports_per_hour int not null default 10 check (reports_per_hour between 1 and 100000),
  ai_failures_per_hour int not null default 15 check (ai_failures_per_hour between 1 and 100000),
  tripped_at timestamptz,
  trip_reason text check (trip_reason in ('hourly', 'daily', 'reports', 'ai_failures')),
  trip_detail jsonb not null default '{}'::jsonb,
  reset_at timestamptz,
  reset_by uuid,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.publish_breaker (id) values (true) on conflict (id) do nothing;

alter table public.publish_breaker enable row level security;
revoke all on public.publish_breaker from public, anon, authenticated;
grant select on public.publish_breaker to authenticated, service_role;
drop policy if exists publish_breaker_read on public.publish_breaker;
create policy publish_breaker_read on public.publish_breaker for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

-- 3) Contagens da janela. Só conta o que veio depois do último reset manual (`reset_at`), senão o
--    disjuntor reabriria na hora. O dia é o dia civil de Cuiabá (America/Cuiaba).
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
    'aiFailuresLastHour',(select count(*) from ai_calls c, w
                           where not c.ok and c.created_at >= w.hour_from and c.created_at <= p_now),
    'limits', jsonb_build_object('hourly', w.hourly_limit, 'daily', w.daily_limit,
                                 'reportsPerHour', w.reports_per_hour, 'aiFailuresPerHour', w.ai_failures_per_hour),
    'trippedAt', (select tripped_at from publish_breaker where id))
  from w;
$$;
revoke execute on function public.publish_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_counts(timestamptz) to service_role;

-- 4) Abrir o disjuntor (só o pipeline, com a service role): desliga a publicação automática,
--    manda o resto do ciclo para revisão e registra. Idempotente: já aberto não repete.
create or replace function public.publish_breaker_trip(p_reason text, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  if p_reason not in ('hourly', 'daily', 'reports', 'ai_failures') then
    raise exception 'breaker: motivo inválido %', p_reason using errcode = '22023';
  end if;
  update publish_breaker
     set tripped_at = now(), trip_reason = p_reason, trip_detail = coalesce(p_detail, '{}'::jsonb),
         updated_at = now()
   where id and tripped_at is null
  returning true into v_first;
  if v_first is null then
    return false;
  end if;
  update feature_flags set enabled = false, updated_at = now() where key = 'auto_publish';
  perform public.contingency_pause_cycle('Disjuntor de publicação aberto: ' || p_reason);
  insert into audit_log (actor, action, object_ref, details)
  values ('sistema', 'breaker.trip', 'flag:auto_publish',
          jsonb_build_object('reason', p_reason, 'detail', coalesce(p_detail, '{}'::jsonb)));
  return true;
end
$$;
revoke execute on function public.publish_breaker_trip(text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_breaker_trip(text, jsonb) to service_role;

-- 5) Reset manual (admin): zera a janela. Religar `auto_publish` segue com duas pessoas (0035).
create or replace function public.publish_breaker_reset(p_ctx jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_role(uid, 'admin') then
    raise exception 'breaker: só admin faz o reset' using errcode = '42501';
  end if;
  update publish_breaker
     set tripped_at = null, trip_reason = null, trip_detail = '{}'::jsonb,
         reset_at = now(), reset_by = uid, updated_by = uid, updated_at = now()
   where id;
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'breaker.reset', 'flag:auto_publish', coalesce(p_ctx, '{}'::jsonb));
end
$$;
revoke execute on function public.publish_breaker_reset(jsonb) from public, anon;
grant execute on function public.publish_breaker_reset(jsonb) to authenticated, service_role;

-- 6) Limites editáveis (admin).
create or replace function public.publish_breaker_set_limits(p jsonb, p_ctx jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_old jsonb;
begin
  if uid is null or not public.has_role(uid, 'admin') then
    raise exception 'breaker: só admin altera os limites' using errcode = '42501';
  end if;
  select to_jsonb(b) - 'trip_detail' into v_old from publish_breaker b where id;
  update publish_breaker set
    hourly_limit = coalesce((p ->> 'hourly')::int, hourly_limit),
    daily_limit = coalesce((p ->> 'daily')::int, daily_limit),
    reports_per_hour = coalesce((p ->> 'reportsPerHour')::int, reports_per_hour),
    ai_failures_per_hour = coalesce((p ->> 'aiFailuresPerHour')::int, ai_failures_per_hour),
    updated_by = uid, updated_at = now()
  where id;
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'breaker.limits', 'flag:auto_publish',
          jsonb_build_object('from', v_old, 'to', p, 'reason', coalesce(p_ctx, '{}'::jsonb) ->> 'reason'));
end
$$;
revoke execute on function public.publish_breaker_set_limits(jsonb, jsonb) from public, anon;
grant execute on function public.publish_breaker_set_limits(jsonb, jsonb) to authenticated, service_role;
