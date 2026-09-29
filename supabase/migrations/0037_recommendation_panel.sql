-- P5-T7 · Recomendação: painel, pesos, campanhas e testes A/B (telas O17, O18).
--
-- 1. `rec_weights_activate(p_approval)`: consumidor da aprovação `rec.weights` (alvo
--    `rec:<versão>`). Regra de duas pessoas conferida aqui (security definer): quem aprovou é outra
--    pessoa (nem quem pediu, nem quem propôs), tem o papel (admin ou operador_ia), quem aplica é
--    quem aprovou e a aprovação tem menos de 24 h. A versão recebe `approved_by`, fica a única
--    ativa e o pedido vira `applied`.
-- 2. `rec_campaigns`: campanhas de descoberta (fontes, período, cota por bloco, público).
-- 3. `rec_experiments`: testes A/B de pesos (variantes com versão de `rec_weights`, alocação,
--    situação). A atribuição por leitor é `assignVariant` (src/lib/ranking/experiments.ts); o
--    rótulo gravado nos eventos é `<base>+<8 hex do id>:<variante>`.
-- 4. `rec_events_summary(p_since)` e `rec_return_7d(p_since)`: agregados de `events` para o painel
--    (security invoker: vale a RLS de métricas). Nunca devolvem `anon_id`.
-- 5. Auditoria (união com 0036): `rec.weights.activate`, `rec.campaign.create`,
--    `rec.experiment.create`, `rec.experiment.end`, `rec.experiment.promote`, `rec.explain`.

-- ---------------------------------------------------------------------------
-- 1. Ativar pesos aprovados
-- ---------------------------------------------------------------------------
create or replace function public.rec_weights_activate(p_approval uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.approvals%rowtype;
  w public.rec_weights%rowtype;
  uid uuid := auth.uid();
  v_version text;
  v_prev text;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found then
    raise exception 'approvals: pedido não encontrado' using errcode = 'P0002';
  end if;
  if a.kind <> 'rec.weights' or a.target_ref !~ '^rec:[a-z0-9][a-z0-9.-]{0,60}$' then
    raise exception 'approvals: tipo % (%) não se aplica por esta função', a.kind, a.target_ref
      using errcode = '22023';
  end if;
  if a.status = 'applied' then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;
  if a.status <> 'approved' or a.approved_by is null then
    raise exception 'approvals: pedido não aprovado' using errcode = '42501';
  end if;
  if a.approved_by = a.requested_by then
    perform public.two_person_error('approvals: quem pede não decide');
  end if;
  if uid is not null and uid <> a.approved_by then
    perform public.two_person_error('approvals: só quem aprovou aplica');
  end if;
  if coalesce(a.decided_at, a.created_at) < now() - interval '24 hours' then
    raise exception 'approvals: aprovação expirou (mais de 24 h sem aplicar)' using errcode = '42501';
  end if;
  if not public.has_any_role(a.approved_by, '{admin,operador_ia}') then
    perform public.two_person_error('rec_weights: papel sem permissão para aprovar');
  end if;

  v_version := substr(a.target_ref, 5);
  select * into w from public.rec_weights where version = v_version for update;
  if not found then
    raise exception 'rec_weights: versão % não existe', v_version using errcode = 'P0002';
  end if;
  if w.approved_by is not null or w.active then
    raise exception 'rec_weights: versão % já decidida', v_version using errcode = '42501';
  end if;
  if w.proposed_by = a.approved_by then
    perform public.two_person_error('rec_weights: quem propõe não aprova');
  end if;

  select version into v_prev from public.rec_weights where active limit 1;
  update public.rec_weights set active = false where active;
  update public.rec_weights set approved_by = a.approved_by, active = true where version = v_version;
  update public.approvals set status = 'applied' where id = p_approval;
  return jsonb_build_object('applied', true, 'version', v_version, 'previous', v_prev);
end
$$;
revoke execute on function public.rec_weights_activate(uuid) from public, anon;
grant execute on function public.rec_weights_activate(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Campanhas de descoberta
-- ---------------------------------------------------------------------------
create table if not exists public.rec_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  source_ids uuid[] not null check (cardinality(source_ids) between 1 and 20),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  -- Vagas de descoberta por bloco de 5 (1 = padrão da spec).
  quota int not null default 1 check (quota between 1 and 3),
  audience text not null default 'all' check (audience in ('all', 'local', 'anonymous', 'accounts')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.rec_campaigns enable row level security;
revoke all on public.rec_campaigns from anon;
revoke delete, truncate on public.rec_campaigns from authenticated;
create policy rec_campaigns_read_staff on public.rec_campaigns for select to authenticated
  using (public.is_staff((select auth.uid())));
create policy rec_campaigns_manage on public.rec_campaigns for insert to authenticated
  with check (public.has_any_role((select auth.uid()), '{admin,operador_ia}')
              and created_by = (select auth.uid()));
create policy rec_campaigns_update on public.rec_campaigns for update to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,operador_ia}'))
  with check (public.has_any_role((select auth.uid()), '{admin,operador_ia}'));

-- ---------------------------------------------------------------------------
-- 3. Testes A/B
-- ---------------------------------------------------------------------------
create table if not exists public.rec_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  -- [{ "name": "controle", "weightsVersion": "rec-v1" }, ...]; a variante 0 é o controle.
  variants jsonb not null,
  split int[] not null check (cardinality(split) between 2 and 4),
  status text not null default 'running' check (status in ('running', 'ended', 'promoted')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  promoted_version text references public.rec_weights(version),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) = cardinality(split))
);
create index if not exists rec_experiments_running_idx on public.rec_experiments (started_at desc)
  where status = 'running';
