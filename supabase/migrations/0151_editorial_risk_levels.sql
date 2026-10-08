-- D-05 (decisão do dono de 04/10/2026): risco editorial em quatro níveis, e D-03: linhagens como
-- indicador informativo. Migration aditiva.
--
-- 1. `articles.risk_level` (1 baixo, 2 moderado, 3 alto, 4 crítico), gravado pela etapa de regras
--    a partir de `classifyRisk` (src/lib/rules/risk.ts). Nulo = matéria anterior a esta migration.
-- 2. `review_due_articles`: o revisor automático nunca recebe nível 4 (crítico). Hoje o nível 4 é
--    o rascunho sem IA, que a 0150 já filtrava; a condição nova mantém SQL e TypeScript
--    (`isReviewable`) com o mesmo critério se o nível 4 ganhar outros motivos.
-- 3. Visões de métricas para o Control Center e consultas (só equipe, pela RLS de `decisions`):
--    `editorial_risk_daily` (decisões da etapa de regras por dia, nível e rota) e
--    `verify_lineage_daily` (fontes x linhagens por dia, indicador da D-03).
--
-- Reverter: `drop view` das duas visões, reaplicar `review_due_articles` de 0150 e
-- `alter table articles drop column risk_level` (nenhum código depende dela para decidir).

alter table public.articles
  add column if not exists risk_level smallint
  check (risk_level is null or risk_level between 1 and 4);

comment on column public.articles.risk_level is
  'Risco editorial (D-05): 1 baixo, 2 moderado, 3 alto, 4 crítico. Gravado pela etapa de regras; motivos em decisions.output->risk.';

create or replace function public.review_due_articles(p_now timestamptz default now(), p_limit int default 10)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a.id
    from articles a
   where a.status = 'in_review'
     and a.due_at is not null and a.due_at <= p_now
     and a.agent_id is not null
     and not a.ai_fallback
     and coalesce(a.risk_level, 1) < 4
     and not exists (select 1 from article_versions v
                      where v.article_id = a.id and v.origin = 'human')
     and not exists (select 1 from reports r
                      where r.content_ref = 'article:' || a.id and r.status = 'open')
     and not exists (select 1 from corrections c
                      where c.article_id = a.id and c.published_at is null and c.status = 'open')
     and not exists (select 1 from review_escalations e
                      where e.article_id = a.id and e.status = 'open')
     and not exists (select 1 from decisions d
                      where d.object_ref = 'article:' || a.id and d.step = 'review'
                        and d.created_at >= a.updated_at)
   order by a.urgent desc, a.due_at asc
   limit greatest(least(p_limit, 50), 0)
$$;
revoke execute on function public.review_due_articles(timestamptz, int) from public, anon, authenticated;
grant execute on function public.review_due_articles(timestamptz, int) to service_role;

-- Decisões da etapa de regras por dia (America/Cuiaba), nível de risco e rota. Base para medir
-- publicadas sozinhas, retidas, em revisão e os motivos, antes de fixar qualquer meta (D-05 §10.10).
create or replace view public.editorial_risk_daily
with (security_invoker = true) as
select (d.created_at at time zone 'America/Cuiaba')::date as day,
       nullif(d.output -> 'risk' ->> 'level', '')::smallint as risk_level,
       d.output ->> 'route' as route,
       d.output ->> 'rule' as rule,
       count(*) as decisions
  from public.decisions d
 where d.step = 'rules'
 group by 1, 2, 3, 4;

comment on view public.editorial_risk_daily is
  'D-05: decisões da etapa de regras por dia, nível de risco, rota e regra. Só equipe (RLS de decisions).';

-- Fontes x linhagens por dia (D-03: indicador informativo, sem efeito em portão ou confiança).
create or replace view public.verify_lineage_daily
with (security_invoker = true) as
select (d.created_at at time zone 'America/Cuiaba')::date as day,
       count(*) as topics,
       count(*) filter (where d.output ? 'independentLineages'
                          and jsonb_typeof(d.output -> 'independentLineages') = 'number') as measured,
       sum((d.output ->> 'independentSources')::int) as sources,
       sum((d.output ->> 'independentLineages')::int)
         filter (where jsonb_typeof(d.output -> 'independentLineages') = 'number') as lineages,
       count(*) filter (where jsonb_typeof(d.output -> 'independentLineages') = 'number'
                          and (d.output ->> 'independentLineages')::int
                              < (d.output ->> 'independentSources')::int) as with_copies
  from public.decisions d
 where d.step = 'verify'
 group by 1;

comment on view public.verify_lineage_daily is
  'D-03: assuntos verificados por dia, fontes, linhagens e quantos tinham cópia do mesmo texto. Informativo.';

revoke all on public.editorial_risk_daily, public.verify_lineage_daily from public, anon;
grant select on public.editorial_risk_daily, public.verify_lineage_daily to authenticated, service_role;
