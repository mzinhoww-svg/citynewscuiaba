-- 0048 · Correções do gate do P5 (docs/reports/P5-gate-review.md).
--
-- Uma migration só, sem alterar 0027–0046 (já em produção). O que muda:
--  1. Convidante ex-staff: `staff_invites.invited_by` aceita null (achado 1, LGPD).
--  2. Aprovação amarrada ao conteúdo: `approvals.content_hash` gravado no pedido, conferido em
--     `approval_apply`, `prompt_publish` e `rec_weights_activate`; conteúdo congelado enquanto há
--     pedido aberto (achado 3).
--  3. `role.admin`: aprovação vale 24 h e o aprovador precisa ser admin; revogar admin também é
--     mudança crítica (achados 4 e 5).
--  4. Rollback de regras que afrouxa, trava dura de Segurança, mescla de tag sensível (6, 7, 8).
--  5. Auditoria: leitura direta só para admin; os demais papéis leem `audit_log_view`, que
--     mascara IP e oculta o hash (achado 10).
--  6. Políticas de segurança da A11: retenção com teto de 90 dias aplicada no cron, 2FA marcado
--     como não aplicado, duração da sessão lida pela aplicação (achado 2).
--  7. Publicidade em subeditoria proibida (13), convites com prazo e aceite (14) e CHECK dos
--     pesos de recomendação (21).
--  8. Auditoria: `studio_audit_actions()` segue a união da 0045 (nada novo nesta migration).

-- ---------------------------------------------------------------------------
-- 1. Convidante ex-staff
-- ---------------------------------------------------------------------------
alter table public.staff_invites alter column invited_by drop not null;

-- ---------------------------------------------------------------------------
-- 2. Aprovação amarrada ao conteúdo
-- ---------------------------------------------------------------------------
alter table public.approvals add column if not exists content_hash text;

