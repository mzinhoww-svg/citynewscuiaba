-- BELL-T1 · Central de notificações da equipe do Estúdio (o sino).
-- Numeração 0080 em diante (0055-0069 ficam com outros agentes; última existente na criação: 0073).
-- Aditiva e idempotente: nenhum DROP nem DELETE (o conector de produção segura esses comandos).
-- Policies entram por bloco DO que confere `pg_policies`; triggers por `create or replace trigger`.
--
-- Modelo: uma notificação é um fato interno (`studio_notifications`), escrito só por service role
-- e por triggers (função `studio_notify`, security definer). Cada pessoa vê a notificação se o
-- papel dela consta em `audience.roles` ou se o id dela consta em `audience.userIds`
-- (`audience.excludeUserIds` tira quem pediu, ex.: quem solicitou uma aprovação). A leitura é
-- por pessoa (`studio_notification_reads`). Falha ao notificar NUNCA derruba o evento de origem:
-- `studio_notify` engole o erro e devolve null.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.studio_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z][a-z_]{2,39}$'),
  severity text not null default 'info' check (severity in ('info', 'warn', 'urgent')),
  title text not null check (length(title) between 1 and 140),
  body text not null default '' check (length(body) <= 400),
  href text not null check (href ~ '^/estudio' and href !~ '^//'),
  object_ref text,
  audience jsonb not null default '{"roles":[],"userIds":[]}'::jsonb
    check (jsonb_typeof(audience) = 'object'),
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Push de urgência para a equipe: marcado quando o despacho já tratou a notificação.
  push_sent_at timestamptz
);
create index if not exists studio_notifications_created_idx
  on public.studio_notifications (created_at desc);
create index if not exists studio_notifications_push_due_idx
  on public.studio_notifications (created_at) where severity = 'urgent' and push_sent_at is null;

create table if not exists public.studio_notification_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_id uuid not null references public.studio_notifications (id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, notification_id)
);

-- Opt-in do push de urgências da central (reaproveita `push_subscriptions`, sem segundo canal).
alter table public.push_subscriptions
  add column if not exists staff_alerts boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Quem vê o quê
-- ---------------------------------------------------------------------------
create or replace function public.studio_notification_visible(p_aud jsonb, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null
    and not coalesce(p_aud -> 'excludeUserIds' ? p_uid::text, false)
    and (
      coalesce(p_aud -> 'userIds' ? p_uid::text, false)
      or exists (
        select 1 from public.user_roles ur
         where ur.user_id = p_uid and coalesce(p_aud -> 'roles' ? ur.role::text, false)
      )
    )
$$;
revoke execute on function public.studio_notification_visible(jsonb, uuid) from public, anon;
grant execute on function public.studio_notification_visible(jsonb, uuid) to authenticated, service_role;

alter table public.studio_notifications enable row level security;
alter table public.studio_notification_reads enable row level security;
revoke all on public.studio_notifications from public, anon, authenticated;
revoke all on public.studio_notification_reads from public, anon, authenticated;
grant select on public.studio_notifications to authenticated;
grant select, insert, update on public.studio_notification_reads to authenticated;
grant all on public.studio_notifications, public.studio_notification_reads to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'studio_notifications' and policyname = 'studio_notifications_read') then
    create policy studio_notifications_read on public.studio_notifications for select to authenticated
      using (public.studio_notification_visible(audience, (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'studio_notification_reads' and policyname = 'studio_notification_reads_own_select') then
    create policy studio_notification_reads_own_select on public.studio_notification_reads
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'studio_notification_reads' and policyname = 'studio_notification_reads_own_insert') then
    create policy studio_notification_reads_own_insert on public.studio_notification_reads
      for insert to authenticated with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.studio_notifications n
                     where n.id = notification_id
                       and public.studio_notification_visible(n.audience, (select auth.uid())))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'studio_notification_reads' and policyname = 'studio_notification_reads_own_update') then
    create policy studio_notification_reads_own_update on public.studio_notification_reads
      for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Leitura e marcação (security definer + auth.uid() explícito)
