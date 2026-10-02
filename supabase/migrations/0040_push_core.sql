-- PWA e notificações (spec docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md §11;
-- plano PW-T1). Núcleo do push no banco: inscrições, envios, lotes, entregas, contadores
-- agregados e a reserva atômica `push_reserve`, única porta de entrada de qualquer envio.
--
-- Ordem: tabelas → índices → funções → RLS → grants. Trilhos (D-P07, D-P08, D-P16, G5, G6):
-- máx. 3 por dia de Cuiabá por inscrição (urgente conta), silêncio 22h–7h adia `follow` e
-- `highlight` (urgente passa), a mesma matéria nunca duas vezes na mesma inscrição (índice
-- único parcial), 404/410 apaga a inscrição. Nada aqui é auditado por inscrição (dado de leitor).

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create or replace function public.push_targets_valid(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null
     and cardinality(p) <= 200
     and not exists (
       select 1 from unnest(p) t where t !~ '^(source|section|topic|bairro):[a-z0-9-]{1,80}$'
     );
$$;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null check (endpoint ~ '^https?://' and length(endpoint) <= 1024),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  endpoint_host text,
  browser text check (browser in ('chrome','safari','firefox','edge','samsung','other')),
  device_class text check (device_class in ('mobile','tablet','desktop')),
  platform text check (platform in ('android','ios','macos','windows','linux','other')),
  installed boolean not null default false,
  user_id uuid references profiles(id) on delete cascade,
  manage_token_hash text not null,
  want_follow boolean not null default true,
  want_urgent boolean not null default true,
  want_highlight boolean not null default true,
  targets text[] not null default '{}' check (push_targets_valid(targets)),
  quiet_start smallint not null default 22 check (quiet_start between 18 and 22),
  quiet_end smallint not null default 7 check (quiet_end between 7 and 10),
  daily_limit smallint not null default 3 check (daily_limit between 1 and 3),
  metrics_consent boolean not null default false,
  day_key date,
  day_count smallint not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  consecutive_failures int not null default 0
);
create index push_subscriptions_targets_idx on push_subscriptions using gin (targets);
create index push_subscriptions_user_idx on push_subscriptions (user_id) where user_id is not null;

create table push_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('follow','urgent','highlight')),
  article_id uuid not null references articles(id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  body text not null check (length(body) between 1 and 120),
  origin_label text not null,
  url text not null check (url ~ '^/' and url !~ '^//'),
  tag text not null,
  audience jsonb not null default '{"type":"targets"}',
  status text not null default 'pending_approval' check (status in (
    'pending_approval','scheduled','queued','dispatching','sent','paused','cancelled','rejected','expired'
  )),
  requested_by uuid references profiles(id) on delete set null,
  justification text,
  scheduled_at timestamptz,
  not_before timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  approval_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  status_reason text,
  targets_n int not null default 0,
  queued_n int not null default 0,
  accepted_n int not null default 0,
  failed_n int not null default 0,
  removed_n int not null default 0,
  skipped_quiet_n int not null default 0,
  skipped_limit_n int not null default 0,
  skipped_duplicate_n int not null default 0,
  skipped_pref_n int not null default 0,
  sent_measurable_n int not null default 0,
  batches_total int not null default 0,
  batches_done int not null default 0,
  version int not null default 1,
  check (kind = 'follow' or requested_by is not null)
);
create unique index push_sends_follow_article_uidx on push_sends (article_id) where kind = 'follow';
create index push_sends_status_idx on push_sends (status, created_at desc);
create index push_sends_created_idx on push_sends (created_at desc);

create table push_batches (
  send_id uuid not null references push_sends(id) on delete cascade,
  batch_no int not null,
  after_id uuid,
  until_id uuid not null,
  status text not null default 'queued' check (status in ('queued','done','paused','expired')),
  primary key (send_id, batch_no)
);

