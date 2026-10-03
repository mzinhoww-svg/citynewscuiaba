-- GUIA-T1 · Guia Cuiabá: lugares, listas, modelos e propostas (spec 2026-10-03-guia-cuiaba-listas).
-- Faixa exclusiva 0130+. Aditiva e idempotente; sem remoção de dados em nenhum comando.
--
-- Decisões desta migration (ver docs/reports/guia-cuiaba.md):
--  * R33/R38: sem Google. A nota vem do TripAdvisor (chave de ambiente) ou de cadastro manual:
--    `rating`, `rating_count` e `rating_source` no lugar de `rating_google`. Nunca texto de avaliação.
--  * RLS pública só de lista publicada e de lugar ativo citado por lista publicada.
--  * Lista publicada exige o texto "Como escolhemos" (check no banco).
--  * Patrocínio: só CityNews e parceiros; só admin e editor-chefe ligam a flag.

-- ---------------------------------------------------------------------------
-- 1. Quem gerencia o Guia: admin, editor-chefe, ou editor da editoria guia-cuiaba.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_guide(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(uid, '{admin,editor_chefe}')
      or public.can_edit_section(uid, 'guia-cuiaba')
$$;
revoke execute on function public.can_manage_guide(uuid) from public, anon;
grant execute on function public.can_manage_guide(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Lugares
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name text not null check (length(trim(name)) between 2 and 160),
  category text not null check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subcategory text,
  neighborhood text,
  address text,
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  phone text,
  website text check (website is null or website ~ '^https?://'),
  instagram text,
  -- Horário como a fonte informa (ex.: Mo-Sa 07:00-19:00).
  hours text,
  price_level smallint check (price_level between 1 and 4),
  -- {osm: "node/1", tripadvisor: "123", wikidata: "Q1"}
  place_ids jsonb not null default '{}'::jsonb,
  rating numeric(3, 2) check (rating between 0 and 5),
  rating_count int check (rating_count >= 0),
  rating_source text check (rating_source in ('tripadvisor', 'google', 'manual')),
  tripadvisor_rank int check (tripadvisor_rank >= 1),
  tripadvisor_url text check (tripadvisor_url is null or tripadvisor_url ~ '^https://'),
  -- Fontes que trouxeram dados: osm, tripadvisor, site, wikidata, manual.
  data_sources text[] not null default '{}'
    check (data_sources <@ array['osm', 'tripadvisor', 'site', 'wikidata', 'manual']::text[]),
  data_updated_at timestamptz,
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venues_category_idx on public.venues (category, status);
create index if not exists venues_neighborhood_idx on public.venues (neighborhood) where neighborhood is not null;
create index if not exists venues_osm_idx on public.venues ((place_ids ->> 'osm')) where place_ids ? 'osm';
create index if not exists venues_ta_idx on public.venues ((place_ids ->> 'tripadvisor')) where place_ids ? 'tripadvisor';
create index if not exists venues_refresh_idx on public.venues (data_updated_at nulls first);

-- Fotos oficiais do lugar (política `reproduction`): liga `media_assets` ao lugar, com crédito e origem.
create table if not exists public.venue_media (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  media_id uuid not null references public.media_assets(id),
  credit text not null,
  origin_url text not null check (origin_url ~ '^https?://'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, media_id)
);
create index if not exists venue_media_venue_idx on public.venue_media (venue_id, position);

-- ---------------------------------------------------------------------------
-- 3. Modelos, listas, itens e propostas
-- ---------------------------------------------------------------------------
create table if not exists public.guide_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Ex.: "As 5 melhores padarias de Cuiabá".
  title text not null check (length(trim(title)) between 8 and 160),
  -- Substantivo no plural para o texto de critério ("padarias").
  noun text not null default '',
  category text not null check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subcategory text,
  neighborhood text,
  take int not null default 5 check (take between 3 and 20),
  min_venues int not null default 5 check (min_venues between 3 and 20),
  weights jsonb,
  active boolean not null default true,
  last_proposed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.guide_lists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  title text not null check (length(trim(title)) between 8 and 160),
  intro text,
  -- "Como escolhemos": lista publicada nunca fica sem ele.
  criteria text not null default '',
  category text not null check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subcategory text,
  neighborhood text,
  take int not null default 5 check (take between 3 and 20),
  status text not null default 'proposal'
    check (status in ('proposal', 'draft', 'published', 'suspended', 'discarded')),
  origin text not null default 'manual' check (origin in ('template', 'link', 'manual')),
  template_id uuid references public.guide_templates(id),
  sponsored boolean not null default false,
  sponsor_name text,
  sponsor_kind text check (sponsor_kind in ('citynews', 'partner')),
  weights jsonb,
  published_at timestamptz,
  -- "Atualizado em": última vez que a lista foi recalculada ou revisada.
  refreshed_at timestamptz,
  next_refresh_at timestamptz,
  -- Como foi publicada: rule (regras do Guia) ou o id da pessoa.
  published_by text,
  suspended_at timestamptz,
  suspended_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_lists_criteria_to_publish
    check (status <> 'published' or length(trim(criteria)) >= 40),
  constraint guide_lists_sponsor_coherent
    check ((sponsored and sponsor_name is not null and length(trim(sponsor_name)) >= 2 and sponsor_kind is not null)
        or (not sponsored and sponsor_name is null and sponsor_kind is null))
);
create index if not exists guide_lists_status_idx on public.guide_lists (status, published_at desc);
create index if not exists guide_lists_refresh_idx on public.guide_lists (next_refresh_at) where status = 'published';

create table if not exists public.guide_list_items (
  list_id uuid not null references public.guide_lists(id),
  venue_id uuid not null references public.venues(id),
  position int not null check (position >= 1),
  editor_note text check (editor_note is null or length(editor_note) <= 400),
  score numeric(5, 2),
  score_breakdown jsonb not null default '{}'::jsonb,
  primary key (list_id, venue_id),
  unique (list_id, position) deferrable initially deferred
);
create index if not exists guide_list_items_venue_idx on public.guide_list_items (venue_id);

create table if not exists public.guide_proposals (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('template', 'link', 'manual')),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  template_id uuid references public.guide_templates(id),
  list_id uuid references public.guide_lists(id),
  status text not null default 'open' check (status in ('open', 'published', 'discarded')),
  -- Para link: nomes e fatos extraídos e o que foi descartado. Nunca texto copiado do portal.
  analysis jsonb not null default '{}'::jsonb,
  decision_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
create index if not exists guide_proposals_status_idx on public.guide_proposals (status, created_at desc);

-- Reclamações sobre um lugar (formulário "Informar problema"). Só o servidor grava.
create table if not exists public.venue_reports (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  reason text not null check (length(trim(reason)) between 5 and 1000),
  contact text check (contact is null or length(contact) <= 200),
  status text not null default 'open' check (status in ('open', 'dismissed', 'confirmed')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);
create index if not exists venue_reports_open_idx on public.venue_reports (venue_id) where status = 'open';

-- Execuções de coleta e propostas (histórico e cota de custo).
create table if not exists public.guide_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('venue_sync', 'propose', 'refresh')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  report jsonb
);
create index if not exists guide_runs_kind_idx on public.guide_runs (kind, started_at desc);

-- ---------------------------------------------------------------------------
-- 4. Guardas: patrocínio só por admin e editor-chefe; "atualizado em" nunca no futuro.
-- ---------------------------------------------------------------------------
create or replace function public.guard_guide_lists_direct()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.sponsored then
      if not public.has_any_role((select auth.uid()), '{admin,editor_chefe}') then
        raise exception 'guide_lists: patrocínio só por admin ou editor-chefe' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE'
      and (new.sponsored is distinct from old.sponsored
        or new.sponsor_name is distinct from old.sponsor_name
        or new.sponsor_kind is distinct from old.sponsor_kind) then
      if not public.has_any_role((select auth.uid()), '{admin,editor_chefe}') then
        raise exception 'guide_lists: patrocínio só por admin ou editor-chefe' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;
create or replace trigger guide_lists_guard before insert or update on public.guide_lists
  for each row execute function public.guard_guide_lists_direct();

create or replace function public.guard_venues_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create or replace trigger venues_touch before update on public.venues
  for each row execute function public.guard_venues_touch();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.venues enable row level security;
alter table public.venue_media enable row level security;
alter table public.guide_templates enable row level security;
alter table public.guide_lists enable row level security;
alter table public.guide_list_items enable row level security;
alter table public.guide_proposals enable row level security;
alter table public.venue_reports enable row level security;
alter table public.guide_runs enable row level security;

revoke all on public.venues, public.venue_media, public.guide_templates, public.guide_lists,
  public.guide_list_items, public.guide_proposals, public.venue_reports, public.guide_runs
  from public, anon, authenticated;
grant select on public.venues, public.venue_media, public.guide_lists, public.guide_list_items
  to anon, authenticated;
grant insert, update, delete on public.venues, public.venue_media, public.guide_lists,
  public.guide_list_items to authenticated;
grant select, insert, update, delete on public.guide_templates, public.guide_proposals to authenticated;
grant select on public.venue_reports, public.guide_runs to authenticated;
grant all on public.venues, public.venue_media, public.guide_templates, public.guide_lists,
  public.guide_list_items, public.guide_proposals, public.venue_reports, public.guide_runs
  to service_role;

do $$
begin
  -- Público: só lista publicada.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_lists_read_public') then
    create policy guide_lists_read_public on public.guide_lists for select to anon, authenticated
      using (status = 'published');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_lists_read_staff') then
    create policy guide_lists_read_staff on public.guide_lists for select to authenticated
      using (public.can_manage_guide((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_lists_write_staff') then
    create policy guide_lists_write_staff on public.guide_lists for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.can_manage_guide((select auth.uid())));
  end if;

  -- Itens: públicos só de lista publicada.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_items_read_public') then
    create policy guide_items_read_public on public.guide_list_items for select to anon, authenticated
      using (exists (select 1 from public.guide_lists l where l.id = list_id and l.status = 'published'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_items_staff') then
    create policy guide_items_staff on public.guide_list_items for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.can_manage_guide((select auth.uid())));
  end if;

  -- Lugares: públicos só se ativos e citados por lista publicada.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'venues_read_public') then
    create policy venues_read_public on public.venues for select to anon, authenticated
      using (status = 'active' and exists (
        select 1 from public.guide_list_items i
        join public.guide_lists l on l.id = i.list_id
        where i.venue_id = venues.id and l.status = 'published'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'venues_staff') then
    create policy venues_staff on public.venues for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.can_manage_guide((select auth.uid())));
  end if;

  -- Fotos do lugar: o mesmo corte do lugar; `media_assets` aplica a sua própria RLS
  -- (aprovada e, para reprodução, com a flag ligada).
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'venue_media_read_public') then
    create policy venue_media_read_public on public.venue_media for select to anon, authenticated
      using (exists (
        select 1 from public.guide_list_items i
        join public.guide_lists l on l.id = i.list_id
        join public.venues v on v.id = i.venue_id
        where i.venue_id = venue_media.venue_id and l.status = 'published' and v.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'venue_media_staff') then
    create policy venue_media_staff on public.venue_media for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.can_manage_guide((select auth.uid())));
  end if;

  -- Modelos, propostas, reclamações e execuções: nunca públicos.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_templates_staff') then
    create policy guide_templates_staff on public.guide_templates for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_proposals_staff') then
    create policy guide_proposals_staff on public.guide_proposals for all to authenticated
      using (public.can_manage_guide((select auth.uid())))
      with check (public.can_manage_guide((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'venue_reports_read_staff') then
    create policy venue_reports_read_staff on public.venue_reports for select to authenticated
      using (public.can_manage_guide((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'guide_runs_read_staff') then
    create policy guide_runs_read_staff on public.guide_runs for select to authenticated
      using (public.can_manage_guide((select auth.uid())));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Reclamação de um lugar: suspende todas as listas publicadas que o citam (Review Focus 4)
-- ---------------------------------------------------------------------------
create or replace function public.guide_report_venue(p_venue uuid, p_reason text, p_contact text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  slugs text[];
begin
  if not exists (select 1 from public.venues where id = p_venue) then
    raise exception 'guide_report_venue: lugar inexistente' using errcode = 'P0002';
  end if;
  insert into public.venue_reports (venue_id, reason, contact)
  values (p_venue, trim(p_reason), nullif(trim(coalesce(p_contact, '')), ''))
  returning id into rid;

  update public.venues set status = 'suspended', status_reason = 'reclamação ' || rid::text
  where id = p_venue and status = 'active';

  with s as (
    update public.guide_lists l
       set status = 'suspended', suspended_at = now(), suspended_reason = 'venue_report:' || rid::text
     where l.status = 'published'
       and exists (select 1 from public.guide_list_items i where i.list_id = l.id and i.venue_id = p_venue)
    returning l.slug
  )
  select coalesce(array_agg(slug), '{}') into slugs from s;

  return jsonb_build_object('reportId', rid, 'suspendedLists', to_jsonb(slugs));
end
$$;
revoke execute on function public.guide_report_venue(uuid, text, text) from public, anon, authenticated;
grant execute on function public.guide_report_venue(uuid, text, text) to service_role;

-- Decisão humana: `dismiss` (improcedente) devolve lugar e listas; `confirm` mantém as listas
-- suspensas e tira o lugar do ar até a lista ser ajustada.
create or replace function public.guide_resolve_report(p_report uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.venue_reports%rowtype;
  uid uuid := (select auth.uid());
  restored text[];
begin
  if uid is not null and not public.can_manage_guide(uid) then
    raise exception 'guide_resolve_report: sem permissão' using errcode = '42501';
  end if;
  if p_decision not in ('dismiss', 'confirm') then
    raise exception 'guide_resolve_report: decisão inválida' using errcode = '22023';
  end if;
  select * into r from public.venue_reports where id = p_report for update;
  if not found then
    raise exception 'guide_resolve_report: reclamação inexistente' using errcode = 'P0002';
  end if;
  if r.status <> 'open' then
    raise exception 'guide_resolve_report: reclamação já decidida' using errcode = '22023';
  end if;

  update public.venue_reports
     set status = case when p_decision = 'dismiss' then 'dismissed' else 'confirmed' end,
         decided_by = uid, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_report;

  if p_decision = 'confirm' then
    update public.venues set status = 'inactive', status_reason = 'reclamação confirmada ' || p_report::text
    where id = r.venue_id;
    return jsonb_build_object('restoredLists', '[]'::jsonb);
  end if;

  -- Improcedente: o lugar volta, se não houver outra reclamação aberta.
  if not exists (select 1 from public.venue_reports where venue_id = r.venue_id and status = 'open') then
    update public.venues set status = 'active', status_reason = null
    where id = r.venue_id and status = 'suspended';
  end if;
  -- As listas só voltam se nenhum lugar delas estiver suspenso ou inativo.
  with s as (
    update public.guide_lists l
       set status = 'published', suspended_at = null, suspended_reason = null
     where l.status = 'suspended' and l.suspended_reason = 'venue_report:' || p_report::text
       and not exists (
         select 1 from public.guide_list_items i join public.venues v on v.id = i.venue_id
         where i.list_id = l.id and v.status <> 'active')
    returning l.slug
  )
  select coalesce(array_agg(slug), '{}') into restored from s;
  return jsonb_build_object('restoredLists', to_jsonb(restored));
end
$$;
revoke execute on function public.guide_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.guide_resolve_report(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Auditoria: ações novas na lista fechada, somadas às que já existem (a lista é lida da
--    própria função, então migrations de outras frentes continuam valendo).
-- ---------------------------------------------------------------------------
do $$
declare
  cur text[];
  extra text[] := array[
    'guide.propose', 'guide.publish', 'guide.suspend', 'guide.adjust', 'guide.discard',
    'guide.sponsor', 'guide.restore', 'guide.refresh', 'guide.venue.save', 'guide.template.save',
    'guide.report.decide', 'guide.sync'
  ];
  merged text[];
begin
  select public.studio_audit_actions() into cur;
  select array_agg(distinct a order by a) into merged from unnest(cur || extra) as a;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8. Interruptor da publicação automática do Guia (liga por padrão; o Estúdio desliga).
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values ('guide_auto_publish', true)
on conflict (key) do nothing;
