-- A-218 · Segurança, segunda rodada (08/10/2026): achados P2/P3 da auditoria de 04/10/2026
-- (docs/security-audit/achados.json) adiados pela spec 2026-10-04-seguranca-p1-design.md.
-- Aditiva e idempotente: só `create or replace`, `drop policy if exists` + `create policy`,
-- revoke/grant e constraint `not valid`. Nenhuma migration antiga muda.

-- ---------------------------------------------------------------------------
-- 0. Quem chama: sistema (sem JWT, ou JWT do service role) ou equipe.
-- ---------------------------------------------------------------------------
-- Sem JWT nenhum (pg_cron, psql, migrations) ou com o JWT do service role. Um JWT `authenticated`
-- sem `sub` (auth.uid() nulo) NÃO é sistema: o padrão antigo `auth.uid() is not null and ...`
-- deixava esse caso passar (C1-08).
create or replace function public.caller_is_system()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
$$;

-- Sistema, ou pessoa com algum papel do Estúdio.
create or replace function public.caller_is_staff_or_system()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then public.caller_is_system()
    else exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
  end
$$;

-- C1-05: consultar o papel de OUTRA conta é só da equipe e do sistema. A própria conta, sempre.
create or replace function public.role_lookup_allowed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (uid is not null and uid = auth.uid()) or public.caller_is_staff_or_system()
$$;

revoke execute on function public.caller_is_system(), public.caller_is_staff_or_system(),
  public.role_lookup_allowed(uuid) from public, anon, authenticated;
