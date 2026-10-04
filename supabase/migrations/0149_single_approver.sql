-- A-128 · Decisão do dono (04/10/2026): acaba a regra de duas pessoas ("quem pede não decide",
-- "quem propõe não aprova", "segunda assinatura"). Uma pessoa com o papel que já aprovava pede,
-- aprova e aplica a mudança crítica numa ação só. Nada deixa de ser registrado: a linha de
-- `approvals` guarda `requested_by` e `approved_by` (agora podem ser a mesma pessoa), e os
-- registros de auditoria (`audit_log`, auditoria de fontes, push) seguem gravados como antes,
-- para o dono consultar quem fez o quê.
--
-- Continuam valendo: os papéis de quem aprova cada tipo, decisão só em nome próprio, decisão
-- final, versão aprovada imutável, transições de status, prazo de 24 h para aplicar, fonte nova
-- nascendo restrita e ninguém conceder nem revogar o próprio papel (isso é autopromoção, não
-- regra de duas pessoas).
--
-- Esta migration recria as funções com a última definição de cada uma (0002, 0011, 0029, 0033,
-- 0036, 0037, 0041, 0047, 0048, 0080, 0148) sem as condições de duas pessoas e derruba os CHECK
-- que proibiam aprovador = solicitante/proponente. `create or replace` preserva os grants.
-- Já feito antes: 0145 (A-125, `auto_publish` sem segunda pessoa) e 0148 (A-127).

-- ---------------------------------------------------------------------------
-- CHECK de tabela: aprovador pode ser quem propôs ou pediu.
-- ---------------------------------------------------------------------------
alter table public.rules drop constraint if exists rules_check;
alter table public.rec_weights drop constraint if exists rec_weights_check;
alter table public.approvals drop constraint if exists approvals_check;

