-- AUT-T1 · Autonomia de publicação alta (spec 2026-10-03-autonomia-de-publicacao-design.md, A2/A4).
-- Numeração 0070 em diante por combinação com os outros agentes (0053+ é da agenda).
-- Aditiva e idempotente; nenhuma função nova usa DELETE.
--
-- 1) Segurança deixa de ser fixa em `blocked`: a v3 das regras põe a categoria em `auto`.
--    A constraint de 0048 recusaria a proposta v3. A duas-pessoas continua valendo para ativar
--    (`rules_loosens` -> pedido `safety.disable`).
alter table public.rules drop constraint if exists rules_seguranca_blocked;

-- 2) Assunto abre ao público quando uma matéria dele é publicada, inclusive urgente e Segurança
--    (antes só com publicação humana, D12). Sem isto a matéria automática ficaria sem página.
create or replace function promote_topic_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic topics%rowtype;
begin
  if new.topic_id is null or new.status not in ('published', 'updated') then return new; end if;
  select * into v_topic from topics where id = new.topic_id for update;
  if not found or v_topic.visibility = 'public' then return new; end if;
  update topics t
     set visibility = 'public',
         title = case when t.title like 'Assunto em apuração%' then left(new.title, 300) else t.title end,
         slug = case when t.slug like 'apuracao-%'
                     then left(trim(both '-' from regexp_replace(lower(unaccent(new.title)), '[^a-z0-9]+', '-', 'g')), 70)
                          || '-' || left(replace(t.id::text, '-', ''), 8)
                     else t.slug end,
         updated_at = greatest(t.updated_at, now())
   where t.id = new.topic_id;
  return new;
end $$;
revoke execute on function promote_topic_on_publish() from public, anon, authenticated;

-- 3) Contexto de decisão ganha `dubious` (agente `verify`). `sourceTrusted` chega na 0071.
create or replace function pipeline_decision_context(p_article uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with src as (
    select c.source_id, s.reliability, c.tags, coalesce(c.sensitive, false) as sensitive
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
    'dubious', coalesce((select (output->>'dubious')::boolean from ver), false),
    'imageApproved', exists (select 1 from article_media am join media_assets m on m.id = am.media_id
                             where am.article_id = a.id and m.status = 'approved'))
  from articles a left join sections sec on sec.slug = a.section_slug
  where a.id = p_article;
$$;
revoke execute on function pipeline_decision_context(uuid) from public, anon, authenticated;
grant execute on function pipeline_decision_context(uuid) to service_role;
