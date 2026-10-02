-- Painel de Fontes, FS-T6 fix round 1 (revisão FS-T6):
-- 1. `source_admin_update`: trocar `feed_url` zera `etag` e `last_modified` (achado 12).
-- 2. `source_admin_bulk` aceita `p_batch_id`: quem chama escolhe o id do lote e o conhece sem ler
--    a auditoria de volta (achado 7; antes a leitura corria contra lotes simultâneos). Sem ele,
--    continua gerando um. A assinatura antiga é removida para o PostgREST não ter duas sobrecargas.
-- 3. `source_discovery_link`: a fonte precisa existir, a descoberta ser de quem chama e ter no
--    máximo 1 dia (achado 9).

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
    'rec_local_highlight', 'rec_excluded', 'consumption', 'kind', 'feed_url'
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

drop function if exists public.source_admin_bulk(uuid[], text, jsonb, jsonb, text);

create or replace function public.source_admin_bulk(
  p_ids uuid[], p_action text, p_value jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null,
  p_batch_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_row sources%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_batch_ctx jsonb := jsonb_set(coalesce(p_ctx, '{}'::jsonb), '{batchId}', to_jsonb(coalesce(p_batch_id, gen_random_uuid())::text), true);
begin
  perform public.require_source_manage();
  perform set_config('citynews.audit_ip_hash', coalesce(p_ip_hash, ''), true);
  foreach v_id in array coalesce(p_ids, '{}'::uuid[])
  loop
    begin
      select * into v_row from sources where id = v_id for update;
      if not found then
        v_result := v_result || jsonb_build_object('id', v_id, 'ok', false, 'reason', 'fonte não encontrada');
        continue;
      end if;
      perform set_config('citynews.audit_ctx', v_batch_ctx::text, true);
      if p_action = 'pause' then
        if v_row.status not in ('active', 'degraded') then
          raise exception 'já não está ativa';
        end if;
        update sources set status = 'paused', status_reason = 'manual', consecutive_failures = 0
          where id = v_id and version = v_row.version;
      elsif p_action = 'activate' then
        if v_row.status <> 'paused' or v_row.archived_at is not null then
          raise exception 'não está pausada';
        end if;
        update sources set status = 'active', status_reason = null, consecutive_failures = 0
          where id = v_id and version = v_row.version;
      elsif p_action = 'frequency' then
        update sources set frequency_minutes = nullif(p_value->>'frequencyMinutes', '')::int
          where id = v_id and version = v_row.version;
      else
        raise exception 'ação % desconhecida', p_action;
      end if;
      v_result := v_result || jsonb_build_object('id', v_id, 'ok', true);
    exception when others then
      v_result := v_result || jsonb_build_object('id', v_id, 'ok', false, 'reason', sqlerrm);
    end;
  end loop;
  return v_result;
end
$$;

revoke execute on function public.source_admin_bulk(uuid[], text, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.source_admin_bulk(uuid[], text, jsonb, jsonb, text, uuid) to authenticated, service_role;

create or replace function public.source_discovery_link(p_id uuid, p_source uuid, p_accepted text[] default '{}')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_system boolean := coalesce(auth.role(), 'authenticated') not in ('anon', 'authenticated');
begin
  if not v_system and not has_any_role(v_uid, '{admin,editor_chefe,operador_ia}') then
    raise exception 'sem permissão para gerenciar fontes (source.manage)' using errcode = '42501';
  end if;
  if not exists (select 1 from sources where id = p_source and archived_at is null) then
    return false;
  end if;
  update source_discoveries
     set source_id = p_source, accepted_fields = coalesce(p_accepted, '{}')
   where id = p_id and source_id is null
     and created_at > now() - interval '1 day'
     and (v_system or created_by = v_uid);
  return found;
end
$$;
