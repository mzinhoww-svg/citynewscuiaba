drop table if exists public._cn_probe;
alter table public.approvals add column if not exists decision_mode text not null default 'human';
alter table public.approvals add column if not exists outcome text;
alter table public.approvals add column if not exists policy_version int;
alter table public.approvals add column if not exists rule_id text;
alter table public.approvals add column if not exists policy_inputs jsonb not null default '{}'::jsonb;
alter table public.approvals add column if not exists confidence numeric(4,3);
alter table public.approvals add column if not exists reason text;
alter table public.approvals add column if not exists expires_at timestamptz;
alter table public.approvals add column if not exists next_action text;
alter table public.approvals drop constraint if exists approvals_decision_mode_check;
alter table public.approvals add constraint approvals_decision_mode_check
  check (decision_mode in ('human', 'system'));
alter table public.approvals drop constraint if exists approvals_outcome_check;
alter table public.approvals add constraint approvals_outcome_check
  check (outcome is null or outcome in ('auto_apply', 'auto_review', 'human_exception', 'rejected'));
alter table public.approvals drop constraint if exists approvals_status_check;
alter table public.approvals add constraint approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'applied', 'expired'));
create or replace function public.approvals_set_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending' and new.expires_at is null then
    new.expires_at := now() + case when new.kind = 'push.urgent' then interval '60 minutes' else interval '72 hours' end;
  end if;
  if new.status = 'pending' and new.next_action is null then
    new.next_action := case when coalesce(new.outcome, '') = 'human_exception'
      then 'human_exception: decidir até o prazo; depois expira e volta ao sistema'
      else 'decidir até o prazo; depois expira' end;
  end if;
  return new;
end
$$;
drop trigger if exists approvals_deadline on public.approvals;
create trigger approvals_deadline before insert on public.approvals
  for each row execute function public.approvals_set_deadline();
update public.approvals
   set expires_at = coalesce(created_at, now()) + interval '72 hours'
 where status = 'pending' and expires_at is null;
create table if not exists public.governance_policies (
  version int primary key,
  body jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default 'system'
);
create unique index if not exists governance_policies_one_active on public.governance_policies (active) where active;
alter table public.governance_policies enable row level security;
drop policy if exists governance_policies_read_staff on public.governance_policies;
create policy governance_policies_read_staff on public.governance_policies for select to authenticated
  using (public.is_staff((select auth.uid())));
insert into public.governance_policies (version, body, active)
values (1, jsonb_build_object(
  'mode', 'autonomy_first',
  'approvalTtlHours', 72,
  'applyTtlHours', 24,
  'push', jsonb_build_object('urgentMaxPerHour', 4, 'highlightMaxPerDay', 8),
  'kinds', jsonb_build_object(
    'rules.activate', jsonb_build_object('roles', array['admin', 'editor_chefe']),
    'force_review.disable', jsonb_build_object('roles', array['admin', 'editor_chefe']),
    'safety.disable', jsonb_build_object('roles', array['admin']),
    'prompt.publish', jsonb_build_object('roles', array['admin', 'editor_chefe', 'operador_ia']),
    'rec.weights', jsonb_build_object('roles', array['admin', 'operador_ia']),
    'role.admin', jsonb_build_object('roles', array['admin']),
    'source.critical', jsonb_build_object('roles', array['admin', 'editor_chefe'])
  )
), true)
on conflict (version) do nothing;
create or replace function public.governance_policy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select body || jsonb_build_object('version', version)
                     from public.governance_policies where active limit 1),
                  '{"version": 0}'::jsonb)
$$;
revoke execute on function public.governance_policy() from public, anon;
grant execute on function public.governance_policy() to authenticated, service_role;
create table if not exists public.governance_decisions (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default 'system',
  requested_by uuid,
  kind text not null,
  subject_ref text not null,
  decision text not null,
  policy text not null,
  policy_version int not null,
  rule_id text not null,
  inputs jsonb not null default '{}'::jsonb,
  input_hash text not null,
  confidence numeric(4,3),
  reason text not null,
  model text,
  prompt text,
  fallback_level smallint,
  approval_id uuid,
  check (decision in ('auto_approved', 'auto_review', 'human_exception', 'rejected', 'expired', 'auto_rollback'))
);
alter table public.governance_decisions drop constraint if exists governance_decisions_approval_id_fkey;
create index if not exists governance_decisions_at_idx on public.governance_decisions (at desc);
create index if not exists governance_decisions_subject_idx on public.governance_decisions (subject_ref, at desc);
alter table public.governance_decisions enable row level security;
drop policy if exists governance_decisions_read_staff on public.governance_decisions;
create policy governance_decisions_read_staff on public.governance_decisions for select to authenticated
  using (public.is_staff((select auth.uid())));
