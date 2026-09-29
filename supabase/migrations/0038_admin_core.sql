-- P5-T8 · Administração: usuários, papéis, equipes, taxonomia e home (A01–A06).
--
-- 1. `staff_invites`: convite de pessoa da equipe (o Auth manda o link; aqui fica o estado
--    "Convite pendente" até o primeiro acesso). Convite nunca dá `admin` (papel de admin só por
--    aprovação `role.admin`, `guard_user_roles` em 0002).
-- 2. `teams` / `team_members`: equipes editoriais com editorias e responsável.
-- 3. Taxonomia: `places` (bairros e municípios, antes lista fixa em src/content) e mesclagem de
--    tags duplicadas com vínculos preservados (`taxonomy_merge_tags`).
-- 4. `home_layouts`: ordem e ativação dos módulos da home, versionada, com uma só publicada.
-- 5. Auditoria: ações da administração (união com 0035).

-- ---------------------------------------------------------------------------
-- 1. Convites
-- ---------------------------------------------------------------------------
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.app_role not null check (role <> 'admin'),
  sections text[] not null default '{}',
  invited_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index if not exists staff_invites_pending_idx on public.staff_invites (user_id) where accepted_at is null;
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon;
create policy staff_invites_admin on public.staff_invites for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Equipes
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  name text not null check (length(name) between 2 and 80),
  description text not null default '' check (length(description) <= 300),
  sections text[] not null default '{}',
  lead_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams, public.team_members from anon;
create policy teams_read_staff on public.teams for select to authenticated
  using (public.is_staff((select auth.uid())));
create policy teams_admin on public.teams for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
create policy team_members_read_staff on public.team_members for select to authenticated
  using (public.is_staff((select auth.uid())));
create policy team_members_admin on public.team_members for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Taxonomia: lugares e tags
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  name text not null check (length(name) between 2 and 80),
  kind text not null check (kind in ('bairro', 'municipio')),
  in_phrase text not null check (length(in_phrase) between 2 and 100),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.places enable row level security;
create policy places_read on public.places for select to anon, authenticated using (true);
create policy places_write on public.places for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));
insert into public.places (slug, name, kind, in_phrase) values
  ('boa-esperanca', 'Boa Esperança', 'bairro', 'na Boa Esperança'),
  ('centro-norte', 'Centro Norte', 'bairro', 'no Centro Norte'),
  ('centro-politico-administrativo', 'Centro Político Administrativo', 'bairro', 'no CPA'),
  ('centro-sul', 'Centro Sul', 'bairro', 'no Centro Sul'),
  ('coxipo', 'Coxipó', 'bairro', 'no Coxipó'),
  ('cpa', 'CPA', 'bairro', 'no CPA'),
  ('duque-de-caxias', 'Duque de Caxias', 'bairro', 'no Duque de Caxias'),
  ('jardim-italia', 'Jardim Itália', 'bairro', 'no Jardim Itália'),
  ('morada-da-serra', 'Morada da Serra', 'bairro', 'na Morada da Serra'),
  ('pedra-90', 'Pedra 90', 'bairro', 'no Pedra 90'),
  ('planalto', 'Planalto', 'bairro', 'no Planalto'),
  ('porto', 'Porto', 'bairro', 'no Porto'),
  ('quilombo', 'Quilombo', 'bairro', 'no Quilombo'),
  ('tres-barras', 'Três Barras', 'bairro', 'no Três Barras'),
  ('verdao', 'Verdão', 'bairro', 'no Verdão'),
  ('varzea-grande', 'Várzea Grande', 'municipio', 'em Várzea Grande')
on conflict (slug) do nothing;

-- Tags em uso (matérias e itens coletados), para a tela de taxonomia. Só equipe.
create or replace function public.taxonomy_tags()
returns table (tag text, articles int, items int)
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select t as tag, count(*)::int as n from articles, unnest(tags) t group by t
  ), c as (
    select t as tag, count(*)::int as n from collected_items, unnest(tags) t group by t
  )
  select coalesce(a.tag, c.tag), coalesce(a.n, 0), coalesce(c.n, 0)
  from a full outer join c on c.tag = a.tag
  where public.is_staff(auth.uid())
  order by 1
$$;
revoke execute on function public.taxonomy_tags() from public, anon;
grant execute on function public.taxonomy_tags() to authenticated, service_role;

