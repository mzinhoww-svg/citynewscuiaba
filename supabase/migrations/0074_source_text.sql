-- Texto completo da fonte como material da redação. O feed de várias fontes (HNT, RDNews) traz só
-- a primeira frase em <description>; o agente `write` recebia título + uma frase e entregava duas
-- linhas. O passo `enrich` passa a guardar o corpo da página aqui, e o redator escreve a partir dele.
--
-- Nunca público: `collected_items` só é legível pela equipe (0002, collected_items_read_staff) e
-- nenhuma view pública seleciona esta coluna. Aditiva e idempotente.

alter table public.collected_items add column if not exists source_text text
  check (source_text is null or char_length(source_text) <= 8000);

comment on column public.collected_items.source_text is
  'Corpo da matéria na página da fonte (enrich). Material interno da redação; nunca exibido.';

create or replace function pipeline_draft_context(p_topic uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'topic', jsonb_build_object('id', t.id, 'slug', t.slug, 'title', t.title, 'sectionSlug', t.section_slug,
                                'confidence', t.confidence, 'confidenceScore', t.confidence_score),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'sourceId', c.source_id, 'sourceSlug', s.slug,
               'sourceName', coalesce(s.display_name, s.name), 'reliability', s.reliability,
               'title', c.original_title, 'excerpt', c.excerpt, 'sourceText', c.source_text,
               'publishedAt', c.published_at,
               'sectionSlug', c.section_slug, 'canonicalUrl', c.canonical_url, 'tags', to_jsonb(c.tags),
               'sensitive', coalesce(c.sensitive, false))
             order by c.created_at, c.id)
      from collected_items c join sources s on s.id = c.source_id
      where c.topic_id = t.id and c.duplicate_of is null and c.quarantined_at is null), '[]'::jsonb),
    'verify', (select d.output from decisions d where d.object_ref = 'topic:' || t.id and d.step = 'verify'
               order by d.created_at desc limit 1),
    'article', (select jsonb_build_object(
                  'id', a.id, 'status', a.status, 'publishMode', a.publish_mode,
                  'humanEdited', exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human'),
                  'version', coalesce((select max(v.number) from article_versions v where v.article_id = a.id), 0))
                from articles a where a.topic_id = t.id and a.agent_id = 'write' limit 1))
  from topics t where t.id = p_topic;
$$;
