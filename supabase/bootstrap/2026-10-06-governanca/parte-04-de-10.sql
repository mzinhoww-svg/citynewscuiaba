select 'parte 4 de 10' as inicio;
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
select 'parte 4 de 10 ok' as fim;
