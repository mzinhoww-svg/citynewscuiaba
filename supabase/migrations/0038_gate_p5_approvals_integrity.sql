-- P5-GATE (frente A) · Integridade das aprovações e proteções no banco.
--
--   A1  Aprovação consumida: approval_apply marca `applied` nas aprovações de regras e pesos
--       (0002 e 0028 já exigiam `approved` para assinar e ativar; sem consumo, um UPDATE direto
--       reativava versão antiga). Rollback = nova proposta + nova aprovação (A-065 revisada).
--   A2  Aprovação vinculada ao conteúdo: `approvals.content_digest` (calculado no INSERT por
--       trigger, nunca pelo cliente) e conferido em approval_apply (P0002 se o conteúdo mudou).
--       Cobre regras, pesos e prompts.
--   M1  Prompt em produção só com aprovação `prompt.publish` (consumida no guard); troca de
--       `ai_agents.prompt_version` só por `ai_agent_set_prompt`.
--   M2  approvals: INSERT/UPDATE diretos passam pela matriz de papéis e pela justificativa.
--   M3  read_only imposto no banco (trigger genérico; service role isento; falha fechada).
--   B1  feature_flags: updated_by/updated_at e auditoria `flag.set` por trigger.
--   B4  role.admin: aprovação vale 7 dias.
--   B2-R3 revoke de rec_variant_events e rec_panel_stats para public/anon.
--   M2-R3 patrocinado nunca em Política (slug, subeditoria ou categoria de autonomia).

-- ---------------------------------------------------------------------------
-- A2 · digest do conteúdo aprovado
-- ---------------------------------------------------------------------------
alter table approvals add column if not exists content_digest text;

