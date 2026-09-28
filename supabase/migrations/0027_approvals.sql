-- P5-T1 · Aprovação dupla para mudanças críticas (spec §8; plano P5 Task 1, Review Focus 1).
--
-- O pedido e a decisão passam por duas funções SECURITY INVOKER: RLS de `approvals` (0002), o
-- trigger `guard_approvals` e os triggers do alvo (`guard_proposal` em rules e rec_weights)
-- continuam valendo como segunda barreira. As funções só acrescentam o que a tabela não sabe:
-- a matriz de papéis por tipo, a validação do alvo, o efeito da aprovação e a auditoria das
-- duas pessoas na mesma transação.
--
-- Efeito por tipo (ponto de extensão: `approval_apply`):
--   rules.activate, safety.disable, force_review.disable → a versão de `rules` recebe a
--     assinatura de quem aprova e passa a ser a única ativa.
--   rec.weights → idem em `rec_weights`.
--   role.admin, prompt.publish, push.urgent → autorização: fica `approved` até ser consumida
--     pela ação do alvo (user_roles via consume_role_admin_approval; prompts em P5-T5; push
--     urgente em P5-T9).

-- Matriz de papéis por tipo (espelhada em src/lib/approvals/kinds.ts; o teste de integração
-- confere as duas). Quem decide é sempre subconjunto de approvals_decide (admin, editor_chefe).
create or replace function public.approval_kind_roles()
returns table (kind text, requesters app_role[], approvers app_role[])
language sql
immutable
set search_path = public
as $$
  values
    ('rules.activate', '{admin,editor_chefe,operador_ia}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('safety.disable', '{admin,editor_chefe,operador_ia}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('force_review.disable', '{admin,editor_chefe,operador_ia}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('prompt.publish', '{operador_ia}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('rec.weights', '{admin,operador_ia}'::app_role[], '{admin}'::app_role[]),
    ('role.admin', '{admin,editor_chefe}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('push.urgent', '{admin,editor_chefe,editor}'::app_role[], '{admin,editor_chefe}'::app_role[])
$$;

-- Ações de auditoria das aprovações (mesma lista de src/lib/audit/actions.ts).
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'rules.propose', 'rules.approve', 'prompt.publish', 'rec.weights', 'reports.moderate',
    'users.manage', 'metrics.view', 'audit.view',
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    'approval.request', 'approval.approve', 'approval.reject'
  ]::text[]
$$;

create index if not exists approvals_pending_idx on approvals (created_at) where status = 'pending';

-- Pedido. Erros: 42501 (sem sessão ou papel) e 22023 (tipo, alvo ou justificativa inválidos).
create or replace function public.approval_request(p_kind text, p_target_ref text, p_justification text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  roles record;
  why text := btrim(coalesce(p_justification, ''), E' \t\r\n');
  target_force boolean;
  target_proposer uuid;
  target_approved uuid;
  new_id uuid;
begin
  if uid is null then
    raise exception 'approval_request: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into roles from public.approval_kind_roles() r where r.kind = p_kind;
  if not found then
    raise exception 'approval_request: tipo desconhecido' using errcode = '22023';
  end if;
  if not public.has_any_role(uid, roles.requesters) then
    raise exception 'approval_request: papel sem permissão para pedir' using errcode = '42501';
  end if;
  if why = '' or length(why) > 2000 then
    raise exception 'approval_request: justificativa obrigatória (até 2000 caracteres)' using errcode = '22023';
  end if;

  if p_kind in ('rules.activate', 'safety.disable', 'force_review.disable') then
    if coalesce(p_target_ref, '') !~ '^[1-9][0-9]{0,9}$' then
      raise exception 'approval_request: versão de regras inválida' using errcode = '22023';
    end if;
    select r.force_review, r.proposed_by, r.approved_by into target_force, target_proposer, target_approved
      from rules r where r.version = p_target_ref::bigint;
    if not found or target_proposer is distinct from uid or target_approved is not null then
      raise exception 'approval_request: a versão precisa ser uma proposta sua ainda não aprovada' using errcode = '22023';
    end if;
    -- Desligar forceReview é mudança crítica própria (spec §8): não passa como ativação comum.
    if (p_kind = 'force_review.disable') = target_force then
      raise exception 'approval_request: desligar forceReview usa o tipo force_review.disable' using errcode = '22023';
    end if;
  elsif p_kind = 'rec.weights' then
    select w.proposed_by, w.approved_by into target_proposer, target_approved
      from rec_weights w where w.version = p_target_ref;
    if not found or target_proposer is distinct from uid or target_approved is not null then
      raise exception 'approval_request: a versão precisa ser uma proposta sua ainda não aprovada' using errcode = '22023';
    end if;
  elsif coalesce(p_target_ref, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'approval_request: alvo inválido' using errcode = '22023';
  elsif p_kind = 'role.admin' and not exists (select 1 from profiles p where p.id = p_target_ref::uuid) then
    raise exception 'approval_request: pessoa não encontrada' using errcode = '22023';
  elsif p_kind = 'prompt.publish' and not exists (select 1 from ai_prompts p where p.id = p_target_ref::uuid) then
    raise exception 'approval_request: prompt não encontrado' using errcode = '22023';
  elsif p_kind = 'push.urgent' and not exists (select 1 from articles a where a.id = p_target_ref::uuid) then
    raise exception 'approval_request: matéria não encontrada' using errcode = '22023';
  end if;

  insert into approvals (kind, target_ref, requested_by, justification)
  values (p_kind, p_target_ref, uid, why)
  returning id into new_id;
  perform public.studio_audit(uid::text, 'approval.request', 'approval:' || new_id,
    jsonb_build_object('kind', p_kind, 'target_ref', p_target_ref, 'requested_by', uid));
  return new_id;
end
$$;

-- Efeito da aprovação por tipo. Roda como quem aprova (RLS e triggers do alvo valendo).
-- Devolve o efeito registrado na auditoria: 'activated' ou 'authorized'.
create or replace function public.approval_apply(p_kind text, p_target_ref text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  -- Só vale como passo de approval_decide: exige a aprovação desta pessoa já registrada.
  if not exists (
    select 1 from approvals a
     where a.kind = p_kind and a.target_ref = p_target_ref and a.status = 'approved'
       and a.approved_by = uid and a.approved_by <> a.requested_by
  ) then
    raise exception 'approval_apply: sem aprovação registrada' using errcode = '42501';
  end if;
  if p_kind in ('rules.activate', 'safety.disable', 'force_review.disable') then
    update rules set active = false where active and version <> p_target_ref::int;
    update rules set approved_by = uid, active = true
     where version = p_target_ref::int and approved_by is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'approval_apply: versão de regras % não está mais pendente', p_target_ref using errcode = 'P0002';
    end if;
    return 'activated';
  elsif p_kind = 'rec.weights' then
    update rec_weights set active = false where active and version <> p_target_ref;
    update rec_weights set approved_by = uid, active = true
     where version = p_target_ref and approved_by is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'approval_apply: pesos % não estão mais pendentes', p_target_ref using errcode = 'P0002';
    end if;
    return 'activated';
  end if;
  -- role.admin, prompt.publish, push.urgent: autorização consumida pela ação do alvo.
  return 'authorized';
end
$$;

-- Decisão. Devolve 'ok' ou o motivo da recusa ('self_approval', 'forbidden', 'not_pending'),
-- sempre auditado: sucesso como approval.approve/approval.reject, recusa com `.denied`.
create or replace function public.approval_decide(p_id uuid, p_decision text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  action text := case p_decision when 'approved' then 'approval.approve' when 'rejected' then 'approval.reject' end;
  a approvals%rowtype;
  approvers app_role[];
  effect text := null;
  details jsonb;
begin
  if uid is null then
    raise exception 'approval_decide: exige usuário autenticado' using errcode = '42501';
  end if;
  if action is null then
    raise exception 'approval_decide: decisão é approved ou rejected' using errcode = '22023';
  end if;
  if not public.is_staff(uid) then
    perform public.studio_audit(uid::text, action || '.denied', 'approval:' || p_id, '{"reason":"forbidden"}');
    return 'forbidden';
  end if;
  select * into a from approvals where id = p_id;
  if not found then
    return 'not_pending';
  end if;
  details := jsonb_build_object('kind', a.kind, 'target_ref', a.target_ref, 'requested_by', a.requested_by);
  if a.requested_by = uid then
    perform public.studio_audit(uid::text, action || '.denied', 'approval:' || a.id,
      details || '{"reason":"self_approval"}');
    return 'self_approval';
  end if;
  if a.status <> 'pending' then
    return 'not_pending';
  end if;
  select r.approvers into approvers from public.approval_kind_roles() r where r.kind = a.kind;
  if approvers is null or not public.has_any_role(uid, approvers) then
    perform public.studio_audit(uid::text, action || '.denied', 'approval:' || a.id,
      details || '{"reason":"forbidden"}');
    return 'forbidden';
  end if;

  -- Trava e confere de novo: duas decisões simultâneas não passam as duas.
  update approvals set status = p_decision, approved_by = uid
   where id = a.id and status = 'pending';
  if not found then
    return 'not_pending';
  end if;
  if p_decision = 'approved' then
    effect := public.approval_apply(a.kind, a.target_ref);
  end if;
  perform public.studio_audit(uid::text, action, 'approval:' || a.id,
    details || jsonb_build_object('approved_by', uid, 'status', p_decision, 'effect', effect));
  return 'ok';
end
$$;

revoke execute on function public.approval_kind_roles(), public.approval_request(text, text, text),
  public.approval_apply(text, text), public.approval_decide(uuid, text)
  from public, anon;
grant execute on function public.approval_kind_roles(), public.approval_request(text, text, text),
  public.approval_decide(uuid, text)
  to authenticated, service_role;
-- approval_apply só roda dentro de approval_decide (mesma transação, como quem aprova).
grant execute on function public.approval_apply(text, text) to authenticated, service_role;
