-- P5-T5 · Agentes, prompts versionados e playground (spec §6.6 e §8; plano P5 Task 5).
--
--   * `ai_calls.playground`: chamada do playground (conta no orçamento e no gasto como qualquer
--     outra, mas se distingue nos relatórios).
--   * `ai_prompts.rollback_of`: versão copiada por um rollback. Um rollback é uma NOVA versão
--     (cópia do corpo antigo) que passa pela aprovação dupla; ao entrar em produção, a versão que
--     saiu fica `reverted` (as demais que saem ficam `archived`).
--   * Uma única versão `production` por agente (índice parcial).
--   * `approval_apply` (partindo da 0030): aprovar `prompt.publish` de fato publica a versão, como
--     quem aprova (RLS e guard_ai_prompts valendo: 2ª assinatura de admin ou editor_chefe, nunca
--     do autor). A troca de `ai_agents.prompt_version` passa por `ai_agent_set_prompt`, único
--     ponto que escreve em ai_agents por quem não é admin/operador_ia, e só aceita versão em
--     produção com assinatura de outra pessoa.
--   * `studio_audit_actions()`: prompt.create, prompt.rollback, prompt.playground, agent.toggle
--     (mesma lista de src/lib/audit/actions.ts).

alter table ai_calls add column if not exists playground boolean not null default false;
alter table ai_prompts add column if not exists rollback_of int;
create unique index if not exists ai_prompts_one_production on ai_prompts (agent_id) where status = 'production';

create or replace function public.ai_agent_set_prompt(p_agent text, p_version int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_any_role(uid, '{admin,editor_chefe}') then
    raise exception 'ai_agent_set_prompt: exige admin ou editor_chefe' using errcode = '42501';
  end if;
  if not exists (
    select 1 from ai_prompts p
     where p.agent_id = p_agent and p.version = p_version and p.status = 'production'
       and exists (select 1 from unnest(p.approved_by) a where a <> p.author_id)
  ) then
    raise exception 'ai_agent_set_prompt: versão sem produção aprovada por outra pessoa' using errcode = '42501';
  end if;
  update ai_agents set prompt_version = p_version where id = p_agent;
end
$$;
revoke execute on function public.ai_agent_set_prompt(text, int) from public, anon;
grant execute on function public.ai_agent_set_prompt(text, int) to authenticated, service_role;

create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'source.approve_critical', 'rules.propose', 'rules.approve', 'prompt.publish', 'rec.weights',
    'reports.moderate', 'users.manage', 'metrics.view', 'audit.view',
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    'approval.request', 'approval.approve', 'approval.reject',
    'pipeline.reprocess', 'pipeline.run_now',
    'source.analyze', 'source.test_connection', 'source.collect_now',
    'source.approval_requested', 'source.approval_applied',
    'prompt.create', 'prompt.rollback', 'prompt.playground', 'agent.toggle'
  ]::text[]
$$;

create or replace function public.approval_apply(p_kind text, p_target_ref text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
  appr approvals;
  pr ai_prompts;
  src_parts record;
  applied_id uuid;
  applied_status text;
begin
  -- Só vale como passo de approval_decide: exige a aprovação desta pessoa já registrada.
  select * into appr from approvals a
   where a.kind = p_kind and a.target_ref = p_target_ref and a.status = 'approved'
     and a.approved_by = uid and a.approved_by <> a.requested_by
   order by a.created_at desc
   limit 1;
  if not found then
    raise exception 'approval_apply: sem aprovação registrada' using errcode = '42501';
  end if;
  if p_kind in ('rules.activate', 'safety.disable', 'force_review.disable') then
    if not public.rules_approvals_complete(p_target_ref::int) then
      return 'waiting';
    end if;
    update rules set approved_by = uid where version = p_target_ref::int and approved_by is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'approval_apply: versão de regras % não está mais pendente', p_target_ref using errcode = 'P0002';
    end if;
    update rules set active = false where active and version <> p_target_ref::int;
    update rules set active = true where version = p_target_ref::int;
    return 'activated';
  elsif p_kind = 'rec.weights' then
    update rec_weights set approved_by = uid where version = p_target_ref and approved_by is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'approval_apply: pesos % não estão mais pendentes', p_target_ref using errcode = 'P0002';
    end if;
    update rec_weights set active = false where active and version <> p_target_ref;
    update rec_weights set active = true where version = p_target_ref;
    return 'activated';
  elsif p_kind = 'source.critical' then
    select * into src_parts from public.source_critical_parts(p_target_ref);
    perform public.source_admin_check();
    perform 1 from sources s where s.id = src_parts.source_id for update;
    if not found then
      raise exception 'approval_apply: fonte não encontrada' using errcode = 'P0002';
    end if;
    perform public.source_admin_ctx(jsonb_build_object('reason', appr.justification));
    -- O guard consome esta aprovação (status `applied`) quando a mudança de fato amplia direitos.
    if src_parts.field = 'image_policy' then
      update sources set image_policy = src_parts.val::image_policy where id = src_parts.source_id;
    elsif src_parts.field = 'republish_policy' then
      update sources set republish_policy = src_parts.val::republish_policy where id = src_parts.source_id;
    elsif src_parts.field = 'reliability' then
      update sources set reliability = src_parts.val::source_reliability where id = src_parts.source_id;
    elsif src_parts.field = 'may_be_sole_source' then
      update sources set may_be_sole_source = true where id = src_parts.source_id;
    else
      perform public.source_admin_status_apply(src_parts.source_id, 'unblock', null);
    end if;
    perform public.source_admin_ctx('{}');
    select a.id, a.status into applied_id, applied_status from approvals a where a.id = appr.id;
    if applied_status is distinct from 'applied' then
      raise exception 'approval_apply: a fonte mudou e esta aprovação não tem mais efeito; recuse o pedido'
        using errcode = 'P0002';
    end if;
    perform public.studio_audit(uid::text, 'source.approval_applied', 'source:' || src_parts.source_id,
      jsonb_build_object('approvalId', appr.id, 'requested_by', appr.requested_by, 'approved_by', uid,
                         'field', src_parts.field, 'value', src_parts.val));
    return 'applied';
  elsif p_kind = 'prompt.publish' then
    -- P5-T5: aprovar PUBLICA a versão. O guard de ai_prompts confere a 2ª assinatura (admin ou
    -- editor_chefe, nunca o autor). A versão em produção sai (archived; reverted se a nova é
    -- rollback) e o agente passa a usar a nova.
    select * into pr from ai_prompts where id = p_target_ref::uuid for update;
    if not found or pr.status not in ('draft', 'pending') or cardinality(pr.approved_by) > 0 then
      raise exception 'approval_apply: o prompt % não está mais pendente', p_target_ref using errcode = 'P0002';
    end if;
    update ai_prompts
       set status = case when pr.rollback_of is not null then 'reverted' else 'archived' end
     where agent_id = pr.agent_id and status = 'production';
    update ai_prompts set approved_by = pr.approved_by || uid, status = 'production' where id = pr.id;
    perform public.ai_agent_set_prompt(pr.agent_id, pr.version);
    perform public.studio_audit(uid::text, 'prompt.publish', 'prompt:' || pr.id,
      jsonb_build_object('agent', pr.agent_id, 'version', pr.version, 'rollback_of', pr.rollback_of,
                         'requested_by', appr.requested_by, 'approved_by', uid));
    return 'published';
  end if;
  -- role.admin, push.urgent: autorização consumida pela ação do alvo.
  return 'authorized';
end
$$;
