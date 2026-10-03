-- AUT-T3 · Escopo regional da notícia (A15). Numeração 0070+ (acordo com os outros agentes).
-- Aditiva e idempotente. `news_scope`: cuiaba (Cuiabá e Várzea Grande), mt (resto do estado) ou
-- national; `national_commotion`: notícia nacional de grande comoção, a única que pode ser
-- urgente ou destaque fora de Cuiabá e MT.
alter table public.articles add column if not exists news_scope text
  check (news_scope in ('cuiaba', 'mt', 'national'));
alter table public.articles add column if not exists national_commotion boolean not null default false;
create index if not exists articles_news_scope_idx on public.articles (news_scope) where news_scope is not null;

-- Contexto de decisão ganha bairros, municípios e localidades das fontes (a regra calcula o
-- escopo em `src/lib/geo/news-scope.ts`) e a comoção nacional marcada.
create or replace function pipeline_decision_context(p_article uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with src as (
    select c.source_id, s.reliability, s.trusted, s.locality as source_locality, c.locality as item_locality,
           c.neighborhood, c.tags, coalesce(c.sensitive, false) as sensitive
    from article_sources a join collected_items c on c.id = a.item_id join sources s on s.id = c.source_id
    where a.article_id = p_article
  ),
  ver as (
    select d.output from decisions d
     where d.object_ref = 'topic:' || (select topic_id from articles where id = p_article) and d.step = 'verify'
     order by d.created_at desc limit 1
  )
  select jsonb_build_object(
    'articleId', a.id, 'slug', a.slug, 'topicId', a.topic_id, 'status', a.status, 'publishMode', a.publish_mode,
    'sectionSlug', a.section_slug, 'category', coalesce(sec.autonomy_category, a.section_slug),
    'title', a.title, 'urgent', a.urgent, 'aiFallback', a.ai_fallback,
    'confidence', a.confidence, 'confidenceScore', a.confidence_score,
    'version', coalesce((select max(v.number) from article_versions v where v.article_id = a.id), 0),
    'humanEdited', exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human'),
    'independentSources', (select count(distinct source_id) from src),
    'primarySources', (select count(distinct source_id) from src where reliability = 'primary'),
    'tags', coalesce((select jsonb_agg(distinct t) from src, unnest(src.tags) t), '[]'::jsonb),
    'sensitive', coalesce((select bool_or(sensitive) from src), false),
    'centralConflict', coalesce((select (output->>'centralConflict')::boolean from ver), false),
    'neighborhoods', coalesce((select jsonb_agg(distinct neighborhood) from src where neighborhood is not null), '[]'::jsonb),
    'municipalities', coalesce((select jsonb_agg(distinct item_locality) from src where item_locality is not null), '[]'::jsonb),
    'sourceLocalities', coalesce((select jsonb_agg(distinct source_locality) from src where source_locality is not null), '[]'::jsonb),
    'nationalCommotion', a.national_commotion,
    'sourceTrusted', coalesce((select bool_or(trusted) from src), false),
    'dubious', coalesce((select (output->>'dubious')::boolean from ver), false),
    'imageApproved', exists (select 1 from article_media am join media_assets m on m.id = am.media_id
                             where am.article_id = a.id and m.status = 'approved'))
  from articles a left join sections sec on sec.slug = a.section_slug
  where a.id = p_article;
$$;
revoke execute on function pipeline_decision_context(uuid) from public, anon, authenticated;
grant execute on function pipeline_decision_context(uuid) to service_role;
