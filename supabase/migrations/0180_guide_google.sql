-- GUIA-G2 · Google Places como fonte do Guia (A-210, A-211; spec 2026-10-06-guia-google-places-design.md).
-- Aditiva e idempotente: aceita `google` em `data_sources`, guarda o link do Google Maps e a data da
-- coleta (os termos do Google permitem guardar o dado por no máximo 30 dias; só o Place ID fica sem
-- prazo) e um expurgo para o que venceu.

alter table public.venues drop constraint if exists venues_data_sources_check;
alter table public.venues add constraint venues_data_sources_check
  check (data_sources <@ array['google', 'osm', 'tripadvisor', 'site', 'wikidata', 'manual']::text[]);

alter table public.venues
  add column if not exists google_maps_url text
    check (google_maps_url is null or google_maps_url ~ '^https://'),
  add column if not exists google_fetched_at timestamptz;

create index if not exists venues_google_idx on public.venues ((place_ids ->> 'google'))
  where place_ids ? 'google';

-- Expurgo dos dados do Google sem atualização desde `p_before`: nota, contagem e link saem quando a
-- nota é do Google; telefone, site, horário e faixa de preço só quando o Google era a única fonte,
-- contando como dele o site do lugar lido a partir do link que o próprio Google trouxe (o passo do
-- site só preenche campo vazio). Nesse caso `site` também sai, e a próxima leitura do site o refaz.
-- O Place ID fica. Devolve quantos mudaram.
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
revoke execute on function public.guide_expire_google(timestamptz) from public, anon, authenticated;
grant execute on function public.guide_expire_google(timestamptz) to service_role;
