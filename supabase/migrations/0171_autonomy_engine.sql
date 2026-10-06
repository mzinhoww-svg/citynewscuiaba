-- 0171 · Motor de autonomia do pipeline (A-161): nada parado, disjuntor que se recupera, itens
-- mortos com recomendação, incidente por causa comum e saúde da fila. Aditiva e idempotente.
--
--  1. `articles` ganha o estado do motor: próxima ação e quando (`next_action`, `next_attempt_at`),
--     reprocessos feitos, quarentena (data e motivo), nível de autonomia (A0 a A4) e motivo do
--     modo degradado. `autonomy_due_articles` entrega à varredura o que venceu.
--  2. Disjuntor: ao abrir, segura o ciclo como rascunho com `next_action = breaker_recovery` (não
--     manda mais para revisão humana); `publish_breaker_auto_recover` religa sozinho depois do
--     resfriamento quando as contagens caem abaixo de 80% dos limites, se a política permitir
--     (`auto_resume`). Falha de IA conta só a final (a que o modelo reserva recuperou não conta, nem
--     recusa de orçamento, IA desligada ou injeção). O admin continua com o reset manual.
--  3. Fila de itens mortos: classe do erro, recomendação, próxima tentativa e tentativas
--     automáticas em `pipeline_quarantine`.
--  4. `pipeline_incidents`: falhas com a mesma causa viram um incidente (não N pedidos).
--  5. `autonomy_queue_health()`: profundidade, idade do mais antigo, falhas, novas tentativas,
--     itens mortos, resolução automática e exceção humana.

-- ---------------------------------------------------------------------------
-- 1. Estado do motor na matéria
-- ---------------------------------------------------------------------------
alter table public.articles add column if not exists next_action text;
alter table public.articles add column if not exists next_attempt_at timestamptz;
alter table public.articles add column if not exists reprocess_count int not null default 0;
alter table public.articles add column if not exists quarantined_at timestamptz;
alter table public.articles add column if not exists quarantine_reason text;
alter table public.articles add column if not exists autonomy_level text;
alter table public.articles add column if not exists degraded_reason text;
alter table public.articles drop constraint if exists articles_autonomy_level_check;
alter table public.articles add constraint articles_autonomy_level_check
  check (autonomy_level is null or autonomy_level in ('A0', 'A1', 'A2', 'A3', 'A4'));
alter table public.articles drop constraint if exists articles_next_action_check;
alter table public.articles add constraint articles_next_action_check
  check (next_action is null or next_action in ('rewrite', 'reevaluate', 'await_auto_publish', 'breaker_recovery'));
create index if not exists articles_next_attempt_idx on public.articles (next_attempt_at)
  where next_attempt_at is not null and quarantined_at is null;

-- Matérias do pipeline com a próxima ação vencida (rascunho, sem pessoa, fora da quarentena).
create or replace function public.autonomy_due_articles(p_now timestamptz default now(), p_limit int default 50)
returns table (id uuid, topic_id uuid, next_action text, ai_fallback boolean, reprocess_count int)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.topic_id, a.next_action, a.ai_fallback, a.reprocess_count
    from articles a
   where a.status = 'draft'
     and a.next_attempt_at is not null and a.next_attempt_at <= p_now
     and a.quarantined_at is null
     and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
   order by a.next_attempt_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.autonomy_due_articles(timestamptz, int) from public, anon, authenticated;
grant execute on function public.autonomy_due_articles(timestamptz, int) to service_role;

