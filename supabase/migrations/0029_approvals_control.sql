-- P5-T1 · Aprovações de mudança crítica (spec §8, plano P5 Task 1, Global Constraints).
--
-- 1. Tipos de pedido em lista fechada (`approval_kinds()`), como `studio_audit_actions()`: a
--    tabela recusa tipo desconhecido; quem acrescenta um tipo redefine a função (o PWA, nas
--    migrations 0040–0049, redefine com `push.highlight`/`push.resume` já reservados aqui).
-- 2. `approval_apply(p_id)`: aplica uma aprovação decidida (regras e flags de segurança) e a
--    marca `applied`. Regra de duas pessoas conferida de novo aqui (a função é security definer
--    e por isso os triggers `guard_*` não valem dentro dela): quem aprovou é outra pessoa,
--    quem aplica é quem aprovou, e a aprovação tem menos de 24 h (I-4, spec §7.5.5). Outros
--    tipos (prompt, pesos, papel admin, push) têm consumidor próprio nas suas tarefas.
-- 3. Ações novas na lista fechada de auditoria (união com 0034).

-- ---------------------------------------------------------------------------
-- 1. Tipos de pedido
-- ---------------------------------------------------------------------------
create or replace function public.approval_kinds()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'rules.activate', 'prompt.publish', 'rec.weights', 'role.admin', 'safety.disable',
    'force_review.disable', 'push.urgent', 'source.critical',
    -- reservados para o PWA (spec 2026-09-28, D-P08)
    'push.highlight', 'push.resume'
  ]::text[]
$$;
revoke execute on function public.approval_kinds() from public, anon;
grant execute on function public.approval_kinds() to authenticated, service_role;

alter table public.approvals drop constraint if exists approvals_kind_check;
alter table public.approvals add constraint approvals_kind_check
  check (kind = any (public.approval_kinds())) not valid;
alter table public.approvals validate constraint approvals_kind_check;

create index if not exists approvals_pending_idx on public.approvals (status, created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Aplicar aprovação decidida
-- ---------------------------------------------------------------------------
create or replace function public.approval_apply(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.approvals%rowtype;
  uid uuid := auth.uid();
  v_version int;
  m text[];
  n int;
begin
  select * into a from public.approvals where id = p_id for update;
  if not found then
    raise exception 'approvals: pedido não encontrado' using errcode = 'P0002';
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

  if a.kind in ('rules.activate', 'force_review.disable') and a.target_ref ~ '^rules:[0-9]+$' then
    v_version := substr(a.target_ref, 7)::int;
    select count(*) into n from public.rules r
      where r.version = v_version and not r.active and r.approved_by is null
        and r.proposed_by = a.requested_by;
    if n = 0 then
      raise exception 'regras: versão % não está proposta por quem pediu ou já foi decidida', v_version
        using errcode = 'P0002';
    end if;
    if not public.has_any_role(a.approved_by, '{admin,editor_chefe}') then
      perform public.two_person_error('rules: papel sem permissão para aprovar');
    end if;
    update public.rules set active = false where active;
    update public.rules set approved_by = a.approved_by, active = true where version = v_version;
  elsif a.kind = 'safety.disable' and a.target_ref ~ '^flag:[a-z_]+=(true|false)$' then
    m := regexp_match(a.target_ref, '^flag:([a-z_]+)=(true|false)$');
    if not public.has_role(a.approved_by, 'admin') then
      perform public.two_person_error('feature_flags: só admin aprova mudança de flag');
    end if;
    update public.feature_flags
      set enabled = m[2]::boolean, updated_by = a.approved_by, updated_at = now()
      where key = m[1];
    if not found then
      raise exception 'feature_flags: flag % não existe', m[1] using errcode = 'P0002';
    end if;
  else
    raise exception 'approvals: tipo % (%) não se aplica por esta função', a.kind, a.target_ref
      using errcode = '22023';
  end if;

  update public.approvals set status = 'applied' where id = p_id;
  return jsonb_build_object('applied', true, 'kind', a.kind, 'target', a.target_ref);
end
$$;
revoke execute on function public.approval_apply(uuid) from public, anon;
grant execute on function public.approval_apply(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Auditoria: união de 0034 + aprovações
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
    'approval.requested', 'approval.approved', 'approval.rejected', 'approval.applied'
  ]::text[]
$$;
