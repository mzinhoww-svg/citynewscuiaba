-- Administração: usuários, papéis, equipes, taxonomia e home (P5-T8; A-200 a A-209).
--
--   * staff_invites: convite de equipe. O envio real de e-mail segue pendente (B-005): a mensagem
--     fica na própria linha (`email_status = 'queued'`), como `reader_emails` faz para leitores.
--     Convite nunca dá `admin` (concessão de admin só pelo fluxo de aprovação `role.admin`).
--   * admin_user_directory / admin_invite_user / admin_revoke_invite: SECURITY DEFINER, só admin.
--   * guard_last_admin: quem opera pela API não remove nem rebaixa o último admin.
--   * teams / team_members: equipes (nome, descrição, responsável e integrantes).
--   * tags / tag_aliases / article_tags e merge_tags(): mesclar tags duplicadas preserva os
--     vínculos (o slug antigo vira alias da tag que ficou).
--   * home_layouts + home_publish(): módulos da home em ordem, com um rascunho e uma versão
--     publicada por vez; a home pública lê a publicada (anon lê só `published`).
--   * admin_audit_actions(): ações novas de auditoria. `studio_audit` passa a aceitar a união com
--     `studio_audit_actions()`, para que as duas listas evoluam sem uma sobrescrever a outra.

-- ---------------------------------------------------------------------------
-- Convites de equipe
-- ---------------------------------------------------------------------------
create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role app_role not null check (role <> 'admin'),
  sections text[] not null default '{}',
  invited_by uuid references profiles(id) on delete set null,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  email_status text not null default 'queued' check (email_status in ('queued', 'sent', 'failed')),
  email_subject text not null,
  email_body text not null check (length(email_body) <= 4000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create unique index staff_invites_one_pending on staff_invites (email) where status = 'pending';

alter table staff_invites enable row level security;
revoke all on staff_invites from anon;
create policy staff_invites_read_admin on staff_invites for select to authenticated
  using (has_role((select auth.uid()), 'admin'));

create or replace function public.admin_user_directory()
returns table (id uuid, name text, email text, created_at timestamptz, last_sign_in_at timestamptz, roles jsonb)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, u.email::text, p.created_at, u.last_sign_in_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object('role', ur.role, 'sections', ur.sections) order by ur.role)
              from user_roles ur where ur.user_id = p.id),
           '[]'::jsonb)
  from profiles p
  join auth.users u on u.id = p.id
  where public.has_role(auth.uid(), 'admin')
  order by p.display_name
$$;
revoke execute on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated, service_role;

create or replace function public.admin_invite_user(
  p_email text, p_role app_role, p_sections text[], p_token_hash text, p_subject text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  mail text := lower(btrim(coalesce(p_email, '')));
  new_id uuid;
begin
  if uid is null or not public.has_role(uid, 'admin') then
    raise exception 'admin_invite_user: só a administração convida' using errcode = '42501';
  end if;
  if p_role = 'admin' then
    raise exception 'admin_invite_user: convite não concede admin (use a aprovação role.admin)' using errcode = '42501';
  end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(mail) > 254 then
    raise exception 'admin_invite_user: e-mail inválido' using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users u join user_roles ur on ur.user_id = u.id where lower(u.email) = mail
  ) then
    raise exception 'admin_invite_user: a pessoa já tem acesso' using errcode = '23505';
  end if;
  update staff_invites set status = 'revoked' where email = mail and status = 'pending' and expires_at < now();
  insert into staff_invites (email, role, sections, invited_by, token_hash, email_subject, email_body)
  values (mail, p_role, coalesce(p_sections, '{}'), uid, p_token_hash, p_subject, p_body)
  returning id into new_id;
  return new_id;
end
$$;
revoke execute on function public.admin_invite_user(text, app_role, text[], text, text, text) from public, anon;
grant execute on function public.admin_invite_user(text, app_role, text[], text, text, text) to authenticated, service_role;