-- Marca a matéria como tratada pela varredura (evita reenfileirar no mesmo minuto).
create or replace function public.autonomy_claim_article(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update articles set next_attempt_at = null where id = p_id
$$;
revoke execute on function public.autonomy_claim_article(uuid) from public, anon, authenticated;
grant execute on function public.autonomy_claim_article(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Disjuntor: segura sem fila humana e se recupera sozinho
-- ---------------------------------------------------------------------------
alter table public.publish_breaker add column if not exists auto_resume boolean not null default true;
alter table public.publish_breaker add column if not exists cooldown_minutes int not null default 30;
alter table public.publish_breaker add column if not exists disabled_by_trip boolean not null default false;

-- Falha de IA final: falhas do provedor/tempo/formato menos as recuperadas pelo modelo reserva.
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

-- Segura o ciclo em andamento como rascunho com próxima ação (sem revisão humana).
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

-- 0073 + segura o ciclo como rascunho (`breaker_recovery`) em vez de revisão humana e lembra que
-- foi o disjuntor quem desligou `auto_publish` (só esse caso religa sozinho).
create or replace function public.publish_breaker_trip(p_reason text, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
  v_was_on boolean;
begin
  if p_reason not in ('hourly', 'daily', 'reports', 'ai_failures') then
    raise exception 'breaker: motivo inválido %', p_reason using errcode = '22023';
  end if;
  select enabled into v_was_on from feature_flags where key = 'auto_publish';
  update publish_breaker
     set tripped_at = now(), trip_reason = p_reason, trip_detail = coalesce(p_detail, '{}'::jsonb),
         disabled_by_trip = coalesce(v_was_on, false), updated_at = now()
   where id and tripped_at is null
  returning true into v_first;
  if v_first is null then
    return false;
  end if;
  update feature_flags set enabled = false, updated_at = now() where key = 'auto_publish';
  perform public.autonomy_hold_cycle('Disjuntor de publicação aberto (' || p_reason
    || '): fica em rascunho e volta sozinha quando o disjuntor se recuperar.', 'breaker_recovery',
    (select cooldown_minutes from publish_breaker where id));
  insert into audit_log (actor, action, object_ref, details)
  values ('sistema', 'breaker.trip', 'flag:auto_publish',
          jsonb_build_object('reason', p_reason, 'detail', coalesce(p_detail, '{}'::jsonb)));
  return true;
end
$$;
revoke execute on function public.publish_breaker_trip(text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_breaker_trip(text, jsonb) to service_role;

-- TRIP → THROTTLE → DIAGNOSE → AUTO-RECOVER. Religa só o que o disjuntor desligou, depois do
-- resfriamento e com as contagens abaixo de 80% dos limites; devolve o diagnóstico.
create or replace function public.publish_breaker_auto_recover(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b publish_breaker%rowtype;
  c jsonb;
  v_ok boolean;
  v_released int := 0;
begin
  select * into b from publish_breaker where id for update;
  if b.tripped_at is null then
    return jsonb_build_object('recovered', false, 'reason', 'closed');
  end if;
  if not b.auto_resume then
    return jsonb_build_object('recovered', false, 'reason', 'auto_resume_off');
  end if;
  if p_now < b.tripped_at + make_interval(mins => b.cooldown_minutes) then
    return jsonb_build_object('recovered', false, 'reason', 'cooldown',
                              'until', b.tripped_at + make_interval(mins => b.cooldown_minutes));
  end if;
  c := public.publish_counts(p_now);
  v_ok := (c ->> 'publishedLastHour')::int < 0.8 * b.hourly_limit
      and (c ->> 'publishedToday')::int < 0.8 * b.daily_limit
      and (c ->> 'reportsLastHour')::int < b.reports_per_hour
      and (c ->> 'aiFailuresLastHour')::int < b.ai_failures_per_hour;
  if not v_ok then
    return jsonb_build_object('recovered', false, 'reason', 'still_high', 'counts', c);
  end if;
  update publish_breaker
     set tripped_at = null, trip_reason = null, trip_detail = '{}'::jsonb, reset_at = p_now,
         reset_by = null, disabled_by_trip = false, updated_at = now()
   where id;
  if b.disabled_by_trip then
    update feature_flags set enabled = true, updated_at = now() where key = 'auto_publish';
  end if;
  update articles set next_attempt_at = p_now
   where next_action = 'breaker_recovery' and status = 'draft' and quarantined_at is null;
  get diagnostics v_released = row_count;
  insert into audit_log (actor, action, object_ref, details)
  values ('system', 'breaker.auto_recover', 'flag:auto_publish',
          jsonb_build_object('tripReason', b.trip_reason, 'trippedAt', b.tripped_at, 'counts', c,
                             'autoPublishRestored', b.disabled_by_trip, 'released', v_released));
  perform public.governance_record('breaker.auto_recover', 'flag:auto_publish', 'auto_approved',
    'breaker.auto_recover', 'Disjuntor recuperado: resfriamento cumprido e contagens abaixo de 80% dos limites',
    jsonb_build_object('counts', c, 'tripReason', b.trip_reason), 1);
  return jsonb_build_object('recovered', true, 'released', v_released,
                            'autoPublishRestored', b.disabled_by_trip, 'counts', c);
end
$$;
revoke execute on function public.publish_breaker_auto_recover(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_breaker_auto_recover(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Fila de itens mortos com recomendação
-- ---------------------------------------------------------------------------
alter table public.pipeline_quarantine add column if not exists reason_class text;
alter table public.pipeline_quarantine add column if not exists recommendation text;
alter table public.pipeline_quarantine add column if not exists next_retry_at timestamptz;
alter table public.pipeline_quarantine add column if not exists auto_retries int not null default 0;
create index if not exists pipeline_quarantine_retry_idx on public.pipeline_quarantine (next_retry_at)
  where resolved_at is null and next_retry_at is not null;

-- ---------------------------------------------------------------------------
-- 4. Incidente por causa comum
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_incidents (
  id bigserial primary key,
  signature text not null,
  step text not null,
  error_class text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count int not null default 0,
  status text not null default 'open' check (status in ('open', 'mitigated', 'resolved')),
  diagnosis text,
  action text,
  resolved_at timestamptz
);
create unique index if not exists pipeline_incidents_open_sig on public.pipeline_incidents (signature)
  where status <> 'resolved';
alter table public.pipeline_incidents enable row level security;
drop policy if exists pipeline_incidents_read_staff on public.pipeline_incidents;
create policy pipeline_incidents_read_staff on public.pipeline_incidents for select to authenticated
  using (public.is_staff((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. Saúde da fila
-- ---------------------------------------------------------------------------
create or replace function public.autonomy_queue_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'queueDepth', (select count(*) from jobs),
    'oldestAgeSec', (select coalesce(extract(epoch from (p_now - min(enqueued_at)))::int, 0) from jobs),
    'retrying', (select count(*) from jobs where last_error is not null),
    'deadLetters', (select count(*) from pipeline_quarantine where resolved_at is null),
    'failuresLastHour', (select count(*) from pipeline_events
                          where at > p_now - interval '1 hour' and level in ('error', 'security')),
    'eventsLastHour', (select count(*) from pipeline_events where at > p_now - interval '1 hour'),
    'reprocessing', (select count(*) from articles
                      where next_attempt_at is not null and quarantined_at is null and status = 'draft'),
    'quarantined24h', (select count(*) from articles where quarantined_at > p_now - interval '24 hours'),
    'humanExceptions', (select count(*) from articles where status = 'in_review'),
    'autoDecisions24h', (select count(*) from decisions
                          where step in ('rules', 'publish') and created_at > p_now - interval '24 hours'),
    'openIncidents', (select count(*) from pipeline_incidents where status = 'open')
  )
$$;
revoke execute on function public.autonomy_queue_health(timestamptz) from public, anon;
grant execute on function public.autonomy_queue_health(timestamptz) to authenticated, service_role;

-- Ações de auditoria novas (mesma união das migrations anteriores).
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(public.studio_audit_actions() || array['breaker.auto_recover']) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
