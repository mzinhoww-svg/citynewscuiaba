-- A-210 · Tipo principal do lugar no Google (`primaryType`, como `bakery` ou `hotel`). A busca por
-- texto do Google traz lugares que só mencionam o termo (hotel em "padaria"); o tipo confere a
-- categoria antes de o lugar entrar numa lista. É dado do Google: vale 30 dias, como o resto.

alter table public.venues add column if not exists google_primary_type text;

-- Expurgo dos 30 dias (0180) passa a limpar também o tipo.
create or replace function public.guide_expire_google(p_before timestamptz)
returns int language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  update public.venues v set
    rating = case when v.rating_source = 'google' then null else v.rating end,
    rating_count = case when v.rating_source = 'google' then null else v.rating_count end,
    rating_source = case when v.rating_source = 'google' then null else v.rating_source end,
    phone = case when array_remove(v.data_sources, 'site') = array['google']::text[] then null else v.phone end,
    website = case when array_remove(v.data_sources, 'site') = array['google']::text[] then null else v.website end,
    hours = case when array_remove(v.data_sources, 'site') = array['google']::text[] then null else v.hours end,
    price_level = case when array_remove(v.data_sources, 'site') = array['google']::text[] then null else v.price_level end,
    google_maps_url = null,
    google_primary_type = null,
    data_sources = case
      when array_remove(v.data_sources, 'site') = array['google']::text[] then '{}'::text[]
      else array_remove(v.data_sources, 'google')
    end,
    updated_at = now()
  where 'google' = any (v.data_sources)
    and (v.google_fetched_at is null or v.google_fetched_at < p_before);
  get diagnostics n = row_count;
  return n;
end $fn$;

-- Salvamento em lote (0161, 0180) passa a gravar o tipo.
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
    google_maps_url, google_primary_type, place_ids, data_sources, data_updated_at, rating_updated_at,
    google_fetched_at
  )
  select x.slug, x.name, x.category, x.subcategory, x.neighborhood, x.address, x.lat, x.lng,
         x.phone, x.website, x.instagram, x.hours, x.price_level, x.rating, x.rating_count,
         x.rating_source, x.tripadvisor_rank, x.tripadvisor_url, x.google_maps_url, x.google_primary_type,
         coalesce(x.place_ids, '{}'::jsonb), coalesce(x.data_sources, '{}'::text[]),
         x.data_updated_at, x.rating_updated_at, x.google_fetched_at
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
         google_maps_url = x.google_maps_url,
         google_primary_type = x.google_primary_type,
         place_ids = coalesce(x.place_ids, '{}'::jsonb),
         data_sources = coalesce(x.data_sources, '{}'::text[]),
         data_updated_at = x.data_updated_at,
         rating_updated_at = case when u.e ? 'rating_updated_at' then x.rating_updated_at
                                  else v.rating_updated_at end,
         google_fetched_at = case when u.e ? 'google_fetched_at' then x.google_fetched_at
                                  else v.google_fetched_at end
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) as u(e)
   cross join lateral jsonb_populate_record(null::venues, u.e) as x
   where v.id = x.id;
  get diagnostics v_upd = row_count;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd);
end
$$;