-- sha256 do conteúdo que a aprovação libera (sem aprovador, ativo e situação, que mudam ao decidir).
-- Nulo quando o alvo não carrega conteúdo (flag, papel, fonte) ou ainda não existe.
create or replace function public.approval_target_hash(p_kind text, p_target text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m text[];
  j jsonb;
begin
  if p_target ~ '^rules:[0-9]+$' then
    select to_jsonb(r) - array['approved_by', 'active'] into j
      from public.rules r where r.version = substr(p_target, 7)::int;
  elsif p_target ~ '^prompt:[a-z_]+:[0-9]+$' then
    m := regexp_match(p_target, '^prompt:([a-z_]+):([0-9]+)$');
    select to_jsonb(p) - array['approved_by', 'status'] into j
      from public.ai_prompts p where p.agent_id = m[1] and p.version = m[2]::int;
  elsif p_target ~ '^rec:[a-z0-9][a-z0-9.-]{0,60}$' then
    select to_jsonb(w) - array['approved_by', 'active'] into j
      from public.rec_weights w where w.version = substr(p_target, 5);
  end if;
  if j is null then
    return null;
  end if;
  return encode(sha256(convert_to(j::text, 'utf8')), 'hex');
end
$$;
revoke execute on function public.approval_target_hash(text, text) from public, anon;
grant execute on function public.approval_target_hash(text, text) to authenticated, service_role;

-- O hash é calculado no banco, no pedido: o cliente não escolhe.
create or replace function public.approvals_set_content_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.content_hash := public.approval_target_hash(new.kind, new.target_ref);
  return new;
end
$$;
drop trigger if exists approvals_content_hash on public.approvals;
create trigger approvals_content_hash before insert on public.approvals
  for each row execute function public.approvals_set_content_hash();

-- Confere que o conteúdo do alvo é o do pedido. Alvo com conteúdo e sem hash (pedido feito antes
-- de o alvo existir) falha fechado: peça de novo.
create or replace function public.approval_assert_content(a public.approvals)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if a.target_ref !~ '^(rules:[0-9]+|prompt:[a-z_]+:[0-9]+|rec:[a-z0-9][a-z0-9.-]{0,60})$' then
    return;
  end if;
  v := public.approval_target_hash(a.kind, a.target_ref);
  if a.content_hash is null or v is distinct from a.content_hash then
    raise exception 'approvals: o conteúdo de % mudou depois do pedido (ou o pedido não o registrou); peça a aprovação de novo', a.target_ref
      using errcode = '42501';
  end if;
end
$$;
revoke execute on function public.approval_assert_content(public.approvals) from public, anon;

-- Enquanto há pedido pendente ou aprovado, o proponente também não muda o conteúdo (editar exige
-- recusar o pedido e pedir de novo). Sem security definer: `critical_actor()` olha `current_user`.
create or replace function public.guard_frozen_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target text;
  ex text[];
begin
  if public.critical_actor() is null then
    return new;
  end if;
  if tg_table_name = 'rules' then
    v_target := 'rules:' || old.version;
    ex := array['approved_by', 'active'];
  elsif tg_table_name = 'rec_weights' then
    v_target := 'rec:' || old.version;
    ex := array['approved_by', 'active'];
  else
    v_target := 'prompt:' || old.agent_id || ':' || old.version;
    ex := array['approved_by', 'status'];
  end if;
  if (to_jsonb(new) - ex) is distinct from (to_jsonb(old) - ex)
     and exists (select 1 from public.approvals a
                  where a.target_ref = v_target and a.status in ('pending', 'approved')) then
    perform public.two_person_error(format('%s: há pedido de aprovação aberto; recuse o pedido antes de editar', tg_table_name));
  end if;
  return new;
end
$$;
drop trigger if exists rules_frozen_content on public.rules;
create trigger rules_frozen_content before update on public.rules
  for each row execute function public.guard_frozen_content();
drop trigger if exists rec_weights_frozen_content on public.rec_weights;
create trigger rec_weights_frozen_content before update on public.rec_weights
  for each row execute function public.guard_frozen_content();
drop trigger if exists ai_prompts_frozen_content on public.ai_prompts;
create trigger ai_prompts_frozen_content before update on public.ai_prompts
  for each row execute function public.guard_frozen_content();

-- approval_apply: 0029 + conferência do conteúdo; `safety.disable` também aplica versão de regras
-- (tema sensível removido, achado 7), e só admin aprova.
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
$$;
revoke execute on function public.approval_apply(uuid) from public, anon;
grant execute on function public.approval_apply(uuid) to authenticated, service_role;

-- prompt_publish: 0036 + conferência do conteúdo.
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
$$;
revoke execute on function public.prompt_publish(uuid) from public, anon;
grant execute on function public.prompt_publish(uuid) to authenticated, service_role;

-- rec_weights_activate: 0037 + conferência do conteúdo.
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
  perform public.approval_assert_content(a);

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
-- 3. role.admin: prazo de 24 h, aprovador admin, revogação também é crítica
-- ---------------------------------------------------------------------------
-- `p_ref`: uuid da pessoa (conceder) ou `revoke:<uuid>` (revogar). Uso único.
create or replace function public.consume_role_admin_ref(p_ref text)
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
  where a.kind = 'role.admin' and a.target_ref = p_ref and a.status = 'approved'
    and a.approved_by is not null and a.approved_by <> a.requested_by
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
$$;
revoke execute on function public.consume_role_admin_ref(text) from public, anon;
grant execute on function public.consume_role_admin_ref(text) to authenticated, service_role;

create or replace function public.consume_role_admin_approval(target uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.consume_role_admin_ref(target::text)
$$;
revoke execute on function public.consume_role_admin_approval(uuid) from public, anon;
grant execute on function public.consume_role_admin_approval(uuid) to authenticated, service_role;

create or replace function public.guard_user_roles_revoke()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
begin
  if uid is not null and old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id) then
    if old.user_id = uid then
      perform public.two_person_error('user_roles: ninguém revoga o próprio papel de admin');
    end if;
    if not public.consume_role_admin_ref('revoke:' || old.user_id::text) then
      perform public.two_person_error('user_roles: revogar admin exige aprovação role.admin decidida por outra pessoa');
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
drop trigger if exists user_roles_revoke_two_person on public.user_roles;
create trigger user_roles_revoke_two_person before update or delete on public.user_roles
  for each row execute function public.guard_user_roles_revoke();

-- ---------------------------------------------------------------------------
-- 4. Regras: rollback que afrouxa, Segurança nunca automática, mescla de tema sensível
-- ---------------------------------------------------------------------------
-- A versão de destino `tgt` é mais frouxa que a `cur`? (revisão obrigatória desligada, tema
-- sensível a menos, categoria com modo, mínimo de fontes, primária, imagem ou confiança menos
-- exigentes, ou categoria automática que a atual não tem).
create or replace function public.rules_loosens(cur jsonb, cur_fr boolean, tgt jsonb, tgt_fr boolean)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  t jsonb;
  c jsonb;
  rank_c int;
  rank_t int;
begin
  if cur_fr and not tgt_fr then
    return true;
  end if;
  if coalesce((cur ->> 'forceReview')::boolean, true) and not coalesce((tgt ->> 'forceReview')::boolean, true) then
    return true;
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(cur -> 'sensitiveTopics', '[]'::jsonb)) x
     where not (coalesce(tgt -> 'sensitiveTopics', '[]'::jsonb) ? x)
  ) then
    return true;
  end if;
  for k, t in select * from jsonb_each(coalesce(tgt -> 'categories', '{}'::jsonb)) loop
    c := cur -> 'categories' -> k;
    rank_t := case t ->> 'mode' when 'blocked' then 0 when 'review' then 1 when 'auto_notify' then 2 else 3 end;
    if c is null then
      if rank_t >= 2 then
        return true;
      end if;
      continue;
    end if;
    rank_c := case c ->> 'mode' when 'blocked' then 0 when 'review' then 1 when 'auto_notify' then 2 else 3 end;
    if rank_t > rank_c
       or coalesce((t ->> 'minSources')::int, 0) < coalesce((c ->> 'minSources')::int, 0)
       or (coalesce((c ->> 'requirePrimary')::boolean, false) and not coalesce((t ->> 'requirePrimary')::boolean, false))
       or (coalesce((c ->> 'requireApprovedImage')::boolean, false) and not coalesce((t ->> 'requireApprovedImage')::boolean, false))
       or coalesce((t ->> 'minScore')::numeric, 0) < coalesce((c ->> 'minScore')::numeric, 0) then
      return true;
    end if;
  end loop;
  return false;
