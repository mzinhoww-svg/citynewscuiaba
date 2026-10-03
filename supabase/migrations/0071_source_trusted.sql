-- AUT-T2 · Fonte confiável (spec de autonomia, A6/A7). Numeração 0070+ (acordo com os outros agentes).
-- Aditiva e idempotente. `sources.trusted`: fonte cujo conteúdo publica direto, sem espera, desde
-- que citada. Padrão: `reliability in ('primary','verified')`; o admin ajusta no Painel de Fontes.
alter table public.sources add column if not exists trusted boolean not null default false;
update public.sources set trusted = true where reliability in ('primary', 'verified') and trusted = false;

-- `source_admin_update` ganha o campo `trusted` (a mudança é auditada pelo gatilho de auditoria
-- da tabela `sources`, que compara a linha inteira).
create or replace function public.source_admin_update(
  p_id uuid, p_version int, p_patch jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current int;
  v_new_version int;
  v_allowed text[] := array[
    'name', 'display_name', 'logo_path', 'owner_id', 'layer', 'categories', 'locality',
    'reliability', 'image_policy', 'republish_policy', 'may_be_sole_source', 'agreement_until',
    'agreement_note', 'terms_url', 'terms_reviewed_at', 'terms_reviewed_by', 'terms_min_interval_minutes',
    'frequency_minutes', 'rate_limit_per_hour', 'priority', 'editorial_score', 'rec_pinned',
    'rec_local_highlight', 'rec_excluded', 'consumption', 'kind', 'feed_url', 'trusted'
  ];
  v_unknown text;
begin
  perform public.require_source_manage();
  select k into v_unknown from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
   where k <> all (v_allowed) limit 1;
  if v_unknown is not null then
    raise exception 'campo desconhecido no patch: %', v_unknown using errcode = '22023';
  end if;

  select version into v_current from sources where id = p_id;
  if v_current is null then
    raise exception 'fonte % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_current <> p_version then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue' using errcode = 'PT409';
  end if;

  perform set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true);
  perform set_config('citynews.audit_ip_hash', coalesce(p_ip_hash, ''), true);

  update sources s set
    name = coalesce(p_patch->>'name', s.name),
    display_name = case when p_patch ? 'display_name' then nullif(p_patch->>'display_name', '') else s.display_name end,
    logo_path = case when p_patch ? 'logo_path' then nullif(p_patch->>'logo_path', '') else s.logo_path end,
    owner_id = case when p_patch ? 'owner_id' then nullif(p_patch->>'owner_id', '')::uuid else s.owner_id end,
    layer = case when p_patch ? 'layer' then nullif(p_patch->>'layer', '')::smallint else s.layer end,
    categories = case when p_patch ? 'categories'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'categories') x), '{}')
      else s.categories end,
    locality = coalesce(p_patch->>'locality', s.locality),
    reliability = case when p_patch ? 'reliability' then (p_patch->>'reliability')::source_reliability else s.reliability end,
    image_policy = case when p_patch ? 'image_policy' then (p_patch->>'image_policy')::image_policy else s.image_policy end,
    republish_policy = case
      when p_patch ? 'republish_policy' then (p_patch->>'republish_policy')::republish_policy
      else s.republish_policy end,
    may_be_sole_source = case
      when p_patch ? 'may_be_sole_source' then (p_patch->>'may_be_sole_source')::boolean
      else s.may_be_sole_source end,
    agreement_until = case when p_patch ? 'agreement_until' then nullif(p_patch->>'agreement_until', '')::date else s.agreement_until end,
    agreement_note = case when p_patch ? 'agreement_note' then p_patch->>'agreement_note' else s.agreement_note end,
    terms_url = case when p_patch ? 'terms_url' then p_patch->>'terms_url' else s.terms_url end,
    terms_reviewed_at = case when p_patch ? 'terms_reviewed_at' then nullif(p_patch->>'terms_reviewed_at', '')::timestamptz else s.terms_reviewed_at end,
    terms_reviewed_by = case when p_patch ? 'terms_reviewed_by' then nullif(p_patch->>'terms_reviewed_by', '')::uuid else s.terms_reviewed_by end,
    terms_min_interval_minutes = case
      when p_patch ? 'terms_min_interval_minutes' then nullif(p_patch->>'terms_min_interval_minutes', '')::int
      else s.terms_min_interval_minutes end,
    frequency_minutes = case
      when p_patch ? 'frequency_minutes' then nullif(p_patch->>'frequency_minutes', '')::int
      else s.frequency_minutes end,
    rate_limit_per_hour = case when p_patch ? 'rate_limit_per_hour' then (p_patch->>'rate_limit_per_hour')::int else s.rate_limit_per_hour end,
    priority = case when p_patch ? 'priority' then (p_patch->>'priority')::smallint else s.priority end,
    editorial_score = case when p_patch ? 'editorial_score' then (p_patch->>'editorial_score')::smallint else s.editorial_score end,
    rec_pinned = case when p_patch ? 'rec_pinned' then (p_patch->>'rec_pinned')::boolean else s.rec_pinned end,
    rec_local_highlight = case when p_patch ? 'rec_local_highlight' then (p_patch->>'rec_local_highlight')::boolean else s.rec_local_highlight end,
    rec_excluded = case when p_patch ? 'rec_excluded' then (p_patch->>'rec_excluded')::boolean else s.rec_excluded end,
    trusted = case when p_patch ? 'trusted' then (p_patch->>'trusted')::boolean else s.trusted end,
    consumption = case when p_patch ? 'consumption' then p_patch->'consumption' else s.consumption end,
    kind = case when p_patch ? 'kind' then (p_patch->>'kind')::source_kind else s.kind end,
    feed_url = case when p_patch ? 'feed_url' then nullif(p_patch->>'feed_url', '') else s.feed_url end,
    -- Feed novo: ETag/Last-Modified do feed antigo não valem para ele (achado 12 da revisão FS-T6).
    etag = case when p_patch ? 'feed_url' and nullif(p_patch->>'feed_url', '') is distinct from s.feed_url
      then null else s.etag end,
    last_modified = case when p_patch ? 'feed_url' and nullif(p_patch->>'feed_url', '') is distinct from s.feed_url
      then null else s.last_modified end
  where s.id = p_id and s.version = p_version
  returning s.version into v_new_version;

  if v_new_version is null then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue' using errcode = 'PT409';
  end if;
  return v_new_version;
end
$$;

-- Contexto de decisão ganha `sourceTrusted` (alguma fonte do assunto é confiável).
create or replace function pipeline_decision_context(p_article uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with src as (
    select c.source_id, s.reliability, s.trusted, c.tags, coalesce(c.sensitive, false) as sensitive
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
    'sourceTrusted', coalesce((select bool_or(trusted) from src), false),
    'dubious', coalesce((select (output->>'dubious')::boolean from ver), false),
    'imageApproved', exists (select 1 from article_media am join media_assets m on m.id = am.media_id
                             where am.article_id = a.id and m.status = 'approved'))
  from articles a left join sections sec on sec.slug = a.section_slug
  where a.id = p_article;
$$;
revoke execute on function pipeline_decision_context(uuid) from public, anon, authenticated;
revoke execute on function pipeline_decision_context(uuid) from public, anon, authenticated;
grant execute on function pipeline_decision_context(uuid) to service_role;