create or replace function public.approval_content_digest(p_kind text, p_target text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d text;
begin
  if p_kind in ('rules.activate', 'safety.disable', 'force_review.disable') then
    if coalesce(p_target, '') !~ '^[1-9][0-9]{0,8}$' then
      return null;
    end if;
    select md5(r.body::text || '|' || r.force_review::text) into d from rules r where r.version = p_target::int;
  elsif p_kind = 'rec.weights' then
    select md5(w.weights::text || '|' || w.cap::text || '|' || w.discovery_every::text) into d
      from rec_weights w where w.version = p_target;
  elsif p_kind = 'prompt.publish' then
    if coalesce(p_target, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    select md5(p.body || '|' || p.rationale) into d from ai_prompts p where p.id = p_target::uuid;
  end if;
  return d;
end
$$;

create or replace function public.approvals_set_digest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.content_digest := public.approval_content_digest(new.kind, new.target_ref);
  return new;
end
$$;

drop trigger if exists approvals_digest on approvals;
create trigger approvals_digest before insert on approvals
  for each row execute function public.approvals_set_digest();

-- Aprovações `approved` dos tipos para o alvo cujo digest não bate mais com o conteúdo atual.
create or replace function public.approval_digest_ok(p_kinds text[], p_target text)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1 from approvals a
     where a.kind = any (p_kinds) and a.target_ref = p_target and a.status = 'approved'
       and a.content_digest is distinct from public.approval_content_digest(a.kind, p_target))
$$;

-- Consumo (approved -> applied). Quem chama precisa ser quem aprovou algum dos tipos para o alvo;
-- consome todas as aprovações `approved` dos tipos (rules tem até dois tipos, de duas pessoas).
create or replace function public.approval_consume(p_kinds text[], p_target text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null or not exists (
    select 1 from approvals a
     where a.kind = any (p_kinds) and a.target_ref = p_target and a.status = 'approved'
       and a.approved_by = uid and a.approved_by <> a.requested_by
  ) then
    return 0;
  end if;
  update approvals set status = 'applied'
   where kind = any (p_kinds) and target_ref = p_target and status = 'approved'
     and approved_by is not null and approved_by <> requested_by;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- A1 + A2 · approval_apply (partindo da 0032)
-- ---------------------------------------------------------------------------
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
  rules_kinds text[] := array['rules.activate', 'safety.disable', 'force_review.disable'];
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
  if p_kind = any (rules_kinds) then
    if not public.approval_digest_ok(rules_kinds, p_target_ref) then
      raise exception 'approval_apply: o conteúdo da versão % mudou depois do pedido; recuse e peça de novo', p_target_ref
        using errcode = 'P0002';
    end if;
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
    perform public.approval_consume(rules_kinds, p_target_ref);
    return 'activated';
  elsif p_kind = 'rec.weights' then
    if not public.approval_digest_ok(array['rec.weights'], p_target_ref) then
      raise exception 'approval_apply: os pesos % mudaram depois do pedido; recuse e peça de novo', p_target_ref
        using errcode = 'P0002';
    end if;
    update rec_weights set approved_by = uid where version = p_target_ref and approved_by is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'approval_apply: pesos % não estão mais pendentes', p_target_ref using errcode = 'P0002';
    end if;
    update rec_weights set active = false where active and version <> p_target_ref;
    update rec_weights set active = true where version = p_target_ref;
    perform public.approval_consume(array['rec.weights'], p_target_ref);
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
    if not public.approval_digest_ok(array['prompt.publish'], p_target_ref) then
      raise exception 'approval_apply: o prompt % mudou depois do pedido; recuse e peça de novo', p_target_ref
        using errcode = 'P0002';
    end if;
    select * into pr from ai_prompts where id = p_target_ref::uuid for update;
    if not found or pr.status not in ('draft', 'pending') or cardinality(pr.approved_by) > 0 then
      raise exception 'approval_apply: o prompt % não está mais pendente', p_target_ref using errcode = 'P0002';
    end if;
    update ai_prompts
       set status = case when pr.rollback_of is not null then 'reverted' else 'archived' end
     where agent_id = pr.agent_id and status = 'production';
    -- O guard de ai_prompts confere e consome a aprovação `prompt.publish` (M1).
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

-- ---------------------------------------------------------------------------
-- M1 · prompts: produção só com aprovação prompt.publish
-- ---------------------------------------------------------------------------
create or replace function public.guard_ai_prompts()
returns trigger
language plpgsql
set search_path = public
as $$
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
    if uid = any (old.approved_by) or uid = old.author_id
       or (select coalesce(array_agg(x order by x), '{}') from unnest(new.approved_by) as x) is distinct from expected then
      perform two_person_error('ai_prompts: aprovador só acrescenta a própria assinatura, nunca a do autor');
    end if;
    if not has_any_role(uid, '{admin,editor_chefe}') then
      perform two_person_error('ai_prompts: 2ª assinatura é de admin ou editor_chefe');
    end if;
    -- M1/A2: a assinatura exige pedido prompt.publish aprovado por esta pessoa, para o conteúdo
    -- que ela aprovou; o pedido é consumido aqui.
    if not exists (
      select 1 from approvals a
       where a.kind = 'prompt.publish' and a.target_ref = old.id::text and a.status = 'approved'
         and a.approved_by = uid and a.requested_by <> uid
         and a.content_digest is not distinct from public.approval_content_digest('prompt.publish', old.id::text)
    ) then
      perform two_person_error('ai_prompts: assinar exige pedido prompt.publish aprovado em approvals (Control Center · Aprovações)');
    end if;
    perform public.approval_consume(array['prompt.publish'], old.id::text);
  end if;

  if new.status = 'production' and old.status is distinct from 'production' then
    if old.status in ('archived', 'reverted') then
      perform two_person_error('ai_prompts: versão arquivada não volta à produção; rollback cria nova versão');
    end if;
    if not exists (select 1 from unnest(new.approved_by) as a where a <> new.author_id) then
      perform two_person_error('ai_prompts: produção exige assinatura de outra pessoa');
    end if;
    if not exists (
      select 1 from approvals a
       where a.kind = 'prompt.publish' and a.target_ref = old.id::text and a.status in ('approved', 'applied')
         and a.approved_by = any (new.approved_by) and a.approved_by <> new.author_id
    ) then
      perform two_person_error('ai_prompts: produção exige pedido prompt.publish aprovado em approvals');
    end if;
  end if;
  return new;
end
$$;

-- prompt_version só muda por ai_agent_set_prompt (SECURITY DEFINER): privilégio por coluna.
revoke update, insert on ai_agents from authenticated;
grant update (function, model_id, fallback_model_id, daily_budget_brl, enabled) on ai_agents to authenticated;
grant insert (id, function, model_id, fallback_model_id, daily_budget_brl, enabled) on ai_agents to authenticated;

-- ---------------------------------------------------------------------------
-- M2 · approvals: matriz de papéis e justificativa também no INSERT/UPDATE direto
-- ---------------------------------------------------------------------------
create or replace function public.guard_approvals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  roles record;
  why text;
begin
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
    select * into roles from public.approval_kind_roles() r where r.kind = new.kind;
    if not found then
      perform two_person_error('approvals: tipo desconhecido');
    end if;
    if not public.has_any_role(uid, roles.requesters) then
      perform two_person_error('approvals: papel sem permissão para pedir este tipo');
    end if;
    why := btrim(coalesce(new.justification, ''), E' \t\r\n');
    if why = '' or length(why) > 2000 then
      perform two_person_error('approvals: justificativa obrigatória (até 2000 caracteres)');
    end if;
    -- Regras e pesos: o alvo é uma proposta sua ainda não aprovada (igual a approval_request).
    if new.kind in ('rules.activate', 'safety.disable', 'force_review.disable') then
      if new.target_ref !~ '^[1-9][0-9]{0,8}$' or not exists (
        select 1 from rules r where r.version = new.target_ref::int and r.proposed_by = uid and r.approved_by is null
      ) then
        perform two_person_error('approvals: a versão precisa ser uma proposta sua ainda não aprovada');
      end if;
    elsif new.kind = 'rec.weights' then
      if not exists (
        select 1 from rec_weights w where w.version = new.target_ref and w.proposed_by = uid and w.approved_by is null
      ) then
        perform two_person_error('approvals: os pesos precisam ser uma proposta sua ainda não aprovada');
      end if;
    end if;
    return new;
  end if;

  if (to_jsonb(new) - '{approved_by,status}'::text[]) is distinct from (to_jsonb(old) - '{approved_by,status}'::text[]) then
    perform two_person_error('approvals: pedido é imutável (tipo, alvo, solicitante, justificativa)');
  end if;
  if new.status is not distinct from old.status and new.approved_by is not distinct from old.approved_by then
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
  if uid = old.requested_by then
    perform two_person_error('approvals: quem pede não decide');
  end if;
  select * into roles from public.approval_kind_roles() r where r.kind = old.kind;
  if not found or not public.has_any_role(uid, roles.approvers) then
    perform two_person_error('approvals: papel sem permissão para decidir este tipo');
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- B4 · role.admin: aprovação vale 7 dias
-- ---------------------------------------------------------------------------
create or replace function public.consume_role_admin_approval(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
begin
  if pg_trigger_depth() = 0 or not public.has_role(auth.uid(), 'admin') then
    return false;
  end if;
  select a.id into hit
  from public.approvals a
  where a.kind = 'role.admin' and a.target_ref = target::text and a.status = 'approved'
    and a.approved_by is not null and a.approved_by <> a.requested_by
    and a.created_at > now() - interval '7 days'
  order by a.created_at
  limit 1
  for update;
  if hit is null then
    return false;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- M3 · read_only no banco
-- ---------------------------------------------------------------------------
-- Bloqueia escrita da EQUIPE (usuário com papel) quando `read_only` está ligado ou a chave sumiu
-- (falha fechada). Service role e pipeline (sem auth.uid()) ficam isentos, assim como leitores.
-- Exceções documentadas: approvals, feature_flags, audit_log (contingência e Aprovações seguem
-- operando). rules, rec_weights e ai_prompts só travam INSERT (proposta): a ativação passa por
-- Aprovações. ai_agents só trava o que não for a troca de prompt_version (ai_agent_set_prompt).
create or replace function public.read_only_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select f.enabled = false from feature_flags f where f.key = 'read_only'), false)
$$;

create or replace function public.guard_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null and public.is_staff(uid) and public.read_only_active() then
    if tg_table_name = 'ai_agents' and tg_op = 'UPDATE'
       and (to_jsonb(new) - 'prompt_version') = (to_jsonb(old) - 'prompt_version') and new.prompt_version is distinct from old.prompt_version then
      null;
    else
      raise exception 'modo leitura: a escrita da equipe está suspensa (%)', tg_table_name
        using errcode = '42501', hint = 'feature_flags.read_only';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'articles', 'article_media', 'article_sources', 'article_suggestions', 'article_tags', 'corrections',
    'media_assets', 'tags', 'tag_aliases', 'sections', 'topics', 'sources', 'sponsored_campaigns',
    'site_settings', 'app_settings', 'home_layouts', 'staff_invites', 'teams', 'team_members',
    'user_roles', 'rec_experiments', 'rec_campaigns', 'event_listings', 'ai_agents', 'ai_models'
  ] loop
    execute format('drop trigger if exists zz_read_only on %I', t);
    execute format(
      'create trigger zz_read_only before insert or update or delete on %I for each row execute function public.guard_read_only()', t);
  end loop;
  foreach t in array array['rules', 'rec_weights', 'ai_prompts'] loop
    execute format('drop trigger if exists zz_read_only on %I', t);
    execute format(
      'create trigger zz_read_only before insert on %I for each row execute function public.guard_read_only()', t);
  end loop;
  foreach t in array array['reports', 'event_submissions'] loop
    execute format('drop trigger if exists zz_read_only on %I', t);
    execute format(
      'create trigger zz_read_only before update or delete on %I for each row execute function public.guard_read_only()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- B1 · feature_flags: quem mudou e auditoria
-- ---------------------------------------------------------------------------
create or replace function public.guard_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    new.updated_by := uid;
  end if;
  new.updated_at := now();
  if new.enabled is distinct from old.enabled then
    insert into audit_log (actor, action, object_ref, details)
    values (coalesce(uid::text, 'system'), 'flag.set', 'flag:' || new.key,
            jsonb_build_object('value', new.enabled, 'previous', old.enabled, 'source', 'db'));
  end if;
  return new;
end
$$;

drop trigger if exists feature_flags_stamp on feature_flags;
create trigger feature_flags_stamp before update on feature_flags
  for each row execute function public.guard_feature_flags();

-- ---------------------------------------------------------------------------
-- M2-R3 · patrocinado nunca em Política (slug, subeditoria ou categoria de autonomia)
-- ---------------------------------------------------------------------------
alter table sponsored_campaigns drop constraint if exists sponsored_campaigns_allowed_sections_check;

create or replace function public.guard_sponsored_sections()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    with recursive s as (
      select sec.slug, sec.parent_slug, sec.autonomy_category, 0 as depth
        from sections sec where sec.slug = any (new.allowed_sections)
      union all
      select p.slug, p.parent_slug, p.autonomy_category, s.depth + 1
        from sections p join s on p.slug = s.parent_slug where s.depth < 8
    )
    select 1 from s where s.slug = 'politica' or s.autonomy_category = 'politica'
  ) or 'politica' = any (new.allowed_sections) then
    raise exception 'sponsored_campaigns: patrocinado nunca em Política (nem em subeditoria)'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists sponsored_no_politica on sponsored_campaigns;
create trigger sponsored_no_politica before insert or update of allowed_sections on sponsored_campaigns
  for each row execute function public.guard_sponsored_sections();

-- ---------------------------------------------------------------------------
-- B2-R3 · funções de painel só para a equipe (a checagem de papel fica dentro delas)
-- ---------------------------------------------------------------------------
revoke execute on function public.rec_variant_events(timestamptz, timestamptz), public.rec_panel_stats(timestamptz)
  from public, anon;

revoke execute on function public.approval_content_digest(text, text), public.approvals_set_digest(),
  public.approval_digest_ok(text[], text), public.approval_consume(text[], text),
  public.guard_read_only(), public.guard_feature_flags(), public.guard_sponsored_sections(),
  public.read_only_active()
  from public, anon;
grant execute on function public.approval_content_digest(text, text), public.approval_digest_ok(text[], text),
  public.approval_consume(text[], text), public.read_only_active()
  to authenticated, service_role;