-- Mescla `p_from` em `p_into` em matérias e itens coletados, sem duplicar e sem perder vínculo
-- (a matéria que tinha as duas fica com uma). Roda como dono: as invariantes de matéria
-- publicada (0023) valem para a redação, não para a taxonomia; nada além de `tags` muda.
create or replace function public.taxonomy_merge_tags(p_from text, p_into text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n_articles int;
  n_items int;
begin
  if coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated')
     and not public.has_any_role(auth.uid(), '{admin,editor_chefe}') then
    raise exception 'taxonomia: sem permissão' using errcode = '42501';
  end if;
  if p_from is null or p_into is null or btrim(p_from) = '' or btrim(p_into) = '' or p_from = p_into then
    raise exception 'taxonomia: tags inválidas para mesclar' using errcode = '22023';
  end if;
  update articles
     set tags = (select array_agg(distinct t order by t) from unnest(array_replace(tags, p_from, p_into)) t)
   where p_from = any (tags);
  get diagnostics n_articles = row_count;
  update collected_items
     set tags = (select array_agg(distinct t order by t) from unnest(array_replace(tags, p_from, p_into)) t)
   where p_from = any (tags);
  get diagnostics n_items = row_count;
  return n_articles + n_items;
end
$$;
revoke execute on function public.taxonomy_merge_tags(text, text) from public, anon;
grant execute on function public.taxonomy_merge_tags(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Módulos da home
-- ---------------------------------------------------------------------------
create table if not exists public.home_layouts (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  -- [{ "id": "topics", "enabled": true }, …] na ordem de exibição
  modules jsonb not null check (jsonb_typeof(modules) = 'array' and jsonb_array_length(modules) between 1 and 20),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  note text not null default '' check (length(note) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz
);
create unique index if not exists home_layouts_one_published on public.home_layouts ((status)) where status = 'published';
alter table public.home_layouts enable row level security;
create policy home_layouts_read on public.home_layouts for select to anon, authenticated using (true);
create policy home_layouts_write on public.home_layouts for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));

-- Versão publicada e status são imutáveis por quem não é dono (publicar é pela função abaixo).
create or replace function public.guard_home_layouts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' and (old.status <> 'draft' or new.status <> 'draft') then
      raise exception 'home_layouts: versão publicada é imutável; publique por home_layout_publish' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and new.status <> 'draft' then
      raise exception 'home_layouts: nova versão nasce como rascunho' using errcode = '42501';
    end if;
    if tg_op = 'DELETE' and old.status <> 'draft' then
      raise exception 'home_layouts: só rascunho é apagado' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
drop trigger if exists home_layouts_guard on public.home_layouts;
create trigger home_layouts_guard before insert or update or delete on public.home_layouts
  for each row execute function public.guard_home_layouts();

create or replace function public.home_layout_publish(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v int;
begin
  if coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated')
     and not public.has_any_role(uid, '{admin,editor_chefe}') then
    raise exception 'home: sem permissão' using errcode = '42501';
  end if;
  select version into v from home_layouts where id = p_id and status = 'draft' for update;
  if v is null then
    raise exception 'home: rascunho não encontrado' using errcode = 'P0002';
  end if;
  update home_layouts set status = 'archived' where status = 'published';
  update home_layouts set status = 'published', published_by = uid, published_at = now() where id = p_id;
  return v;
end
$$;
revoke execute on function public.home_layout_publish(uuid) from public, anon;
grant execute on function public.home_layout_publish(uuid) to authenticated, service_role;

insert into public.home_layouts (version, modules, status, note, published_at)
values (1, '[
  {"id":"topics","enabled":true},
  {"id":"collections","enabled":true},
  {"id":"nearby","enabled":true},
  {"id":"agenda_services","enabled":true},
  {"id":"sections","enabled":true},
  {"id":"most_read","enabled":true},
  {"id":"sources","enabled":true},
  {"id":"panorama","enabled":true},
  {"id":"newsletter","enabled":true}
]'::jsonb, 'published', 'Ordem inicial (P1)', now())
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Auditoria: união de 0035 + administração (P5-T8)
-- ---------------------------------------------------------------------------
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- permissões (ACTIONS)
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'source.approve_critical', 'rules.propose', 'rules.approve', 'prompt.publish',
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view', 'site.manage',
    -- Estúdio (P4)
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    -- Painel de fontes (0033)
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update',
    -- Control Center (P5-T3) e governança da IA (P5-T6)
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case',
    -- Aprovações (P5-T1)
    'approval.requested', 'approval.approved', 'approval.rejected', 'approval.applied',
    -- Contingência (P5-T10)
    'flag.set', 'rules.rollback',
    -- Administração (P5-T8)
    'user.invite', 'user.role.grant', 'user.role.revoke', 'team.save', 'team.delete',
    'taxonomy.save', 'taxonomy.merge', 'home.save', 'home.publish'
  ]::text[]
$$;
