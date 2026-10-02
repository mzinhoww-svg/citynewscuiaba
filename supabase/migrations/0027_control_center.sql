-- P5-T3 · Control Center: visão geral, tempo real, falhas, execuções e logs.
--
-- 1. Pausa automática de fonte: é do Painel de Fontes (Ruling R8, A-065). O `fetch` aplica
--    `afterFetch` (D-F18): 1ª e 2ª falha seguida → `degraded`, 3ª → `status = 'paused'` com
--    `status_reason = 'auto_failures'`, `consecutive_failures` na própria linha (0011) e aviso
--    `source_auto_paused` via `notify_once`. Esta migration não cria trigger nem coluna para isso;
--    o Control Center só lê esse estado.
-- 2. Leituras agregadas do Control Center para quem tem `metrics.view` (fila, saúde das fontes,
--    pendências e custo por ciclo) em funções que checam o papel: `jobs`, as views de saúde e
--    `ai_calls` continuam fechados para leitura direta.
-- 3. Busca de logs em `pipeline_events` com a RLS de quem lê (security invoker).
-- 4. Ações novas na lista fechada de auditoria: ficam na 0034 (união com as do painel, 0033).

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

-- Saúde das fontes (O01, O03): estado do painel (`status`, `status_reason`, `consecutive_failures`,
-- 0011), coletas de 30 dias de `source_health_daily` (`record_source_fetch`, 0011/0030), erros de
-- coleta em 24 h dos eventos do pipeline e itens publicados em 24 h (`source_item_stats`).
create or replace function public.control_source_health()
returns table (
  id uuid, slug text, name text, kind text, status text, status_reason text, reliability text,
  frequency_minutes int, last_fetched_at timestamptz, last_error text,
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
  with h as (
    select d.source_id,
           sum(d.fetch_ok + d.fetch_not_modified)::int as ok,
           sum(d.fetch_ok + d.fetch_not_modified + d.fetch_failed)::int as total
    from source_health_daily d
    where d.day >= (now() at time zone 'America/Cuiaba')::date - 30
    group by d.source_id
  ), e as (
    select substr(p.item_ref, 8) as slug,
           count(*)::int as errors_24h
    from pipeline_events p
    where p.step = 'fetch' and p.item_ref like 'source:%' and p.level <> 'info'
      and p.at >= now() - interval '24 hours'
    group by substr(p.item_ref, 8)
  )
  select s.id, s.slug, coalesce(s.display_name, s.name), s.kind::text, s.status::text, s.status_reason,
         s.reliability::text, s.frequency_minutes, s.last_fetched_at, s.last_error,
         coalesce(h.ok, 0), coalesce(h.total, 0),
         s.consecutive_failures,
         coalesce(e.errors_24h, 0), coalesce(i.items_24h, 0)
  from sources s
  left join h on h.source_id = s.id
  left join e on e.slug = s.slug
  left join source_item_stats i on i.source_id = s.id
  where s.archived_at is null
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

