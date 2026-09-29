-- 0036 · P5-T9 Administração: publicidade, SEO, notificações, auditoria, segurança e configurações.
--
-- 1. site_settings: configurações gerais e de SEO/notificações (chaves em lista fechada; leitura da
--    equipe, escrita de admin e editor-chefe; nunca guarda segredo).
-- 2. sponsored_campaigns: `active`, autoria e datas coerentes; gestão por admin e editor-chefe.
--    Flag `sponsored_enabled` (desligada: B-003, plano Hobby da Vercel).
-- 3. push_dispatches + push_urgent_dispatch(): o envio de push urgente só passa com uma aprovação
--    `push.urgent` (duas pessoas, migration 0027) ainda não usada, de menos de 24 h. Sem provedor
--    de push/e-mail, o envio fica `queued` (B-005).
-- 4. admin_security_sessions / admin_security_limits / admin_clear_login_blocks: leitura para
--    admin e editor-chefe; limpar bloqueios de login é só do admin e audita.
-- 5. studio_audit_actions() ganha os nomes novos (união com a lista vigente, sem sobrescrever
--    o que outras migrations acrescentaram).

-- ---------------------------------------------------------------------------
-- 1. site_settings
-- ---------------------------------------------------------------------------
create table if not exists site_settings (
  key text primary key check (key in (
    'seo.title_template', 'seo.default_description',
    'general.contact_email', 'general.tip_email',
    'notify.quiet_start', 'notify.quiet_end', 'notify.max_push_per_day'
  )),
  value text not null check (char_length(value) <= 500),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
revoke all on site_settings from anon;
create policy site_settings_read_staff on site_settings for select to authenticated
  using (is_staff((select auth.uid())));
create policy site_settings_insert on site_settings for insert to authenticated
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));
create policy site_settings_update on site_settings for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

insert into site_settings (key, value) values
  ('seo.title_template', '{titulo} · CityNews Cuiabá'),
  ('seo.default_description', 'Notícias de Cuiabá e Mato Grosso, com a origem de cada informação sempre visível.'),
  ('general.contact_email', 'redacao@citynews.local'),
  ('general.tip_email', 'pautas@citynews.local'),
  ('notify.quiet_start', '22:00'),
  ('notify.quiet_end', '06:00'),
  ('notify.max_push_per_day', '3')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Publicidade
-- ---------------------------------------------------------------------------
alter table sponsored_campaigns
  add column if not exists active boolean not null default false,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz not null default now();
alter table sponsored_campaigns drop constraint if exists sponsored_period_ok;
alter table sponsored_campaigns add constraint sponsored_period_ok
  check (ends_on >= starts_on and cardinality(allowed_sections) > 0);

drop policy if exists sponsored_manage on sponsored_campaigns;
create policy sponsored_manage on sponsored_campaigns for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