drop trigger if exists governance_decisions_immutable on public.governance_decisions;
create trigger governance_decisions_immutable before update or delete on public.governance_decisions
  for each row execute function public.forbid_update_delete();
create or replace function public.governance_record(
  p_kind text, p_subject text, p_decision text, p_rule text, p_reason text,
  p_inputs jsonb default '{}'::jsonb, p_confidence numeric default null,
  p_approval uuid default null, p_requested_by uuid default null,
  p_model text default null, p_prompt text default null, p_fallback smallint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pol jsonb := public.governance_policy();
  v_id bigint;
  v_inputs jsonb := coalesce(p_inputs, '{}'::jsonb);
begin
  insert into public.governance_decisions
    (kind, subject_ref, decision, policy, policy_version, rule_id, inputs, input_hash, confidence, reason,
     model, prompt, fallback_level, approval_id, requested_by)
  values
    (p_kind, p_subject, p_decision, coalesce(pol->>'mode', 'autonomy_first'), (pol->>'version')::int, p_rule,
     v_inputs, encode(sha256(convert_to(v_inputs::text, 'utf8')), 'hex'), p_confidence, p_reason,
     p_model, p_prompt, p_fallback, p_approval, p_requested_by)
  returning id into v_id;
  insert into public.audit_log (actor, action, object_ref, details)
  values ('system', 'governance.' || p_decision, p_subject, jsonb_build_object(
    'kind', p_kind, 'decision', p_decision, 'policy', coalesce(pol->>'mode', 'autonomy_first'),
    'policyVersion', (pol->>'version')::int, 'ruleId', p_rule, 'reason', p_reason,
    'confidence', p_confidence, 'approvalId', p_approval, 'requestedBy', p_requested_by,
    'inputHash', encode(sha256(convert_to(v_inputs::text, 'utf8')), 'hex')));
  return v_id;
end
$$;
revoke execute on function public.governance_record(text, text, text, text, text, jsonb, numeric, uuid, uuid, text, text, smallint) from public, anon, authenticated;
grant execute on function public.governance_record(text, text, text, text, text, jsonb, numeric, uuid, uuid, text, text, smallint) to service_role;
create or replace function public.governance_log(
  p_kind text, p_subject text, p_decision text, p_rule text, p_reason text,
  p_inputs jsonb default '{}'::jsonb, p_confidence numeric default null, p_approval uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_staff(uid) then
    raise exception 'governança: sessão de equipe necessária' using errcode = '42501';
  end if;
  if p_decision not in ('auto_approved', 'auto_review', 'human_exception', 'rejected') then
    raise exception 'governança: decisão % inválida', p_decision using errcode = '22023';
  end if;
  if p_approval is not null then
    update public.approvals
       set decision_mode = 'system',
           outcome = case p_decision when 'auto_approved' then 'auto_apply' else p_decision end,
           policy_version = (public.governance_policy()->>'version')::int,
           rule_id = p_rule, reason = left(p_reason, 1000), policy_inputs = coalesce(p_inputs, '{}'::jsonb),
           confidence = p_confidence
     where id = p_approval and requested_by = uid;
  end if;
  return public.governance_record(p_kind, p_subject, p_decision, p_rule, left(p_reason, 1000),
    coalesce(p_inputs, '{}'::jsonb), p_confidence, p_approval, uid);
end
$$;
revoke execute on function public.governance_log(text, text, text, text, text, jsonb, numeric, uuid) from public, anon;
grant execute on function public.governance_log(text, text, text, text, text, jsonb, numeric, uuid) to authenticated, service_role;
drop policy if exists approvals_decide on public.approvals;
create policy approvals_decide on public.approvals for update to authenticated
  using (
    public.has_any_role((select auth.uid()), '{admin,editor_chefe}')
    or (kind = 'rec.weights' and public.has_role((select auth.uid()), 'operador_ia'))
  )
  with check (
    (public.has_any_role((select auth.uid()), '{admin,editor_chefe}')
     or (kind = 'rec.weights' and public.has_role((select auth.uid()), 'operador_ia')))
    and approved_by = (select auth.uid())
  );
create or replace function public.push_policy_dispatch(p_send uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s push_sends%rowtype;
  pol jsonb := public.governance_policy();
  v_urgent_max int := coalesce((pol->'push'->>'urgentMaxPerHour')::int, 4);
  v_highlight_max int := coalesce((pol->'push'->>'highlightMaxPerDay')::int, 8);
  v_count int;
  v_hour int;
  v_next text;
  v_at timestamptz;
  v_reason text;
  v_rule text;
  v_inputs jsonb;
begin
  select * into s from push_sends where id = p_send for update;
  if not found or s.status <> 'pending_approval' then
    return coalesce(s.status, 'not_found');
  end if;
  if s.kind = 'urgent' then
    select count(*) into v_count from push_sends
     where kind = 'urgent' and id <> s.id and status not in ('pending_approval', 'rejected', 'cancelled', 'expired')
       and created_at > now() - interval '1 hour';
    v_inputs := jsonb_build_object('kind', s.kind, 'urgentLastHour', v_count, 'limit', v_urgent_max);
    if v_count >= v_urgent_max then
      v_rule := 'push.urgent.rate_limit';
      v_reason := format('Limite de %s urgentes por hora atingido', v_urgent_max);
    end if;
  else
    select count(*) into v_count from push_sends
     where kind = 'highlight' and id <> s.id and status not in ('pending_approval', 'rejected', 'cancelled', 'expired')
       and (created_at at time zone 'America/Cuiaba')::date = (now() at time zone 'America/Cuiaba')::date;
    v_inputs := jsonb_build_object('kind', s.kind, 'highlightToday', v_count, 'limit', v_highlight_max);
    if v_count >= v_highlight_max then
      v_rule := 'push.highlight.daily_limit';
      v_reason := format('Limite de %s destaques por dia atingido', v_highlight_max);
    end if;
  end if;
  if v_rule is not null then
    update approvals set status = 'rejected', approved_by = s.requested_by, decided_at = now()
     where target_ref = 'push:' || s.id::text and status = 'pending';
    update approvals set decision_mode = 'system', outcome = 'rejected', rule_id = v_rule, reason = v_reason,
                         policy_version = (pol->>'version')::int, policy_inputs = v_inputs
     where target_ref = 'push:' || s.id::text;
    update push_sends set status = 'rejected', status_reason = v_reason where id = s.id;
    perform public.governance_record('push.' || s.kind, 'push:' || s.id, 'rejected', v_rule, v_reason, v_inputs, 1,
      s.approval_id, s.requested_by);
    return 'rejected';
  end if;
  v_at := s.scheduled_at;
  if s.kind = 'highlight' and v_at is null then
    v_hour := extract(hour from (now() at time zone 'America/Cuiaba'));
    if v_hour >= push_settings_int('push.quiet_start', 22) or v_hour < push_settings_int('push.quiet_end', 7) then
      v_inputs := v_inputs || jsonb_build_object('quietHours', true);
    end if;
  end if;
  v_rule := 'push.' || s.kind || '.policy_ok';
  v_reason := 'Política de avisos satisfeita (papel, limite, matéria publicada)';
  update approvals set status = 'approved', approved_by = s.requested_by, decided_at = now()
   where target_ref = 'push:' || s.id::text and status = 'pending';
  update approvals set decision_mode = 'system', outcome = 'auto_apply', rule_id = v_rule, reason = v_reason,
                       policy_version = (pol->>'version')::int, policy_inputs = v_inputs
   where target_ref = 'push:' || s.id::text;
  v_next := case when v_at is null then 'queued' else 'scheduled' end;
  update push_sends set status = v_next, approved_by = s.requested_by, approved_at = now() where id = s.id;
  perform public.governance_record('push.' || s.kind, 'push:' || s.id, 'auto_approved', v_rule, v_reason, v_inputs, 1,
    s.approval_id, s.requested_by);
  return v_next;
end
$$;
revoke execute on function public.push_policy_dispatch(uuid) from public, anon;
grant execute on function public.push_policy_dispatch(uuid) to authenticated, service_role;
create or replace function public.push_request(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_kind text := p->>'kind';
  v_article articles%rowtype;
  v_when jsonb := coalesce(p->'when', '{"type":"now"}'::jsonb);
  v_at timestamptz;
  v_hour int;
  v_audience jsonb := coalesce(p->'audience', '{"type":"all"}'::jsonb);
  v_id uuid;
  v_appr uuid;
  v_label text;
begin
  if uid is null then
    raise exception 'sessão necessária' using errcode = '42501';
  end if;
  if v_kind not in ('urgent', 'highlight') then
    raise exception 'Tipo de envio inválido.' using errcode = '22023';
  end if;
  select * into v_article from articles where id = (p->>'articleId')::uuid;
  if not found or v_article.status not in ('published', 'updated') then
    raise exception 'Só matéria publicada pode virar aviso.' using errcode = '23514';
  end if;
  if v_article.sponsored then
    raise exception 'Matéria patrocinada não vira aviso.' using errcode = '23514';
  end if;
  if v_audience->>'type' not in ('all', 'section', 'bairro') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;
  if v_when->>'type' = 'at' then
    if v_kind = 'urgent' then
      raise exception 'Urgente só sai agora.' using errcode = '23514';
    end if;
    v_at := (v_when->>'at')::timestamptz;
    if v_at < now() then
      raise exception 'O horário já passou.' using errcode = '23514';
    end if;
    if v_at > now() + interval '7 days' then
      raise exception 'Agende no máximo 7 dias à frente.' using errcode = '23514';
    end if;
    v_hour := extract(hour from (v_at at time zone 'America/Cuiaba'));
    if v_hour >= push_settings_int('push.quiet_start', 22) or v_hour < push_settings_int('push.quiet_end', 7) then
      raise exception 'Fora do silêncio: escolha um horário entre 7h e 22h.' using errcode = '23514';
    end if;
  elsif v_when->>'type' <> 'now' then
    raise exception 'Horário inválido.' using errcode = '22023';
  end if;
  v_label := case
    when v_article.publish_mode = 'auto' then 'PUBLICADO AUTOMATICAMENTE'
    when v_article.kind = 'normalized' then 'NORMALIZADO PELO CITYNEWS'
    else 'ORIGINAL CITYNEWS' end;
  insert into push_sends (kind, article_id, title, body, origin_label, url, tag, audience, status, requested_by,
                          justification, scheduled_at)
  values (v_kind, v_article.id, left(p->>'title', 60), left(p->>'body', 120), v_label,
          '/materia/' || v_article.slug, replace(v_article.id::text, '-', ''), v_audience, 'pending_approval', uid,
          nullif(trim(coalesce(p->>'justification', '')), ''), v_at)
  returning id into v_id;
  insert into approvals (kind, target_ref, requested_by, justification)
  values ('push.' || v_kind, 'push:' || v_id::text, uid,
          coalesce(nullif(trim(coalesce(p->>'justification', '')), ''), 'Destaque da redação: ' || left(p->>'title', 60)))
  returning id into v_appr;
  update push_sends set approval_id = v_appr where id = v_id;
  perform public.push_policy_dispatch(v_id);
  return v_id;
end
$$;
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
  for s in select * from push_sends where status = 'queued' and batches_total > 0 loop
    update push_sends set status = 'dispatching' where id = s.id;
    for b in select batch_no from push_batches where send_id = s.id and status = 'queued' loop
      perform queue_enqueue('notify', 'push_deliver:push:' || s.id::text || ':' || b.batch_no,
        jsonb_build_object('runId', 'push', 'step', 'push_deliver', 'itemRef', 'push:' || s.id::text || ':' || b.batch_no, 'attempt', 1), 0);
    end loop;
    v_resumed := v_resumed + 1;
  end loop;
  for s in select * from push_sends where status = 'queued' and batches_total = 0 and kind = 'follow' loop
    update push_sends set status = 'dispatching' where id = s.id;
    perform queue_enqueue('notify', 'push_match:push:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_match', 'itemRef', 'push:' || s.id::text, 'attempt', 1), 0);
    v_resumed := v_resumed + 1;
  end loop;
  for s in select * from push_sends
            where kind <> 'follow' and batches_total = 0
              and (status = 'queued' or (status = 'scheduled' and scheduled_at <= p_now))
            order by created_at loop
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
       or a.requested_by is distinct from s.requested_by
       or not ((a.decision_mode = 'system' and a.outcome = 'auto_apply')
               or push_can(a.approved_by, 'push.approve')) then
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
  for s in select distinct d.send_id as id from push_deliveries d
            where (d.not_before is not null and d.not_before <= p_now
                   and ((d.status = 'queued' and d.attempts > 0) or d.status = 'deferred'))
               or (d.status = 'queued' and d.attempts = 0 and d.created_at < p_now - interval '3 minutes') loop
    perform queue_enqueue('notify', 'push_due:due:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_due', 'itemRef', 'due:' || s.id::text, 'attempt', 1), 0);
    v_due := v_due + 1;
  end loop;
  return jsonb_build_object('paused', false, 'expired', v_expired, 'dispatched', v_dispatched,
                            'cancelled', v_cancelled, 'resumed', v_resumed, 'due', v_due);
end
$function$;
revoke execute on function public.push_dispatch_due(timestamptz) from public, anon, authenticated;
grant execute on function public.push_dispatch_due(timestamptz) to service_role;
alter table public.sources add column if not exists terms_status text not null default 'unknown';
alter table public.sources drop constraint if exists sources_terms_status_check;
alter table public.sources add constraint sources_terms_status_check
  check (terms_status in ('unknown', 'acknowledged', 'restricted'));
update public.sources set terms_status = 'acknowledged'
 where terms_reviewed_at is not null and terms_status = 'unknown';
create or replace function public.source_usage_mode(p_terms text, p_status text, p_republish text, p_image text)
returns text
language sql
immutable
as $$
  select case
    when p_terms = 'restricted' or p_status = 'blocked' then 'BLOCKED'
    when p_terms = 'unknown' then 'EXCERPT'
    when p_republish = 'summary_2_sentences' and p_image in ('with_agreement', 'reproduction') then 'FULL'
    else 'ATTRIBUTED'
  end
$$;
create or replace function public.sources_terms_status_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.terms_reviewed_at is not null and new.terms_status = 'unknown'
     and (tg_op = 'INSERT' or old.terms_reviewed_at is null) then
    new.terms_status := 'acknowledged';
  end if;
  return new;
end
$$;
drop trigger if exists sources_terms_status on public.sources;
create trigger sources_terms_status before insert or update on public.sources
  for each row execute function public.sources_terms_status_sync();
create or replace function public.guard_source_terms_restricted()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' and new.terms_status = 'restricted' then
    raise exception 'Termos de uso restritivos: a fonte não pode ser ativada.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists sources_terms_restricted on public.sources;
create trigger sources_terms_restricted before update on public.sources
  for each row execute function public.guard_source_terms_restricted();
create or replace function public.governance_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n_expired int := 0;
  n_push int := 0;
begin
  for r in
    select id, kind, target_ref, requested_by, outcome from public.approvals
     where status = 'pending' and expires_at is not null and expires_at < p_now
     for update skip locked
  loop
    update public.approvals
       set status = 'expired', decision_mode = 'system',
           next_action = case when r.outcome = 'human_exception'
             then 'expirou sem decisão humana; o pedido precisa ser refeito com dados novos'
             else 'expirou; o sistema reavalia no próximo pedido' end,
           reason = coalesce(reason, 'Prazo vencido')
     where id = r.id;
    perform public.governance_record(r.kind, r.target_ref, 'expired', r.kind || '.timeout',
      'Prazo do pedido vencido; estado terminal', jsonb_build_object('approvalId', r.id), null, r.id, r.requested_by);
    n_expired := n_expired + 1;
  end loop;
  for r in select id from public.push_sends where status = 'pending_approval' for update skip locked loop
    perform public.push_policy_dispatch(r.id);
    n_push := n_push + 1;
  end loop;
  return jsonb_build_object('expired', n_expired, 'pushEvaluated', n_push);
end
$$;
revoke execute on function public.governance_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.governance_sweep(timestamptz) to service_role;
do $$
begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('governance-sweep', '*/15 * * * *', 'select public.governance_sweep()');
  end if;
end
$$;
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions()
        || array['governance.auto_approved', 'governance.auto_review', 'governance.human_exception',
                 'governance.rejected', 'governance.expired', 'governance.auto_rollback', 'governance.apply']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
alter table public.articles add column if not exists next_action text;
alter table public.articles add column if not exists next_attempt_at timestamptz;
alter table public.articles add column if not exists reprocess_count int not null default 0;
alter table public.articles add column if not exists quarantined_at timestamptz;
alter table public.articles add column if not exists quarantine_reason text;
alter table public.articles add column if not exists autonomy_level text;
alter table public.articles add column if not exists degraded_reason text;
alter table public.articles drop constraint if exists articles_autonomy_level_check;
alter table public.articles add constraint articles_autonomy_level_check
  check (autonomy_level is null or autonomy_level in ('A0', 'A1', 'A2', 'A3', 'A4'));
alter table public.articles drop constraint if exists articles_next_action_check;
alter table public.articles add constraint articles_next_action_check
  check (next_action is null or next_action in ('rewrite', 'reevaluate', 'await_auto_publish', 'breaker_recovery'));
create index if not exists articles_next_attempt_idx on public.articles (next_attempt_at)
  where next_attempt_at is not null and quarantined_at is null;
create or replace function public.autonomy_due_articles(p_now timestamptz default now(), p_limit int default 50)
returns table (id uuid, topic_id uuid, next_action text, ai_fallback boolean, reprocess_count int)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.topic_id, a.next_action, a.ai_fallback, a.reprocess_count
    from articles a
   where a.status = 'draft'
     and a.next_attempt_at is not null and a.next_attempt_at <= p_now
     and a.quarantined_at is null
     and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
   order by a.next_attempt_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.autonomy_due_articles(timestamptz, int) from public, anon, authenticated;
grant execute on function public.autonomy_due_articles(timestamptz, int) to service_role;
create or replace function public.autonomy_claim_article(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update articles set next_attempt_at = null where id = p_id
$$;
revoke execute on function public.autonomy_claim_article(uuid) from public, anon, authenticated;
grant execute on function public.autonomy_claim_article(uuid) to service_role;
alter table public.publish_breaker add column if not exists auto_resume boolean not null default true;
alter table public.publish_breaker add column if not exists cooldown_minutes int not null default 30;
alter table public.publish_breaker add column if not exists disabled_by_trip boolean not null default false;
create or replace function public.publish_counts(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select coalesce(reset_at, '-infinity'::timestamptz) as since,
           hourly_limit, daily_limit, reports_per_hour, ai_failures_per_hour
      from publish_breaker where id
  ), w as (
    select greatest(p_now - interval '1 hour', b.since) as hour_from,
           greatest((date_trunc('day', p_now at time zone 'America/Cuiaba')) at time zone 'America/Cuiaba', b.since) as day_from,
           b.*
      from b
  )
  select jsonb_build_object(
    'publishedLastHour', (select count(*) from articles a, w
                           where a.publish_mode = 'auto' and a.published_at >= w.hour_from and a.published_at <= p_now),
    'publishedToday',    (select count(*) from articles a, w
                           where a.publish_mode = 'auto' and a.published_at >= w.day_from and a.published_at <= p_now),
    'reportsLastHour',   (select count(*) from reports r, w where r.created_at >= w.hour_from and r.created_at <= p_now),
    'aiCallsLastHour',   (select count(*) from ai_calls c, w where c.created_at >= w.hour_from and c.created_at <= p_now),
    'aiFailuresLastHour',(select greatest(0,
                             (select count(*) from ai_calls c
                               where not c.ok and c.created_at >= w.hour_from and c.created_at <= p_now
                                 and coalesce(c.error, '') not in ('budget_exceeded', 'disabled', 'injection'))
                           - (select count(*) from ai_calls c
                               where c.ok and c.fallback_used and c.created_at >= w.hour_from and c.created_at <= p_now))),
    'limits', jsonb_build_object('hourly', w.hourly_limit, 'daily', w.daily_limit,
                                 'reportsPerHour', w.reports_per_hour, 'aiFailuresPerHour', w.ai_failures_per_hour),
    'trippedAt', (select tripped_at from publish_breaker where id))
  from w;
$$;
revoke execute on function public.publish_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_counts(timestamptz) to service_role;
create or replace function public.autonomy_hold_cycle(p_reason text, p_next_action text, p_minutes int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
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
  ), to_hold as (
    select ca.id
    from cycle_articles ca
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
    select 'article:' || t.id::text, 'publish', 'autonomy-hold:' || now()::text,
           jsonb_build_object('published', false, 'hold', p_next_action, 'actor', 'system'),
           p_reason, 'publish'
    from to_hold t
    returning object_ref
  ), upd as (
    update articles a
       set status = 'draft', review_reason = p_reason, next_action = p_next_action,
           next_attempt_at = now() + make_interval(mins => greatest(p_minutes, 1)), updated_at = now()
      from to_hold t
     where a.id = t.id
    returning a.id
  )
  select count(*) into n from upd;
  return coalesce(n, 0);
end
$$;
revoke execute on function public.autonomy_hold_cycle(text, text, int) from public, anon, authenticated;
grant execute on function public.autonomy_hold_cycle(text, text, int) to service_role;
create or replace function public.publish_breaker_trip(p_reason text, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
  v_was_on boolean;
begin
  if p_reason not in ('hourly', 'daily', 'reports', 'ai_failures') then
    raise exception 'breaker: motivo inválido %', p_reason using errcode = '22023';
  end if;
  select enabled into v_was_on from feature_flags where key = 'auto_publish';
  update publish_breaker
     set tripped_at = now(), trip_reason = p_reason, trip_detail = coalesce(p_detail, '{}'::jsonb),
         disabled_by_trip = coalesce(v_was_on, false), updated_at = now()
   where id and tripped_at is null
  returning true into v_first;
  if v_first is null then
    return false;
  end if;
  update feature_flags set enabled = false, updated_at = now() where key = 'auto_publish';
  perform public.autonomy_hold_cycle('Disjuntor de publicação aberto (' || p_reason
    || '): fica em rascunho e volta sozinha quando o disjuntor se recuperar.', 'breaker_recovery',
    (select cooldown_minutes from publish_breaker where id));
  insert into audit_log (actor, action, object_ref, details)
  values ('sistema', 'breaker.trip', 'flag:auto_publish',
          jsonb_build_object('reason', p_reason, 'detail', coalesce(p_detail, '{}'::jsonb)));
  return true;
end
$$;
revoke execute on function public.publish_breaker_trip(text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_breaker_trip(text, jsonb) to service_role;
create or replace function public.publish_breaker_auto_recover(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b publish_breaker%rowtype;
  c jsonb;
  v_ok boolean;
  v_released int := 0;
begin
  select * into b from publish_breaker where id for update;
  if b.tripped_at is null then
    return jsonb_build_object('recovered', false, 'reason', 'closed');
  end if;
  if not b.auto_resume then
    return jsonb_build_object('recovered', false, 'reason', 'auto_resume_off');
  end if;
  if p_now < b.tripped_at + make_interval(mins => b.cooldown_minutes) then
    return jsonb_build_object('recovered', false, 'reason', 'cooldown',
                              'until', b.tripped_at + make_interval(mins => b.cooldown_minutes));
  end if;
  c := public.publish_counts(p_now);
  v_ok := (c ->> 'publishedLastHour')::int < 0.8 * b.hourly_limit
      and (c ->> 'publishedToday')::int < 0.8 * b.daily_limit
      and (c ->> 'reportsLastHour')::int < b.reports_per_hour
      and (c ->> 'aiFailuresLastHour')::int < b.ai_failures_per_hour;
  if not v_ok then
    return jsonb_build_object('recovered', false, 'reason', 'still_high', 'counts', c);
  end if;
  update publish_breaker
     set tripped_at = null, trip_reason = null, trip_detail = '{}'::jsonb, reset_at = p_now,
         reset_by = null, disabled_by_trip = false, updated_at = now()
   where id;
  if b.disabled_by_trip then
    update feature_flags set enabled = true, updated_at = now() where key = 'auto_publish';
  end if;
  update articles set next_attempt_at = p_now
   where next_action = 'breaker_recovery' and status = 'draft' and quarantined_at is null;
  get diagnostics v_released = row_count;
  insert into audit_log (actor, action, object_ref, details)
  values ('system', 'breaker.auto_recover', 'flag:auto_publish',
          jsonb_build_object('tripReason', b.trip_reason, 'trippedAt', b.tripped_at, 'counts', c,
                             'autoPublishRestored', b.disabled_by_trip, 'released', v_released));
  perform public.governance_record('breaker.auto_recover', 'flag:auto_publish', 'auto_approved',
    'breaker.auto_recover', 'Disjuntor recuperado: resfriamento cumprido e contagens abaixo de 80% dos limites',
    jsonb_build_object('counts', c, 'tripReason', b.trip_reason), 1);
  return jsonb_build_object('recovered', true, 'released', v_released,
                            'autoPublishRestored', b.disabled_by_trip, 'counts', c);
end
$$;
revoke execute on function public.publish_breaker_auto_recover(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_breaker_auto_recover(timestamptz) to service_role;
alter table public.pipeline_quarantine add column if not exists reason_class text;
alter table public.pipeline_quarantine add column if not exists recommendation text;
alter table public.pipeline_quarantine add column if not exists next_retry_at timestamptz;
alter table public.pipeline_quarantine add column if not exists auto_retries int not null default 0;
create index if not exists pipeline_quarantine_retry_idx on public.pipeline_quarantine (next_retry_at)
  where resolved_at is null and next_retry_at is not null;
create table if not exists public.pipeline_incidents (
  id bigserial primary key,
  signature text not null,
  step text not null,
  error_class text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count int not null default 0,
  status text not null default 'open' check (status in ('open', 'mitigated', 'resolved')),
  diagnosis text,
  action text,
  resolved_at timestamptz
);
create unique index if not exists pipeline_incidents_open_sig on public.pipeline_incidents (signature)
  where status <> 'resolved';
alter table public.pipeline_incidents enable row level security;
drop policy if exists pipeline_incidents_read_staff on public.pipeline_incidents;
create policy pipeline_incidents_read_staff on public.pipeline_incidents for select to authenticated
  using (public.is_staff((select auth.uid())));
create or replace function public.autonomy_queue_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'queueDepth', (select count(*) from jobs),
    'oldestAgeSec', (select coalesce(extract(epoch from (p_now - min(enqueued_at)))::int, 0) from jobs),
    'retrying', (select count(*) from jobs where last_error is not null),
    'deadLetters', (select count(*) from pipeline_quarantine where resolved_at is null),
    'failuresLastHour', (select count(*) from pipeline_events
                          where at > p_now - interval '1 hour' and level in ('error', 'security')),
    'eventsLastHour', (select count(*) from pipeline_events where at > p_now - interval '1 hour'),
    'reprocessing', (select count(*) from articles
                      where next_attempt_at is not null and quarantined_at is null and status = 'draft'),
    'quarantined24h', (select count(*) from articles where quarantined_at > p_now - interval '24 hours'),
    'humanExceptions', (select count(*) from articles where status = 'in_review'),
    'autoDecisions24h', (select count(*) from decisions
                          where step in ('rules', 'publish') and created_at > p_now - interval '24 hours'),
    'openIncidents', (select count(*) from pipeline_incidents where status = 'open')
  )
$$;
revoke execute on function public.autonomy_queue_health(timestamptz) from public, anon;
grant execute on function public.autonomy_queue_health(timestamptz) to authenticated, service_role;
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(public.studio_audit_actions() || array['breaker.auto_recover']) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
insert into supabase_migrations.schema_migrations (version, name) values ('20261006000170', '0170_autonomous_governance'), ('20261006000171', '0171_autonomy_engine') on conflict do nothing;
select (select count(*) from public.governance_policies where active) gov, (select count(*) from cron.job where jobname = 'governance-sweep') sweep, (select count(*) from pg_proc where proname = 'publish_breaker_auto_recover') recover, (select count(*) from pg_proc where proname = 'autonomy_queue_health') health, to_regclass('public._cn_probe') probe;