end
$$;

create or replace function public.rules_rollback()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
   where r.version < v_from and r.approved_by is not null and r.approved_by <> r.proposed_by
   order by r.version desc
   limit 1;
  if v_to is null then
    raise exception 'rules: não há versão aprovada anterior à v%', v_from using errcode = 'P0002';
  end if;
  select * into r_from from rules where version = v_from;
  select * into r_to from rules where version = v_to;
  if public.rules_loosens(r_from.body, r_from.force_review, r_to.body, r_to.force_review) then
    raise exception 'rules: a v% afrouxa as regras da v% ativa; rollback direto recusado, proponha a v% como versão nova (duas pessoas)',
      v_to, v_from, v_to using errcode = '42501';
  end if;
  update rules set active = false where version = v_from;
  update rules set active = true where version = v_to;
  return jsonb_build_object('from', v_from, 'to', v_to);
end
$$;
revoke execute on function public.rules_rollback() from public, anon;
grant execute on function public.rules_rollback() to authenticated, service_role;

-- Segurança nunca publica sozinha (CLAUDE.md §5.8): nenhuma versão nova de regras com a categoria
-- fora de `blocked`. `not valid`: linhas antigas ficam como estão, toda linha nova é conferida.
alter table public.rules drop constraint if exists rules_seguranca_blocked;
alter table public.rules add constraint rules_seguranca_blocked
  check (coalesce(body -> 'categories' -> 'seguranca' ->> 'mode', 'blocked') = 'blocked') not valid;

