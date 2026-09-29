-- Painel de Fontes, FS-T6: a edição da aba Coleta (estratégia e URL do feed, "Reanalisar link")
-- precisa gravar `kind` e `feed_url`, que são o que o pipeline executa (spec §6.2: `consumption`
-- guarda o detalhe, `kind`/`feed_url` continuam valendo). `source_admin_update` (0011) ganha as
-- duas chaves; o resto do contrato não muda (só snake_case, chave desconhecida é erro, versão
-- otimista, `security invoker`). Nenhuma das duas é mudança crítica (D-F3). `base_url` e `slug`
-- continuam fora do patch (identidade da fonte). Assinatura igual: grants de 0011 continuam.

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
    feed_url = case when p_patch ? 'feed_url' then nullif(p_patch->>'feed_url', '') else s.feed_url end
  where s.id = p_id and s.version = p_version
  returning s.version into v_new_version;

  if v_new_version is null then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue' using errcode = 'PT409';
  end if;
  return v_new_version;
end
$$;

-- Liga a análise por link à fonte criada a partir dela (spec §6.3, §7.1.9): `source_id` e os campos
-- que vieram de sugestão (`accepted_fields`). Mesma checagem de papel de `source_discovery_save`
-- (security definer, escrita direta em `source_discoveries` segue revogada para `authenticated`).
-- Só a própria pessoa que analisou liga a descoberta, e só uma vez (sem trocar a fonte depois).
create or replace function public.source_discovery_link(p_id uuid, p_source uuid, p_accepted text[] default '{}')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated')
     and not has_any_role(v_uid, '{admin,editor_chefe,operador_ia}') then
    raise exception 'sem permissão para gerenciar fontes (source.manage)' using errcode = '42501';
  end if;
  update source_discoveries
     set source_id = p_source, accepted_fields = coalesce(p_accepted, '{}')
   where id = p_id and source_id is null
     and (created_by = v_uid or coalesce(auth.role(), 'authenticated') not in ('anon', 'authenticated'));
  return found;
end
$$;

revoke execute on function public.source_discovery_link(uuid, uuid, text[]) from public, anon;
grant execute on function public.source_discovery_link(uuid, uuid, text[]) to authenticated, service_role;
