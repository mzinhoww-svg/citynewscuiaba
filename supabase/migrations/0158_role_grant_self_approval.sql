-- 0158 · Papel numa ação só (UX-W3-T7, item 61, A-150; regra do dono A-128).
--
-- Quem tem `users.manage` (admin) concede, muda ou revoga papéis de outra pessoa numa ação só:
-- `role_set` registra o pedido em `approvals` com quem pediu e quem aprovou (a mesma pessoa,
-- autoaprovação auditada), aplica em `user_roles` e grava `audit_log`, tudo na mesma transação.
-- Antes, conceder administração eram várias chamadas (pedir, aprovar, inserir), e uma falha no
-- meio deixava um pedido "aprovado, falta aplicar" na tela. Agora ou tudo acontece, ou nada.
--
-- Continuam valendo: só admin (`users.manage`) muda papel; ninguém concede, muda ou revoga o
-- próprio papel; editor precisa de editoria; mexer em administração pede justificativa; cada
-- mudança tem linha em `approvals` (tipos novos `role.grant` e `role.revoke`) e em `audit_log`.
-- Os outros tipos de pedido não mudam. A segunda assinatura não volta (CLAUDE.md, A-128).
--
-- `security definer` porque grava o pedido já decidido e aplicado (o caminho comum,
-- `guard_approvals`, exige pedido pendente) e a auditoria em nome de quem chamou; as checagens de
-- papel e de autopromoção ficam aqui dentro, contra `auth.uid()`.

-- ---------------------------------------------------------------------------
-- 1. Tipos de pedido: + role.grant, role.revoke
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
    'push.highlight', 'push.resume',
    -- papel numa ação só (0158, A-150)
    'role.grant', 'role.revoke'
  ]::text[]