-- Palavras de um rótulo, como em src/lib/rules/index.ts (`words`): sem acento, minúsculas.
create or replace function public.tag_words(p text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(regexp_replace(w, '[oa]es$', 'ao')), '{}')
    from unnest(regexp_split_to_array(lower(unaccent(coalesce(p, ''))), '[^a-z0-9]+')) w
   where w <> ''
$$;

-- O tema casa se as palavras dele aparecem em sequência no rótulo, cada uma pela raiz
-- (`sensitiveMatch` em src/lib/rules/index.ts).
create or replace function public.sensitive_tag_match(p_tag text, p_term text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  t text[] := public.tag_words(p_tag);
  w text[] := public.tag_words(p_term);
  i int;
  j int;
  ok boolean;
  r text;
begin
  if coalesce(array_length(w, 1), 0) = 0 then
    return false;
  end if;
  for i in 1 .. coalesce(array_length(t, 1), 0) - array_length(w, 1) + 1 loop
    ok := true;
    for j in 1 .. array_length(w, 1) loop
      r := case when length(w[j]) > 3 then regexp_replace(w[j], '[aeo]$', '') else w[j] end;
      if not (left(t[i + j - 1], length(r)) = r
              and substr(t[i + j - 1], length(r) + 1) in ('', 'a', 'e', 'o', 'as', 'es', 'os')) then
        ok := false;
        exit;
      end if;
    end loop;
    if ok then
      return true;
    end if;
  end loop;
  return false;
end
$$;

-- Mescla de tags: recusa a que tira uma tag de tema sensível das regras ativas (a mescla
-- reescreveria `tags` e faria os itens em curso deixarem de casar com `sensitiveTopics`).
create or replace function public.taxonomy_merge_tags(p_from text, p_into text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n_articles int;
  n_items int;
  v_topics jsonb;
  v_term text;
  v_first text;
  v_from_hit boolean := false;
  v_into_hit boolean := false;
begin
  if coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated')
     and not public.has_any_role(auth.uid(), '{admin,editor_chefe}') then
    raise exception 'taxonomia: sem permissão' using errcode = '42501';
  end if;
  if p_from is null or p_into is null or btrim(p_from) = '' or btrim(p_into) = '' or p_from = p_into then
    raise exception 'taxonomia: tags inválidas para mesclar' using errcode = '22023';
  end if;
  select body -> 'sensitiveTopics' into v_topics from public.rules where active limit 1;
  for v_term in select jsonb_array_elements_text(coalesce(v_topics, '[]'::jsonb)) loop
    v_from_hit := v_from_hit or public.sensitive_tag_match(p_from, v_term);
    v_into_hit := v_into_hit or public.sensitive_tag_match(p_into, v_term);
    if v_from_hit and v_first is null then
      v_first := v_term;
    end if;
  end loop;
  if v_from_hit and not v_into_hit then
    raise exception 'taxonomia: "%" é tema sensível das regras ativas (%); mesclar em "%" faria os itens deixarem de ser retidos',
      p_from, v_first, p_into using errcode = '42501';
  end if;
  update articles
     set tags = (select array_agg(distinct t order by t) from unnest(array_replace(tags, p_from, p_into)) t)
   where p_from = any (tags);
  get diagnostics n_articles = row_count;
  update collected_items
     set tags = (select array_agg(distinct t order by t) from unnest(array_replace(tags, p_from, p_into)) t)
   where p_from = any (tags);
  get diagnostics n_items = row_count;
  return n_articles + n_items;
end
$$;
revoke execute on function public.taxonomy_merge_tags(text, text) from public, anon;
grant execute on function public.taxonomy_merge_tags(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Auditoria: leitura direta só para admin; os demais leem a view mascarada
-- ---------------------------------------------------------------------------
-- IPv4 vira a.b.x.x e IPv6 vira os dois primeiros grupos + :x:x (como `maskIps`, src/lib/control).
create or replace function public.mask_ips(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''),
          '([0-9A-Fa-f]{1,4}):([0-9A-Fa-f]{1,4})(:[0-9A-Fa-f]{1,4}){6}', '\1:\2:x:x', 'g'),
        '([0-9A-Fa-f]{1,4}):([0-9A-Fa-f]{1,4})(:[0-9A-Fa-f]{1,4})*::[0-9A-Fa-f:]*', '\1:\2:x:x', 'g'),
      '([0-9A-Fa-f]{1,4})::([0-9A-Fa-f]{1,4})[0-9A-Fa-f:]*', '\1:\2:x:x', 'g'),
    '(^|[^0-9.])([0-9]{1,3})\.([0-9]{1,3})\.[0-9]{1,3}\.[0-9]{1,3}($|[^0-9.])', '\1\2.\3.x.x\4', 'g')
