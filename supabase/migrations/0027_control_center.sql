-- P5-T3 · Control Center: visão geral, tempo real, falhas, execuções e logs.
--
-- 1. Pausa automática de fonte (architecture §10, "fonte com 3 falhas seguidas"): 3 coletas
--    seguidas com falha (eventos `fetch` de nível warn/error/security depois do último sucesso e
--    da última reativação) pausam a fonte ativa, gravam `auto_paused_at` e avisam o Control
--    Center. Reativar a fonte (status volta a `active`) zera a contagem. Eventos de seed
--    (`details.seed`) não pausam nada.
-- 2. Leituras agregadas do Control Center para quem tem `metrics.view` (fila, saúde das fontes,
--    pendências e custo por ciclo) em funções que checam o papel: `jobs`, as views de saúde e
--    `ai_calls` continuam fechados para leitura direta.
-- 3. Busca de logs em `pipeline_events` com a RLS de quem lê (security invoker).
-- 4. Ações novas na lista fechada de auditoria.

-- ---------------------------------------------------------------------------
-- 1. Pausa automática
-- ---------------------------------------------------------------------------
alter table sources add column if not exists auto_paused_at timestamptz;
alter table sources add column if not exists fetch_reset_at timestamptz;

-- Falhas seguidas de coleta de uma fonte: depois do último sucesso e da última reativação.
create or replace function public.source_consecutive_failures(p_slug text, p_reset timestamptz)
returns int
language sql
stable
set search_path = public
as $$
  with last_ok as (
    select max(p.at) as at from pipeline_events p
    where p.step = 'fetch' and p.item_ref = 'source:' || p_slug and p.level = 'info'
      and p.at >= now() - interval '30 days'
  )
  select count(*)::int from pipeline_events p, last_ok
  where p.step = 'fetch' and p.item_ref = 'source:' || p_slug and p.level <> 'info'
    and p.at >= now() - interval '30 days'
    and p.at > greatest(coalesce(last_ok.at, '-infinity'::timestamptz), coalesce(p_reset, '-infinity'::timestamptz))
$$;
revoke execute on function public.source_consecutive_failures(text, timestamptz) from public, anon, authenticated;

create or replace function public.pipeline_events_auto_pause()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  if new.step <> 'fetch' or new.level = 'info' or new.item_ref is null
     or new.item_ref not like 'source:%' or coalesce(new.details ? 'seed', false) then
    return null;
  end if;
  select id, slug, name, status, fetch_reset_at into s from sources where slug = substr(new.item_ref, 8);
  if not found or s.status <> 'active' then
    return null;
  end if;
  if public.source_consecutive_failures(s.slug, s.fetch_reset_at) < 3 then
    return null;
  end if;
  update sources
     set status = 'paused', auto_paused_at = now(),
         last_error = 'Pausada automaticamente depois de 3 falhas seguidas de coleta. Último erro: ' || left(new.message, 400)
   where id = s.id and status = 'active';
  perform notify_once(jsonb_build_object(
    'kind', 'source_auto_paused', 'channel', 'control_center', 'severity', 'warn',
    'objectRef', 'source:' || s.slug, 'dedupeKey', 'source_auto_paused:' || s.slug,
    'title', 'Fonte pausada automaticamente: ' || s.name,
    'body', '3 falhas seguidas de coleta. Último erro: ' || left(new.message, 400)), 600);
  return null;
end
$$;
revoke execute on function public.pipeline_events_auto_pause() from public, anon, authenticated;
drop trigger if exists pipeline_events_auto_pause on pipeline_events;
create trigger pipeline_events_auto_pause after insert on pipeline_events
  for each row execute function public.pipeline_events_auto_pause();

-- Reativar (qualquer status → active) zera a contagem e tira a marca de pausa automática.
create or replace function public.sources_fetch_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and old.status <> 'active' then
    new.auto_paused_at := null;
    new.fetch_reset_at := now();
  elsif new.status <> 'paused' then
    new.auto_paused_at := null;
  end if;
  return new;
end
$$;
revoke execute on function public.sources_fetch_reset() from public, anon, authenticated;
drop trigger if exists sources_fetch_reset on sources;
create trigger sources_fetch_reset before update of status on sources
  for each row execute function public.sources_fetch_reset();

