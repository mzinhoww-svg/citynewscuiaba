-- P5-T4/FS-T6 · Aprovação `source.critical` pelo fluxo comum de aprovações (0027).
--
-- A 0011 (FS-T1) já impõe no banco a regra de duas pessoas sobre campos críticos de `sources`
-- (`guard_source_changes` consome uma aprovação `source.critical` aprovada por outra pessoa), mas
-- `approval_kind_roles()` (0027) ainda não conhecia o tipo. Esta migration estende o fluxo:
--
--   * `approval_kind_roles()`: source.critical (pedem admin, editor_chefe, operador_ia; decidem
--     admin, editor_chefe = ação `source.approve_critical`).
--   * `approval_request` e `approval_apply` partem das versões da 0028 (regras e pesos ficam como estão)
--     e acrescentam o ramo `source.critical`.
--   * `approval_request`: valida o alvo `source:<uuid>:<campo>=<valor>` (campo e valor da lista de
--     mudanças críticas D-F3, fonte existente e não arquivada, mudança que de fato amplia direitos,
--     sem pedido igual pendente) e audita também como `source.approval_requested` na fonte.
--   * `approval_apply`: aprovar APLICA a mudança na fonte, como quem aprova (RLS e guard valendo).
--     O guard consome a aprovação (`applied`) e a auditoria da fonte leva quem pediu e quem
--     aprovou; `source.approval_applied` marca o efeito. Se a fonte mudou e a aprovação já não
--     tem efeito, a decisão inteira é desfeita (P0002) e o pedido deve ser recusado.
--   * `studio_audit_actions()`: ações novas do painel de fontes (mesma lista de
--     src/lib/audit/actions.ts).

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
    ('push.urgent', '{admin,editor_chefe,editor}'::app_role[], '{admin,editor_chefe}'::app_role[]),
    ('source.critical', '{admin,editor_chefe,operador_ia}'::app_role[], '{admin,editor_chefe}'::app_role[])
$$;

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
    'source.approval_requested', 'source.approval_applied'
  ]::text[]
$$;

-- Alvo `source:<uuid>:<campo>=<valor>` dividido em partes; inválido → 22023.
create or replace function public.source_critical_parts(p_ref text)
returns table (source_id uuid, field text, val text)
language plpgsql
immutable
set search_path = public
as $$
declare
  m text[];
begin
  m := regexp_match(coalesce(p_ref, ''),
    '^source:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(image_policy|republish_policy|reliability|may_be_sole_source|status)=([a-z_0-9]+)$',
    'i');
  if m is null then
    raise exception 'source.critical: alvo inválido' using errcode = '22023';
  end if;
  if not ((m[2] = 'image_policy' and m[3] in ('licensed_only', 'with_agreement', 'reproduction'))
       or (m[2] = 'republish_policy' and m[3] = 'summary_2_sentences')
       or (m[2] = 'reliability' and m[3] in ('verified', 'primary'))
       or (m[2] = 'may_be_sole_source' and m[3] = 'true')
       or (m[2] = 'status' and m[3] = 'paused')) then
    raise exception 'source.critical: campo ou valor fora da lista de mudanças críticas' using errcode = '22023';
  end if;
  source_id := m[1]::uuid;
  field := m[2];
  val := m[3];
  return next;
end
$$;

-- A mudança pedida amplia direitos em relação ao estado atual da fonte?
create or replace function public.source_critical_widens(p_cur sources, p_field text, p_val text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_field
    when 'image_policy' then public.source_image_rank(p_val::image_policy) > public.source_image_rank(p_cur.image_policy)
    when 'republish_policy' then p_cur.republish_policy = 'link_only'
    when 'reliability' then public.source_reliability_rank(p_val::source_reliability) > public.source_reliability_rank(p_cur.reliability)
    when 'may_be_sole_source' then not p_cur.may_be_sole_source
    when 'status' then p_cur.status = 'blocked'
    else false end
$$;

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
  target_proposer uuid;
  target_approved uuid;
  new_id uuid;
  src_parts record;
  src sources;
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
    if coalesce(p_target_ref, '') !~ '^[1-9][0-9]{0,9}$' or p_target_ref::bigint > 2147483647 then
      raise exception 'approval_request: versão de regras inválida' using errcode = '22023';
    end if;
    select r.proposed_by, r.approved_by into target_proposer, target_approved
      from rules r where r.version = p_target_ref::int;
    if not found or target_proposer is distinct from uid or target_approved is not null then
      raise exception 'approval_request: a versão precisa ser uma proposta sua ainda não aprovada' using errcode = '22023';
    end if;
    -- O tipo vem da comparação com a versão ativa: desligar forceReview ou regra de segurança
    -- não passa como ativação comum (spec §8).
    if not (p_kind = any (public.rules_required_kinds(p_target_ref::int))) then
      raise exception 'approval_request: o tipo não corresponde à mudança (tipos exigidos: %)',
        array_to_string(public.rules_required_kinds(p_target_ref::int), ', ') using errcode = '22023';
    end if;
  elsif p_kind = 'rec.weights' then
    select w.proposed_by, w.approved_by into target_proposer, target_approved
      from rec_weights w where w.version = p_target_ref;
    if not found or target_proposer is distinct from uid or target_approved is not null then
      raise exception 'approval_request: a versão precisa ser uma proposta sua ainda não aprovada' using errcode = '22023';
    end if;
  elsif p_kind = 'source.critical' then
    select * into src_parts from public.source_critical_parts(p_target_ref);
    select * into src from sources s where s.id = src_parts.source_id;
    if not found or src.archived_at is not null then
      raise exception 'approval_request: fonte não encontrada ou arquivada' using errcode = '22023';
    end if;
    if not public.source_critical_widens(src, src_parts.field, src_parts.val) then
      raise exception 'approval_request: a mudança não amplia direitos da fonte; aplique direto' using errcode = '22023';
    end if;
    if exists (select 1 from approvals a where a.kind = 'source.critical' and a.target_ref = p_target_ref and a.status = 'pending') then
      raise exception 'approval_request: já existe um pedido igual pendente' using errcode = '22023';
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

  if p_kind in ('rules.activate', 'safety.disable', 'force_review.disable', 'rec.weights')
     and exists (select 1 from approvals a
                  where a.kind = p_kind and a.target_ref = p_target_ref and a.status in ('pending', 'approved')) then
    raise exception 'approval_request: já existe pedido deste tipo para esta versão' using errcode = '22023';
  end if;

  insert into approvals (kind, target_ref, requested_by, justification)
  values (p_kind, p_target_ref, uid, why)
  returning id into new_id;
  perform public.studio_audit(uid::text, 'approval.request', 'approval:' || new_id,
    jsonb_build_object('kind', p_kind, 'target_ref', p_target_ref, 'requested_by', uid));
  if p_kind = 'source.critical' then
    perform public.studio_audit(uid::text, 'source.approval_requested', 'source:' || src.id,
      jsonb_build_object('approvalId', new_id, 'field', src_parts.field, 'value', src_parts.val,
                         'justification', why));
  end if;
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
  appr approvals;
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
  end if;
  -- role.admin, prompt.publish, push.urgent: autorização consumida pela ação do alvo.
  return 'authorized';
end
$$;

revoke execute on function public.source_critical_parts(text), public.source_critical_widens(sources, text, text)
  from public, anon;
grant execute on function public.source_critical_parts(text), public.source_critical_widens(sources, text, text)
  to authenticated, service_role;
