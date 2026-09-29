-- P5-T5 · Agentes, modelos, prompts versionados e playground (telas O10, O11, O12, O15).
--
-- 1. `prompt_publish(p_approval)`: consumidor da aprovação `prompt.publish` (alvo
--    `prompt:<agente>:<versão>`). Regra de duas pessoas conferida aqui de novo (security definer,
--    os triggers `guard_*` não valem dentro): quem aprovou é outra pessoa (nem quem pediu, nem o
--    autor), quem aplica é quem aprovou, a aprovação tem menos de 24 h e o aprovador tem a
--    2ª assinatura (admin ou editor_chefe). A versão em produção vai para `archived`, a nova
--    entra em `production` com a assinatura do aprovador e `ai_agents.prompt_version` aponta
--    para ela. O pedido fica `applied`.
-- 2. `prompt_rollback(p_agent, p_to)`: volta para uma versão que já esteve em produção
--    (`archived` ou `reverted`), sem aprovação nova (o texto já passou por duas pessoas, ou veio
--    da migration): cria a versão seguinte com o mesmo corpo e marca a atual `reverted`.
--    Só admin ou editor_chefe.
-- 3. `ai_agents_budget_guard`: os orçamentos por agente nunca somam mais que R$ 30/dia (A-006).
-- 4. Auditoria: `prompt.create`, `prompt.request`, `prompt.rollback`, `ai.playground.run`,
--    `ai.agent.update`, `ai.model.update` (união com 0035).

-- ---------------------------------------------------------------------------
-- 1. Publicar prompt aprovado
-- ---------------------------------------------------------------------------
create or replace function public.prompt_publish(p_approval uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.approvals%rowtype;
  p public.ai_prompts%rowtype;
  uid uuid := auth.uid();
  m text[];
  v_agent text;
  v_version int;
  v_prev int;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found then
    raise exception 'approvals: pedido não encontrado' using errcode = 'P0002';
  end if;
  if a.kind <> 'prompt.publish' or a.target_ref !~ '^prompt:[a-z_]+:[0-9]+$' then
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
  if not public.has_any_role(a.approved_by, '{admin,editor_chefe}') then
    perform public.two_person_error('ai_prompts: 2ª assinatura é de admin ou editor_chefe');
  end if;

  m := regexp_match(a.target_ref, '^prompt:([a-z_]+):([0-9]+)$');
  v_agent := m[1];
  v_version := m[2]::int;
  select * into p from public.ai_prompts where agent_id = v_agent and version = v_version for update;
  if not found then
    raise exception 'ai_prompts: versão % do agente % não existe', v_version, v_agent using errcode = 'P0002';
  end if;
  if p.status not in ('draft', 'pending') then
    raise exception 'ai_prompts: versão % já foi decidida (%)', v_version, p.status using errcode = '42501';
  end if;
  if p.author_id = a.approved_by then
    perform public.two_person_error('ai_prompts: produção exige assinatura de outra pessoa');
  end if;

  select version into v_prev from public.ai_prompts
    where agent_id = v_agent and status = 'production' limit 1;
  update public.ai_prompts set status = 'archived' where agent_id = v_agent and status = 'production';
  update public.ai_prompts
     set status = 'production', approved_by = array[a.approved_by]
   where agent_id = v_agent and version = v_version;
  update public.ai_agents set prompt_version = v_version where id = v_agent;
  update public.approvals set status = 'applied' where id = p_approval;
  return jsonb_build_object('applied', true, 'agent', v_agent, 'version', v_version, 'previous', v_prev);
end
$$;
revoke execute on function public.prompt_publish(uuid) from public, anon;
grant execute on function public.prompt_publish(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Rollback de prompt
-- ---------------------------------------------------------------------------
create or replace function public.prompt_rollback(p_agent text, p_to int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target public.ai_prompts%rowtype;
  v_from int;
  v_new int;
begin
  if uid is not null and not public.has_any_role(uid, '{admin,editor_chefe}') then
    raise exception 'ai_prompts: só admin ou editor_chefe faz rollback' using errcode = '42501';
  end if;
  select * into target from public.ai_prompts where agent_id = p_agent and version = p_to;
  if not found then
    raise exception 'ai_prompts: versão % do agente % não existe', p_to, p_agent using errcode = 'P0002';
  end if;
  if target.status not in ('archived', 'reverted') then
    raise exception 'ai_prompts: só versões que já estiveram em produção voltam (v% está %)', p_to, target.status
      using errcode = '42501';
  end if;
  select version into v_from from public.ai_prompts where agent_id = p_agent and status = 'production' limit 1;
  select coalesce(max(version), 0) + 1 into v_new from public.ai_prompts where agent_id = p_agent;
  update public.ai_prompts set status = 'reverted' where agent_id = p_agent and status = 'production';
  insert into public.ai_prompts (agent_id, version, body, rationale, author_id, approved_by, status)
  values (p_agent, v_new, target.body, format('Rollback para a v%s', p_to),
          coalesce(uid, '00000000-0000-0000-0000-000000000000'), target.approved_by, 'production');
  update public.ai_agents set prompt_version = v_new where id = p_agent;
  return jsonb_build_object('from', v_from, 'to', p_to, 'version', v_new);
end
$$;
revoke execute on function public.prompt_rollback(text, int) from public, anon;
grant execute on function public.prompt_rollback(text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Orçamentos por agente dentro do teto global
-- ---------------------------------------------------------------------------
create or replace function public.ai_agents_budget_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  total numeric;
begin
  if new.daily_budget_brl < 0 then
    raise exception 'ai_agents: orçamento negativo' using errcode = '23514';
  end if;
  select coalesce(sum(daily_budget_brl), 0) into total from public.ai_agents where id <> new.id;
  if total + new.daily_budget_brl > 30 then
    raise exception 'ai_agents: orçamentos somam mais que o teto global de R$ 30/dia' using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists ai_agents_budget on public.ai_agents;
create trigger ai_agents_budget before insert or update of daily_budget_brl on public.ai_agents
  for each row execute function public.ai_agents_budget_guard();
revoke execute on function public.ai_agents_budget_guard() from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Auditoria: união de 0035 + prompts, agentes, modelos e playground
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
    'ai.agent.update', 'ai.model.update'
  ]::text[]
$$;