-- ---------------------------------------------------------------------------
-- two_person_error: Nome mantido (é chamado em todo o banco); só a dica deixa de falar em duas pessoas.
-- ---------------------------------------------------------------------------
create or replace function public.two_person_error(msg text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception '%', msg using errcode = '42501', hint = 'Mudança crítica (spec §8; A-128).';
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_proposal: rules e rec_weights: quem propõe também pode aprovar, se tiver o papel. Segue: aprovação só em nome próprio, papel de aprovador, versão aprovada imutável.
-- ---------------------------------------------------------------------------
create or replace function public.guard_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
  approvers app_role[] := tg_argv[0]::app_role[];
  n jsonb;
  o jsonb;
  content_changed boolean;
begin
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.proposed_by is distinct from uid then
      perform two_person_error(format('%s: proposed_by deve ser quem propõe', tg_table_name));
    end if;
    if new.approved_by is not null or new.active then
      perform two_person_error(format('%s: proposta nasce sem aprovação e inativa', tg_table_name));
    end if;
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  if new.proposed_by is distinct from old.proposed_by or n -> 'version' is distinct from o -> 'version'
     or n -> 'created_at' is distinct from o -> 'created_at' then
    perform two_person_error(format('%s: versão, proponente e data são imutáveis', tg_table_name));
  end if;
  content_changed := (n - '{approved_by,active}'::text[]) is distinct from (o - '{approved_by,active}'::text[]);

  if old.approved_by is not null or old.active then
    if new.approved_by is distinct from old.approved_by then
      perform two_person_error(format('%s: aprovação registrada não muda', tg_table_name));
    end if;
    if content_changed then
      perform two_person_error(format('%s: versão aprovada ou ativa é imutável; proponha nova versão', tg_table_name));
    end if;
  elsif new.approved_by is not null then
    if new.approved_by <> uid then
      perform two_person_error(format('%s: aprovação só em nome próprio', tg_table_name));
    end if;
    if not has_any_role(uid, approvers) then
      perform two_person_error(format('%s: papel sem permissão para aprovar', tg_table_name));
    end if;
    if content_changed then
      perform two_person_error(format('%s: aprovação não altera o conteúdo', tg_table_name));
    end if;
  elsif content_changed and uid <> old.proposed_by then
    perform two_person_error(format('%s: só quem propõe edita a proposta', tg_table_name));
  end if;

  if new.active and new.approved_by is null then
    perform two_person_error(format('%s: só versão aprovada pode ser ativada', tg_table_name));
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_approvals: approvals: quem pede pode decidir o próprio pedido. Segue: decisão em nome próprio, final, approved/rejected, pedido imutável.
-- ---------------------------------------------------------------------------
create or replace function public.guard_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
begin
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status is distinct from old.status then
    new.decided_at := now();
  end if;
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.requested_by is distinct from uid then
      perform two_person_error('approvals: requested_by deve ser quem pede');
    end if;
    if new.approved_by is not null or new.status <> 'pending' then
      perform two_person_error('approvals: pedido nasce pendente e sem aprovador');
    end if;
    new.decided_at := null;
    return new;
  end if;

  if (to_jsonb(new) - '{approved_by,status,decided_at}'::text[]) is distinct from (to_jsonb(old) - '{approved_by,status,decided_at}'::text[]) then
    perform two_person_error('approvals: pedido é imutável (tipo, alvo, solicitante, justificativa)');
  end if;
  if new.status is not distinct from old.status and new.approved_by is not distinct from old.approved_by then
    new.decided_at := old.decided_at;
    return new;
  end if;
  if old.status <> 'pending' then
    perform two_person_error('approvals: decisão já tomada é final');
  end if;
  if new.status not in ('approved', 'rejected') then
    perform two_person_error('approvals: decisão é approved ou rejected');
  end if;
  if new.approved_by is distinct from uid then
    perform two_person_error('approvals: decisão só em nome próprio');
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- approval_apply: Aplica regras e flags aprovadas pela mesma pessoa que pediu. Segue: só quem aprovou aplica, 24 h, papel por tipo.
-- ---------------------------------------------------------------------------
create or replace function public.approval_apply(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if uid is not null and uid <> a.approved_by then
    perform public.two_person_error('approvals: só quem aprovou aplica');
  end if;
  if coalesce(a.decided_at, a.created_at) < now() - interval '24 hours' then
    raise exception 'approvals: aprovação expirou (mais de 24 h sem aplicar)' using errcode = '42501';
  end if;

  if a.kind in ('rules.activate', 'force_review.disable', 'safety.disable') and a.target_ref ~ '^rules:[0-9]+$' then
    v_version := substr(a.target_ref, 7)::int;
    select count(*) into n from public.rules r
      where r.version = v_version and not r.active and r.approved_by is null
        and r.proposed_by = a.requested_by;
    if n = 0 then
      raise exception 'regras: versão % não está proposta por quem pediu ou já foi decidida', v_version
        using errcode = 'P0002';
    end if;
    if a.kind = 'safety.disable' then
      if not public.has_role(a.approved_by, 'admin') then
        perform public.two_person_error('rules: só admin aprova mudança de segurança das regras');
      end if;
    elsif not public.has_any_role(a.approved_by, '{admin,editor_chefe}') then
      perform public.two_person_error('rules: papel sem permissão para aprovar');
    end if;
    perform public.approval_assert_content(a);
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
$function$;


-- ---------------------------------------------------------------------------
-- guard_ai_prompts: ai_prompts: o autor com papel de admin ou editor_chefe pode assinar a própria versão. Produção exige ao menos uma assinatura desses papéis.
-- ---------------------------------------------------------------------------
create or replace function public.guard_ai_prompts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
  expected uuid[];
begin
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.author_id is distinct from uid then
      perform two_person_error('ai_prompts: author_id deve ser quem escreve');
    end if;
    if cardinality(new.approved_by) > 0 or new.status not in ('draft', 'pending') then
      perform two_person_error('ai_prompts: prompt nasce sem aprovação, em rascunho ou pendente');
    end if;
    return new;
  end if;

  if new.id <> old.id or new.agent_id <> old.agent_id or new.version <> old.version
     or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    perform two_person_error('ai_prompts: agente, versão, autor e data são imutáveis');
  end if;

  if new.body is distinct from old.body or new.rationale is distinct from old.rationale then
    if cardinality(old.approved_by) > 0 or old.status in ('production', 'archived', 'reverted') then
      perform two_person_error('ai_prompts: prompt aprovado é imutável; crie nova versão');
    end if;
    if uid <> old.author_id then
      perform two_person_error('ai_prompts: só o autor edita o rascunho');
    end if;
  end if;

  if new.approved_by is distinct from old.approved_by then
    select coalesce(array_agg(distinct x order by x), '{}') into expected from unnest(old.approved_by || uid) as x;
    if uid = any (old.approved_by)
       or (select coalesce(array_agg(x order by x), '{}') from unnest(new.approved_by) as x) is distinct from expected then
      perform two_person_error('ai_prompts: aprovador só acrescenta a própria assinatura');
    end if;
    if not has_any_role(uid, '{admin,editor_chefe}') then
      perform two_person_error('ai_prompts: assinatura de produção é de admin ou editor_chefe');
    end if;
  end if;

  if new.status = 'production' and old.status is distinct from 'production'
     and cardinality(new.approved_by) = 0 then
    perform two_person_error('ai_prompts: produção exige assinatura de admin ou editor_chefe');
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- prompt_publish: Publica o prompt aprovado mesmo quando quem aprova é quem escreveu ou pediu.
-- ---------------------------------------------------------------------------
create or replace function public.prompt_publish(p_approval uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if uid is not null and uid <> a.approved_by then
    perform public.two_person_error('approvals: só quem aprovou aplica');
  end if;
  if coalesce(a.decided_at, a.created_at) < now() - interval '24 hours' then
    raise exception 'approvals: aprovação expirou (mais de 24 h sem aplicar)' using errcode = '42501';
  end if;
  if not public.has_any_role(a.approved_by, '{admin,editor_chefe}') then
    perform public.two_person_error('ai_prompts: assinatura de produção é de admin ou editor_chefe');
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
  perform public.approval_assert_content(a);

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
$function$;


-- ---------------------------------------------------------------------------
-- rec_weights_activate: Ativa os pesos aprovados mesmo quando quem aprova é quem propôs.
-- ---------------------------------------------------------------------------
create or replace function public.rec_weights_activate(p_approval uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.approval_assert_content(a);

  select version into v_prev from public.rec_weights where active limit 1;
  update public.rec_weights set active = false where active;
  update public.rec_weights set approved_by = a.approved_by, active = true where version = v_version;
  update public.approvals set status = 'applied' where id = p_approval;
  return jsonb_build_object('applied', true, 'version', v_version, 'previous', v_prev);
end
$function$;


-- ---------------------------------------------------------------------------
-- rules_rollback: Rollback volta para a última versão aprovada (antes exigia aprovador diferente do proponente).
-- ---------------------------------------------------------------------------
create or replace function public.rules_rollback()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_from int;
  v_to int;
  r_from public.rules%rowtype;
  r_to public.rules%rowtype;
begin
  if uid is not null and not public.has_role(uid, 'admin') then
    raise exception 'rules: só admin faz rollback' using errcode = '42501';
  end if;
  select r.version into v_from from rules r where r.active limit 1;
  if v_from is null then
    raise exception 'rules: nenhuma versão ativa' using errcode = 'P0002';
  end if;
  select r.version into v_to
    from rules r
   where r.version < v_from and r.approved_by is not null
   order by r.version desc
   limit 1;
  if v_to is null then
    raise exception 'rules: não há versão aprovada anterior à v%', v_from using errcode = 'P0002';
  end if;
  select * into r_from from rules where version = v_from;
  select * into r_to from rules where version = v_to;
  if public.rules_loosens(r_from.body, r_from.force_review, r_to.body, r_to.force_review) then
    raise exception 'rules: a v% afrouxa as regras da v% ativa; rollback direto recusado, proponha a v% como versão nova',
      v_to, v_from, v_to using errcode = '42501';
  end if;
  update rules set active = false where version = v_from;
  update rules set active = true where version = v_to;
  return jsonb_build_object('from', v_from, 'to', v_to);
end
$function$;


-- ---------------------------------------------------------------------------
-- consume_role_admin_ref: role.admin: a aprovação registrada vale mesmo decidida por quem pediu. Segue: ninguém concede nem revoga o próprio papel (guard_user_roles).
-- ---------------------------------------------------------------------------
create or replace function public.consume_role_admin_ref(p_ref text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hit uuid;
begin
  if pg_trigger_depth() = 0 or not public.has_role(auth.uid(), 'admin') then
    return false;
  end if;
  select a.id into hit
  from public.approvals a
  where a.kind = 'role.admin' and a.target_ref = p_ref and a.status = 'approved'
    and a.approved_by is not null
    and coalesce(a.decided_at, a.created_at) >= now() - interval '24 hours'
    and public.has_role(a.approved_by, 'admin')
  order by a.created_at
  limit 1
  for update;
  if hit is null then
    return false;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return true;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_user_roles: Só a mensagem muda; ninguém concede ou altera o próprio papel continua valendo.
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
begin
  if uid is null then
    return new;
  end if;
  if new.user_id = uid then
    perform two_person_error('user_roles: ninguém concede ou altera o próprio papel');
  end if;
  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role <> 'admin' or old.user_id <> new.user_id)
     and not public.consume_role_admin_approval(new.user_id) then
    perform two_person_error('user_roles: conceder admin exige aprovação role.admin registrada');
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_user_roles_revoke: Só a mensagem muda; ninguém revoga o próprio papel de admin continua valendo.
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_roles_revoke()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
begin
  if uid is not null and old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id) then
    if old.user_id = uid then
      perform public.two_person_error('user_roles: ninguém revoga o próprio papel de admin');
    end if;
    if not public.consume_role_admin_ref('revoke:' || old.user_id::text) then
      perform public.two_person_error('user_roles: revogar admin exige aprovação role.admin registrada');
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- consume_source_critical_approval: source.critical: consome a aprovação registrada mesmo decidida por quem pediu.
-- ---------------------------------------------------------------------------
create or replace function public.consume_source_critical_approval(p_target text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hit uuid;
begin
  if pg_trigger_depth() = 0 then
    return null;
  end if;
  select a.id into hit
  from public.approvals a
  where a.kind = 'source.critical' and a.target_ref = p_target and a.status = 'approved'
    and a.approved_by is not null
    and coalesce(a.decided_at, a.created_at) > now() - interval '24 hours'
  order by coalesce(a.decided_at, a.created_at) desc
  limit 1
  for update;
  if hit is null then
    return null;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return hit;
end
$function$;


-- ---------------------------------------------------------------------------
-- require_source_critical_approval: Só a mensagem muda (a aplicação mapeia 'exige aprovação' para needs_approval).
-- ---------------------------------------------------------------------------
create or replace function public.require_source_critical_approval(p_id uuid, p_field text, p_value text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_target text := format('source:%s:%s=%s', p_id, p_field, p_value);
  v_approval uuid;
begin
  v_approval := public.consume_source_critical_approval(v_target);
  if v_approval is null then
    perform public.two_person_error(
      format('Alterar %s exige aprovação registrada antes de aplicar (source.critical).', p_field)
    );
  end if;
  return v_approval;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_source_changes: Base: 0148 (A-127). Só comentário e mensagem da criação mudam; fonte nova segue nascendo restrita.
-- ---------------------------------------------------------------------------
create or replace function public.guard_source_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
  v_fast_max int;
  v_count int;
  v_approval uuid;
  v_last_approval uuid;
  v_op text[] := public.source_operational_columns();
  v_content_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    new.updated_at := now();
    new.created_by := coalesce(new.created_by, uid);
    if new.status_changed_at is null then
      new.status_changed_at := now();
    end if;
    if uid is not null then
      if new.frequency_minutes is not null and new.frequency_minutes < 30 then
        perform public.two_person_error('Fonte nova não pode nascer na via rápida.');
      end if;
      -- Fonte nasce sempre no padrão restrito (D-F3/D-F5): afrouxar os quatro campos críticos
      -- passa pelo fluxo de mudança crítica, que registra o pedido e a aprovação (A-128: a mesma
      -- pessoa com papel de aprovar pede e aplica na mesma ação; o histórico guarda quem fez).
      if new.image_policy <> 'none' or new.republish_policy <> 'link_only'
         or new.reliability in ('verified', 'primary') or new.may_be_sole_source then
        perform public.two_person_error(
          'Fonte nova só nasce com direitos restritos (imagem nenhuma, só link, confiabilidade '
          || 'padrão, sem fonte única); mudanças críticas passam pela aprovação registrada depois de criada.'
        );
      end if;
    end if;
    return new;
  end if;

  -- Identidade da fonte não muda por nenhuma pessoa (achado I-3 da revisão final): `slug` é chave
  -- de fila (`source:<slug>`), de `public_sources` e de URL, e `created_by` é histórico. Os dois
  -- estão em `source_operational_columns()` (sem auditoria nem versão), então o bloqueio é aqui.
  -- service_role/postgres (console, migrations) continuam podendo corrigir.
  if uid is not null then
    if new.slug is distinct from old.slug then
      raise exception 'O identificador (slug) da fonte não pode ser alterado.' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by da fonte não pode ser alterado.' using errcode = '42501';
    end if;
  end if;

  -- Motivo obrigatório vale no banco, para qualquer caminho (spec §7.3/§9, D-F5; achado I-5):
  -- arquivar exige `archive_reason`; bloquear exige um dos motivos de bloqueio em `status_reason`.
  if old.archived_at is null and new.archived_at is not null
     and coalesce(btrim(new.archive_reason), '') = '' then
    raise exception 'Arquivar exige um motivo.' using errcode = '42501';
  end if;
  if new.status = 'blocked' and old.status is distinct from 'blocked'
     and coalesce(new.status_reason, '') not in ('opt_out', 'legal', 'quality', 'other') then
    raise exception 'Bloquear exige um motivo: opt_out, legal, quality ou other.' using errcode = '42501';
  end if;

  -- Fonte arquivada só aceita restaurar (voltar archived_at para null); qualquer outra mudança
  -- enquanto continua arquivada é recusada (mesmo por service_role/postgres: histórico intacto).
  if old.archived_at is not null and new.archived_at is not null
     and (to_jsonb(new) - '{updated_at,version}'::text[]) is distinct from (to_jsonb(old) - '{updated_at,version}'::text[]) then
    raise exception 'fonte arquivada só aceita restaurar' using errcode = '42501';
  end if;

  -- Arquivar uma fonte da via rápida libera a vaga (§7.8.2): vale para qualquer caminho, direto
  -- no trigger (achado da revisão FS-T1; antes só `source_admin_status` fazia isto).
  if old.archived_at is null and new.archived_at is not null
     and new.frequency_minutes is not null and new.frequency_minutes < 30 then
    new.frequency_minutes := null;
  end if;

  -- Transições de status válidas (spec §6.4/§7.3), para qualquer caminho. Termos revisados,
  -- robots.txt e testConnection ficam com a aplicação (A-127: o banco não recusa mais ativar sem
  -- termos revisados).
  if new.status is distinct from old.status then
    if not (
      (old.status = 'paused' and new.status in ('active', 'blocked'))
      or (old.status = 'active' and new.status in ('degraded', 'paused', 'blocked'))
      or (old.status = 'degraded' and new.status in ('active', 'paused', 'blocked'))
      or (old.status = 'blocked' and new.status = 'paused')
    ) then
      raise exception 'transição de status % → % não é permitida', old.status, new.status using errcode = '42501';
    end if;
  end if;

  -- Via rápida (D-F28): entrar (de null/≥30 para <30) exige active/degraded e vaga; trocar entre
  -- 10, 15 e 20 não ocupa vaga nova. `for update` na linha de app_settings serializa duas
  -- marcações simultâneas (Review Focus 6).
  if new.frequency_minutes is distinct from old.frequency_minutes
     and new.frequency_minutes is not null and new.frequency_minutes < 30
     and (old.frequency_minutes is null or old.frequency_minutes >= 30) then
    if new.status not in ('active', 'degraded') or new.archived_at is not null then
      raise exception 'Ative a fonte antes de colocá-la na via rápida.' using errcode = '42501';
    end if;
    v_fast_max := public.lock_fast_lane_max();
    select count(*) into v_count from sources
     where archived_at is null and frequency_minutes is not null and frequency_minutes < 30 and id <> new.id;
    if v_count >= v_fast_max then
      raise exception 'A via rápida está cheia: % de % fontes.', v_count, v_fast_max using errcode = '42501';
    end if;
  end if;

  if uid is not null then
    -- Mudança crítica (D-F3): afrouxar image_policy; liberar resumo; confiabilidade para
    -- verified/primary; ligar fonte única; desbloquear.
    if new.image_policy is distinct from old.image_policy
       and public.image_policy_rank(new.image_policy) > public.image_policy_rank(old.image_policy) then
      v_last_approval := public.require_source_critical_approval(new.id, 'image_policy', new.image_policy::text);
    end if;
    if old.republish_policy = 'link_only' and new.republish_policy = 'summary_2_sentences' then
      v_last_approval := public.require_source_critical_approval(new.id, 'republish_policy', new.republish_policy::text);
    end if;
    if new.reliability is distinct from old.reliability
       and new.reliability in ('verified', 'primary')
       and public.source_reliability_rank(new.reliability) > public.source_reliability_rank(old.reliability) then
      v_last_approval := public.require_source_critical_approval(new.id, 'reliability', new.reliability::text);
    end if;
    if old.may_be_sole_source = false and new.may_be_sole_source = true then
      v_last_approval := public.require_source_critical_approval(new.id, 'may_be_sole_source', 'true');
    end if;
    if old.status = 'blocked' and new.status is distinct from 'blocked' then
      v_last_approval := public.require_source_critical_approval(new.id, 'status', new.status::text);
    end if;
    -- Guarda o último id consumido para a auditoria (details.approvalId); RPCs passam o próprio
    -- approvalId em p_ctx quando o chamador já sabe qual é.
    if v_last_approval is not null then
      perform set_config(
        'citynews.audit_ctx',
        jsonb_set(
          coalesce(nullif(current_setting('citynews.audit_ctx', true), '')::jsonb, '{}'::jsonb),
          '{approvalId}', to_jsonb(v_last_approval::text), true
        )::text,
        true
      );
    end if;
  end if;

  -- Versão otimista e `updated_at` só sobem quando algo que a tela mostra realmente mudou
  -- (achado da revisão FS-T1): um `claim_source_fetch` ou uma atualização só de
  -- `last_fetched_at`/`etag`/contadores nunca deve invalidar a versão de quem está editando.
  v_content_changed := (to_jsonb(new) - v_op) is distinct from (to_jsonb(old) - v_op);
  if v_content_changed then
    new.version := old.version + 1;
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := uid;
    end if;
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_push_approvals: Só comentário e dica mudam; a decisão segue exigindo push.approve.
-- ---------------------------------------------------------------------------
create or replace function public.guard_push_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
  v_send push_sends%rowtype;
  v_section text;
begin
  if new.kind not like 'push.%' then
    return new;
  end if;
  if new.kind not in ('push.urgent', 'push.highlight', 'push.resume') then
    raise exception 'tipo de aprovação % desconhecido', new.kind using errcode = '22023';
  end if;
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.kind = 'push.resume' then
      if not push_can(uid, 'push.settings') then
        perform two_person_error('push: retomar envios exige push.settings');
      end if;
      return new;
    end if;
    if new.target_ref not like 'push:%' then
      perform two_person_error('push: alvo da aprovação deve ser push:<id>');
    end if;
    select * into v_send from push_sends where id = substr(new.target_ref, 6)::uuid;
    if not found then
      perform two_person_error('push: envio do pedido não existe');
    end if;
    if v_send.requested_by is distinct from uid then
      perform two_person_error('push: só quem pediu o envio abre a aprovação');
    end if;
    if new.kind = 'push.urgent' then
      if v_send.kind <> 'urgent' or not has_any_role(uid, '{admin,editor_chefe}') then
        perform two_person_error('push: urgente só por admin ou editor-chefe');
      end if;
    else
      select section_slug into v_section from articles where id = v_send.article_id;
      if v_send.kind <> 'highlight' or not push_can(uid, 'push.request', v_section) then
        perform two_person_error('push: Destaque só de matéria da própria editoria');
      end if;
    end if;
    return new;
  end if;
  -- Decisão: quem aprova precisa de push.approve (pode ser quem pediu, A-128).
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not push_can(uid, 'push.approve') then
      raise exception 'A aprovação precisa ser de quem tem permissão de aprovar avisos.'
        using errcode = '42501', hint = 'Mudança crítica (spec §8; A-128).';
    end if;
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- guard_push_sends: push: a decisão vale com a aprovação registrada por quem tem push.approve, mesmo quem pediu.
-- ---------------------------------------------------------------------------
create or replace function public.guard_push_sends()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.critical_actor();
  v_article articles%rowtype;
  a approvals%rowtype;
  n jsonb;
  o jsonb;
  v_frozen text[] := '{title,body,audience,article_id,kind,scheduled_at,requested_by,created_at,justification,origin_label,url,tag}';
  v_person text[] := '{status,status_reason,approval_id,version}';
  k text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'follow' then
      if uid is not null then
        perform two_person_error('push: envio automático nasce só pelo sistema');
      end if;
      return new;
    end if;
    if uid is null then
      return new;
    end if;
    if new.status <> 'pending_approval' or new.requested_by is distinct from uid then
      perform two_person_error('push: pedido nasce pendente e em nome de quem pede');
    end if;
    if new.approved_by is not null or new.approved_at is not null or new.started_at is not null then
      perform two_person_error('push: pedido nasce sem aprovação');
    end if;
    select * into v_article from articles where id = new.article_id;
    if not found or v_article.status not in ('published', 'updated') then
      raise exception 'Só matéria publicada pode virar aviso.' using errcode = '23514';
    end if;
    if v_article.sponsored then
      raise exception 'Matéria patrocinada não vira aviso.' using errcode = '23514';
    end if;
    if new.kind = 'urgent' then
      if not has_any_role(uid, '{admin,editor_chefe}') then
        raise exception 'Urgente só por admin ou editor-chefe.' using errcode = '42501';
      end if;
      if new.scheduled_at is not null then
        raise exception 'Urgente só sai agora.' using errcode = '23514';
      end if;
      if coalesce(length(trim(new.justification)), 0) = 0 then
        raise exception 'Justificativa obrigatória para urgente.' using errcode = '23514';
      end if;
    elsif not push_can(uid, 'push.request', v_article.section_slug) then
      raise exception 'Destaque só de matéria da própria editoria.' using errcode = '42501';
    end if;
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  foreach k in array v_frozen loop
    if n -> k is distinct from o -> k then
      raise exception 'push: texto, público, matéria e horário são imutáveis depois do pedido (%)', k using errcode = '42501';
    end if;
  end loop;
  if new.status is distinct from old.status and not push_transition_ok(old.status, new.status) then
    raise exception 'push: transição % → % inválida', old.status, new.status using errcode = '42501';
  end if;
  new.version := old.version + (case when new.status is distinct from old.status then 1 else 0 end);
  if uid is null then
    return new;
  end if;

  -- Pessoa comum: só campos de decisão; contadores, lotes e horários são do serviço.
  for k in select key from jsonb_each(n) loop
    if k <> all (v_frozen) and k <> all (v_person) and n -> k is distinct from o -> k then
      raise exception 'push: campo % só muda pelo serviço', k using errcode = '42501';
    end if;
  end loop;
  if new.approval_id is distinct from old.approval_id then
    if old.approval_id is not null or old.requested_by is distinct from uid then
      perform two_person_error('push: a aprovação do pedido é ligada uma vez, por quem pediu');
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('queued', 'scheduled', 'rejected') then
      select * into a from approvals where target_ref = 'push:' || old.id::text order by created_at desc limit 1;
      if not found or a.approved_by is distinct from uid
         or a.status <> (case when new.status = 'rejected' then 'rejected' else 'approved' end)
         or not push_can(uid, 'push.approve') then
        perform two_person_error('push: decisão exige a aprovação registrada por quem tem push.approve');
      end if;
      if new.status <> 'rejected' then
        new.approved_by := a.approved_by;
        new.approved_at := coalesce(a.decided_at, now());
      end if;
    elsif new.status = 'cancelled' then
      if old.requested_by is distinct from uid and not push_can(uid, 'push.settings') then
        perform two_person_error('push: cancelar só por quem pediu ou por push.settings');
      end if;
    else
      perform two_person_error(format('push: estado %s só pelo serviço', new.status));
    end if;
  end if;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- push_resume_apply: Retomada aplicada com aprovação de quem tem push.approve, mesmo quem pediu (base 0047).
-- ---------------------------------------------------------------------------
create or replace function public.push_resume_apply(p_approval uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  a approvals%rowtype;
begin
  select * into a from approvals where id = p_approval for update;
  if not found or a.kind <> 'push.resume' or a.status <> 'approved' or a.approved_by is distinct from uid
     or not push_can(a.approved_by, 'push.approve') then
    raise exception 'retomada exige aprovação registrada por quem tem push.approve' using errcode = '42501';
  end if;
  update approvals set status = 'applied' where id = a.id;
  insert into app_settings (key, value, updated_by, updated_at)
  values ('push.paused', jsonb_build_object('on', false, 'by', uid, 'at', now(), 'reason', null), uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update push_sends set status = 'expired', status_reason = 'Agendamento vencido durante a pausa'
   where status = 'paused' and scheduled_at is not null and scheduled_at < now() - interval '1 hour';
  -- TTL por tipo (spec §12.4): o que passou do prazo durante a pausa vira `expired`, em vez de
  -- sair como notícia velha e gastar a cota diária dos leitores (PWA-03).
  update push_sends set status = 'expired', status_reason = 'Prazo vencido durante a pausa'
   where status = 'paused'
     and (
       (kind = 'follow' and coalesce(started_at, created_at) < now() - make_interval(hours => push_ttl_hours('follow')))
       or (kind = 'urgent' and coalesce(started_at, approved_at, created_at) < now() - make_interval(hours => push_ttl_hours('urgent')))
       or (kind = 'highlight' and scheduled_at is null
           and coalesce(started_at, approved_at, created_at) < now() - make_interval(hours => push_ttl_hours('highlight')))
     );
  -- Agendado para o futuro volta a `scheduled` (o despacho respeita `scheduled_at`); o resto volta à fila.
  update push_sends set status = 'scheduled', status_reason = null
   where status = 'paused' and kind <> 'follow' and batches_total = 0 and scheduled_at is not null and scheduled_at > now();
  update push_sends set status = 'queued', status_reason = null where status = 'paused';
  update push_batches set status = 'queued' where status = 'paused';
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'push.resume_applied', 'push:settings', jsonb_build_object('approvalId', a.id, 'reason', a.justification));
end
$function$;


-- ---------------------------------------------------------------------------
-- push_dispatch_due: Despacho reconfere a aprovação registrada sem exigir aprovador diferente de quem pediu (base 0047).
-- ---------------------------------------------------------------------------
create or replace function public.push_dispatch_due(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_paused boolean := coalesce((select (value->>'on')::boolean from app_settings where key = 'push.paused'), false);
  v_expired int := 0;
  v_dispatched int := 0;
  v_cancelled int := 0;
  v_resumed int := 0;
  v_due int := 0;
  s record;
  a approvals%rowtype;
  b record;
  v_art record;
begin
  v_expired := push_expire_requests(p_now);
  if v_paused then
    return jsonb_build_object('paused', true, 'expired', v_expired, 'dispatched', 0, 'cancelled', 0, 'resumed', 0, 'due', 0);
  end if;

  -- Retomados no meio do fan-out: lotes `queued` sem job voltam à fila.
  for s in select * from push_sends where status = 'queued' and batches_total > 0 loop
    update push_sends set status = 'dispatching' where id = s.id;
    for b in select batch_no from push_batches where send_id = s.id and status = 'queued' loop
      perform queue_enqueue('notify', 'push_deliver:push:' || s.id::text || ':' || b.batch_no,
        jsonb_build_object('runId', 'push', 'step', 'push_deliver', 'itemRef', 'push:' || s.id::text || ':' || b.batch_no, 'attempt', 1), 0);
    end loop;
    v_resumed := v_resumed + 1;
  end loop;

  -- `follow` retomado antes do fan-out: refaz o match.
  for s in select * from push_sends where status = 'queued' and batches_total = 0 and kind = 'follow' loop
    update push_sends set status = 'dispatching' where id = s.id;
    perform queue_enqueue('notify', 'push_match:push:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_match', 'itemRef', 'push:' || s.id::text, 'attempt', 1), 0);
    v_resumed := v_resumed + 1;
  end loop;

  -- Aprovados "agora" e agendados vencidos: reconfere a aprovação registrada e despacha.
  for s in select * from push_sends
            where kind <> 'follow' and batches_total = 0
              and (status = 'queued' or (status = 'scheduled' and scheduled_at <= p_now))
            order by created_at loop
    -- A matéria pode ter saído do ar ou virado patrocinada depois da aprovação (PWA-01, PWA-16).
    select ar.status, ar.sponsored into v_art from articles ar where ar.id = s.article_id;
    if not found or v_art.status not in ('published', 'updated') then
      update push_sends set status = 'cancelled', status_reason = 'Matéria despublicada' where id = s.id;
      v_cancelled := v_cancelled + 1;
      continue;
    elsif v_art.sponsored then
      update push_sends set status = 'cancelled', status_reason = 'Matéria patrocinada' where id = s.id;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    select * into a from approvals
     where target_ref = 'push:' || s.id::text and kind = 'push.' || s.kind
     order by created_at desc limit 1 for update;
    if not found or a.status <> 'approved' or a.approved_by is null
       or a.requested_by is distinct from s.requested_by or not push_can(a.approved_by, 'push.approve') then
      update push_sends set status = 'cancelled', status_reason = 'Aprovação inválida' where id = s.id;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    update approvals set status = 'applied' where id = a.id;
    update push_sends set status = 'dispatching', started_at = coalesce(started_at, p_now) where id = s.id;
    perform queue_enqueue('notify', 'push_match:push:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_match', 'itemRef', 'push:' || s.id::text, 'attempt', 1), 0);
    v_dispatched := v_dispatched + 1;
  end loop;

  -- Entregas adiadas ou reagendadas que chegaram à hora: um job por envio.
  for s in select distinct d.send_id as id from push_deliveries d
            where (d.not_before is not null and d.not_before <= p_now
                   and ((d.status = 'queued' and d.attempts > 0) or d.status = 'deferred'))
               -- Reservada e nunca enviada (worker caiu depois do `reserve`): reenvia (PWA-08).
               or (d.status = 'queued' and d.attempts = 0 and d.created_at < p_now - interval '3 minutes') loop
    perform queue_enqueue('notify', 'push_due:due:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_due', 'itemRef', 'due:' || s.id::text, 'attempt', 1), 0);
    v_due := v_due + 1;
  end loop;

  return jsonb_build_object('paused', false, 'expired', v_expired, 'dispatched', v_dispatched,
                            'cancelled', v_cancelled, 'resumed', v_resumed, 'due', v_due);
end
$function$;


-- ---------------------------------------------------------------------------
-- studio_notify_on_approval: Sino: pedido de quem já pode aprovar não gera aviso (a pessoa aplica na hora); texto sem segunda pessoa.
-- ---------------------------------------------------------------------------
create or replace function public.studio_notify_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_label text;
  v_roles text[];
  v_href text := '/estudio/control/aprovacoes';
  v_who text;
begin
  if new.status <> 'pending' or new.kind = 'push.urgent' then return new; end if;
  v_label := case new.kind
    when 'rules.activate' then 'ativar regras de publicação'
    when 'force_review.disable' then 'desligar a revisão forçada'
    when 'safety.disable' then 'liberar publicação de segurança'
    when 'prompt.publish' then 'publicar prompt de IA'
    when 'rec.weights' then 'mudar pesos da recomendação'
    when 'role.admin' then 'conceder papel de administrador'
    when 'source.critical' then 'mudar fonte crítica'
    when 'push.highlight' then 'enviar push de destaque'
    when 'push.resume' then 'retomar envio de push'
    else new.kind end;
  v_roles := case when new.kind in ('rec.weights', 'role.admin')
    then array['admin'] else array['admin', 'editor_chefe'] end;
  if new.kind like 'push.%' then v_href := '/estudio/admin/notificacoes'; end if;
  -- A-128: quem pede e já tem o papel de aprovar decide e aplica na mesma ação; não há o que
  -- avisar. O aviso fica para pedido de quem não tem o papel (ex.: Destaque de editor).
  if public.has_any_role(new.requested_by, v_roles::app_role[]) then return new; end if;
  select display_name into v_who from public.profiles where id = new.requested_by;
  perform public.studio_notify('approval_pending', 'warn',
    'Aprovação pendente: ' || v_label,
    coalesce(v_who, 'Alguém') || ' pediu e aguarda quem tem permissão para aprovar.',
    v_href, 'approval:' || new.id, v_roles, 'approval:' || new.id,
    '{}'::uuid[], array[new.requested_by]);
  return new;
exception when others then
  raise warning 'studio_notify_on_approval: %', sqlerrm;
  return new;
end
$function$;


-- ---------------------------------------------------------------------------
-- studio_notify_on_breaker: Texto: religar a publicação automática é ação direta do admin (A-125).
-- ---------------------------------------------------------------------------
create or replace function public.studio_notify_on_breaker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_why text;
begin
  if new.tripped_at is not null and old.tripped_at is distinct from new.tripped_at then
    v_why := case new.trip_reason
      when 'hourly' then 'limite de publicações por hora'
      when 'daily' then 'limite de publicações por dia'
      when 'reports' then 'pico de denúncias'
      when 'ai_failures' then 'pico de falhas de IA'
      else 'limite do disjuntor' end;
    perform public.studio_notify('breaker_open', 'urgent', 'Disjuntor aberto: publicação automática pausada',
      'Motivo: ' || v_why || '. Revise no Control Center.',
      '/estudio/control', 'breaker', array['admin', 'editor_chefe', 'operador_ia'],
      'breaker:' || extract(epoch from new.tripped_at)::bigint);
  elsif new.tripped_at is null and old.tripped_at is not null then
    perform public.studio_notify('backlog_released', 'info', 'Disjuntor religado: fila liberada',
      'O disjuntor foi zerado. A publicação automática segue desligada até um admin religar.',
      '/estudio/control', 'breaker', array['admin', 'editor_chefe', 'operador_ia'],
      'breaker_reset:' || extract(epoch from coalesce(new.reset_at, now()))::bigint);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_breaker: %', sqlerrm;
  return new;
end
$function$;