create or replace function public.admin_revoke_invite(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin_revoke_invite: só a administração' using errcode = '42501';
  end if;
  update staff_invites set status = 'revoked' where id = p_id and status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end
$$;
revoke execute on function public.admin_revoke_invite(uuid) from public, anon;
grant execute on function public.admin_revoke_invite(uuid) to authenticated, service_role;

-- O último admin não sai pela API (service role, usada em manutenção, fica de fora).
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.critical_actor() is null then
    return coalesce(new, old);
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id)
     and not exists (select 1 from public.user_roles ur where ur.role = 'admin' and ur.user_id <> old.user_id) then
    raise exception 'user_roles: o último admin não pode ser removido' using errcode = '42501';
  end if;
  return coalesce(new, old);
end
$$;
create trigger user_roles_last_admin before update or delete on user_roles
  for each row execute function public.guard_last_admin();
revoke execute on function public.guard_last_admin() from public, anon;

-- ---------------------------------------------------------------------------
-- Equipes
-- ---------------------------------------------------------------------------
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 300),
  lead_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index teams_name_key on teams (lower(btrim(name)));
create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table teams enable row level security;
alter table team_members enable row level security;
revoke all on teams, team_members from anon;
create policy teams_read_staff on teams for select to authenticated using (is_staff((select auth.uid())));
create policy teams_write_admin on teams for all to authenticated
  using (has_role((select auth.uid()), 'admin')) with check (has_role((select auth.uid()), 'admin'));
create policy team_members_read_staff on team_members for select to authenticated using (is_staff((select auth.uid())));
create policy team_members_write_admin on team_members for all to authenticated
  using (has_role((select auth.uid()), 'admin')) with check (has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- Taxonomia: tags e mesclagem
-- ---------------------------------------------------------------------------
create table tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);
create table tag_aliases (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tag_id uuid not null references tags(id) on delete cascade
);
create table article_tags (
  article_id uuid not null references articles(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (article_id, tag_id)
);
create index article_tags_tag_idx on article_tags (tag_id);

alter table tags enable row level security;
alter table tag_aliases enable row level security;
alter table article_tags enable row level security;
create policy tags_read on tags for select to anon, authenticated using (true);
create policy tags_write on tags for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));
create policy tag_aliases_read on tag_aliases for select to anon, authenticated using (true);
create policy tag_aliases_write on tag_aliases for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));
-- Vínculo visível quando a matéria é visível (a RLS de articles vale dentro do exists).
create policy article_tags_read on article_tags for select to anon, authenticated
  using (exists (select 1 from articles a where a.id = article_tags.article_id));
create policy article_tags_write on article_tags for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