create table push_deliveries (
  id bigserial primary key,
  send_id uuid not null references push_sends(id) on delete cascade,
  subscription_id uuid references push_subscriptions(id) on delete set null,
  article_id uuid not null,
  status text not null check (status in ('queued','deferred','sent','failed','expired','skipped')),
  skip_reason text check (skip_reason in ('pref','limit','quiet','duplicate','coalesced','expired','gone')),
  not_before timestamptz,
  attempts int not null default 0,
  http_status int,
  error_code text,
  device_class text,
  browser text,
  measurable boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index push_deliveries_once_uidx on push_deliveries (subscription_id, article_id)
  where status in ('queued','deferred','sent');
create index push_deliveries_send_idx on push_deliveries (send_id, status);
create index push_deliveries_due_idx on push_deliveries (not_before) where status in ('queued','deferred');
create index push_deliveries_created_idx on push_deliveries (created_at);

create table push_send_counters (
  send_id uuid not null references push_sends(id) on delete cascade,
  device_class text not null,
  browser text not null,
  delivered int not null default 0,
  clicked int not null default 0,
  primary key (send_id, device_class, browser)
);

-- ---------------------------------------------------------------------------
-- 2. Funções auxiliares (relógio de Cuiabá e configurações)
-- ---------------------------------------------------------------------------
create or replace function public.push_local_day(p_ts timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_ts at time zone 'America/Cuiaba')::date;
$$;

-- Lê um inteiro de `app_settings` (tabela criada em 0011; sem ela ou sem a chave, o padrão).
create or replace function public.push_settings_int(p_key text, p_default int)
returns int
language plpgsql
stable
set search_path = public
as $$
declare
  v int;
begin
  if to_regclass('public.app_settings') is null then
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

-- Fim do silêncio efetivo a partir de `p_now`: hoje às `p_end` se a hora local ainda não chegou
-- lá; senão amanhã (o silêncio começa à noite e termina de manhã).
create or replace function public.push_quiet_ends_at(p_now timestamptz, p_end int)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when extract(hour from (p_now at time zone 'America/Cuiaba')) < p_end
      then ((p_now at time zone 'America/Cuiaba')::date + make_time(p_end, 0, 0)) at time zone 'America/Cuiaba'
    else ((p_now at time zone 'America/Cuiaba')::date + 1 + make_time(p_end, 0, 0)) at time zone 'America/Cuiaba'
  end;
$$;

create or replace function public.push_ttl_hours(p_kind text)
returns int
language sql
immutable
as $$
  select case p_kind when 'follow' then 6 when 'urgent' then 2 else 12 end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reserva atômica (G5, G6): decide uma entrega para (inscrição, envio) com a linha da
-- inscrição travada. Mesma ordem de `decideReservation` (src/lib/push/rules.ts):
-- preferência → duplicata → silêncio → limite → ok.
-- ---------------------------------------------------------------------------
create or replace function public.push_reserve(p_sub uuid, p_send uuid, p_now timestamptz default now())
returns table (outcome text, delivery_id bigint)
language plpgsql
set search_path = public
as $$
declare
  s push_sends%rowtype;
  sub push_subscriptions%rowtype;
  v_today date := push_local_day(p_now);
  v_count int;
  v_want boolean;
  v_quiet_start int;
  v_quiet_end int;
  v_hour int;
  v_limit int;
  v_not_before timestamptz;
  v_ttl_end timestamptz;
  v_id bigint;
begin
  select * into s from push_sends where id = p_send;
  if not found then
    raise exception 'envio % não existe', p_send using errcode = 'P0002';
  end if;
  select * into sub from push_subscriptions where id = p_sub for update;
  if not found then
    return query select 'gone'::text, null::bigint;
    return;
  end if;

  v_count := case when sub.day_key is distinct from v_today then 0 else sub.day_count end;
  v_want := case s.kind when 'follow' then sub.want_follow when 'urgent' then sub.want_urgent else sub.want_highlight end;

  if not v_want then
    insert into push_deliveries (send_id, subscription_id, article_id, status, skip_reason, created_at)
    values (s.id, sub.id, s.article_id, 'skipped', 'pref', p_now) returning id into v_id;
    update push_sends set skipped_pref_n = skipped_pref_n + 1 where id = s.id;
    return query select 'skipped_pref'::text, v_id;
    return;
  end if;

  if exists (select 1 from push_deliveries d
             where d.subscription_id = sub.id and d.article_id = s.article_id
               and d.status in ('queued','deferred','sent')) then
    insert into push_deliveries (send_id, subscription_id, article_id, status, skip_reason, created_at)
    values (s.id, sub.id, s.article_id, 'skipped', 'duplicate', p_now) returning id into v_id;
    update push_sends set skipped_duplicate_n = skipped_duplicate_n + 1 where id = s.id;
    return query select 'skipped_duplicate'::text, v_id;
    return;
  end if;

  if s.kind <> 'urgent' then
    v_quiet_start := least(sub.quiet_start, push_settings_int('push.quiet_start', 22));
    v_quiet_end := greatest(sub.quiet_end, push_settings_int('push.quiet_end', 7));
    v_hour := extract(hour from (p_now at time zone 'America/Cuiaba'));
    if v_hour >= v_quiet_start or v_hour < v_quiet_end then
      v_not_before := push_quiet_ends_at(p_now, v_quiet_end);
      v_ttl_end := coalesce(s.started_at, p_now) + make_interval(hours => push_ttl_hours(s.kind));
      if v_not_before <= v_ttl_end then
        if s.kind = 'follow' then
          -- Um só aviso por inscrição no fim do silêncio: o anterior adiado vira agrupado.
          update push_deliveries set status = 'skipped', skip_reason = 'coalesced'
           where subscription_id = sub.id and status = 'deferred'
             and send_id in (select id from push_sends where kind = 'follow');
        end if;
        insert into push_deliveries (send_id, subscription_id, article_id, status, not_before, device_class, browser, measurable, created_at)
        values (s.id, sub.id, s.article_id, 'deferred', v_not_before, sub.device_class, sub.browser, sub.metrics_consent, p_now)
        returning id into v_id;
        return query select 'deferred'::text, v_id;
        return;
      end if;
      insert into push_deliveries (send_id, subscription_id, article_id, status, skip_reason, created_at)
      values (s.id, sub.id, s.article_id, 'skipped', 'quiet', p_now) returning id into v_id;
      update push_sends set skipped_quiet_n = skipped_quiet_n + 1 where id = s.id;
      return query select 'skipped_quiet'::text, v_id;
      return;
    end if;
  end if;

  v_limit := least(sub.daily_limit, greatest(1, least(3, push_settings_int('push.default_daily_limit', 3))));
  if v_count >= v_limit then
    insert into push_deliveries (send_id, subscription_id, article_id, status, skip_reason, created_at)
    values (s.id, sub.id, s.article_id, 'skipped', 'limit', p_now) returning id into v_id;
    update push_sends set skipped_limit_n = skipped_limit_n + 1 where id = s.id;
    update push_subscriptions set day_key = v_today, day_count = v_count where id = sub.id;
    return query select 'skipped_limit'::text, v_id;
    return;
  end if;

  begin
    insert into push_deliveries (send_id, subscription_id, article_id, status, device_class, browser, measurable, created_at)
    values (s.id, sub.id, s.article_id, 'queued', sub.device_class, sub.browser, sub.metrics_consent, p_now)
    returning id into v_id;
  exception when unique_violation then
    insert into push_deliveries (send_id, subscription_id, article_id, status, skip_reason, created_at)
    values (s.id, sub.id, s.article_id, 'skipped', 'duplicate', p_now) returning id into v_id;
    update push_sends set skipped_duplicate_n = skipped_duplicate_n + 1 where id = s.id;
    return query select 'skipped_duplicate'::text, v_id;
    return;
  end;
  update push_subscriptions set day_key = v_today, day_count = v_count + 1 where id = sub.id;
  update push_sends set queued_n = queued_n + 1 where id = s.id;
  return query select 'ok'::text, v_id;
end
$$;

-- Entrega adiada (ou reagendada) chegou à hora: reconfere inscrição, TTL e limite do dia.
create or replace function public.push_claim_due(p_delivery bigint, p_now timestamptz)
returns text
language plpgsql
set search_path = public
as $$
declare
  d push_deliveries%rowtype;
  s push_sends%rowtype;
  sub push_subscriptions%rowtype;
  v_today date := push_local_day(p_now);
  v_count int;
  v_limit int;
begin
  select * into d from push_deliveries where id = p_delivery for update;
  if not found then
    return 'gone';
  end if;
  if d.status = 'skipped' and d.skip_reason = 'coalesced' then
    return 'coalesced';
  end if;
  if d.status not in ('queued','deferred') then
    return 'gone';
  end if;
  select * into s from push_sends where id = d.send_id;
  if d.subscription_id is null or not exists (select 1 from push_subscriptions where id = d.subscription_id) then
    update push_deliveries set status = 'skipped', skip_reason = 'gone' where id = d.id;
    return 'gone';
  end if;
  if p_now > coalesce(s.started_at, d.created_at) + make_interval(hours => push_ttl_hours(s.kind)) then
    update push_deliveries set status = 'expired', skip_reason = 'expired' where id = d.id;
    if d.status = 'queued' then
      update push_sends set queued_n = greatest(queued_n - 1, 0) where id = s.id;
    end if;
    return 'expired';
  end if;
  if d.status = 'queued' then
    return 'ok';
  end if;
  select * into sub from push_subscriptions where id = d.subscription_id for update;
  v_count := case when sub.day_key is distinct from v_today then 0 else sub.day_count end;
  v_limit := least(sub.daily_limit, greatest(1, least(3, push_settings_int('push.default_daily_limit', 3))));
  if v_count >= v_limit then
    update push_deliveries set status = 'skipped', skip_reason = 'limit' where id = d.id;
    update push_sends set skipped_limit_n = skipped_limit_n + 1 where id = s.id;
    return 'skipped_limit';
  end if;
  update push_deliveries set status = 'queued', not_before = null where id = d.id;
  update push_subscriptions set day_key = v_today, day_count = v_count + 1 where id = sub.id;
  update push_sends set queued_n = queued_n + 1 where id = s.id;
  return 'ok';
end
$$;

-- Resultado do serviço de push (spec §12.3): aceito, sumido (404/410), retentativa ou falha.
create or replace function public.push_delivery_result(
  p_delivery bigint, p_outcome text, p_http int default null, p_error text default null, p_retry_at timestamptz default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  d push_deliveries%rowtype;
  v_days int;
begin
  select * into d from push_deliveries where id = p_delivery for update;
  if not found then
    return;
  end if;
  if p_outcome = 'accepted' then
    update push_deliveries set status = 'sent', http_status = p_http, sent_at = now(), not_before = null where id = d.id;
    update push_sends set accepted_n = accepted_n + 1,
                          sent_measurable_n = sent_measurable_n + (case when d.measurable then 1 else 0 end)
     where id = d.send_id;
    update push_subscriptions set last_success_at = now(), consecutive_failures = 0 where id = d.subscription_id;
  elsif p_outcome = 'gone' then
    update push_deliveries set status = 'failed', http_status = p_http, error_code = 'gone', skip_reason = 'gone' where id = d.id;
    update push_sends set removed_n = removed_n + 1 where id = d.send_id;
    delete from push_subscriptions where id = d.subscription_id;
  elsif p_outcome = 'retry' then
    update push_deliveries set status = 'queued', attempts = attempts + 1, http_status = p_http,
                               error_code = left(p_error, 200), not_before = p_retry_at
     where id = d.id;
  elsif p_outcome = 'failed' then
    update push_deliveries set status = 'failed', http_status = p_http, error_code = left(p_error, 200) where id = d.id;
    update push_sends set failed_n = failed_n + 1 where id = d.send_id;
    if d.subscription_id is not null and coalesce(p_http, 0) not between 400 and 499 then
      -- Cinco falhas seguidas (não 4xx) em dias diferentes apagam a inscrição (spec §12.3).
      update push_subscriptions set consecutive_failures = consecutive_failures + 1 where id = d.subscription_id;
      select count(distinct push_local_day(x.created_at)) into v_days
        from push_deliveries x
       where x.subscription_id = d.subscription_id and x.status = 'failed' and x.error_code is distinct from 'gone'
         and coalesce(x.http_status, 0) not between 400 and 499
         and x.created_at > (select coalesce(max(y.sent_at), '-infinity'::timestamptz) from push_deliveries y
                             where y.subscription_id = d.subscription_id and y.status = 'sent');
      if v_days >= 5 then
        delete from push_subscriptions where id = d.subscription_id;
      end if;
    end if;
  else
    raise exception 'resultado % desconhecido', p_outcome using errcode = '22023';
  end if;
end
$$;

-- Recibo agregado (D-P21): só envio iniciado há menos de 48 h; nunca liga a uma inscrição.
create or replace function public.push_receipt_hit(
  p_send uuid, p_event text, p_device text, p_browser text, p_now timestamptz
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if p_event not in ('delivered','clicked') then
    return false;
  end if;
  if not exists (select 1 from push_sends s where s.id = p_send and s.started_at is not null
                   and s.started_at > p_now - interval '48 hours') then
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

-- Retenção (spec §10, §11.3, §14): entregas em 30 dias; inscrição sem visita em 180 dias.
create or replace function public.push_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n_del int;
  n_sub int;
begin
  with gone as (delete from push_deliveries where created_at < p_now - interval '30 days' returning 1)
  select count(*) into n_del from gone;
  with gone as (delete from push_subscriptions where last_seen_at < p_now - interval '180 days' returning 1)
  select count(*) into n_sub from gone;
  return jsonb_build_object('deliveries', n_del, 'subscriptions', n_sub);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS e grants (spec §11.1: anon nada; leitor só as próprias sem chaves; equipe nada)
-- ---------------------------------------------------------------------------
alter table push_subscriptions enable row level security;
alter table push_sends enable row level security;
alter table push_batches enable row level security;
alter table push_deliveries enable row level security;
alter table push_send_counters enable row level security;

revoke all on push_subscriptions, push_sends, push_batches, push_deliveries, push_send_counters from anon, authenticated;
grant select (id, user_id, browser, device_class, platform, installed, want_follow, want_urgent, want_highlight,
              targets, quiet_start, quiet_end, daily_limit, metrics_consent, created_at, last_seen_at, last_success_at)
  on push_subscriptions to authenticated;
create policy push_subscriptions_own on push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create view my_push_subscriptions with (security_invoker = true) as
  select id, browser, device_class, platform, installed, want_follow, want_urgent, want_highlight,
         targets, quiet_start, quiet_end, daily_limit, metrics_consent, created_at, last_seen_at, last_success_at
    from push_subscriptions
   where user_id = (select auth.uid());
grant select on my_push_subscriptions to authenticated;

-- `push_sends` ganha políticas de leitura para a equipe em 0041; aqui ninguém além do serviço lê.

revoke execute on function
  public.push_reserve(uuid, uuid, timestamptz),
  public.push_claim_due(bigint, timestamptz),
  public.push_delivery_result(bigint, text, int, text, timestamptz),
  public.push_receipt_hit(uuid, text, text, text, timestamptz),
  public.push_retention(timestamptz),
  public.push_settings_int(text, int),
  public.push_quiet_ends_at(timestamptz, int)
  from public, anon, authenticated;
grant execute on function
  public.push_reserve(uuid, uuid, timestamptz),
  public.push_claim_due(bigint, timestamptz),
  public.push_delivery_result(bigint, text, int, text, timestamptz),
  public.push_receipt_hit(uuid, text, text, text, timestamptz),
  public.push_retention(timestamptz),
  public.push_settings_int(text, int),
  public.push_quiet_ends_at(timestamptz, int)
  to service_role;
grant execute on function public.push_local_day(timestamptz), public.push_targets_valid(text[]), public.push_ttl_hours(text)
  to anon, authenticated, service_role;
