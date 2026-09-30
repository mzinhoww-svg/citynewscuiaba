-- 0047 · Correções do gate do PWA (docs/reports/pwa-gate-review.md). Não altera 0040..0046.
--   PWA-01  despublicar cancela também envios em `dispatching` e expira entregas pendentes
--           (retry/adiadas) de qualquer envio da matéria; o despacho reconfere matéria e patrocínio.
--   PWA-03  retomada: agendado futuro volta a `scheduled`; vencidos por TTL viram `expired`.
--   PWA-04  matéria `updated` (corrigida, no ar) vale como publicada (guard, pedido, despacho).
--   PWA-08  entrega `queued` sem tentativa há mais de 3 min é reprocessada pelo despacho.
--   PWA-09  quem pediu não escreve `approved_by`/`approved_at` na própria linha.
--   PWA-16  `push_settings_int` só lê chaves `push.%`.
-- Não toca studio_audit_actions()/app_setting_set/guard_app_settings (nenhuma ação nova).

-- PWA-01 ----------------------------------------------------------------------------------
create or replace function public.articles_push_unpublish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status not in ('published', 'updated') or new.status in ('published', 'updated') then
    return new;
  end if;
  update push_sends
     set status = 'cancelled', status_reason = 'Matéria despublicada'
   where article_id = new.id
     and status in ('pending_approval', 'queued', 'scheduled', 'dispatching', 'paused');
  -- Retentativas e entregas adiadas de qualquer envio (inclusive já `sent`) não saem mais.
  update push_deliveries
     set status = 'expired', skip_reason = 'expired'
   where article_id = new.id and status in ('queued', 'deferred');
  return new;
end
$$;
revoke execute on function public.articles_push_unpublish() from public, anon, authenticated;

-- PWA-03: retomar um agendado o devolve a `scheduled` ------------------------------------------
create or replace function public.push_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_from
    when 'pending_approval' then p_to in ('queued','scheduled','rejected','cancelled','expired')
    when 'queued' then p_to in ('dispatching','paused','cancelled','expired')
    when 'scheduled' then p_to in ('queued','dispatching','paused','cancelled','expired')
    when 'dispatching' then p_to in ('sent','paused','cancelled')
    when 'paused' then p_to in ('queued','scheduled','dispatching','expired','cancelled')
    else false
  end;
$$;

-- PWA-16: só chaves push.% -----------------------------------------------------------------
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
  begin
    execute 'select (value #>> ''{}'')::int from app_settings where key = $1' into v using p_key;
  exception when others then
    return p_default;
  end;
  return coalesce(v, p_default);
end
$$;

-- PWA-04, PWA-09 ---------------------------------------------------------------------------
create or replace function public.guard_push_sends()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  v_article articles%rowtype;
  a approvals%rowtype;
  n jsonb;
  o jsonb;
  v_frozen text[] := '{title,body,audience,article_id,kind,scheduled_at,requested_by,created_at,justification,origin_label,url,tag}';
  v_person text[] := '{status,status_reason,approval_id,version}';
  k text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'follow' then
      if uid is not null then
        perform two_person_error('push: envio automático nasce só pelo sistema');
      end if;
      return new;
    end if;
    if uid is null then
      return new;
    end if;
    if new.status <> 'pending_approval' or new.requested_by is distinct from uid then
      perform two_person_error('push: pedido nasce pendente e em nome de quem pede');
    end if;
    if new.approved_by is not null or new.approved_at is not null or new.started_at is not null then
      perform two_person_error('push: pedido nasce sem aprovação');
    end if;
    select * into v_article from articles where id = new.article_id;
    if not found or v_article.status not in ('published', 'updated') then
      raise exception 'Só matéria publicada pode virar aviso.' using errcode = '23514';
    end if;
    if v_article.sponsored then
      raise exception 'Matéria patrocinada não vira aviso.' using errcode = '23514';
    end if;
    if new.kind = 'urgent' then
      if not has_any_role(uid, '{admin,editor_chefe}') then
        raise exception 'Urgente só por admin ou editor-chefe.' using errcode = '42501';
      end if;
      if new.scheduled_at is not null then
        raise exception 'Urgente só sai agora.' using errcode = '23514';
      end if;
      if coalesce(length(trim(new.justification)), 0) = 0 then
        raise exception 'Justificativa obrigatória para urgente.' using errcode = '23514';
      end if;
    elsif not push_can(uid, 'push.request', v_article.section_slug) then
      raise exception 'Destaque só de matéria da própria editoria.' using errcode = '42501';
    end if;
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  foreach k in array v_frozen loop
    if n -> k is distinct from o -> k then
      raise exception 'push: texto, público, matéria e horário são imutáveis depois do pedido (%)', k using errcode = '42501';
    end if;
  end loop;
  if new.status is distinct from old.status and not push_transition_ok(old.status, new.status) then
    raise exception 'push: transição % → % inválida', old.status, new.status using errcode = '42501';
  end if;
  new.version := old.version + (case when new.status is distinct from old.status then 1 else 0 end);
  if uid is null then
    return new;
  end if;

  -- Pessoa comum: só campos de decisão; contadores, lotes e horários são do serviço.
  for k in select key from jsonb_each(n) loop
    if k <> all (v_frozen) and k <> all (v_person) and n -> k is distinct from o -> k then
      raise exception 'push: campo % só muda pelo serviço', k using errcode = '42501';
    end if;
  end loop;
  if new.approval_id is distinct from old.approval_id then
    if old.approval_id is not null or old.requested_by is distinct from uid then
      perform two_person_error('push: a aprovação do pedido é ligada uma vez, por quem pediu');
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('queued', 'scheduled', 'rejected') then
      select * into a from approvals where target_ref = 'push:' || old.id::text order by created_at desc limit 1;
      if not found or a.approved_by is distinct from uid or a.approved_by = a.requested_by
         or a.status <> (case when new.status = 'rejected' then 'rejected' else 'approved' end)
         or not push_can(uid, 'push.approve') then
        perform two_person_error('push: decisão exige a aprovação registrada por outra pessoa com push.approve');
      end if;
      if new.status <> 'rejected' then
        new.approved_by := a.approved_by;
        new.approved_at := coalesce(a.decided_at, now());
      end if;
    elsif new.status = 'cancelled' then
      if old.requested_by is distinct from uid and not push_can(uid, 'push.settings') then
        perform two_person_error('push: cancelar só por quem pediu ou por push.settings');
      end if;
    else
      perform two_person_error(format('push: estado %s só pelo serviço', new.status));
    end if;
  end if;
  return new;