-- ---------------------------------------------------------------------------
-- Lista paginada por cursor (created_at). `p_history` inclui expiradas e dispensadas (página
-- completa); o sino usa o padrão (só o que está valendo).
create or replace function public.studio_notifications_for(
  p_limit int default 30,
  p_cursor timestamptz default null,
  p_only_unread boolean default false,
  p_kind text default null,
  p_history boolean default false
)
returns table (
  id uuid, kind text, severity text, title text, body text, href text, object_ref text,
  created_at timestamptz, read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.severity, n.title, n.body, n.href, n.object_ref, n.created_at, r.read_at
    from public.studio_notifications n
    left join public.studio_notification_reads r
      on r.notification_id = n.id and r.user_id = auth.uid()
   where auth.uid() is not null
     and public.studio_notification_visible(n.audience, auth.uid())
     and (p_history or ((n.expires_at is null or n.expires_at > now()) and r.dismissed_at is null))
     and (p_cursor is null or n.created_at < p_cursor)
     and (not p_only_unread or r.read_at is null)
     and (p_kind is null or n.kind = p_kind)
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
revoke execute on function public.studio_notifications_for(int, timestamptz, boolean, text, boolean) from public, anon;
grant execute on function public.studio_notifications_for(int, timestamptz, boolean, text, boolean) to authenticated, service_role;

create or replace function public.studio_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.studio_notifications n
    left join public.studio_notification_reads r
      on r.notification_id = n.id and r.user_id = auth.uid()
   where auth.uid() is not null
     and public.studio_notification_visible(n.audience, auth.uid())
     and (n.expires_at is null or n.expires_at > now())
     and r.dismissed_at is null
     and r.read_at is null
$$;
revoke execute on function public.studio_unread_count() from public, anon;
grant execute on function public.studio_unread_count() to authenticated, service_role;

create or replace function public.studio_notifications_mark_read(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then return 0; end if;
  insert into public.studio_notification_reads (user_id, notification_id, read_at)
  select uid, x.id, now()
    from public.studio_notifications x
   where x.id = any (coalesce(p_ids, '{}'::uuid[]))
     and public.studio_notification_visible(x.audience, uid)
  on conflict (user_id, notification_id)
  do update set read_at = coalesce(public.studio_notification_reads.read_at, excluded.read_at);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.studio_notifications_mark_read(uuid[]) from public, anon;
grant execute on function public.studio_notifications_mark_read(uuid[]) to authenticated, service_role;

create or replace function public.studio_notifications_mark_all_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then return 0; end if;
  insert into public.studio_notification_reads (user_id, notification_id, read_at)
  select uid, x.id, now()
    from public.studio_notifications x
   where public.studio_notification_visible(x.audience, uid)
     and (x.expires_at is null or x.expires_at > now())
  on conflict (user_id, notification_id)
  do update set read_at = coalesce(public.studio_notification_reads.read_at, excluded.read_at);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.studio_notifications_mark_all_read() from public, anon;
grant execute on function public.studio_notifications_mark_all_read() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Produtor: `studio_notify` (só service role e triggers)
-- ---------------------------------------------------------------------------
create or replace function public.studio_notify(
  p_kind text,
  p_severity text,
  p_title text,
  p_body text,
  p_href text,
  p_object_ref text,
  p_roles text[],
  p_dedupe text,
  p_user_ids uuid[] default '{}'::uuid[],
  p_exclude_user_ids uuid[] default '{}'::uuid[],
  p_ttl interval default interval '30 days'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.studio_notifications
    (kind, severity, title, body, href, object_ref, audience, dedupe_key, expires_at)
  values (
    p_kind, p_severity, left(p_title, 140), left(coalesce(p_body, ''), 400), p_href, p_object_ref,
    jsonb_build_object(
      'roles', to_jsonb(coalesce(p_roles, '{}'::text[])),
      'userIds', to_jsonb(coalesce(p_user_ids, '{}'::uuid[])),
      'excludeUserIds', to_jsonb(coalesce(p_exclude_user_ids, '{}'::uuid[]))
    ),
    p_dedupe, now() + p_ttl
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
exception when others then
  -- Nunca derruba o evento de origem (denúncia, aprovação, publicação...).
  raise warning 'studio_notify(%): %', p_kind, sqlerrm;
  return null;
end
$$;
revoke execute on function public.studio_notify(text, text, text, text, text, text, text[], text, uuid[], uuid[], interval)
  from public, anon, authenticated;
grant execute on function public.studio_notify(text, text, text, text, text, text, text[], text, uuid[], uuid[], interval)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Fontes de eventos (triggers, sempre defensivos)
-- ---------------------------------------------------------------------------
-- 5.1 Denúncias: 3 na mesma matéria em 24 h (urgente), direito de resposta pedido.
create or replace function public.studio_notify_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if new.kind = 'right_of_reply' then
    perform public.studio_notify('reply_pending', 'warn', 'Direito de resposta pedido',
      coalesce(nullif(left(new.message, 160), ''), 'Pedido sem texto.'),
      '/estudio/denuncias', new.content_ref, array['editor_chefe', 'moderador'], 'reply:' || new.id);
  end if;
  select count(*) into n from public.reports
   where content_ref = new.content_ref and created_at > now() - interval '24 hours';
  if n >= 3 then
    perform public.studio_notify('reports_burst', 'urgent', n || ' denúncias na mesma matéria',
      'A matéria recebeu ' || n || ' denúncias em 24 horas. Revise e responda.',
      '/estudio/denuncias', new.content_ref, array['editor_chefe', 'moderador'],
      'reports3:' || new.content_ref || ':' || to_char(now() at time zone 'America/Cuiaba', 'YYYYMMDD'));
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_report: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_report() from public, anon, authenticated;
create or replace trigger studio_notify_on_report after insert on public.reports
  for each row execute function public.studio_notify_on_report();

-- 5.2 Correção pendente.
create or replace function public.studio_notify_on_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'open' then
    perform public.studio_notify('correction_pending', 'warn', 'Correção pendente',
      coalesce(nullif(left(new.public_note, 160), ''), 'Correção aguardando decisão.'),
      '/estudio/correcoes', 'article:' || new.article_id, array['editor_chefe', 'editor', 'revisor'],
      'correction:' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_correction: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_correction() from public, anon, authenticated;
create or replace trigger studio_notify_on_correction after insert on public.corrections
  for each row execute function public.studio_notify_on_correction();

-- 5.3 Aprovações duas-pessoas pendentes (quem pediu não é notificado). `push.urgent` vem do
--     envio (5.6), com o título da matéria.
create or replace function public.studio_notify_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_roles text[];
  v_href text := '/estudio/control/aprovacoes';
  v_who text;
begin
  if new.status <> 'pending' or new.kind = 'push.urgent' then return new; end if;
  v_label := case new.kind
    when 'rules.activate' then 'ativar regras de publicação'
    when 'force_review.disable' then 'desligar a revisão forçada'
    when 'safety.disable' then 'liberar publicação de segurança'
    when 'prompt.publish' then 'publicar prompt de IA'
    when 'rec.weights' then 'mudar pesos da recomendação'
    when 'role.admin' then 'conceder papel de administrador'
    when 'source.critical' then 'mudar fonte crítica'
    when 'push.highlight' then 'enviar push de destaque'
    when 'push.resume' then 'retomar envio de push'
    else new.kind end;
  v_roles := case when new.kind in ('rec.weights', 'role.admin')
    then array['admin'] else array['admin', 'editor_chefe'] end;
  if new.kind like 'push.%' then v_href := '/estudio/admin/notificacoes'; end if;
  select display_name into v_who from public.profiles where id = new.requested_by;
  perform public.studio_notify('approval_pending', 'warn',
    'Aprovação pendente: ' || v_label,
    coalesce(v_who, 'Alguém') || ' pediu e precisa de uma segunda pessoa.',
    v_href, 'approval:' || new.id, v_roles, 'approval:' || new.id,
    '{}'::uuid[], array[new.requested_by]);
  return new;
exception when others then
  raise warning 'studio_notify_on_approval: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_approval() from public, anon, authenticated;
create or replace trigger studio_notify_on_approval after insert on public.approvals
  for each row execute function public.studio_notify_on_approval();

-- 5.4 Disjuntor de publicação aberto (e religado = backlog liberado).
create or replace function public.studio_notify_on_breaker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_why text;
begin
  if new.tripped_at is not null and old.tripped_at is distinct from new.tripped_at then
    v_why := case new.trip_reason
      when 'hourly' then 'limite de publicações por hora'
      when 'daily' then 'limite de publicações por dia'
      when 'reports' then 'pico de denúncias'
      when 'ai_failures' then 'pico de falhas de IA'
      else 'limite do disjuntor' end;
    perform public.studio_notify('breaker_open', 'urgent', 'Disjuntor aberto: publicação automática pausada',
      'Motivo: ' || v_why || '. Revise no Control Center.',
      '/estudio/control', 'breaker', array['admin', 'editor_chefe', 'operador_ia'],
      'breaker:' || extract(epoch from new.tripped_at)::bigint);
  elsif new.tripped_at is null and old.tripped_at is not null then
    perform public.studio_notify('backlog_released', 'info', 'Disjuntor religado: fila liberada',
      'O disjuntor foi zerado. A publicação automática segue desligada até duas pessoas religarem.',
      '/estudio/control', 'breaker', array['admin', 'editor_chefe', 'operador_ia'],
      'breaker_reset:' || extract(epoch from coalesce(new.reset_at, now()))::bigint);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_breaker: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_breaker() from public, anon, authenticated;
create or replace trigger studio_notify_on_breaker after update on public.publish_breaker
  for each row execute function public.studio_notify_on_breaker();

-- 5.5 Fonte pausada por falhas ou bloqueada.
create or replace function public.studio_notify_on_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_what text;
begin
  if new.status is distinct from old.status
     and (new.status = 'blocked'
          or (new.status = 'paused' and new.status_reason in ('auto_failures', 'robots', 'opt_out', 'legal'))) then
    v_what := case when new.status = 'blocked' then 'bloqueada'
                   when new.status_reason = 'auto_failures' then 'pausada por falhas seguidas'
                   else 'pausada (' || new.status_reason || ')' end;
    perform public.studio_notify('source_paused', 'warn', 'Fonte ' || v_what || ': ' || new.name,
      'A coleta desta fonte parou. Veja o detalhe e decida se retoma.',
      '/estudio/control/fontes', 'source:' || new.id, array['admin', 'editor_chefe', 'operador_ia'],
      'source:' || new.id || ':' || new.status || ':' || to_char(now(), 'YYYYMMDDHH24'));
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_source: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_source() from public, anon, authenticated;
create or replace trigger studio_notify_on_source after update of status on public.sources
  for each row execute function public.studio_notify_on_source();

-- 5.6 Push urgente aguardando aprovação.
create or replace function public.studio_notify_on_push_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'urgent' and new.status = 'pending_approval' then
    perform public.studio_notify('push_urgent_pending', 'urgent', 'Push urgente aguardando aprovação',
      left(new.title, 120), '/estudio/admin/notificacoes', 'push:' || new.id,
      array['admin', 'editor_chefe'], 'push_urgent:' || new.id,
      '{}'::uuid[], case when new.requested_by is null then '{}'::uuid[] else array[new.requested_by] end);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_push_send: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_push_send() from public, anon, authenticated;
create or replace trigger studio_notify_on_push_send after insert on public.push_sends
  for each row execute function public.studio_notify_on_push_send();

-- 5.7 Publicação forçada concluída (avisa quem pediu e a chefia).
create or replace function public.studio_notify_on_forced_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform public.studio_notify('forced_publish_done', 'info', 'Publicação forçada concluída',
      (new.done) || ' de ' || new.total || ' matérias publicadas' ||
        case when new.failed > 0 then ', ' || new.failed || ' com falha.' else '.' end,
      '/estudio/fila', 'forced_job:' || new.id, array['editor_chefe'], 'forced:' || new.id,
      array[new.requested_by]);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_forced_publish: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_forced_publish() from public, anon, authenticated;
create or replace trigger studio_notify_on_forced_publish after update of status on public.forced_publish_jobs
  for each row execute function public.studio_notify_on_forced_publish();

-- 5.8 Sugestão de evento de leitor.
create or replace function public.studio_notify_on_event_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.studio_notify('event_suggestion', 'info', 'Sugestão de evento de leitor',
      coalesce(nullif(left(new.payload ->> 'title', 140), ''), 'Evento sem título.'),
      '/estudio/agenda/sugestoes', 'event_submission:' || new.id, array['editor_chefe', 'editor'],
      'event_submission:' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'studio_notify_on_event_submission: %', sqlerrm;
  return new;
end
$$;
revoke execute on function public.studio_notify_on_event_submission() from public, anon, authenticated;
create or replace trigger studio_notify_on_event_submission after insert on public.event_submissions
  for each row execute function public.studio_notify_on_event_submission();

-- ---------------------------------------------------------------------------
-- 6. Varredura periódica (o que não tem evento de origem): revisão vencida, denúncias fora do
--    prazo de 24 h e falhas de IA em pico (abaixo do disjuntor, que é só para o pipeline).
-- ---------------------------------------------------------------------------
create or replace function public.studio_notifications_sweep(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  made int := 0;
  v_day text := to_char(p_now at time zone 'America/Cuiaba', 'YYYYMMDD');
  v_id uuid;
begin
  select count(*) into n from public.articles
   where status = 'in_review' and updated_at < p_now - interval '6 hours';
  if n > 0 then
    v_id := public.studio_notify('review_overdue', 'warn', n || ' matérias há mais de 6 h na revisão',
      'A fila de revisão tem itens vencidos.', '/estudio/fila', 'queue:review',
      array['editor_chefe', 'editor'],
      'review_overdue:' || v_day || ':' || (extract(hour from p_now at time zone 'America/Cuiaba')::int / 6));
    if v_id is not null then made := made + 1; end if;
  end if;

  select count(*) into n from public.reports where status = 'open' and due_at < p_now;
  if n > 0 then
    v_id := public.studio_notify('reports_overdue', 'warn', n || ' denúncias fora do prazo de 24 h',
      'Responda ou encerre as denúncias vencidas.', '/estudio/denuncias', 'queue:reports',
      array['editor_chefe', 'moderador'], 'reports_overdue:' || v_day);
    if v_id is not null then made := made + 1; end if;
  end if;

  select count(*) into n from public.ai_calls
   where not ok and created_at >= p_now - interval '1 hour';
  if n >= 5 then
    v_id := public.studio_notify('ai_failures', 'warn', n || ' falhas de IA na última hora',
      'Verifique modelos, chaves e custos.', '/estudio/control/falhas', 'ai:failures',
      array['admin', 'operador_ia'],
      'ai_failures:' || v_day || ':' || extract(hour from p_now at time zone 'America/Cuiaba')::int);
    if v_id is not null then made := made + 1; end if;
  end if;
  return made;
end
$$;
revoke execute on function public.studio_notifications_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_notifications_sweep(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Push de urgências para a equipe: quem optou (`staff_alerts`) e tem papel na audiência.
--    O envio é feito pelo servidor (src/lib/studio-notifications/push.ts) com o mesmo
--    `PushSender` do push do leitor; aqui só se escolhe e se marca.
-- ---------------------------------------------------------------------------
create or replace function public.studio_urgent_push_due(p_now timestamptz default now())
returns table (id uuid, title text, body text, href text, subs jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.title, n.body, n.href,
         coalesce((
           select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
             from public.push_subscriptions s
            where s.staff_alerts and s.user_id is not null
              and public.studio_notification_visible(n.audience, s.user_id)
         ), '[]'::jsonb) as subs
    from public.studio_notifications n
   where n.severity = 'urgent' and n.push_sent_at is null
     and n.created_at > p_now - interval '2 hours'
   order by n.created_at
   limit 20
$$;
revoke execute on function public.studio_urgent_push_due(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_urgent_push_due(timestamptz) to service_role;

create or replace function public.studio_urgent_push_done(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.studio_notifications set push_sent_at = now()
   where id = any (coalesce(p_ids, '{}'::uuid[])) and push_sent_at is null
$$;
revoke execute on function public.studio_urgent_push_done(uuid[]) from public, anon, authenticated;
grant execute on function public.studio_urgent_push_done(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 8. pg_cron: varredura a cada 10 minutos (sem pg_cron o drain cobre, como no push).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    raise notice 'sem pg_cron: nada agendado (o drain chama studio_notifications_sweep)';
    return;
  end if;
  perform cron.schedule('studio-notifications-sweep', '*/10 * * * *',
    'select public.studio_notifications_sweep(now())');
end $$;
