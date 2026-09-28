-- P5-T6 · Bases, avaliações, custos e governança da IA (telas O09, O13, O14, O16).
--
-- 1. `eval_cases` (casos de regressão por agente, no formato de src/lib/ai/eval.ts) e `eval_runs`
--    (rodadas com métricas, limites violados e resultado por caso). A equipe lê; quem assina
--    prompt (`prompt.publish`: admin, editor_chefe, operador_ia) cadastra casos e roda avaliações.
--    Rodada é somente inserção (histórico auditável).
-- 2. `ai_cost_daily`: gasto por dia (Cuiabá), agente e modelo, com a RLS de `ai_calls`.
-- 3. `ai_knowledge_bases`: tamanho e indexação das bases que a IA consulta (contagens, nada de
--    conteúdo), para quem tem `metrics.view`.

create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  case_key text not null check (case_key ~ '^[a-z0-9-]{1,80}$'),
  body jsonb not null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, case_key)
);

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  prompt_version int,
  model_id text,
  provider text not null check (provider in ('openrouter', 'fake')),
  trigger text not null default 'manual' check (trigger in ('manual', 'ci', 'publish')),
  cases int not null check (cases >= 0),
  metrics jsonb not null,
  gate_failures text[] not null default '{}',
  results jsonb not null default '[]',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists eval_runs_agent_idx on eval_runs (agent_id, created_at desc);

alter table eval_cases enable row level security;
alter table eval_runs enable row level security;
revoke all on eval_cases, eval_runs from anon;
revoke delete, truncate on eval_runs from authenticated;

create policy eval_cases_read_staff on eval_cases for select to authenticated
  using (is_staff((select auth.uid())));
create policy eval_cases_manage on eval_cases for insert to authenticated
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}')
              and created_by = (select auth.uid()));
create policy eval_cases_update on eval_cases for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));

create policy eval_runs_read_staff on eval_runs for select to authenticated
  using (is_staff((select auth.uid())));
create policy eval_runs_insert on eval_runs for insert to authenticated
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}')
              and created_by = (select auth.uid()));
-- Rodada registrada não muda (a política de update não existe; o trigger cobre o service role).
create or replace function public.eval_runs_immutable() returns trigger language plpgsql
set search_path = public as $$
begin
  raise exception 'eval_runs é somente inserção';
end $$;
revoke execute on function public.eval_runs_immutable() from public, anon, authenticated;
drop trigger if exists eval_runs_immutable on eval_runs;
create trigger eval_runs_immutable before update on eval_runs
  for each row execute function public.eval_runs_immutable();

-- Gasto por dia de Cuiabá, agente e modelo desde p_since. Invoker: RLS de ai_calls
-- (admin, editor_chefe, operador_ia, analista).
create or replace function public.ai_cost_daily(p_since timestamptz)
returns table (day date, agent_id text, model_id text, cost_brl numeric, calls int, errors int, fallbacks int,
               tokens_in bigint, tokens_out bigint, avg_latency_ms int)
language sql
stable
security invoker
set search_path = public
as $$
  select (c.created_at at time zone 'America/Cuiaba')::date, c.agent_id, c.model_id,
         coalesce(sum(c.cost_brl), 0), count(*)::int, count(*) filter (where not c.ok)::int,
         count(*) filter (where c.fallback_used)::int,
         coalesce(sum(c.tokens_in), 0)::bigint, coalesce(sum(c.tokens_out), 0)::bigint,
         coalesce(avg(c.latency_ms), 0)::int
  from ai_calls c
  where c.created_at >= p_since
  group by 1, 2, 3
$$;

-- Bases de conhecimento (O13): o que a IA consulta e quanto já está indexado.
create or replace function public.ai_knowledge_bases()
returns table (base text, total int, indexed int, embedded int, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.control_guard_view();
  return query
  select 'articles'::text,
         count(*)::int,
         count(*) filter (where a.tsv is not null)::int,
         count(*) filter (where a.embedding is not null)::int,
         max(a.updated_at)
    from articles a where a.status in ('published', 'updated')
  union all
  select 'aggregated', count(*)::int,
         count(*) filter (where ci.tsv is not null)::int,
         count(*) filter (where ci.embedding is not null)::int,
         max(ci.created_at)
    from collected_items ci where ci.duplicate_of is null
  union all
  select 'topics', count(*)::int,
         count(*) filter (where t.tsv is not null)::int,
         count(*) filter (where t.centroid is not null)::int,
         max(t.updated_at)
    from topics t
  union all
  select 'events', count(*)::int,
         count(*) filter (where e.tsv is not null)::int,
         0,
         max(e.starts_at)
    from event_listings e
  union all
  select 'sources', count(*)::int,
         count(*) filter (where s.status = 'active')::int,
         0,
         max(s.last_fetched_at)
    from sources s;
end
$$;

revoke execute on function public.ai_cost_daily(timestamptz), public.ai_knowledge_bases() from public, anon;
grant execute on function public.ai_cost_daily(timestamptz), public.ai_knowledge_bases() to authenticated, service_role;

-- Auditoria: avaliação e casos de regressão (src/lib/audit/actions.ts).
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
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case'
  ]::text[]
$$;