-- Mescla `p_from` em `p_into`: vínculos migram (sem duplicar), o slug antigo vira alias e a tag
-- antiga some. Devolve quantos vínculos passaram a apontar para a tag que ficou.
create or replace function public.merge_tags(p_from uuid, p_into uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_slug text;
  moved int;
begin
  if p_from = p_into then
    raise exception 'merge_tags: escolha duas tags diferentes' using errcode = '22023';
  end if;
  select slug into old_slug from tags where id = p_from;
  if old_slug is null or not exists (select 1 from tags where id = p_into) then
    raise exception 'merge_tags: tag não encontrada' using errcode = 'P0002';
  end if;
  insert into article_tags (article_id, tag_id)
  select article_id, p_into from article_tags where tag_id = p_from
  on conflict do nothing;
  get diagnostics moved = row_count;
  delete from article_tags where tag_id = p_from;
  update tag_aliases set tag_id = p_into where tag_id = p_from;
  insert into tag_aliases (slug, tag_id) values (old_slug, p_into) on conflict (slug) do update set tag_id = excluded.tag_id;
  delete from tags where id = p_from;
  return moved;
end
$$;
revoke execute on function public.merge_tags(uuid, uuid) from public, anon;
grant execute on function public.merge_tags(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home: módulos em ordem, rascunho e versão publicada
-- ---------------------------------------------------------------------------
create table home_layouts (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  modules jsonb not null check (jsonb_typeof(modules) = 'array' and jsonb_array_length(modules) between 1 and 20),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (status <> 'published' or published_at is not null)
);
create unique index home_layouts_one_published on home_layouts (status) where status = 'published';
create unique index home_layouts_one_draft on home_layouts (status) where status = 'draft';
create unique index home_layouts_version_key on home_layouts (version) where status <> 'draft';

alter table home_layouts enable row level security;
-- anon não executa is_staff (0002 revoga): duas políticas, uma por papel de banco.
create policy home_layouts_read_anon on home_layouts for select to anon
  using (status = 'published');
create policy home_layouts_read_auth on home_layouts for select to authenticated
  using (status = 'published' or is_staff((select auth.uid())));
create policy home_layouts_write on home_layouts for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

create or replace function public.home_publish(p_modules jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  next_version int;
begin
  if uid is null or not public.has_any_role(uid, '{admin,editor_chefe}') then
    raise exception 'home_publish: sem permissão' using errcode = '42501';
  end if;
  update home_layouts set status = 'archived' where status = 'published';
  delete from home_layouts where status = 'draft';
  select coalesce(max(version), 0) + 1 into next_version from home_layouts;
  insert into home_layouts (version, status, modules, created_by, published_at)
  values (next_version, 'published', p_modules, uid, now());
  return next_version;
end
$$;
revoke execute on function public.home_publish(jsonb) from public, anon;
grant execute on function public.home_publish(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auditoria: ações desta tarefa (src/lib/audit/actions.ts, ADMIN_AUDIT_ACTIONS)
-- ---------------------------------------------------------------------------
create or replace function public.admin_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'taxonomy.manage', 'home.manage',
    'user.invite', 'user.invite_revoke', 'role.grant', 'role.revoke', 'role.sections', 'role.admin_request',
    'team.save', 'team.delete', 'team.member_add', 'team.member_remove',
    'tag.create', 'tag.rename', 'tag.merge', 'tag.delete', 'section.rename', 'section.create',
    'home.save_draft', 'home.publish'
  ]::text[]
$$;

create or replace function public.studio_audit(p_actor text, p_action text, p_object_ref text, p_details jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  denied boolean := p_action like '%.denied';
  staff boolean;
  new_id bigint;
begin
  if uid is null then
    raise exception 'studio_audit: exige usuário autenticado' using errcode = '42501';
  end if;
  if p_actor is distinct from uid::text then
    raise exception 'studio_audit: auditoria só em nome próprio' using errcode = '42501';
  end if;
  if regexp_replace(coalesce(p_action, ''), '\.denied$', '') <> all (public.studio_audit_actions() || public.admin_audit_actions()) then
    raise exception 'studio_audit: ação desconhecida' using errcode = '22023';
  end if;
  if length(p_object_ref) > 200 or pg_column_size(p_details) > 16384 then
    raise exception 'studio_audit: registro grande demais' using errcode = '22001';
  end if;
  staff := public.is_staff(uid);
  if not staff then
    if not denied then
      raise exception 'studio_audit: só a equipe audita ações' using errcode = '42501';
    end if;
    if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 1024 then
      raise exception 'studio_audit: detalhes grandes demais' using errcode = '22001';
    end if;
    select l.id into new_id from audit_log l
     where l.actor = uid::text and l.action = p_action and l.object_ref = p_object_ref
       and l.at > now() - interval '10 minutes'
     order by l.at desc limit 1;
    if found then
      return new_id;
    end if;
    if not public.hit_rate_limit('studio_audit_denied', md5(uid::text), 20, 60) then
      return null;
    end if;
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, p_action, p_object_ref, coalesce(p_details, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end
$$;
revoke execute on function public.studio_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.studio_audit(text, text, text, jsonb) to authenticated, service_role;
revoke execute on function public.admin_audit_actions() from public, anon;
grant execute on function public.admin_audit_actions() to authenticated, service_role;
