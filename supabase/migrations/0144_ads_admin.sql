-- ADS-T4 (plano 2026-10-03-banners-padrao) · Administração dos banners.
--
-- 1. `feature_flags.ads_enabled` (padrão ligada: as peças da casa já estão no ar): desligar tira
--    todos os campos de banner do portal na hora (o cache dos campos é de 60 s). Fica na página
--    Interruptores, com motivo e auditoria, como o patrocinado nativo.
-- 2. `public_ad_placements` passa a respeitar a flag (mesmas colunas de 0082).
-- 3. Bucket público `ads` para as imagens enviadas pelo Estúdio. A CSP do portal só aceita imagem
--    do próprio site e do Supabase; o envio passa pela ação do Estúdio (papel conferido, tipo e
--    dimensões lidos dos bytes) com o cliente de serviço, como os logotipos das fontes.
-- 4. Auditoria: ações novas na lista fechada (união, sem repetir a lista).
-- Sem `drop`: só cria ou substitui.

insert into public.feature_flags (key, enabled) values ('ads_enabled', true)
on conflict (key) do nothing;

create or replace view public.public_ad_placements as
  select p.id, p.slot, c.creative, p.starts_on, p.ends_on, p.allowed_sections, p.weight,
         p.max_impressions_per_day, (c.advertiser_id is null) as is_house,
         coalesce((select sum(s.impressions) from public.ad_stats s
                    where s.placement_id = p.id
                      and s.day = (now() at time zone 'America/Cuiaba')::date), 0)::int
           as impressions_today
    from public.ad_placements p
    join public.ad_creatives c on c.id = p.creative_id
    join public.ad_slots sl on sl.code = p.slot
   where p.status = 'active' and c.status = 'active' and sl.enabled
     and (now() at time zone 'America/Cuiaba')::date between p.starts_on and p.ends_on
     and coalesce((select f.enabled from public.feature_flags f where f.key = 'ads_enabled'), true);
revoke all on public.public_ad_placements from anon, authenticated;
grant select on public.public_ad_placements to anon, authenticated, service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
               values ('ads', 'ads', true, 204800, array['image/png', 'image/jpeg', 'image/webp'])
             on conflict (id) do nothing$q$;
  end if;
end $$;

do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions()
        || array['ads.banner.create', 'ads.placement.status', 'ads.report.export']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
