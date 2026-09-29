-- P5-T3 Monitoramento do Control Center: leituras agregadas para a equipe e ações auditadas.
--
-- `jobs` não é legível pelo papel `authenticated` (só o servidor). As telas de visão geral, tempo
-- real, falhas e execuções leem por estas funções SECURITY DEFINER, que exigem sessão e um dos
-- papéis que veem métricas (matriz `metrics.view`). Só contam filas de produção (sem prefixo de
-- namespace de teste). Reprocessar e "Executar agora" gravam em `jobs` com service role no app,
-- depois de checar o papel e auditar (`pipeline.reprocess`, `pipeline.run_now`).

create or replace function public.control_can_view() returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and public.has_any_role(auth.uid(), '{admin,editor_chefe,editor,operador_ia,analista,leitura}')
$$;

-- Filas por etapa: total, prontas, em nova tentativa (com erro), mais antiga e maior nº de leituras.
create or replace function public.control_queue_stats()
returns table (queue text, step text, total int, ready int, retrying int, oldest_at timestamptz, max_reads int)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_queue_stats: sem permissão' using errcode = '42501';
  end if;
  return query
    select j.queue, j.message ->> 'step', count(*)::int,
           count(*) filter (where j.visible_at <= now())::int,
           count(*) filter (where j.last_error is not null)::int,
           min(j.enqueued_at), max(j.read_ct)::int
    from jobs j
    where j.queue in ('pipeline', 'media', 'notify')
    group by j.queue, j.message ->> 'step';
end $$;

