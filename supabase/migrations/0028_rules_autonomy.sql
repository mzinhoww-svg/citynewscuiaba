-- P5-T2 · Regras de autonomia (spec §6.4 e §8; plano P5 Task 2; CLAUDE.md regra 8).
--
-- Fecha dois limites deixados pela T1:
--   1. Ativar ou assinar uma versão de `rules`/`rec_weights` por UPDATE direto, sem pedido
--      aprovado em `approvals`, é recusado no banco (`guard_proposal`). O caminho é
--      `approval_request` → `approval_decide` (0027).
--   2. O tipo de aprovação de uma versão de regras vem da comparação real com a versão ativa
--      (`rules_kinds_between`, espelho de src/lib/rules/critical.ts): desligar forceReview
--      exige `force_review.disable`; tirar tema sensível ou desbloquear Segurança exige
--      `safety.disable`; o resto é `rules.activate`. Com os dois primeiros juntos, a versão
--      só entra em vigor quando os dois pedidos estiverem aprovados.
-- E acrescenta a trava de conteúdo: nenhuma versão (nem do seed ou do service role) deixa
-- Segurança ou categoria urgente em modo automático (`rules_body_safe`).

-- Chave de categoria ou tema: minúsculas, sem acento, espaço e sublinhado viram hífen
-- (mesmo que `foldKey` em src/lib/rules/safety.ts).
create or replace function public.rules_fold(t text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
    lower(btrim(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))),
    '[[:space:]_]+', '-', 'g')
$$;

-- Categorias que nunca publicam sozinhas (NEVER_AUTO_CATEGORIES em src/lib/rules/safety.ts).
create or replace function public.rules_never_auto_categories()
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select array['seguranca', 'urgente', 'breaking', 'breaking-news', 'ultima-hora', 'plantao']::text[]
$$;

