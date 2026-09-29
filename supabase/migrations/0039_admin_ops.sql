-- P5-T9 · Administração: publicidade, SEO, auditoria, segurança, governança, integrações e
-- configurações (A07, A08, A10–A14).
--
-- 1. `sponsored_campaigns`: situação, entregas e autoria; gerência por admin e editor-chefe;
--    política nunca em Política, Segurança ou Saúde (CLAUDE.md §5.8/§5.9: patrocinado fora de
--    contexto urgente, de segurança, saúde individual ou tragédia).
-- 2. `redirects`: redirecionamentos (matéria arquivada → destino), lidos pelo portal.
-- 3. `privacy_requests`: pedidos LGPD com prazo de 15 dias (fila da A11).
-- 4. `integration_keys`: só metadados de rotação das chaves (o valor fica em variável de
--    ambiente, nunca no banco).
-- 5. `app_settings`: chaves de SEO, segurança e publicidade com grade; `app_setting_set` aceita.
-- 6. Auditoria: união com 0038 + ações desta tarefa.

-- ---------------------------------------------------------------------------
-- 1. Campanhas patrocinadas
-- ---------------------------------------------------------------------------
alter table public.sponsored_campaigns
  add column if not exists status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  add column if not exists deliveries int not null default 0 check (deliveries >= 0),
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.sponsored_campaigns drop constraint if exists sponsored_campaigns_check;
alter table public.sponsored_campaigns drop constraint if exists sponsored_sections_allowed;
alter table public.sponsored_campaigns add constraint sponsored_sections_allowed
  check (not (allowed_sections && array['politica', 'seguranca', 'saude']::text[]));
alter table public.sponsored_campaigns drop constraint if exists sponsored_period_check;
alter table public.sponsored_campaigns add constraint sponsored_period_check check (ends_on >= starts_on);
drop policy if exists sponsored_manage on public.sponsored_campaigns;
create policy sponsored_manage on public.sponsored_campaigns for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));

-- ---------------------------------------------------------------------------
-- 2. Redirecionamentos
-- ---------------------------------------------------------------------------
create table if not exists public.redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique check (from_path ~ '^/[^\s?#]*$' and length(from_path) between 2 and 300),
  to_path text not null check (to_path ~ '^/[^\s#]*$' and length(to_path) between 1 and 300 and to_path <> from_path),
  kind int not null default 301 check (kind in (301, 302)),
  reason text not null default '' check (length(reason) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.redirects enable row level security;
create policy redirects_read on public.redirects for select to anon, authenticated using (true);
create policy redirects_write on public.redirects for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));

-- ---------------------------------------------------------------------------
-- 3. Pedidos LGPD
-- ---------------------------------------------------------------------------
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('access', 'delete', 'rectify', 'portability')),
  email text not null check (position('@' in email) > 1),
  notes text not null default '' check (length(notes) <= 1000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'rejected')),
  due_at timestamptz not null default now() + interval '15 days',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);