alter table public.rec_experiments enable row level security;
revoke all on public.rec_experiments from anon;
revoke delete, truncate on public.rec_experiments from authenticated;
create policy rec_experiments_read_staff on public.rec_experiments for select to authenticated
  using (public.is_staff((select auth.uid())));
create policy rec_experiments_manage on public.rec_experiments for insert to authenticated
  with check (public.has_any_role((select auth.uid()), '{admin,operador_ia}')
              and created_by = (select auth.uid()));
create policy rec_experiments_update on public.rec_experiments for update to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,operador_ia}'))
  with check (public.has_any_role((select auth.uid()), '{admin,operador_ia}'));

-- ---------------------------------------------------------------------------
-- 4. Agregados de eventos para o painel (RLS de métricas; sem anon_id)
-- ---------------------------------------------------------------------------
create or replace function public.rec_events_summary(p_since timestamptz)
returns table (algo_version text, name text, list text, reason text, dismiss_reason text,
               source_slug text, personalization boolean, account boolean, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.algo_version, e.name,
         e.props ->> 'list', e.props ->> 'reason', e.props ->> 'dismissReason',
         case when e.name = 'recommendation_clicked' then e.source_slug end,
         coalesce((e.consent ->> 'personalization')::boolean, false),
         e.user_id is not null,
         count(*)
  from events e
  where e.received_at >= p_since
    and e.name in ('source_viewed', 'recommendation_clicked', 'recommendation_dismissed')
  group by 1, 2, 3, 4, 5, 6, 7, 8
$$;

-- Retorno em 7 dias de quem seguiu uma fonte pela recomendação: entre os leitores que seguiram há
-- pelo menos 7 dias, quantos voltaram (qualquer evento) entre 1 e 7 dias depois.
create or replace function public.rec_return_7d(p_since timestamptz)
returns table (algo_version text, followed bigint, returned bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with follows as (
    select e.anon_id, e.algo_version, min(e.at) as at
    from events e
    where e.received_at >= p_since and e.name = 'source_followed'
      and (e.props ->> 'fromRecommendation')::boolean and e.anon_id is not null
      and e.at <= now() - interval '7 days'
    group by 1, 2
  )
  select f.algo_version, count(*)::bigint,
         count(*) filter (where exists (
           select 1 from events r
           where r.anon_id = f.anon_id and r.at > f.at + interval '1 day' and r.at <= f.at + interval '7 days'
         ))::bigint
  from follows f
  group by 1
$$;
revoke execute on function public.rec_events_summary(timestamptz), public.rec_return_7d(timestamptz) from public, anon;
grant execute on function public.rec_events_summary(timestamptz), public.rec_return_7d(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Auditoria: união de 0036 + recomendação
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
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view',
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
    -- Agentes, modelos, prompts e playground (P5-T5)
    'prompt.create', 'prompt.request', 'prompt.rollback', 'ai.playground.run',
    'ai.agent.update', 'ai.model.update',
    -- Recomendação (P5-T7)
    'rec.weights.activate', 'rec.campaign.create', 'rec.experiment.create', 'rec.experiment.end',
    'rec.experiment.promote', 'rec.explain'
  ]::text[]
$$;
