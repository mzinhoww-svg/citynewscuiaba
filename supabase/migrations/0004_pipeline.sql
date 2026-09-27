-- Pipeline de ingestão (P3-T1, A-028): extensões, filas, quarentena, eventos e agendamento.
--
-- Filas: tabela `jobs` própria com `select ... for update skip locked` (contorno de docs/AUTONOMY.md §4,
-- A-017). Funciona igual no Supabase real e na pilha local sem pgmq/pg_net. `pgmq` e `pg_net` são
-- habilitados quando existem, mas a fila do app não depende do `pgmq`.
--
-- Semântica (igual à do pgmq): `queue_read` torna a mensagem invisível por `vt` segundos e soma
-- `read_ct`; `queue_ack` apaga; `queue_fail` reagenda com espera; `queue_quarantine` move para
-- `pipeline_quarantine`. Idempotência de enfileiramento por `(queue, dedupe_key)`, com
-- `dedupe_key = '<etapa>:<item>'`: a mesma etapa do mesmo item nunca fica duas vezes na fila.

-- ---------------------------------------------------------------------------
-- Extensões (só se o servidor oferece)
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select from pg_available_extensions where name = 'pgmq') then
    create extension if not exists pgmq;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fila
-- ---------------------------------------------------------------------------
-- `queue` = 'pipeline' | 'media' | 'notify', com prefixo opcional '<namespace>:' (isolamento de testes).
create table jobs (
  id bigserial primary key,
  queue text not null check (queue ~ '^([a-z0-9-]{1,64}:)?(pipeline|media|notify)$'),
  dedupe_key text not null check (length(dedupe_key) between 1 and 512),
  message jsonb not null,
  read_ct int not null default 0,
  enqueued_at timestamptz not null default now(),
  visible_at timestamptz not null default now(),
  last_error text,
  unique (queue, dedupe_key)
);
create index jobs_ready_idx on jobs (queue, visible_at, id);
create index jobs_run_idx on jobs ((message ->> 'runId'));

create table pipeline_quarantine (
  id bigserial primary key,
  queue text not null,
  msg_id bigint not null,
  dedupe_key text not null,
  message jsonb not null,
  read_ct int not null,
  error text not null,
  quarantined_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index pipeline_quarantine_open_idx on pipeline_quarantine (quarantined_at desc) where resolved_at is null;

-- Registro append-only das etapas (etapa 18 "registrar").
create table pipeline_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  run_id uuid references ingest_runs(id),
  step text not null,
  item_ref text,
  level text not null check (level in ('info','warn','error','security')),
  message text not null,
  details jsonb not null default '{}'
);
create index pipeline_events_run_idx on pipeline_events (run_id, at);
create index pipeline_events_security_idx on pipeline_events (at desc) where level = 'security';

create or replace function pipeline_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'pipeline_events é somente inserção'; end $$;
create trigger pipeline_events_immutable before update or delete on pipeline_events
  for each row execute function pipeline_events_immutable();

-- ---------------------------------------------------------------------------
-- Operações da fila (chamadas só pelo servidor com service_role)
-- ---------------------------------------------------------------------------
create or replace function queue_enqueue(p_queue text, p_dedupe_key text, p_message jsonb, p_delay_sec int default 0)
returns bigint
language sql
set search_path = public
as $$
  insert into jobs (queue, dedupe_key, message, visible_at)
  values (p_queue, p_dedupe_key, p_message, now() + make_interval(secs => greatest(p_delay_sec, 0)))
  on conflict (queue, dedupe_key) do nothing
  returning id;
$$;