create index if not exists privacy_requests_open_idx on public.privacy_requests (due_at) where status in ('open', 'in_progress');
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon;
create policy privacy_requests_admin on public.privacy_requests for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- 4. Chaves e rotação (só metadados)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_keys (
  key text primary key check (key ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  label text not null check (length(label) between 2 and 80),
  integration text not null check (length(integration) between 2 and 40),
  rotate_every_days int not null default 90 check (rotate_every_days between 7 and 365),
  rotated_at timestamptz,
  rotated_by uuid references public.profiles(id) on delete set null,
  notes text not null default '' check (length(notes) <= 300)
);
alter table public.integration_keys enable row level security;
revoke all on public.integration_keys from anon;
create policy integration_keys_admin on public.integration_keys for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
insert into public.integration_keys (key, label, integration, rotate_every_days) values
  ('SUPABASE_SERVICE_ROLE_KEY', 'Chave de serviço do Supabase', 'supabase', 90),
  ('OPENROUTER_API_KEY', 'Chave da OpenRouter (IA)', 'openrouter', 90),
  ('CRON_SECRET', 'Segredo das rotas de cron e worker', 'vercel', 90),
  ('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Chave anônima do Supabase', 'supabase', 365)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Configurações: chaves novas com grade
-- ---------------------------------------------------------------------------
create or replace function public.guard_app_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n numeric;
begin
  if new.key = 'sources.default_frequency_minutes' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 30 and 1440
       or (new.value)::text::int % 30 <> 0 then
      raise exception 'sources.default_frequency_minutes deve ser múltiplo de 30 entre 30 e 1440' using errcode = '23514';
    end if;
  elsif new.key = 'sources.fast_lane_max' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 0 and 20 then
      raise exception 'sources.fast_lane_max deve ser um inteiro entre 0 e 20' using errcode = '23514';
    end if;
  elsif new.key = 'seo.title_template' then
    if jsonb_typeof(new.value) <> 'string' or position('{title}' in (new.value #>> '{}')) = 0
       or length(new.value #>> '{}') > 120 then
      raise exception 'seo.title_template deve ser um texto de até 120 caracteres com {title}' using errcode = '23514';
    end if;
  elsif new.key in ('security.session_hours', 'security.retention_days', 'ads.max_per_page') then
    if jsonb_typeof(new.value) <> 'number' then
      raise exception '% deve ser um número inteiro', new.key using errcode = '23514';
    end if;
    n := (new.value)::text::numeric;
    if n <> floor(n)
       or (new.key = 'security.session_hours' and n not between 1 and 720)
       or (new.key = 'security.retention_days' and n not between 30 and 3650)
       or (new.key = 'ads.max_per_page' and n not between 0 and 3) then
      raise exception '% fora da faixa permitida', new.key using errcode = '23514';
    end if;
  elsif new.key = 'security.require_2fa' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'security.require_2fa deve ser verdadeiro ou falso' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

insert into public.app_settings (key, value) values
  ('seo.title_template', '"{title} · CityNews Cuiabá"'),
  ('security.session_hours', '12'),
  ('security.retention_days', '365'),
  ('security.require_2fa', 'false'),
  ('ads.max_per_page', '1')
on conflict (key) do nothing;

-- Mesma função de 0011, com a lista de chaves ampliada; segurança e publicidade só admin.
create or replace function public.app_setting_set(
  p_key text, p_value jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_anon boolean := coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated');
begin
  if p_key in ('sources.default_frequency_minutes', 'sources.fast_lane_max') then
    if v_anon and not has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia}') then
      raise exception 'sem permissão para gerenciar fontes (source.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('seo.title_template', 'ads.max_per_page') then
    if v_anon and not has_any_role(auth.uid(), '{admin,editor_chefe}') then
      raise exception 'sem permissão para administrar o site (site.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('security.session_hours', 'security.retention_days', 'security.require_2fa') then
    if v_anon and not has_role(auth.uid(), 'admin') then
      raise exception 'sem permissão (users.manage)' using errcode = '42501';
    end if;
  else
    raise exception 'chave % não suportada', p_key using errcode = '22023';
  end if;
  select value into v_old from app_settings where key = p_key;
  insert into app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into audit_log (actor, action, object_ref, details, ip_hash)
  values (coalesce(auth.uid()::text, 'sistema'), 'settings.update', 'setting:' || p_key,
          jsonb_build_object('from', v_old, 'to', p_value, 'reason', coalesce(p_ctx, '{}'::jsonb)->>'reason'),
          p_ip_hash);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Auditoria: união de 0038 + P5-T9
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
    -- Agentes, modelos, prompts e playground (P5-T5, 0036)
    'prompt.create', 'prompt.request', 'prompt.rollback', 'ai.playground.run',
    'ai.agent.update', 'ai.model.update',
    -- Recomendação (P5-T7, 0037)
    'rec.weights.activate', 'rec.campaign.create', 'rec.experiment.create', 'rec.experiment.end',
    'rec.experiment.promote', 'rec.explain',
    -- Administração (P5-T8)
    'user.invite', 'user.role.grant', 'user.role.revoke', 'team.save', 'team.delete',
    'taxonomy.save', 'taxonomy.merge', 'home.save', 'home.publish',
    -- Administração (P5-T9)
    'ads.campaign.save', 'ads.campaign.delete', 'seo.redirect.save', 'seo.redirect.delete',
    'audit.export', 'privacy.request.save', 'security.key.rotate'
  ]::text[]
$$;