$$;

create or replace function public.mask_ips_jsonb(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select public.mask_ips(p::text)::jsonb
$$;

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

-- Mesmos papéis de antes (audit.view); IP e hash só para admin. Roda com os direitos do dono
-- (por isso o filtro de papel fica dentro da view).
create or replace view public.audit_log_view as
  select a.id, a.at, a.actor, a.action, a.object_ref,
         case when public.has_role(auth.uid(), 'admin') then a.details
              else public.mask_ips_jsonb(a.details) end as details,
         case when public.has_role(auth.uid(), 'admin') then a.ip_hash end as ip_hash
    from public.audit_log a
   where public.has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia,leitura}');
revoke all on public.audit_log_view from public, anon;
grant select on public.audit_log_view to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Políticas de segurança (A11)
-- ---------------------------------------------------------------------------
-- Retenção dos eventos individuais: a chave `security.retention_days` vale até o teto da spec §10
-- (90 dias). Valor antigo acima do teto (a 0039 semeou 365) cai para 90.
update public.app_settings set value = '90'::jsonb
 where key = 'security.retention_days' and jsonb_typeof(value) = 'number' and (value)::text::numeric > 90;
update public.app_settings set value = 'false'::jsonb
 where key = 'security.require_2fa' and value <> 'false'::jsonb;

create or replace function public.security_retention_days()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(90, greatest(30, coalesce(
    (select (value)::text::numeric::int from public.app_settings
      where key = 'security.retention_days' and jsonb_typeof(value) = 'number'), 90)))
$$;
revoke execute on function public.security_retention_days() from public, anon, authenticated;
grant execute on function public.security_retention_days() to service_role;

-- Duração máxima da sessão da equipe (horas), lida pela aplicação em `getSession`.
create or replace function public.security_session_hours()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, least(720, coalesce(
    (select (value)::text::numeric::int from public.app_settings
      where key = 'security.session_hours' and jsonb_typeof(value) = 'number'), 12)))
$$;
revoke execute on function public.security_session_hours() from public, anon;
grant execute on function public.security_session_hours() to authenticated, service_role;

-- Trigger próprio (não redefine `guard_app_settings`): teto de 90 dias e 2FA ainda não aplicado.
create or replace function public.guard_security_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key = 'security.retention_days'
     and (jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric not between 30 and 90) then
    raise exception 'security.retention_days: eventos individuais ficam até 90 dias (spec §10); use de 30 a 90' using errcode = '23514';
  end if;
  if new.key = 'security.require_2fa' and new.value is distinct from 'false'::jsonb then
    raise exception 'security.require_2fa: ainda não aplicado (o Estúdio não tem cadastro de segundo fator); a chave fica desligada' using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists app_settings_security_guard on public.app_settings;
create trigger app_settings_security_guard before insert or update on public.app_settings
  for each row execute function public.guard_security_settings();

-- O cron de retenção passa a ler a chave (0009 usava 90 fixo).
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'events-retention'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'events-retention', '40 3 * * *',
      'select anonymize_old_events(public.security_retention_days())');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Publicidade, convites e pesos