end
$$;

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
  return v_id;
end
$$;

-- PWA-03 ------------------------------------------------------------------------------------
create or replace function public.push_resume_apply(p_approval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a approvals%rowtype;
begin
  select * into a from approvals where id = p_approval for update;
  if not found or a.kind <> 'push.resume' or a.status <> 'approved' or a.approved_by is distinct from uid
     or a.approved_by = a.requested_by or not push_can(a.approved_by, 'push.approve') then
    raise exception 'retomada exige aprovação de outra pessoa com push.approve' using errcode = '42501';
  end if;
  update approvals set status = 'applied' where id = a.id;
  insert into app_settings (key, value, updated_by, updated_at)
  values ('push.paused', jsonb_build_object('on', false, 'by', uid, 'at', now(), 'reason', null), uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update push_sends set status = 'expired', status_reason = 'Agendamento vencido durante a pausa'
   where status = 'paused' and scheduled_at is not null and scheduled_at < now() - interval '1 hour';
  -- TTL por tipo (spec §12.4): o que passou do prazo durante a pausa vira `expired`, em vez de
  -- sair como notícia velha e gastar a cota diária dos leitores (PWA-03).
  update push_sends set status = 'expired', status_reason = 'Prazo vencido durante a pausa'
   where status = 'paused'
     and (
       (kind = 'follow' and coalesce(started_at, created_at) < now() - make_interval(hours => push_ttl_hours('follow')))
       or (kind = 'urgent' and coalesce(started_at, approved_at, created_at) < now() - make_interval(hours => push_ttl_hours('urgent')))
       or (kind = 'highlight' and scheduled_at is null
           and coalesce(started_at, approved_at, created_at) < now() - make_interval(hours => push_ttl_hours('highlight')))
     );
  -- Agendado para o futuro volta a `scheduled` (o despacho respeita `scheduled_at`); o resto volta à fila.
  update push_sends set status = 'scheduled', status_reason = null
   where status = 'paused' and kind <> 'follow' and batches_total = 0 and scheduled_at is not null and scheduled_at > now();
  update push_sends set status = 'queued', status_reason = null where status = 'paused';
  update push_batches set status = 'queued' where status = 'paused';
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'push.resume_applied', 'push:settings', jsonb_build_object('approvalId', a.id, 'reason', a.justification));
end
$$;

-- PWA-01, PWA-08, PWA-16 (despacho) ---------------------------------------------------------
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

  -- Aprovados "agora" e agendados vencidos: reconfere a aprovação (duas pessoas) e despacha.
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
$$;
revoke execute on function public.push_dispatch_due(timestamptz) from public, anon, authenticated;
grant execute on function public.push_dispatch_due(timestamptz) to service_role;
