-- ADS-T1 (plano 2026-10-03-banners-padrao, spec §2/§4) · Campos de banner, peças, veiculações
-- e contagem agregada.
--
-- 1. `ad_slots`: os 8 campos do padrão B, com os formatos de src/lib/ads/slots.ts.
-- 2. `ad_creatives`: peça tipada (`creative` validado por src/lib/ads/creative.ts no Estúdio),
--    do anunciante ou da casa (`advertiser_id` nulo).
-- 3. `ad_placements`: peça × campo × período × editorias × peso × teto diário. Nunca em
--    Política, Justiça, Segurança ou Saúde (`is_never_sponsored_section`, 0075).
-- 4. `ad_stats`: impressões, visualizações (>= 50% por 1 s) e cliques por dia, peça e editoria,
--    sem identificador de pessoa. `ad_event_keys` guarda só o hash da deduplicação (30 min) e
--    é limpo todo dia.
-- 5. `public_ad_placements`: o que o portal lê (veiculação ativa no período, com a contagem de
--    hoje). As tabelas ficam só para admin e editor-chefe; a contagem passa por `ad_track`,
--    executável só pelo service role (rotas /api/ads/*).
-- Sem `drop`: só cria.

create table if not exists public.ad_slots (
  code text primary key check (code in ('TOP', 'RAIL-A', 'RAIL-B', 'MID', 'ART-1', 'ART-2', 'STICKY', 'HUB')),
  name text not null,
  formats jsonb not null default '[]',
  max_kb int not null default 200 check (max_kb between 1 and 2000),
  enabled boolean not null default true
);

insert into public.ad_slots (code, name, formats) values
  ('TOP', 'Faixa de topo', '[{"width":970,"height":250,"device":"desktop"},{"width":728,"height":90,"device":"desktop"},{"width":320,"height":100,"device":"mobile"}]'),
  ('RAIL-A', 'Retângulo lateral', '[{"width":300,"height":250,"device":"desktop"}]'),
  ('RAIL-B', 'Arranha-céu lateral', '[{"width":300,"height":600,"device":"desktop"}]'),
  ('MID', 'Faixa entre blocos', '[{"width":970,"height":120,"device":"desktop"},{"width":320,"height":100,"device":"mobile"}]'),
  ('ART-1', 'No texto', '[{"width":728,"height":90,"device":"desktop"},{"width":320,"height":100,"device":"mobile"}]'),
  ('ART-2', 'Fim da matéria', '[{"width":728,"height":250,"device":"desktop"},{"width":300,"height":250,"device":"mobile"}]'),
  ('STICKY', 'Rodapé fixo', '[{"width":320,"height":50,"device":"mobile"}]'),
  ('HUB', 'Estúdio CityNews', '[]')
on conflict (code) do nothing;

create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  slot text not null references public.ad_slots(code),
  advertiser_id uuid references public.advertisers(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  creative jsonb not null check (creative->>'kind' in ('display', 'video', 'tile', 'newsletter', 'native')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Peça de imagem: link e imagem https e texto alternativo (o Estúdio valida o resto).
  check (creative->>'kind' <> 'display' or (
    creative->>'href' like 'https://%' and creative->>'imageUrl' like 'https://%'
    and length(btrim(coalesce(creative->>'alt', ''))) > 0))
);

create table if not exists public.ad_placements (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.ad_creatives(id) on delete restrict,
  slot text not null references public.ad_slots(code),
  campaign_id uuid references public.sponsored_campaigns(id) on delete set null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  allowed_sections text[] not null default '{}',
  weight int not null default 1 check (weight between 1 and 100),
  max_impressions_per_day int check (max_impressions_per_day is null or max_impressions_per_day > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ad_placements_live_idx on public.ad_placements (slot, status, starts_on, ends_on);

create or replace function public.guard_ad_placement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bad text;
begin
  select s into bad from unnest(new.allowed_sections) s
   where public.is_never_sponsored_section(s) limit 1;
  if bad is not null then
    raise exception 'publicidade: a editoria "%" (Política, Justiça, Segurança ou Saúde, com subeditorias) não recebe anúncio', bad
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.ad_creatives c where c.id = new.creative_id and c.slot = new.slot) then
    raise exception 'publicidade: a peça não é deste campo' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.guard_ad_placement() from public, anon;
create or replace trigger ad_placements_guard before insert or update on public.ad_placements
  for each row execute function public.guard_ad_placement();

create table if not exists public.ad_stats (
  day date not null,
  placement_id uuid not null references public.ad_placements(id) on delete cascade,
  section_slug text not null default '',
  impressions int not null default 0,
  views int not null default 0,
  clicks int not null default 0,
  primary key (day, placement_id, section_slug)
);

create table if not exists public.ad_event_keys (
  key text primary key,
  at timestamptz not null default now()
);

alter table public.ad_slots enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ad_placements enable row level security;
alter table public.ad_stats enable row level security;
alter table public.ad_event_keys enable row level security;

create policy ad_slots_staff on public.ad_slots for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
create policy ad_creatives_staff on public.ad_creatives for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
create policy ad_placements_staff on public.ad_placements for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
create policy ad_stats_staff_read on public.ad_stats for select to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
-- ad_event_keys: sem política (só o service role, por `ad_track`).

-- O que o portal lê: veiculação ativa, peça ativa e campo ligado, no período (dia de Cuiabá),
-- com as impressões de hoje para o teto diário. Roda com os direitos do dono, como
-- public_bylines (0008).
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
     and (now() at time zone 'America/Cuiaba')::date between p.starts_on and p.ends_on;
revoke all on public.public_ad_placements from anon, authenticated;
grant select on public.public_ad_placements to anon, authenticated, service_role;

-- Contagem: deduplica pela chave (hash) e soma no dia. Devolve `true` se contou.
create or replace function public.ad_track(p_placement uuid, p_section text, p_event text, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Cuiaba')::date;
  v_section text := coalesce(p_section, '');
begin
  if p_event not in ('impression', 'view', 'click') then
    raise exception 'ad_track: evento inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_placements where id = p_placement) then
    return false;
  end if;
  insert into public.ad_event_keys (key) values (p_key) on conflict (key) do nothing;
  if not found then
    return false;
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

-- Limpeza diária das chaves de deduplicação (só servem por 30 min).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ad-event-keys-cleanup', '15 4 * * *',
      $q$delete from public.ad_event_keys where at < now() - interval '1 day'$q$);
  end if;
end $$;