$$;
revoke execute on function public.approval_kinds() from public, anon;
grant execute on function public.approval_kinds() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. role_set: papéis de uma pessoa numa transação
-- ---------------------------------------------------------------------------
-- p_roles: [{ "role": "editor", "sections": ["cidade"] }, ...] = o conjunto final de papéis.
-- Devolve { granted, updated, revoked, approvalIds }.
create or replace function public.role_set(
  p_user uuid,
  p_roles jsonb,
  p_justification text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_wanted jsonb := '{}'::jsonb;
  v_known text[] := enum_range(null::app_role)::text[];
  v_elem jsonb;
  v_role text;
  v_secs text[];
  v_cur text[];
  v_found boolean;
  v_had_admin boolean;
  v_id uuid;
  v_granted text[] := '{}';
  v_updated text[] := '{}';
  v_revoked text[] := '{}';
  v_ids uuid[] := '{}';
  r record;
begin
  if uid is null then
    raise exception 'role_set: exige usuário autenticado' using errcode = '42501';
  end if;
  if not public.has_role(uid, 'admin') then
    raise exception 'role_set: mudar papel exige users.manage' using errcode = '42501';
  end if;
  if p_user is null or p_user = uid then
    raise exception 'role_set: ninguém concede ou altera o próprio papel' using errcode = '42501';
  end if;
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' or jsonb_array_length(p_roles) > 20 then
    raise exception 'role_set: lista de papéis inválida' using errcode = '22023';
  end if;
  if v_just is not null and length(v_just) > 500 then
    raise exception 'role_set: justificativa longa demais' using errcode = '22023';
  end if;

  for v_elem in select value from jsonb_array_elements(p_roles) loop
    v_role := v_elem ->> 'role';
    if v_role is null or not (v_role = any (v_known)) then
      raise exception 'role_set: papel desconhecido' using errcode = '22023';
    end if;
    if v_wanted ? v_role then
      raise exception 'role_set: papel repetido' using errcode = '22023';
    end if;
    if v_elem ? 'sections' and jsonb_typeof(v_elem -> 'sections') <> 'array' then
      raise exception 'role_set: editorias inválidas' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct s order by s), '{}')
      into v_secs
      from jsonb_array_elements_text(coalesce(v_elem -> 'sections', '[]'::jsonb)) as t(s)
     where s ~ '^[a-z0-9-]+$';
    if v_role <> 'editor' then
      v_secs := '{}';
    elsif cardinality(v_secs) = 0 then
      raise exception 'role_set: editor precisa de pelo menos uma editoria' using errcode = '22023';
    end if;
    v_wanted := v_wanted || jsonb_build_object(v_role, to_jsonb(v_secs));
  end loop;

  -- Trava a pessoa: duas mudanças simultâneas nos papéis dela não se cruzam.
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    raise exception 'role_set: pessoa não encontrada' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.user_roles where user_id = p_user and role = 'admin')
    into v_had_admin;
  if v_had_admin <> (v_wanted ? 'admin') and v_just is null then
    raise exception 'role_set: mudar a administração exige justificativa' using errcode = '22023';
  end if;
  v_just := coalesce(v_just, 'Papel alterado no Estúdio (A-128).');

  -- Revogações.
  for r in
    select ur.role::text as role
      from public.user_roles ur
     where ur.user_id = p_user and not (v_wanted ? ur.role::text)
     order by ur.role::text
  loop
    insert into public.approvals
      (kind, target_ref, requested_by, approved_by, justification, status, decided_at)
    values
      ('role.revoke', 'user:' || p_user || ':' || r.role, uid, uid, v_just, 'applied', now())
    returning id into v_id;
    delete from public.user_roles where user_id = p_user and role = r.role::app_role;
    insert into public.audit_log (actor, action, object_ref, details)
    values (uid::text, 'user.role.revoke', 'user:' || p_user,
            jsonb_build_object('role', r.role, 'approvalId', v_id, 'justification', v_just));
    v_revoked := v_revoked || r.role;
    v_ids := v_ids || v_id;
  end loop;

  -- Concessões e mudanças de editoria.
  for v_role in select k from jsonb_object_keys(v_wanted) as k order by k loop
    select coalesce(array_agg(s order by s), '{}')
      into v_secs
      from jsonb_array_elements_text(v_wanted -> v_role) as t(s);
    select coalesce(
             (select array_agg(distinct s order by s) from unnest(ur.sections) as u(s)),
             '{}'),
           true
      into v_cur, v_found
      from public.user_roles ur
     where ur.user_id = p_user and ur.role = v_role::app_role;
    if v_found is not true then
      insert into public.approvals
        (kind, target_ref, requested_by, approved_by, justification, status, decided_at)
      values
        ('role.grant', 'user:' || p_user || ':' || v_role, uid, uid, v_just, 'applied', now())
      returning id into v_id;
      insert into public.user_roles (user_id, role, sections)
      values (p_user, v_role::app_role, v_secs);
      insert into public.audit_log (actor, action, object_ref, details)
      values (uid::text, 'user.role.grant', 'user:' || p_user,
              jsonb_build_object('role', v_role, 'sections', to_jsonb(v_secs),
                                 'approvalId', v_id, 'justification', v_just));
      v_granted := v_granted || v_role;
      v_ids := v_ids || v_id;
    elsif v_cur is distinct from v_secs then
      insert into public.approvals
        (kind, target_ref, requested_by, approved_by, justification, status, decided_at)
      values
        ('role.grant', 'user:' || p_user || ':' || v_role, uid, uid, v_just, 'applied', now())
      returning id into v_id;
      update public.user_roles set sections = v_secs
       where user_id = p_user and role = v_role::app_role;
      insert into public.audit_log (actor, action, object_ref, details)
      values (uid::text, 'user.role.grant', 'user:' || p_user,
              jsonb_build_object('role', v_role, 'sections', to_jsonb(v_secs), 'update', true,
                                 'approvalId', v_id, 'justification', v_just));
      v_updated := v_updated || v_role;
      v_ids := v_ids || v_id;
    end if;
    v_found := null;
  end loop;

  return jsonb_build_object(
    'granted', to_jsonb(v_granted),
    'updated', to_jsonb(v_updated),
    'revoked', to_jsonb(v_revoked),
    'approvalIds', to_jsonb(v_ids)
  );
end
$$;
revoke execute on function public.role_set(uuid, jsonb, text) from public, anon;
grant execute on function public.role_set(uuid, jsonb, text) to authenticated;
