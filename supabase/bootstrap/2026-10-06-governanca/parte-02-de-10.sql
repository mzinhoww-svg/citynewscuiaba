select 'parte 2 de 10' as inicio;
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
select 'parte 2 de 10 ok' as fim;
