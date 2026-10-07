-- UX-W5-T4 (item 84): consultas em lote para as rotinas que faziam uma chamada por item.
-- Todas são `security invoker` (a RLS e as permissões de quem chama valem como antes), exceto o
-- alcance, que só repete `push_audience_estimate` (security definer, com a checagem de permissão)
-- para cada pedido.

-- 1. Menções de lugares nas matérias publicadas: a mesma busca de frase (phraseto_tsquery em
-- português, como o filtro `phfts` do PostgREST) para cada par (lugar, frase).
create or replace function public.guide_venue_mentions(p_ids uuid[], p_phrases text[])
returns table (venue_id uuid, mentions int)
language sql
stable
security invoker
set search_path = public
as $$
  select i.id,
         (select count(*)::int
            from articles a
           where a.status in ('published', 'updated')
             and a.tsv @@ phraseto_tsquery('portuguese', i.phrase))
    from unnest(p_ids, p_phrases) as i(id, phrase)
$$;

-- 2. Slugs de lugares já usados que começam por qualquer uma das bases (o sufixo -2, -3 é
-- calculado no servidor da aplicação).
create or replace function public.guide_venue_slugs(p_bases text[])
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select v.slug
    from venues v
   where v.slug like any (array(select b || '%' from unnest(p_bases) as b))
$$;

-- 3. Gravação de lugares da coleta: inserções e atualizações num só comando.
-- `p_inserts`: linhas completas (com slug); `p_updates`: linhas com `id` e os mesmos campos;
-- `rating_updated_at` só muda quando vem no objeto.
create or replace function public.guide_venues_save(p_inserts jsonb, p_updates jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ins int := 0;
  v_upd int := 0;
begin
  insert into venues (
    slug, name, category, subcategory, neighborhood, address, lat, lng, phone, website, instagram,
    hours, price_level, rating, rating_count, rating_source, tripadvisor_rank, tripadvisor_url,
    place_ids, data_sources, data_updated_at, rating_updated_at
  )
  select x.slug, x.name, x.category, x.subcategory, x.neighborhood, x.address, x.lat, x.lng,
         x.phone, x.website, x.instagram, x.hours, x.price_level, x.rating, x.rating_count,
         x.rating_source, x.tripadvisor_rank, x.tripadvisor_url, coalesce(x.place_ids, '{}'::jsonb),
         coalesce(x.data_sources, '{}'::text[]), x.data_updated_at, x.rating_updated_at
    from jsonb_populate_recordset(null::venues, coalesce(p_inserts, '[]'::jsonb)) as x;
  get diagnostics v_ins = row_count;

  update venues v
     set name = x.name,
         category = x.category,
         subcategory = x.subcategory,
         neighborhood = x.neighborhood,
         address = x.address,
         lat = x.lat,
         lng = x.lng,
         phone = x.phone,
         website = x.website,
         instagram = x.instagram,
         hours = x.hours,
         price_level = x.price_level,
         rating = x.rating,
         rating_count = x.rating_count,
         rating_source = x.rating_source,
         tripadvisor_rank = x.tripadvisor_rank,
         tripadvisor_url = x.tripadvisor_url,
         place_ids = coalesce(x.place_ids, '{}'::jsonb),
         data_sources = coalesce(x.data_sources, '{}'::text[]),
         data_updated_at = x.data_updated_at,
         rating_updated_at = case when u.e ? 'rating_updated_at' then x.rating_updated_at
                                  else v.rating_updated_at end
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) as u(e)
   cross join lateral jsonb_populate_record(null::venues, u.e) as x
   where v.id = x.id;
  get diagnostics v_upd = row_count;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd);
end
$$;

-- 4. Alcance estimado de vários pedidos de aviso, na ordem recebida (null onde não se aplica).
-- Cada item: {"kind": "...", "audience": {...}} ou null.
create or replace function public.push_audience_estimates(p_items jsonb)
returns int[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    array_agg(
      case when jsonb_typeof(t.e) = 'object'
           then push_audience_estimate(t.e ->> 'kind', t.e -> 'audience') end
      order by t.o
    ),
    '{}'::int[]
  )
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, o)
$$;

revoke execute on function
  public.guide_venue_mentions(uuid[], text[]), public.guide_venue_slugs(text[]),
  public.guide_venues_save(jsonb, jsonb), public.push_audience_estimates(jsonb)
  from public, anon;
grant execute on function
  public.guide_venue_mentions(uuid[], text[]), public.guide_venue_slugs(text[]),
  public.guide_venues_save(jsonb, jsonb), public.push_audience_estimates(jsonb)
  to authenticated, service_role;