-- ---------------------------------------------------------------------------
-- 2. Leituras agregadas (metrics.view: admin, editor_chefe, editor, operador_ia, analista, leitura)
-- ---------------------------------------------------------------------------
create or replace function public.control_can_view(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(uid, '{admin,editor_chefe,editor,operador_ia,analista,leitura}')
$$;

create or replace function public.control_can_operate(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(uid, '{admin,editor_chefe,operador_ia}')
$$;

create or replace function public.control_guard_view()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.control_can_view(auth.uid()) then
    raise exception 'control: sem permissão' using errcode = '42501';
  end if;
end
$$;

-- Saúde das fontes (O01, O03): coletas de 30 dias, falhas seguidas, erros e itens em 24 h.
create or replace function public.control_source_health()
returns table (
  id uuid, slug text, name text, kind text, status text, reliability text, frequency_minutes int,
  last_fetched_at timestamptz, last_error text, auto_paused_at timestamptz,
  ok_30d int, total_30d int, consecutive_failures int, errors_24h int, items_24h int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.control_guard_view();
  return query
  with f as (
    select substr(p.item_ref, 8) as slug, p.level, p.at
    from pipeline_events p
    where p.step = 'fetch' and p.item_ref like 'source:%' and p.at >= now() - interval '30 days'
  ), agg as (
    select f.slug,
           count(*) filter (where f.level = 'info')::int as ok,
           count(*)::int as total,
           count(*) filter (where f.level <> 'info' and f.at >= now() - interval '24 hours')::int as errors_24h
    from f group by f.slug
  )
  select s.id, s.slug, coalesce(s.display_name, s.name), s.kind::text, s.status::text, s.reliability::text,
         s.frequency_minutes, s.last_fetched_at, s.last_error, s.auto_paused_at,
         coalesce(a.ok, 0), coalesce(a.total, 0),
         public.source_consecutive_failures(s.slug, s.fetch_reset_at),
         coalesce(a.errors_24h, 0), coalesce(i.items_24h, 0)
  from sources s
  left join agg a on a.slug = s.slug
  left join source_item_stats i on i.source_id = s.id
  order by s.name;
end
$$;

-- Fila por etapa (O01, O02): pronta, em processamento e aguardando nova tentativa. Só as filas
-- de produção (sem namespace de teste).
create or replace function public.control_queue_stats()
returns table (queue text, step text, ready int, in_flight int, retrying int, oldest_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.control_guard_view();
  return query
  select j.queue, coalesce(j.message->>'step', '?'),
         count(*) filter (where j.visible_at <= clock_timestamp())::int,
         count(*) filter (where j.visible_at > clock_timestamp() and j.last_error is null)::int,
         count(*) filter (where j.visible_at > clock_timestamp() and j.last_error is not null)::int,
         min(j.enqueued_at)
  from jobs j
  where j.queue in ('pipeline', 'media', 'notify')
  group by j.queue, j.message->>'step';
end
$$;

-- Pendências, quarentena aberta e custo de IA por ciclo (O01, O07). O custo é o gasto registrado
-- em `ai_calls` entre o início do ciclo e o início do seguinte (as chamadas não levam o ciclo).
create or replace function public.control_run_totals(p_run_ids uuid[])
returns table (run_id uuid, pending int, quarantined int, cost_brl numeric, ai_calls int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.control_guard_view();
  return query
  with r as (
    select ir.id, ir.started_at,
           coalesce((select min(n.started_at) from ingest_runs n where n.started_at > ir.started_at), 'infinity'::timestamptz) as until
    from ingest_runs ir where ir.id = any (p_run_ids)
  )
  select r.id,
         (select count(*)::int from jobs j where j.message->>'runId' = r.id::text and j.queue in ('pipeline', 'media', 'notify')),
         (select count(*)::int from pipeline_quarantine q
           where q.message->>'runId' = r.id::text and q.resolved_at is null and q.queue in ('pipeline', 'media', 'notify')),
         coalesce((select sum(c.cost_brl) from ai_calls c where c.created_at >= r.started_at and c.created_at < r.until), 0)::numeric,
         (select count(*)::int from ai_calls c where c.created_at >= r.started_at and c.created_at < r.until)
  from r;
end
$$;

-- Eventos por etapa de cada ciclo (O07): contagem por nível e janela de tempo. Invoker: vale a
-- RLS de `pipeline_events` (equipe).
create or replace function public.control_run_steps(p_run_ids uuid[])
returns table (run_id uuid, step text, ok int, warn int, error int, security int, first_at timestamptz, last_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select e.run_id, e.step,
         count(*) filter (where e.level = 'info')::int,
         count(*) filter (where e.level = 'warn')::int,
         count(*) filter (where e.level = 'error')::int,
         count(*) filter (where e.level = 'security')::int,
         min(e.at), max(e.at)
  from pipeline_events e
  where e.run_id = any (p_run_ids)
  group by e.run_id, e.step
$$;

-- Mensagens aguardando nova tentativa (O06). Operação: admin, editor_chefe, operador_ia.
create or replace function public.control_retrying_jobs(p_limit int default 100)
returns table (id bigint, queue text, step text, item_ref text, run_ref text, read_ct int, last_error text,
               visible_at timestamptz, enqueued_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.control_can_operate(auth.uid()) then
    raise exception 'control: sem permissão' using errcode = '42501';
  end if;
  return query
  select j.id, j.queue, j.message->>'step', j.message->>'itemRef', j.message->>'runId', j.read_ct, j.last_error,
         j.visible_at, j.enqueued_at
  from jobs j
  where j.last_error is not null and j.queue in ('pipeline', 'media', 'notify')
  order by j.visible_at
  limit greatest(1, least(p_limit, 500));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Logs (O08): filtros por ciclo, item, fonte, etapas, nível e texto; paginação por id.
-- ---------------------------------------------------------------------------
create or replace function public.control_logs(
  p_run uuid default null, p_item text default null, p_source text default null,
  p_steps text[] default null, p_level text default null, p_q text default null,
  p_before bigint default null, p_since timestamptz default null, p_limit int default 50
)
returns table (id bigint, at timestamptz, run_id uuid, step text, item_ref text, level text, message text, details jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, e.at, e.run_id, e.step, e.item_ref, e.level, e.message, e.details
  from pipeline_events e
  where (p_run is null or e.run_id = p_run)
    and (p_item is null or e.item_ref = p_item or e.item_ref like p_item || '#%')
    and (p_source is null
         or e.item_ref = 'source:' || p_source
         or exists (select 1 from raw_items r join sources s on s.id = r.source_id
                    where s.slug = p_source and split_part(e.item_ref, '#', 1) = 'raw:' || r.id)
         or exists (select 1 from collected_items ci join sources s on s.id = ci.source_id
                    where s.slug = p_source and e.item_ref = 'item:' || ci.id))
    and (p_steps is null or e.step = any (p_steps))
    and (p_level is null or e.level = p_level)
    and (p_q is null or e.message ilike '%' || p_q || '%' or e.item_ref ilike '%' || p_q || '%'
         or e.details::text ilike '%' || p_q || '%')
    and (p_before is null or e.id < p_before)
    and (p_since is null or e.at >= p_since)
  order by e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 1000))
$$;

revoke execute on function
  public.control_can_view(uuid), public.control_can_operate(uuid), public.control_guard_view(),
  public.control_source_health(), public.control_queue_stats(), public.control_run_totals(uuid[]),
  public.control_run_steps(uuid[]), public.control_retrying_jobs(int),
  public.control_logs(uuid, text, text, text[], text, text, bigint, timestamptz, int)
  from public, anon;
grant execute on function
  public.control_source_health(), public.control_queue_stats(), public.control_run_totals(uuid[]),
  public.control_run_steps(uuid[]), public.control_retrying_jobs(int),
  public.control_logs(uuid, text, text, text[], text, text, bigint, timestamptz, int)
  to authenticated, service_role;
grant execute on function public.control_can_view(uuid), public.control_can_operate(uuid),
  public.control_guard_view() to authenticated, service_role;

create index if not exists pipeline_events_step_at_idx on pipeline_events (step, at desc);
create index if not exists pipeline_quarantine_run_idx on pipeline_quarantine ((message ->> 'runId'));

-- ---------------------------------------------------------------------------
-- 4. Auditoria: ações do Control Center (src/lib/audit/actions.ts)
-- ---------------------------------------------------------------------------
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'rules.propose', 'rules.approve', 'prompt.publish', 'rec.weights', 'reports.moderate',
    'users.manage', 'metrics.view', 'audit.view',
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export'
  ]::text[]
$$;
