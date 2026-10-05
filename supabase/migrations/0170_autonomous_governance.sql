-- 0170 · Governança autônoma: motor de política, aprovação pelo sistema e nada parado (A-160).
--
-- Complementa a A-128 (0149, uma pessoa pede, aprova e aplica). Decisão do dono (04/10/2026):
-- "AUTONOMY FIRST, HUMAN EXCEPTION SECOND". PEDIDO → MOTOR DE POLÍTICA → VALIDAÇÃO → APLICAÇÃO →
-- AUDITORIA, sem fila humana como padrão. Aditiva e idempotente; nenhuma migration anterior muda.
--
--  1. `approvals` registra o resultado da política: `decision_mode` (human | system), `outcome`
--     (auto_apply | auto_review | human_exception | rejected), versão e regra da política,
--     entradas, confiança, motivo, prazo (`expires_at`) e próxima ação (`next_action`). Todo pedido
--     pendente nasce com prazo; vencido, vira `expired` (estado terminal) pela varredura.
--  2. `governance_policies` (versionada) e `governance_decisions` (trilha somente-inserção de cada
--     decisão automática: actor = system, decisão, política, versão, regra, entradas, hash,
--     confiança, motivo, modelo, prompt, nível de fallback). `governance_log` deixa o Estúdio
--     registrar a decisão do motor de política (TS) em nome do sistema.
--  3. Push: a política de avisos (papel, limite por hora e por dia, matéria publicada) decide na
--     mesma chamada de `push_request`; passou, sai aprovado pelo sistema; não passou, recusado com
--     motivo. Nunca fica pendente esperando pessoa. `push_dispatch_due` aceita a aprovação pelo
--     sistema.
--  4. Pesos de recomendação: operador de IA também decide (`rec_weights_activate` já aceitava).
--  5. Fontes: termos em três estados (`terms_status`) e modo de uso derivado
--     (`source_usage_mode`: FULL, ATTRIBUTED, EXCERPT, BLOCKED). Só termos restritivos impedem a
--     ativação.
--  6. `governance_sweep()` a cada 15 min (pg_cron, quando existe): expira pedidos vencidos com
--     motivo e próxima ação e passa pela política os avisos que ainda estejam pendentes.

-- ---------------------------------------------------------------------------
-- 1. approvals: resultado da política e prazo
-- ---------------------------------------------------------------------------
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

-- Pedido pendente sempre tem prazo (no-stuck): 72 h por padrão, 60 min para push urgente.
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


-- ---------------------------------------------------------------------------
-- 2. Política versionada e trilha de decisões automáticas
-- ---------------------------------------------------------------------------
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
  -- Sem chave estrangeira: a trilha é somente-inserção e sobrevive ao pedido apagado.
  approval_id uuid,
  check (decision in ('auto_approved', 'auto_review', 'human_exception', 'rejected', 'expired', 'auto_rollback'))
);
-- Bancos que já criaram a tabela com a chave estrangeira (pré-produção) ficam iguais.
alter table public.governance_decisions drop constraint if exists governance_decisions_approval_id_fkey;
create index if not exists governance_decisions_at_idx on public.governance_decisions (at desc);
create index if not exists governance_decisions_subject_idx on public.governance_decisions (subject_ref, at desc);
alter table public.governance_decisions enable row level security;
drop policy if exists governance_decisions_read_staff on public.governance_decisions;
create policy governance_decisions_read_staff on public.governance_decisions for select to authenticated
  using (public.is_staff((select auth.uid())));
-- Somente inserção (como audit_log): decisão registrada não muda.
drop trigger if exists governance_decisions_immutable on public.governance_decisions;
create trigger governance_decisions_immutable before update or delete on public.governance_decisions
  for each row execute function public.forbid_update_delete();

-- Registra uma decisão automática na trilha própria e no audit_log (actor = system).
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


-- O motor de política do Estúdio (src/lib/governance) registra a decisão em nome do sistema.
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

-- guard_approvals (0149) compara o pedido inteiro; as colunas da política só mudam pelo sistema
-- (funções security definer, onde `critical_actor()` é nulo), então a guarda não precisa mudar.

-- ---------------------------------------------------------------------------
-- 4. Pesos de recomendação: quem tem `rec.weights` decide (admin e operador de IA)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Push: política em vez de espera
-- ---------------------------------------------------------------------------
-- Política do aviso: limite de urgentes por hora e de destaques por dia; silêncio vale para o
-- destaque "agora" (vai para as 7h). Passou: aprovado pelo sistema e na fila. Não passou: recusado
-- com motivo (exceção real), nunca pendente esperando pessoa.
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

-- push_request (0047) + política na mesma chamada. Retorna o id do envio, como antes.
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


-- push_dispatch_due (0149) reconfere a aprovação no despacho; aceita a aprovação pelo sistema.
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
    -- Aprovação válida (A-160): pela política de avisos (sistema) ou por quem tem push.approve.
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

revoke execute on function public.push_dispatch_due(timestamptz) from public, anon, authenticated;
grant execute on function public.push_dispatch_due(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Fontes: termos em três estados e modo de uso
-- ---------------------------------------------------------------------------
alter table public.sources add column if not exists terms_status text not null default 'unknown';
alter table public.sources drop constraint if exists sources_terms_status_check;
alter table public.sources add constraint sources_terms_status_check
  check (terms_status in ('unknown', 'acknowledged', 'restricted'));
update public.sources set terms_status = 'acknowledged'
 where terms_reviewed_at is not null and terms_status = 'unknown';

-- FULL: termos conhecidos, resumo e imagem liberados; ATTRIBUTED: termos conhecidos; EXCERPT:
-- termos desconhecidos (título, data, link e, quando a política deixa, resumo atribuído);
-- BLOCKED: termos restritivos ou fonte bloqueada.
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

-- Reconhecer os termos no painel marca `acknowledged`; restritivo é marcado pela aplicação.
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


-- Só termos restritivos impedem ativar (0148 já tirou a exigência de termos revisados).
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

-- ---------------------------------------------------------------------------
-- 6. Nada parado: varredura de pedidos vencidos
-- ---------------------------------------------------------------------------
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
  -- Avisos ainda pendentes (pedido anterior a esta migration): passam pela política agora.
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

-- Ações de auditoria novas (mesma união das migrations anteriores).
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
