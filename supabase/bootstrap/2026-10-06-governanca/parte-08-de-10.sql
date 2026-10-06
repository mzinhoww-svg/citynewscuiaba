select 'parte 8 de 10' as inicio;
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
select 'parte 8 de 10 ok' as fim;
