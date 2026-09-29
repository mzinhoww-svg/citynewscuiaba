-- PWA e notificações (spec 2026-09-28 §12; plano PW-T9, G3, G7). Fila `notify` para o push:
-- gatilho de publicação → `push_match`; `push_dispatch_due()` (pg_cron a cada minuto e
-- pré-etapa do drain) despacha aprovados, agendados vencidos, retomados e entregas adiadas.
--
-- Trigger só em UPDATE de `status` (publicar é sempre uma transição draft/approved/scheduled →
-- published, pelo Estúdio ou pelo pipeline); um insert direto já publicado (seed, fixtures) não
-- gera aviso. Matéria urgente, patrocinada ou com envio `follow` existente fica de fora
-- (urgente vai pelo pedido em A09, D-P02). Publicação automática espera 10 min (D-P15).

create or replace function public.articles_push_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'published' or old.status is not distinct from 'published' then
    return new;
  end if;
  if new.urgent or new.sponsored then
    return new;
  end if;
  if exists (select 1 from push_sends s where s.article_id = new.id and s.kind = 'follow') then
    return new;
  end if;
  perform queue_enqueue(
    'notify',
    'push_match:article:' || new.id::text,
    jsonb_build_object('runId', 'push', 'step', 'push_match', 'itemRef', 'article:' || new.id::text, 'attempt', 1),
    case when new.publish_mode = 'auto' then 600 else 0 end
  );
  return new;
end
$$;
revoke execute on function public.articles_push_follow() from public, anon, authenticated;
drop trigger if exists articles_push_follow on articles;
create trigger articles_push_follow after update of status on articles
  for each row execute function public.articles_push_follow();

-- ---------------------------------------------------------------------------
-- Despacho (spec §12.2; Review Focus 6 do plano: a aprovação é reconferida aqui e marcada
-- `applied`; registro adulterado → envio cancelado sem enviar).
-- ---------------------------------------------------------------------------
create or replace function public.push_dispatch_due(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Aprovados "agora" e agendados vencidos: reconfere a aprovação (duas pessoas) e despacha.
  for s in select * from push_sends
            where kind <> 'follow' and batches_total = 0
              and (status = 'queued' or (status = 'scheduled' and scheduled_at <= p_now))
            order by created_at loop
    select * into a from approvals
     where target_ref = 'push:' || s.id::text and kind = 'push.' || s.kind
     order by created_at desc limit 1 for update;
    if not found or a.status <> 'approved' or a.approved_by is null or a.approved_by = a.requested_by
       or a.requested_by is distinct from s.requested_by or not push_can(a.approved_by, 'push.approve') then
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
            where d.not_before is not null and d.not_before <= p_now
              and ((d.status = 'queued' and d.attempts > 0) or d.status = 'deferred') loop
    perform queue_enqueue('notify', 'push_due:due:' || s.id::text,
      jsonb_build_object('runId', 'push', 'step', 'push_due', 'itemRef', 'due:' || s.id::text, 'attempt', 1), 0);
    v_due := v_due + 1;
  end loop;

  return jsonb_build_object('paused', false, 'expired', v_expired, 'dispatched', v_dispatched,
                            'cancelled', v_cancelled, 'resumed', v_resumed, 'due', v_due);
end
$$;
revoke execute on function public.push_dispatch_due(timestamptz) from public, anon, authenticated;
grant execute on function public.push_dispatch_due(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: despacho a cada minuto e retenção diária (só com pg_cron; sem ele o drain cobre).
-- ---------------------------------------------------------------------------
create or replace function public.schedule_push_cron()
returns text
language plpgsql
set search_path = public
as $fn$
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado (beforeDrain cobre o despacho)';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'push-dispatch', '* * * * *', 'select public.push_dispatch_due()');
  execute format('select cron.schedule(%L, %L, %L)', 'push-retention', '35 4 * * *', 'select public.push_retention(now())');
  return 'agendado: push-dispatch e push-retention';
end $fn$;
revoke execute on function public.schedule_push_cron() from public, anon, authenticated;
grant execute on function public.schedule_push_cron() to service_role;
select schedule_push_cron();

-- ---------------------------------------------------------------------------
-- Fim de lote atômico: marca o lote `done`, soma `batches_done` e fecha o envio (`sent`,
-- `push.finish` na auditoria) quando o último lote termina. Idempotente por lote.
-- ---------------------------------------------------------------------------
create or replace function public.push_finish_batch(p_send uuid, p_batch int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  s push_sends%rowtype;
  v_rows int;
begin
  select * into s from push_sends where id = p_send for update;
  if not found then
    return false;
  end if;
  update push_batches set status = 'done' where send_id = p_send and batch_no = p_batch and status <> 'done';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    update push_sends set batches_done = batches_done + 1 where id = p_send returning * into s;
  end if;
  if s.batches_done >= s.batches_total and s.status = 'dispatching' then
    update push_sends set status = 'sent', finished_at = now() where id = p_send;
    return true;
  end if;
  return s.batches_done >= s.batches_total;
end
$$;
revoke execute on function public.push_finish_batch(uuid, int) from public, anon, authenticated;
grant execute on function public.push_finish_batch(uuid, int) to service_role;
