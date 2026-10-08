-- AGM-T6 (spec 2026-10-08-agenda-coletor-multifonte-design.md §5.1): o Painel de Fontes cadastra e
-- edita fontes de eventos. `source_admin_create` passa a gravar as colunas de evento de 0182
-- (`kind = 'events'` exige `extract_kind` e `event_origin`, constraint
-- `sources_events_need_extract_check`), e `source_admin_update` aceita essas colunas no patch.
-- Uma fonte não troca de tipo (notícias × eventos) depois de criada.

create or replace function public.source_admin_create(p jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_source_manage();
  perform set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true);
  perform set_config('citynews.audit_ip_hash', coalesce(p_ip_hash, ''), true);
  insert into sources (
    slug, name, base_url, kind, feed_url, categories, locality, reliability,
    image_policy, republish_policy, may_be_sole_source, status, status_reason,
    frequency_minutes, rate_limit_per_hour, priority, layer, editorial_score, consumption,
    owner_id, agreement_until, display_name, terms_url, agreement_note,
    confirms, extract_kind, event_origin, collector_notes, list_urls, require_city,
    default_venue, default_neighborhood, default_category
  ) values (
    p->>'slug', p->>'name', p->>'baseUrl', (p->>'kind')::source_kind, p->>'feedUrl',
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'categories', '[]'::jsonb)) x), '{}'),
    coalesce(p->>'locality', 'mt'),
    coalesce((p->>'reliability')::source_reliability, 'standard'),
    coalesce((p->>'imagePolicy')::image_policy, 'none'),
    coalesce((p->>'republishPolicy')::republish_policy, 'link_only'),
    coalesce((p->>'mayBeSoleSource')::boolean, false),
    'paused', 'pending_activation',
    nullif(p->>'frequencyMinutes', '')::int,
    coalesce((p->>'rateLimitPerHour')::int, 60),
    coalesce((p->>'priority')::smallint, 2),
    nullif(p->>'layer', '')::smallint,
    coalesce((p->>'editorialScore')::smallint, 3),
    coalesce(p->'consumption', '{}'::jsonb),
    nullif(p->>'ownerId', '')::uuid, nullif(p->>'agreementUntil', '')::date, p->>'displayName',
    p->>'termsUrl', p->>'agreementNote',
    coalesce((p->>'confirms')::boolean, false),
    nullif(p->>'extractKind', ''),
    nullif(p->>'eventOrigin', ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'collectorNotes', '[]'::jsonb)) x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'listUrls', '[]'::jsonb)) x), '{}'),
    coalesce((p->>'requireCity')::boolean, false),
    nullif(p->>'defaultVenue', ''), nullif(p->>'defaultNeighborhood', ''), nullif(p->>'defaultCategory', '')
  ) returning id into v_id;
  return v_id;
end
$$;

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
  v_kind source_kind;
  v_new_version int;
  v_allowed text[] := array[
    'name', 'display_name', 'logo_path', 'owner_id', 'layer', 'categories', 'locality',
    'reliability', 'image_policy', 'republish_policy', 'may_be_sole_source', 'agreement_until',
    'agreement_note', 'terms_url', 'terms_reviewed_at', 'terms_reviewed_by', 'terms_min_interval_minutes',
    'frequency_minutes', 'rate_limit_per_hour', 'priority', 'editorial_score', 'rec_pinned',
    'rec_local_highlight', 'rec_excluded', 'consumption', 'kind', 'feed_url', 'trusted',
    'confirms', 'extract_kind', 'event_origin', 'collector_notes', 'list_urls', 'require_city',
    'default_venue', 'default_neighborhood', 'default_category'
  ];
  v_unknown text;
begin
  perform public.require_source_manage();
  select k into v_unknown from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
   where k <> all (v_allowed) limit 1;
  if v_unknown is not null then
    raise exception 'campo desconhecido no patch: %', v_unknown using errcode = '22023';
  end if;

  select version, kind into v_current, v_kind from sources where id = p_id;
  if v_current is null then
    raise exception 'fonte % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_current <> p_version then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue' using errcode = 'PT409';
  end if;
  if p_patch ? 'kind' and ((p_patch->>'kind') = 'events') is distinct from (v_kind = 'events') then
    raise exception 'tipo da fonte inválido: notícias e eventos não trocam entre si' using errcode = '22023';
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
      then null else s.last_modified end,
    confirms = case when p_patch ? 'confirms' then (p_patch->>'confirms')::boolean else s.confirms end,
    extract_kind = case when p_patch ? 'extract_kind' then nullif(p_patch->>'extract_kind', '') else s.extract_kind end,
    event_origin = case when p_patch ? 'event_origin' then nullif(p_patch->>'event_origin', '') else s.event_origin end,
    collector_notes = case when p_patch ? 'collector_notes'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'collector_notes') x), '{}')
      else s.collector_notes end,
    list_urls = case when p_patch ? 'list_urls'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'list_urls') x), '{}')
      else s.list_urls end,
    require_city = case when p_patch ? 'require_city' then (p_patch->>'require_city')::boolean else s.require_city end,
    default_venue = case when p_patch ? 'default_venue' then nullif(p_patch->>'default_venue', '') else s.default_venue end,
    default_neighborhood = case when p_patch ? 'default_neighborhood'
      then nullif(p_patch->>'default_neighborhood', '') else s.default_neighborhood end,
    default_category = case when p_patch ? 'default_category'
      then nullif(p_patch->>'default_category', '') else s.default_category end
  where s.id = p_id and s.version = p_version
  returning s.version into v_new_version;

  if v_new_version is null then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue' using errcode = 'PT409';
  end if;
  return v_new_version;
end
$$;