-- ---------------------------------------------------------------------------
-- Subeditoria herda `autonomy_category`: campanha em `politica-*` cai na mesma proibição.
create or replace function public.guard_sponsored_sections()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bad text;
begin
  select s into bad
    from unnest(new.allowed_sections) s
   where s in ('politica', 'seguranca', 'saude')
      or exists (select 1 from public.sections sec
                  where sec.slug = s and sec.autonomy_category in ('politica', 'seguranca', 'saude'))
   limit 1;
  if bad is not null then
    raise exception 'publicidade: a editoria "%" (Política, Segurança ou Saúde, com subeditorias) não recebe patrocinado', bad
      using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists sponsored_sections_guard on public.sponsored_campaigns;
create trigger sponsored_sections_guard before insert or update on public.sponsored_campaigns
  for each row execute function public.guard_sponsored_sections();

-- Convites: `revoked_at` quando o prazo vence sem aceite; `accepted_at` no primeiro acesso.
alter table public.staff_invites add column if not exists revoked_at timestamptz;

create or replace function public.staff_invite_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.staff_invites
       set accepted_at = now()
     where user_id = new.id and accepted_at is null and revoked_at is null and expires_at >= now();
  end if;
  return new;
end
$$;
do $$ begin
  drop trigger if exists staff_invite_accept on auth.users;
  create trigger staff_invite_accept after update of last_sign_in_at on auth.users
    for each row execute function public.staff_invite_accept();
exception when insufficient_privilege then
  raise notice 'sem permissão em auth.users: o aceite do convite fica para staff_invites_sweep()';
end $$;

-- Varredura: aceita quem entrou dentro do prazo (caso o trigger não exista) e revoga o papel de
-- quem não entrou até `expires_at`. Devolve quantos convites venceram.
create or replace function public.staff_invites_sweep()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.staff_invites si
     set accepted_at = u.last_sign_in_at
    from auth.users u
   where u.id = si.user_id and si.accepted_at is null and si.revoked_at is null
     and u.last_sign_in_at is not null and u.last_sign_in_at <= si.expires_at;
  with expired as (
    update public.staff_invites
       set revoked_at = now()
     where accepted_at is null and revoked_at is null and expires_at < now()
    returning user_id, role
  ), gone as (
    delete from public.user_roles ur
     using expired e
     where ur.user_id = e.user_id and ur.role = e.role
    returning ur.user_id, ur.role
  ), logged as (
    insert into public.audit_log (actor, action, object_ref, details)
    select 'system', 'user.role.revoke', 'user:' || g.user_id::text,
           jsonb_build_object('role', g.role, 'reason', 'invite_expired')
      from gone g
    returning 1
  )
  select count(*) into n from expired;
  return coalesce(n, 0);
end
$$;
revoke execute on function public.staff_invites_sweep() from public, anon, authenticated;
grant execute on function public.staff_invites_sweep() to service_role;

do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'staff-invites-sweep'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'staff-invites-sweep', '17 * * * *',
      'select public.staff_invites_sweep()');
  end if;
end $$;

-- Pesos de recomendação (spec §7.3): chaves conhecidas, não negativos, soma 1,00 ± 0,001 e teto
-- de 25 % por fonte (`cap`). `not valid`: versões antigas ficam, toda linha nova é conferida.
create or replace function public.rec_weights_valid(p_weights jsonb, p_cap numeric)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_weights) is distinct from 'object' or p_cap is null or p_cap <= 0 or p_cap > 0.25
              then false
         else not exists (
                select 1 from jsonb_each(p_weights) e
                 where e.key not in ('popularity', 'individual', 'recency', 'engagement', 'operational', 'diversity')
                    or jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric < 0)
              and abs((select coalesce(sum((e.value)::text::numeric), 0) from jsonb_each(p_weights) e) - 1) <= 0.001
         end
$$;
alter table public.rec_weights drop constraint if exists rec_weights_valid;
alter table public.rec_weights add constraint rec_weights_valid
  check (public.rec_weights_valid(weights, cap)) not valid;