-- Mensagens em nova tentativa (erro registrado, ainda na fila).
create or replace function public.control_retrying_jobs(p_limit int default 100)
returns table (id bigint, queue text, step text, item_ref text, run_id text, read_ct int, last_error text, visible_at timestamptz, enqueued_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_retrying_jobs: sem permissão' using errcode = '42501';
  end if;
  return query
    select j.id, j.queue, j.message ->> 'step', j.message ->> 'itemRef', j.message ->> 'runId',
           j.read_ct, j.last_error, j.visible_at, j.enqueued_at
    from jobs j
    where j.queue in ('pipeline', 'media', 'notify') and j.last_error is not null
    order by j.visible_at
    limit greatest(1, least(p_limit, 500));
end $$;

-- Quarentena aberta (esgotou tentativas, mensagem inválida ou instrução embutida).
create or replace function public.control_quarantine(p_limit int default 100)
returns table (id bigint, queue text, step text, item_ref text, run_id text, read_ct int, error text, quarantined_at timestamptz, total_open bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_quarantine: sem permissão' using errcode = '42501';
  end if;
  return query
    select q.id, q.queue, q.message ->> 'step', q.message ->> 'itemRef', q.message ->> 'runId',
           q.read_ct, q.error, q.quarantined_at, count(*) over ()
    from pipeline_quarantine q
    where q.resolved_at is null and q.queue in ('pipeline', 'media', 'notify')
    order by q.quarantined_at desc
    limit greatest(1, least(p_limit, 500));
end $$;

-- Saúde de cada fonte: estado, coletas dos últimos 30 dias, falhas seguidas e itens em 24 h.
create or replace function public.control_source_health()
returns table (slug text, name text, kind text, status text, frequency_minutes int, last_fetched_at timestamptz,
               last_error text, fetch_ok int, fetch_total int, consecutive_failures int, items_24h int)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_source_health: sem permissão' using errcode = '42501';
  end if;
  return query
    select s.slug, s.name, s.kind::text, s.status::text, s.frequency_minutes, s.last_fetched_at, s.last_error,
           coalesce(h.ok, 0), coalesce(h.total, 0), coalesce(h.consecutive_failures, 0), coalesce(i.items_24h, 0)
    from sources s
    left join source_fetch_health h on h.slug = s.slug
    left join source_item_stats i on i.source_id = s.id
    order by s.slug;
end $$;

-- Números da visão geral (uma linha).
create or replace function public.control_overview()
returns table (events_1h int, errors_1h int, security_24h int, cost_24h_brl numeric, ai_calls_24h int, ai_failed_24h int)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_overview: sem permissão' using errcode = '42501';
  end if;
  return query
    select (select count(*)::int from pipeline_events e where e.at >= now() - interval '1 hour'),
           (select count(*)::int from pipeline_events e where e.at >= now() - interval '1 hour' and e.level = 'error'),
           (select count(*)::int from pipeline_events e where e.at >= now() - interval '24 hours' and e.level = 'security'),
           (select coalesce(sum(c.cost_brl), 0) from ai_calls c where c.created_at >= now() - interval '24 hours'),
           (select count(*)::int from ai_calls c where c.created_at >= now() - interval '24 hours'),
           (select count(*)::int from ai_calls c where c.created_at >= now() - interval '24 hours' and not c.ok);
end $$;

-- Execuções (ciclos) mais recentes com contagem de eventos, falhas, fila e custo de IA no período.
create or replace function public.control_runs(p_limit int default 50, p_run uuid default null)
returns table (id uuid, window_start timestamptz, started_at timestamptz, finished_at timestamptz, status text, stats jsonb,
               events int, errors int, warns int, last_event_at timestamptz, pending int, cost_brl numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_runs: sem permissão' using errcode = '42501';
  end if;
  return query
    select r.id, r.window_start, r.started_at, r.finished_at, r.status, r.stats,
           coalesce(ev.events, 0), coalesce(ev.errors, 0), coalesce(ev.warns, 0), ev.last_at,
           (select count(*)::int from jobs j where j.queue in ('pipeline', 'media', 'notify') and j.message ->> 'runId' = r.id::text),
           (select coalesce(sum(c.cost_brl), 0) from ai_calls c
              where c.created_at >= r.started_at and c.created_at <= coalesce(ev.last_at, r.started_at) + interval '1 minute')
    from ingest_runs r
    left join lateral (
      select count(*)::int as events,
             count(*) filter (where e.level in ('error', 'security'))::int as errors,
             count(*) filter (where e.level = 'warn')::int as warns,
             max(e.at) as last_at
      from pipeline_events e where e.run_id = r.id
    ) ev on true
    where p_run is null or r.id = p_run
    order by r.started_at desc
    limit greatest(1, least(p_limit, 200));
end $$;

-- Eventos de um ciclo por etapa e nível, com primeiro e último instante (duração por fase).
create or replace function public.control_run_steps(p_run uuid)
returns table (step text, level text, count int, first_at timestamptz, last_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.control_can_view() then
    raise exception 'control_run_steps: sem permissão' using errcode = '42501';
  end if;
  return query
    select e.step, e.level, count(*)::int, min(e.at), max(e.at)
    from pipeline_events e where e.run_id = p_run
    group by e.step, e.level;
end $$;

revoke execute on function public.control_can_view(), public.control_queue_stats(), public.control_retrying_jobs(int),
  public.control_quarantine(int), public.control_source_health(), public.control_overview(), public.control_runs(int, uuid), public.control_run_steps(uuid)
  from public, anon;
grant execute on function public.control_can_view(), public.control_queue_stats(), public.control_retrying_jobs(int),
  public.control_quarantine(int), public.control_source_health(), public.control_overview(), public.control_runs(int, uuid), public.control_run_steps(uuid)
  to authenticated, service_role;

-- Índices do explorador de logs.
create index if not exists pipeline_events_at_idx on pipeline_events (at desc);
create index if not exists pipeline_events_step_idx on pipeline_events (step, at desc);
create index if not exists pipeline_events_item_idx on pipeline_events (item_ref, at desc);

-- Ações de auditoria do monitoramento (mesma lista de src/lib/audit/actions.ts).
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
    'approval.request', 'approval.approve', 'approval.reject',
    'pipeline.reprocess', 'pipeline.run_now'
  ]::text[]
$$;