grant execute on function public.caller_is_system(), public.caller_is_staff_or_system(),
  public.role_lookup_allowed(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 1. C1-05 · Oráculo de papéis. As políticas continuam chamando as mesmas funções (com
-- `auth.uid()`, sempre liberado); leitor perguntando por outra conta recebe `false`/`null`.
-- `can_edit_section`, `control_can_*` e `can_approve_media` passam por `has_role`/`has_any_role`.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(uid uuid, role app_role, section text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_lookup_allowed(has_role.uid) and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = has_role.uid
      and ur.role = has_role.role
      and (has_role.section is null or has_role.section = any (ur.sections))
  )
$$;

create or replace function public.is_staff(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_lookup_allowed(is_staff.uid)
    and exists (select 1 from public.user_roles ur where ur.user_id = is_staff.uid)
$$;

create or replace function public.has_any_role(uid uuid, roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_lookup_allowed(has_any_role.uid)
    and exists (select 1 from public.user_roles ur where ur.user_id = has_any_role.uid and ur.role = any (has_any_role.roles))
$$;

-- Autor e editoria de matéria: equipe e sistema (políticas do Estúdio); leitor só de matéria pública.
create or replace function public.article_section(article uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.section_slug from public.articles a
   where a.id = article
     and (a.status in ('published', 'updated') or public.caller_is_staff_or_system())
$$;

create or replace function public.article_owner(article uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.author_id from public.articles a
   where a.id = article
     and (a.status in ('published', 'updated') or public.caller_is_staff_or_system())
$$;

-- push_can lê `user_roles` direto no caso do editor: a mesma guarda.
create or replace function public.push_can(p_uid uuid, p_action text, p_section text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_uid is null or not public.role_lookup_allowed(p_uid) then
    return false;
  end if;
  if p_action = 'push.request' then
    if has_any_role(p_uid, '{admin,editor_chefe}') then
      return true;
    end if;
    return p_section is not null and exists (
      select 1 from user_roles ur where ur.user_id = p_uid and ur.role = 'editor' and p_section = any (ur.sections)
    );
  elsif p_action in ('push.approve', 'push.settings') then
    return has_any_role(p_uid, '{admin,editor_chefe}');
  elsif p_action = 'push.metrics' then
    return has_any_role(p_uid, '{admin,editor_chefe,analista}');
  end if;
  return false;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. C1-04 · Colunas de articles que nenhum código público lê (a busca usa `search_hybrid`,
-- security definer). As demais seguem com o grant da 0153 porque o portal as seleciona.
-- ---------------------------------------------------------------------------
revoke select (embedding, tsv, scheduled_for) on public.articles from anon;

-- ---------------------------------------------------------------------------
-- 3. C1-06 · Eventos individuais só para quem analisa (admin, analista) e para o "por que" da
-- recomendação (operador_ia, rec.weights). O painel de recomendação (metrics.view) lê agregados
-- sem anon_id por funções security definer com a mesma checagem de `control_can_view`.
-- ---------------------------------------------------------------------------
drop policy if exists events_read_metrics on public.events;
create policy events_read_metrics on public.events for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia,analista}'));

create or replace function public.rec_events_summary(p_since timestamptz)
returns table (algo_version text, name text, list text, reason text, dismiss_reason text,
               source_slug text, personalization boolean, account boolean, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.algo_version, e.name,
         e.props ->> 'list', e.props ->> 'reason', e.props ->> 'dismissReason',
         case when e.name = 'recommendation_clicked' then e.source_slug end,
         coalesce((e.consent ->> 'personalization')::boolean, false),
         e.user_id is not null,
         count(*)
  from events e
  where e.received_at >= p_since
    and e.name in ('source_viewed', 'recommendation_clicked', 'recommendation_dismissed')
    and (case when auth.uid() is null then public.caller_is_system()
              else public.control_can_view(auth.uid()) end)
  group by 1, 2, 3, 4, 5, 6, 7, 8
$$;

create or replace function public.rec_return_7d(p_since timestamptz)
returns table (algo_version text, followed bigint, returned bigint)
language sql
stable
security definer
set search_path = public
as $$
  with follows as (
    select e.anon_id, e.algo_version, min(e.at) as at
    from events e
    where e.received_at >= p_since and e.name = 'source_followed'
      and (e.props ->> 'fromRecommendation')::boolean and e.anon_id is not null
      and e.at <= now() - interval '7 days'
      and (case when auth.uid() is null then public.caller_is_system()
                else public.control_can_view(auth.uid()) end)
    group by 1, 2
  )
  select f.algo_version, count(*)::bigint,
         count(*) filter (where exists (
           select 1 from events r
           where r.anon_id = f.anon_id and r.at > f.at + interval '1 day' and r.at <= f.at + interval '7 days'
         ))::bigint
  from follows f
  group by 1
$$;
revoke execute on function public.rec_events_summary(timestamptz), public.rec_return_7d(timestamptz) from public, anon;
grant execute on function public.rec_events_summary(timestamptz), public.rec_return_7d(timestamptz) to authenticated, service_role;

-- Perfis: a equipe lê os perfis da equipe (nomes em auditoria, aprovações, bylines); perfil de
-- leitor só para quem atende leitor (editor-chefe, moderador; admin já tem `profiles_admin`).
drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_staff on public.profiles for select to authenticated
  using (
    is_staff((select auth.uid()))
    and (is_staff(profiles.id) or has_any_role((select auth.uid()), '{editor_chefe,moderador}'))
  );

-- ---------------------------------------------------------------------------
-- 4. C1-07 · security definer sem checagem de papel.
-- ---------------------------------------------------------------------------
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
  -- Hash do conteúdo de regras, prompts e pesos: só equipe e sistema (oráculo de conteúdo).
  if not public.caller_is_staff_or_system() then
    return null;
  end if;
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

-- Trava de `app_settings` só dentro do gatilho de fontes (`guard_source_changes`) ou pelo sistema.
create or replace function public.lock_fast_lane_max()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  if pg_trigger_depth() = 0 and not public.caller_is_system() then
    raise exception 'lock_fast_lane_max: só no gatilho de fontes' using errcode = '42501';
  end if;
  select coalesce((value #>> '{}')::int, 10) into v from app_settings where key = 'sources.fast_lane_max' for update;
  return coalesce(v, 10);
end
$$;

-- Fora do sistema, só os três limites numéricos que `push_request`/`push_reserve` usam.
create or replace function public.push_settings_int(p_key text, p_default int)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v int;
begin
  if p_key not like 'push.%' or to_regclass('public.app_settings') is null then
    return p_default;
  end if;
  if p_key not in ('push.quiet_start', 'push.quiet_end', 'push.default_daily_limit')
     and not public.caller_is_system() then
    return p_default;
  end if;
  begin
    execute 'select (value #>> ''{}'')::int from app_settings where key = $1' into v using p_key;
  exception when others then
    return p_default;
  end;
  return coalesce(v, p_default);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. C1-08 · Revogação completa e guarda de uid nulo.
-- ---------------------------------------------------------------------------
-- Só `approval_apply`, `prompt_publish` e `rec_weights_activate` (security definer) a chamam.
revoke execute on function public.approval_assert_content(public.approvals) from public, anon, authenticated;
-- Função de gatilho: disparar não exige EXECUTE de quem escreve.
revoke execute on function public.staff_invite_accept() from public, anon, authenticated;

-- `consume_source_critical_approval` segue executável por authenticated: quem a chama é
-- `require_source_critical_approval` (security invoker, no gatilho de fontes), e ela já devolve
-- nulo fora de gatilho (`pg_trigger_depth() = 0`).

create or replace function public.control_guard_view()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if not public.caller_is_system() then
      raise exception 'control: sem permissão' using errcode = '42501';
    end if;
  elsif not public.control_can_view(auth.uid()) then
    raise exception 'control: sem permissão' using errcode = '42501';
  end if;
end
$$;

-- Corpos idênticos aos atuais (pg_get_functiondef); só a guarda de uid nulo muda.
CREATE OR REPLACE FUNCTION public.contingency_pause_cycle(p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  n int;
begin
  if (uid is null and not public.caller_is_system()) or (uid is not null and not public.has_role(uid, 'admin')) then
    raise exception 'contingency: sem permissão' using errcode = '42501';
  end if;
  with running as (
    select r.id from ingest_runs r where r.status = 'running'
  ), cycle_articles as (
    select distinct a.id
    from articles a
    join collected_items ci on ci.topic_id = a.topic_id
    join raw_items ri on ri.id = ci.raw_id
    join running r on r.id = ri.run_id
    where a.status in ('draft', 'in_review')
      and a.publish_mode is null
      and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
  ), to_review as (
    select ca.id
    from cycle_articles ca
    -- A última decisão de publicação da matéria é a das regras mandando publicar (uma decisão
    -- posterior da etapa 17, ou desta função, já a tirou da fila de publicação).
    where exists (
      select 1
      from (
        select d.step, d.output ->> 'route' as route
        from decisions d
        where d.object_ref = 'article:' || ca.id::text and d.step in ('rules', 'publish')
        order by d.created_at desc
        limit 1
      ) last
      where last.step = 'rules' and last.route in ('publish', 'publish_notify')
    )
  ), ins as (
    insert into decisions (object_ref, step, input_hash, output, rationale, recommended)
    select 'article:' || t.id::text, 'publish', 'contingency:' || now()::text,
           jsonb_build_object('published', false, 'contingency', 'pause_auto_publish', 'by', uid),
           p_reason, 'review'
    from to_review t
    returning object_ref
  ), upd as (
    update articles a
       set status = 'in_review', review_reason = p_reason, updated_at = now()
      from to_review t
     where a.id = t.id
    returning a.id
  )
  select count(*) into n from upd;
  return coalesce(n, 0);
end
$function$;

CREATE OR REPLACE FUNCTION public.prompt_rollback(p_agent text, p_to integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  target public.ai_prompts%rowtype;
  v_from int;
  v_new int;
begin
  if (uid is null and not public.caller_is_system()) or (uid is not null and not public.has_any_role(uid, '{admin,editor_chefe}')) then
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
$function$;

CREATE OR REPLACE FUNCTION public.rules_rollback()
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
  if (uid is null and not public.caller_is_system()) or (uid is not null and not public.has_role(uid, 'admin')) then
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
-- 6. audit_log_insert (adiada da P1): a equipe grava direto só a auditoria complementar do painel
-- de fontes (`source.*`, src/lib/db/source-admin-store.ts), com papel de `source.manage` e
-- tamanho limitado. O resto passa por `studio_audit` / `push_audit` ou pelo service role.
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (
    actor = (select auth.uid())::text
    and has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}')
    and action like 'source.%'
    and char_length(action) <= 80
    and char_length(object_ref) <= 200
    and pg_column_size(details) <= 16384
  );

-- ---------------------------------------------------------------------------
-- 7. C2-01 · Bairro do perfil com tamanho limitado (a ação valida pela lista de bairros).
-- `not valid`: vale para toda escrita nova sem reprovar linha antiga.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_neighborhood_len;
alter table public.profiles add constraint profiles_neighborhood_len
  check (neighborhood is null or char_length(neighborhood) <= 80) not valid;

-- ---------------------------------------------------------------------------
-- 8. C2-02 · Recibo de push: o recibo continua sem id de inscrição (privacidade), mas a soma de
-- `delivered` e a de `clicked` de um envio não passam do número de entregas mensuráveis
-- (`sent_measurable_n`, inscrições com Métricas que o serviço de push aceitou). Quem forja recibos
-- não infla o envio além do público real. Teto aproximado sob concorrência (sem trava na linha
-- do envio, que o despacho atualiza a cada entrega).
-- ---------------------------------------------------------------------------
create or replace function public.push_receipt_hit(p_send uuid, p_event text, p_device text, p_browser text, p_now timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_cap int;
  v_used bigint;
begin
  if p_event not in ('delivered','clicked') then
    return false;
  end if;
  select s.sent_measurable_n into v_cap
    from push_sends s
   where s.id = p_send and s.started_at is not null
     and s.started_at > p_now - interval '48 hours';
  if not found then
    return false;
  end if;
  select coalesce(sum(case when p_event = 'delivered' then c.delivered else c.clicked end), 0)
    into v_used
    from push_send_counters c
   where c.send_id = p_send;
  if v_used >= coalesce(v_cap, 0) then
    return false;
  end if;
  insert into push_send_counters (send_id, device_class, browser, delivered, clicked)
  values (p_send, coalesce(p_device, 'other'), coalesce(p_browser, 'other'),
          case when p_event = 'delivered' then 1 else 0 end,
          case when p_event = 'clicked' then 1 else 0 end)
  on conflict (send_id, device_class, browser) do update
    set delivered = push_send_counters.delivered + excluded.delivered,
        clicked = push_send_counters.clicked + excluded.clicked;
  return true;
end
$$;
revoke execute on function public.push_receipt_hit(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.push_receipt_hit(uuid, text, text, text, timestamptz) to service_role;
