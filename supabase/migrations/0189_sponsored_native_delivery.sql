-- B-022 · Patrocínio nativo no portal (atrás de `sponsored_native_enabled`, que segue desligada).
--
-- 1. `sponsored_campaigns.views` e `.clicks`: contagem agregada do card nativo (impressão já é
--    `deliveries`, que até aqui nada incrementava). Sem identificador de pessoa.
-- 2. `public_sponsored_campaigns`: o que o portal lê. Só campanha ativa, no período (dia de
--    Cuiabá), peça `native` com link https e fora de Política, Justiça, Segurança e Saúde;
--    leva o teto por página (`ads.max_per_page`, padrão 1), que o anônimo não lê em
--    `app_settings`. Com `sponsored_native_enabled` desligada a view fica vazia (falha fechada:
--    sem card, sem link de clique, sem contagem). Roda com os direitos do dono, como `public_ad_placements` (0082). Sem
--    entregas, autoria nem datas de edição.
-- 3. `ad_track`: aceita também o id de uma campanha nativa (mesma deduplicação de 30 min), para
--    as rotas `/api/ads/view` e `/api/ads/click/[id]` servirem ao card nativo.
-- Sem `drop`: só acrescenta e substitui a função.

alter table public.sponsored_campaigns
  add column if not exists views int not null default 0 check (views >= 0),
  add column if not exists clicks int not null default 0 check (clicks >= 0);

create or replace view public.public_sponsored_campaigns as
  select c.id, c.advertiser, c.starts_on, c.ends_on, c.allowed_sections, c.creative,
         coalesce((select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::int
                               when s.value #>> '{}' ~ '^[0-9]+$' then (s.value #>> '{}')::int
                          end
                     from public.app_settings s where s.key = 'ads.max_per_page'), 1)
           as max_per_page
    from public.sponsored_campaigns c
   where c.status = 'active'
     and (now() at time zone 'America/Cuiaba')::date between c.starts_on and c.ends_on
     and c.creative->>'kind' = 'native'
     and c.creative->>'href' like 'https://%'
     -- Mesma regra de `is_never_sponsored_section` (0075), em linha: a função não é executável
     -- pelo anônimo, e função dentro de view roda com os direitos de quem lê.
     and not exists (
       select 1
         from unnest(c.allowed_sections) s
         cross join unnest(array['politica', 'justica', 'seguranca', 'saude']) n
        where s = n
           or s like n || '-%'
           or exists (select 1 from public.sections sec
                       where sec.slug = s and sec.autonomy_category = n))
     -- Interruptor desligado: nada sai (nem link de clique nem contagem).
     and exists (select 1 from public.feature_flags f
                  where f.key = 'sponsored_native_enabled' and f.enabled);
revoke all on public.public_sponsored_campaigns from anon, authenticated;
grant select on public.public_sponsored_campaigns to anon, authenticated, service_role;

create or replace function public.ad_track(p_placement uuid, p_section text, p_event text, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Cuiaba')::date;
  v_section text := coalesce(p_section, '');
  v_campaign boolean := false;
begin
  if p_event not in ('impression', 'view', 'click') then
    raise exception 'ad_track: evento inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_placements where id = p_placement) then
    -- Card nativo (B-022): só campanha que o portal pode mostrar agora.
    if not exists (select 1 from public.public_sponsored_campaigns where id = p_placement) then
      return false;
    end if;
    v_campaign := true;
  end if;
  insert into public.ad_event_keys (key) values (p_key) on conflict (key) do nothing;
  if not found then
    return false;
  end if;
  if v_campaign then
    update public.sponsored_campaigns
       set deliveries = deliveries + (p_event = 'impression')::int,
           views = views + (p_event = 'view')::int,
           clicks = clicks + (p_event = 'click')::int
     where id = p_placement;
    return true;
  end if;
  insert into public.ad_stats (day, placement_id, section_slug, impressions, views, clicks)
  values (v_day, p_placement, v_section,
          (p_event = 'impression')::int, (p_event = 'view')::int, (p_event = 'click')::int)
  on conflict (day, placement_id, section_slug) do update set
    impressions = ad_stats.impressions + excluded.impressions,
    views = ad_stats.views + excluded.views,
    clicks = ad_stats.clicks + excluded.clicks;
  return true;
end
$$;
revoke execute on function public.ad_track(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ad_track(uuid, text, text, text) to service_role;