-- Segurança e urgentes só em `blocked` ou `review` (CLAUDE.md regra 8).
create or replace function public.rules_body_safe(p_body jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when jsonb_typeof(p_body -> 'categories') is distinct from 'object' then true
    else not exists (
      select 1 from jsonb_each(p_body -> 'categories') c(k, v)
       where public.rules_fold(c.k) = any (public.rules_never_auto_categories())
         and (jsonb_typeof(c.v) is distinct from 'object'
              or coalesce(c.v ->> 'mode', '') not in ('blocked', 'review'))
    )
  end
$$;

alter table rules drop constraint if exists rules_never_auto_safe;
alter table rules add constraint rules_never_auto_safe check (public.rules_body_safe(body));

-- forceReview desligado numa linha: coluna ou corpo pedindo (o mais conservador).
create or replace function public.rules_force_review_off(p_force boolean, p_body jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select not coalesce(p_force, true) or coalesce(p_body ->> 'forceReview', 'true') = 'false'
$$;

-- Tipos de aprovação exigidos para trocar a versão atual pela nova. Sem versão atual, a base
-- é a mais restrita (forceReview ligado, sem temas, Segurança bloqueada).
create or replace function public.rules_kinds_between(
  p_cur_force boolean, p_cur_body jsonb, p_next_force boolean, p_next_body jsonb)
returns text[]
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  cur_body jsonb := coalesce(p_cur_body,
    '{"sensitiveTopics":[],"categories":{"seguranca":{"mode":"blocked"}}}'::jsonb);
  cur_off boolean := p_cur_body is not null and public.rules_force_review_off(p_cur_force, p_cur_body);
  next_topics jsonb := case when jsonb_typeof(p_next_body -> 'sensitiveTopics') = 'array'
                            then p_next_body -> 'sensitiveTopics' else '[]'::jsonb end;
  next_cats jsonb := case when jsonb_typeof(p_next_body -> 'categories') = 'object'
                          then p_next_body -> 'categories' else '{}'::jsonb end;
  kinds text[] := '{}';
begin
  if not cur_off and public.rules_force_review_off(p_next_force, p_next_body) then
    kinds := kinds || 'force_review.disable'::text;
  end if;
  if exists (
       select 1
         from jsonb_array_elements_text(case when jsonb_typeof(cur_body -> 'sensitiveTopics') = 'array'
                                             then cur_body -> 'sensitiveTopics' else '[]'::jsonb end) t(x)
        where not exists (select 1 from jsonb_array_elements_text(next_topics) n(y)
                           where public.rules_fold(n.y) = public.rules_fold(t.x)))
     or exists (
       select 1
         from jsonb_each(case when jsonb_typeof(cur_body -> 'categories') = 'object'
                              then cur_body -> 'categories' else '{}'::jsonb end) c(k, v)
        where public.rules_fold(c.k) = any (public.rules_never_auto_categories())
          and c.v ->> 'mode' = 'blocked'
          and coalesce((select n.v ->> 'mode' from jsonb_each(next_cats) n(k, v)
                         where public.rules_fold(n.k) = public.rules_fold(c.k) limit 1), '') <> 'blocked')
  then
    kinds := kinds || 'safety.disable'::text;
  end if;
  if cardinality(kinds) = 0 then
    kinds := array['rules.activate'];
  end if;
  return kinds;
end
$$;

-- Tipos exigidos para ativar a versão `p_version` no lugar da ativa de agora (null se não existe).
create or replace function public.rules_required_kinds(p_version int)
returns text[]
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  nxt rules%rowtype;
  cur rules%rowtype;
begin
  select * into nxt from rules where version = p_version;
  if not found then
    return null;
  end if;
  select * into cur from rules where active and version <> p_version order by version desc limit 1;
  if not found then
    return public.rules_kinds_between(null, null, nxt.force_review, nxt.body);
  end if;
  return public.rules_kinds_between(cur.force_review, cur.body, nxt.force_review, nxt.body);
end
$$;

-- Todos os tipos exigidos pela versão já têm pedido aprovado por outra pessoa?
create or replace function public.rules_approvals_complete(p_version int)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(bool_and(exists (
           select 1 from approvals a
            where a.kind = k and a.target_ref = p_version::text and a.status = 'approved'
              and a.approved_by is not null and a.approved_by <> a.requested_by)), false)
    from unnest(public.rules_required_kinds(p_version)) k
$$;

-- guard_proposal (0002) + exigência de pedido aprovado em `approvals` para assinar e ativar.
create or replace function public.guard_proposal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  approvers app_role[] := tg_argv[0]::app_role[];
  n jsonb;
  o jsonb;
  content_changed boolean;
  target text;
  kinds text[] := case tg_table_name
                    when 'rules' then array['rules.activate', 'safety.disable', 'force_review.disable']
                    else array['rec.weights'] end;
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
  target := n ->> 'version';
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
    if uid = old.proposed_by then
      perform two_person_error(format('%s: quem propõe não aprova', tg_table_name));
    end if;
    if not has_any_role(uid, approvers) then
      perform two_person_error(format('%s: papel sem permissão para aprovar', tg_table_name));
    end if;
    if content_changed then
      perform two_person_error(format('%s: aprovação não altera o conteúdo', tg_table_name));
    end if;
    -- P5-T2: assinatura só com pedido aprovado por esta pessoa (approval_decide) e, em regras,
    -- com todos os tipos exigidos pela comparação com a versão ativa já aprovados.
    if not exists (
      select 1 from approvals a
       where a.kind = any (kinds) and a.target_ref = target and a.status = 'approved'
         and a.approved_by = uid and a.requested_by <> uid
    ) then
      perform two_person_error(format('%s: aprovar exige pedido aprovado em approvals (Control Center · Aprovações)', tg_table_name));
    end if;
    if tg_table_name = 'rules' then
      if not public.rules_approvals_complete(target::int) then
        perform two_person_error('rules: faltam aprovações exigidas por esta versão (forceReview ou segurança)');
      end if;
    end if;
  elsif content_changed and uid <> old.proposed_by then
    perform two_person_error(format('%s: só quem propõe edita a proposta', tg_table_name));
  end if;

  if new.active and new.approved_by is null then
    perform two_person_error(format('%s: só versão aprovada pode ser ativada', tg_table_name));
  end if;
  -- P5-T2: ativar exige pedido aprovado para esta versão (a assinatura sozinha não basta).
  if new.active and not old.active and not exists (
    select 1 from approvals a
     where a.kind = any (kinds) and a.target_ref = target and a.status = 'approved'
       and a.approved_by is not null and a.approved_by <> a.requested_by
  ) then
    perform two_person_error(format('%s: ativar exige pedido aprovado em approvals', tg_table_name));
  end if;
  return new;
end
$$;

-- Pedido (0027) com o tipo conferido contra a comparação real e sem pedido repetido.
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
  return new_id;
end
$$;

-- Efeito (0027) com regras em três passos: assina (com a versão anterior ainda ativa, para a
-- comparação do guard valer), desativa as demais e ativa. Faltando outro tipo exigido, a
-- aprovação fica registrada e o efeito é 'waiting'.
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
  if not exists (
    select 1 from approvals a
     where a.kind = p_kind and a.target_ref = p_target_ref and a.status = 'approved'
       and a.approved_by = uid and a.approved_by <> a.requested_by
  ) then
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
  end if;
  return 'authorized';
end
$$;

revoke execute on function public.rules_required_kinds(int), public.rules_approvals_complete(int)
  from public, anon;
grant execute on function public.rules_fold(text), public.rules_never_auto_categories(),
  public.rules_body_safe(jsonb), public.rules_force_review_off(boolean, jsonb),
  public.rules_kinds_between(boolean, jsonb, boolean, jsonb)
  to authenticated, service_role;
grant execute on function public.rules_required_kinds(int), public.rules_approvals_complete(int)
  to authenticated, service_role;