create or replace function queue_read(p_queue text, p_n int, p_vt_sec int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql
set search_path = public
as $$
  with picked as (
    select id from jobs
    where queue = p_queue and visible_at <= clock_timestamp()
    order by visible_at, id
    limit greatest(p_n, 0)
    for update skip locked
  )
  update jobs j
     set read_ct = j.read_ct + 1,
         visible_at = clock_timestamp() + make_interval(secs => greatest(p_vt_sec, 0))
    from picked
   where j.id = picked.id
  returning j.id, j.read_ct, j.message;
$$;

create or replace function queue_ack(p_queue text, p_msg_id bigint)
returns boolean
language sql
set search_path = public
as $$
  with d as (delete from jobs where queue = p_queue and id = p_msg_id returning 1)
  select exists (select 1 from d);
$$;

-- Falha com nova tentativa: reagenda a mensagem com espera e guarda o erro.
create or replace function queue_fail(p_queue text, p_msg_id bigint, p_error text, p_delay_sec int)
returns void
language sql
set search_path = public
as $$
  update jobs
     set visible_at = clock_timestamp() + make_interval(secs => greatest(p_delay_sec, 0)),
         last_error = left(p_error, 2000)
   where queue = p_queue and id = p_msg_id;
$$;

-- Devolve à fila uma mensagem lida e não processada (fim do tempo do drain): não conta como tentativa.
create or replace function queue_release(p_queue text, p_msg_id bigint)
returns void
language sql
set search_path = public
as $$
  update jobs
     set visible_at = clock_timestamp(), read_ct = greatest(read_ct - 1, 0)
   where queue = p_queue and id = p_msg_id;
$$;

create or replace function queue_quarantine(p_queue text, p_msg_id bigint, p_error text)
returns boolean
language sql
set search_path = public
as $$
  with d as (
    delete from jobs where queue = p_queue and id = p_msg_id
    returning queue, id, dedupe_key, message, read_ct
  ), q as (
    insert into pipeline_quarantine (queue, msg_id, dedupe_key, message, read_ct, error)
    select queue, id, dedupe_key, message, read_ct, left(p_error, 2000) from d
    returning 1
  )
  select exists (select 1 from q);
$$;

-- Varredura: mensagens com tentativas esgotadas que voltaram a ficar visíveis (o worker caiu ou
-- estourou o tempo sem registrar falha) vão para a quarentena.
create or replace function queue_move_exhausted(p_queue text, p_max_reads int)
returns int
language sql
set search_path = public
as $$
  with d as (
    delete from jobs
    where id in (
      select id from jobs
      where queue = p_queue and read_ct >= p_max_reads and visible_at <= clock_timestamp()
      for update skip locked
    )
    returning queue, id, dedupe_key, message, read_ct, last_error
  ), q as (
    insert into pipeline_quarantine (queue, msg_id, dedupe_key, message, read_ct, error)
    select queue, id, dedupe_key, message, read_ct,
           coalesce(last_error, 'tentativas esgotadas sem confirmação') from d
    returning 1
  )
  select count(*)::int from q;
$$;

-- Mensagens pendentes (visíveis ou em processamento), com filtro opcional por run e etapas.
create or replace function queue_pending(p_queue text, p_run_id text default null, p_steps text[] default null)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from jobs
  where queue = p_queue
    and (p_run_id is null or message ->> 'runId' = p_run_id)
    and (p_steps is null or message ->> 'step' = any (p_steps));
$$;

-- Um run por janela de 30 min (Review Focus 2): dois ticks na mesma janela recebem o mesmo run.
create or replace function start_ingest_run(p_window timestamptz)
returns table (run_id uuid, created boolean, stats jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ingest_runs (window_start) values (p_window)
  on conflict (window_start) do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, true, '{}'::jsonb;
  else
    return query select r.id, false, r.stats from ingest_runs r where r.window_start = p_window;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões: tabelas e funções só para o servidor; staff lê quarentena e eventos.
-- ---------------------------------------------------------------------------
alter table jobs enable row level security;
alter table pipeline_quarantine enable row level security;
alter table pipeline_events enable row level security;
revoke all on jobs, pipeline_quarantine, pipeline_events from anon, authenticated;
revoke all on sequence jobs_id_seq, pipeline_quarantine_id_seq, pipeline_events_id_seq from anon, authenticated;
grant select on pipeline_quarantine, pipeline_events to authenticated;
create policy pipeline_quarantine_read_ops on pipeline_quarantine for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy pipeline_events_read_staff on pipeline_events for select to authenticated
  using (is_staff((select auth.uid())));

revoke execute on function
  queue_enqueue(text, text, jsonb, int), queue_read(text, int, int), queue_ack(text, bigint),
  queue_fail(text, bigint, text, int), queue_release(text, bigint), queue_quarantine(text, bigint, text),
  queue_move_exhausted(text, int), queue_pending(text, text, text[]), start_ingest_run(timestamptz),
  pipeline_events_immutable()
  from public, anon, authenticated;
grant execute on function
  queue_enqueue(text, text, jsonb, int), queue_read(text, int, int), queue_ack(text, bigint),
  queue_fail(text, bigint, text, int), queue_release(text, bigint), queue_quarantine(text, bigint, text),
  queue_move_exhausted(text, int), queue_pending(text, text, text[]), start_ingest_run(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento (ADR-003): pg_cron + pg_net chamam o app com o segredo do Vault.
-- Só agenda quando pg_cron, pg_net e os segredos `app_url` e `cron_secret` existem no Vault.
-- Sem isso (pilha local, projeto novo sem segredos) nada é agendado e o watchdog do GitHub
-- (P3-T9) chama o tick. Depois de gravar os segredos no Vault, rode `select schedule_pipeline_cron();`.
-- A URL e o segredo são lidos do Vault a cada execução: nunca ficam gravados em cron.job.
-- ---------------------------------------------------------------------------
create or replace function schedule_pipeline_cron()
returns text
language plpgsql
set search_path = public
as $fn$
declare
  n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre o tick)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;

  -- Tick a cada 30 min.
  execute format('select cron.schedule(%L, %L, %L)', 'ingest-tick', '*/30 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);

  -- Drain a cada minuto, só enquanto houver mensagem pronta nas filas de produção.
  execute format('select cron.schedule(%L, %L, %L)', 'jobs-drain', '* * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/drain',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
    where exists (
      select 1 from public.jobs
      where queue in ('pipeline', 'media', 'notify') and visible_at <= now())
  $cmd$);

  return 'agendado: ingest-tick e jobs-drain';
end $fn$;
revoke execute on function schedule_pipeline_cron() from public, anon, authenticated, service_role;

select schedule_pipeline_cron();