insert into feature_flags (key, enabled) values ('sponsored_enabled', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Push urgente
-- ---------------------------------------------------------------------------
create table if not exists push_dispatches (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  article_id uuid not null references articles(id) on delete cascade,
  approval_id uuid not null unique references approvals(id),
  sent_by uuid not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed'))
);
create index if not exists push_dispatches_created_idx on push_dispatches (created_at desc);
alter table push_dispatches enable row level security;
revoke all on push_dispatches from anon;
revoke insert, update, delete, truncate on push_dispatches from authenticated;
revoke all on sequence push_dispatches_id_seq from anon, authenticated;
create policy push_dispatches_read_staff on push_dispatches for select to authenticated
  using (is_staff((select auth.uid())));

-- Consome uma aprovação `push.urgent` (aprovada por outra pessoa, de até 24 h, ainda não usada).
-- Devolve 'queued', 'approval_required', 'not_found' ou 'forbidden'; sempre audita.
create or replace function public.push_urgent_dispatch(p_article uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a approvals%rowtype;
begin
  if uid is null then
    raise exception 'push_urgent_dispatch: exige usuário autenticado' using errcode = '42501';
  end if;
  if not public.has_any_role(uid, '{admin,editor_chefe,editor}'::app_role[]) then
    perform public.studio_audit(uid::text, 'push.send.denied', 'article:' || p_article, '{"reason":"forbidden"}');
    return 'forbidden';
  end if;
  if not exists (select 1 from articles where id = p_article and status = 'published') then
    return 'not_found';
  end if;
  select * into a from approvals ap
   where ap.kind = 'push.urgent' and ap.target_ref = p_article::text and ap.status = 'approved'
     and ap.approved_by is not null and ap.approved_by <> ap.requested_by
     and ap.created_at > now() - interval '24 hours'
     and not exists (select 1 from push_dispatches d where d.approval_id = ap.id)
   order by ap.created_at desc
   limit 1
   for update;
  if not found then
    perform public.studio_audit(uid::text, 'push.send.denied', 'article:' || p_article, '{"reason":"approval_required"}');
    return 'approval_required';
  end if;
  insert into push_dispatches (article_id, approval_id, sent_by) values (p_article, a.id, uid);
  perform public.studio_audit(uid::text, 'push.send', 'article:' || p_article,
    jsonb_build_object('approval', a.id, 'requested_by', a.requested_by, 'approved_by', a.approved_by, 'status', 'queued'));
  return 'queued';
end
$$;
revoke execute on function public.push_urgent_dispatch(uuid) from public, anon;
grant execute on function public.push_urgent_dispatch(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Segurança
-- ---------------------------------------------------------------------------
create or replace function public.admin_security_sessions()
returns table (user_id uuid, display_name text, roles text, sessions int, last_active timestamptz, last_ip text, last_agent text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.has_any_role(auth.uid(), '{admin,editor_chefe}'::app_role[]) then
    raise exception 'admin_security_sessions: sem permissão' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name,
           (select string_agg(r.role::text, ', ' order by r.role::text) from public.user_roles r where r.user_id = p.id),
           (select count(*)::int from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
           (select max(s.updated_at) from auth.sessions s where s.user_id = p.id),
           (select s.ip::text from auth.sessions s where s.user_id = p.id order by s.updated_at desc nulls last limit 1),
           (select s.user_agent from auth.sessions s where s.user_id = p.id order by s.updated_at desc nulls last limit 1)
      from public.profiles p
     where exists (select 1 from public.user_roles r where r.user_id = p.id)
     order by p.display_name;
end
$$;
revoke execute on function public.admin_security_sessions() from public, anon;
grant execute on function public.admin_security_sessions() to authenticated, service_role;

-- Uso dos limites nas últimas 24 h, por balde (nunca devolve a chave: ela já é um hash).
create or replace function public.admin_security_limits()
returns table (bucket text, keys int, hits bigint, max_hits int, last_window timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_any_role(auth.uid(), '{admin,editor_chefe}'::app_role[]) then
    raise exception 'admin_security_limits: sem permissão' using errcode = '42501';
  end if;
  return query
    select l.bucket, count(distinct l.key_hash)::int, sum(l.hits)::bigint, max(l.hits)::int, max(l.window_start)
      from public.rate_limits l
     where l.window_start > now() - interval '24 hours'
     group by l.bucket
     order by l.bucket;
end
$$;
revoke execute on function public.admin_security_limits() from public, anon;
grant execute on function public.admin_security_limits() to authenticated, service_role;

-- Libera os bloqueios de login (só o admin). Devolve quantas linhas saíram.
create or replace function public.admin_clear_login_blocks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null or not public.has_role(uid, 'admin'::app_role) then
    if uid is not null and public.is_staff(uid) then
      perform public.studio_audit(uid::text, 'security.clear_login_blocks.denied', 'rate_limits:login_fail', '{"reason":"forbidden"}');
    end if;
    raise exception 'admin_clear_login_blocks: só admin' using errcode = '42501';
  end if;
  delete from public.rate_limits where bucket = 'login_fail';
  get diagnostics n = row_count;
  perform public.studio_audit(uid::text, 'security.clear_login_blocks', 'rate_limits:login_fail', jsonb_build_object('rows', n));
  return n;
end
$$;
revoke execute on function public.admin_clear_login_blocks() from public, anon;
grant execute on function public.admin_clear_login_blocks() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Ações de auditoria (união com a lista vigente)
-- ---------------------------------------------------------------------------
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array[
        'ads.campaign.save', 'ads.campaign.toggle', 'ads.flag.toggle',
        'push.send', 'settings.update', 'security.clear_login_blocks'
      ]::text[]
    ) as x order by x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
