-- P5-T10 · Contingência (A15, architecture §9): botões de emergência com registro.
--
-- 1. `guard_feature_flags`: religar `auto_publish` é "autonomia para automático" (spec §8) e só
--    entra por aprovação de duas pessoas (`approval_apply`, security definer, passa; uma pessoa
--    direto pela API não). Desligar (pausar) é imediato para admin.
-- 2. `contingency_pause_cycle(p_reason)`: ao pausar a publicação automática no meio de um ciclo,
--    as matérias do ciclo em andamento que as regras já mandaram publicar e ainda não foram
--    publicadas vão para revisão, com a justificativa registrada em `decisions` (Review Focus 4).
--    Quem tem edição humana nunca é tocada.
-- 3. `rules_rollback()`: volta para a versão aprovada anterior à ativa (admin), sem aprovação
--    nova: a versão de destino já passou por duas pessoas.
-- 4. Auditoria: `flag.set`, `rules.rollback` (união com 0029).

-- ---------------------------------------------------------------------------
-- 1. Religar auto_publish exige aprovação
-- ---------------------------------------------------------------------------
create or replace function public.guard_feature_flags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
begin
  if uid is null then
    return new;
  end if;
  if new.key = 'auto_publish' and new.enabled and not old.enabled then
    perform public.two_person_error('feature_flags: religar a publicação automática exige aprovação safety.disable de outra pessoa');
  end if;
  return new;
end
$$;
drop trigger if exists feature_flags_two_person on public.feature_flags;
create trigger feature_flags_two_person before update on public.feature_flags
  for each row execute function public.guard_feature_flags();
revoke execute on function public.guard_feature_flags() from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Itens restantes do ciclo em andamento → revisão
-- ---------------------------------------------------------------------------
create or replace function public.contingency_pause_cycle(p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is not null and not public.has_role(uid, 'admin') then
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
$$;
revoke execute on function public.contingency_pause_cycle(text) from public, anon;
grant execute on function public.contingency_pause_cycle(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Rollback de regras
-- ---------------------------------------------------------------------------
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
  update rules set active = false where version = v_from;
  update rules set active = true where version = v_to;
  return jsonb_build_object('from', v_from, 'to', v_to);
end
$$;
revoke execute on function public.rules_rollback() from public, anon;
grant execute on function public.rules_rollback() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Auditoria: união de 0029 + contingência
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
    'flag.set', 'rules.rollback'
  ]::text[]
$$;
