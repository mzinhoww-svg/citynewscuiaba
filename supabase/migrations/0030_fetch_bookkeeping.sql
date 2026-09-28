-- Painel de Fontes, FS-T5 fix round 1: contabilidade da coleta idempotente e atômica.
--
-- 1. `mark_fetch_enqueued`: marca `stats.fetch_enqueued` numa só instrução, mesclando o jsonb no
--    banco e só se ainda não estiver marcado. Dois ticks concorrentes (pg_cron e watchdog) não
--    sobrescrevem as estatísticas um do outro; o perdedor recebe `false`.
-- 2. `record_source_fetch`: parâmetros opcionais com `default null` (latência, itens, erro), para
--    a chamada sem amostra de latência não precisar forjar tipos.
-- 3. `record_source_fetch_once`: o resultado final de uma coleta (ok, 304, falha) conta uma vez
--    por (fonte, run). Uma nova tentativa depois de falha ao enfileirar o validate, uma mensagem
--    esgotada varrida por `queue_move_exhausted` depois de já contada, ou uma queda entre a
--    contagem e a quarentena não contam de novo. `false` = já contado (o chamador não aplica
--    `afterFetch`).
-- 4. `queue_move_exhausted` passa a devolver as mensagens movidas para a quarentena: o drain conta
--    a falha final de um `fetch` esgotado pelo mesmo caminho (D-F18).
-- Só `service_role` executa. Nada que dispare SQLSTATE 40001.

create or replace function public.mark_fetch_enqueued(p_run uuid, p_count int, p_extra jsonb default '{}'::jsonb)
returns boolean
language sql
set search_path = public
as $$
  with u as (
    update ingest_runs
       set stats = coalesce(stats, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb)
                   || jsonb_build_object('fetch_enqueued', p_count)
     where id = p_run and not (coalesce(stats, '{}'::jsonb) ? 'fetch_enqueued')
    returning 1
  )
  select exists (select 1 from u);
$$;

create or replace function public.record_source_fetch(
  p_source uuid, p_outcome text, p_latency_ms int default null, p_items_new int default 0, p_error text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Cuiaba')::date;
begin
  insert into source_health_daily
    (day, source_id, fetch_ok, fetch_not_modified, fetch_failed, items_new, latency_ms_sum, latency_samples, last_error)
  values (
    v_day, p_source,
    case when p_outcome = 'ok' then 1 else 0 end,
    case when p_outcome = 'not_modified' then 1 else 0 end,
    case when p_outcome = 'failed' then 1 else 0 end,
    coalesce(p_items_new, 0),
    coalesce(p_latency_ms, 0),
    case when p_latency_ms is not null then 1 else 0 end,
    p_error
  )
  on conflict (day, source_id) do update set
    fetch_ok = source_health_daily.fetch_ok + excluded.fetch_ok,
    fetch_not_modified = source_health_daily.fetch_not_modified + excluded.fetch_not_modified,
    fetch_failed = source_health_daily.fetch_failed + excluded.fetch_failed,
    items_new = source_health_daily.items_new + excluded.items_new,
    latency_ms_sum = source_health_daily.latency_ms_sum + excluded.latency_ms_sum,
    latency_samples = source_health_daily.latency_samples + excluded.latency_samples,
    last_error = coalesce(excluded.last_error, source_health_daily.last_error);
end
$$;

-- Uma linha por (fonte, run) com resultado final já contado. `run_id` é texto (o id da mensagem),
-- sem FK: a limpeza é por tempo (as novas tentativas de um run acabam em minutos).
create table public.source_fetch_outcomes (
  source_id uuid not null references sources(id),
  run_id text not null,
  outcome text not null,
  recorded_at timestamptz not null default now(),
  primary key (source_id, run_id)
);
create index source_fetch_outcomes_recorded_idx on public.source_fetch_outcomes (recorded_at);
alter table public.source_fetch_outcomes enable row level security;
revoke all on public.source_fetch_outcomes from anon, authenticated;

create or replace function public.record_source_fetch_once(
  p_source uuid, p_run text, p_outcome text,
  p_latency_ms int default null, p_items_new int default 0, p_error text default null
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  delete from source_fetch_outcomes where recorded_at < now() - interval '2 days';
  insert into source_fetch_outcomes (source_id, run_id, outcome)
  values (p_source, p_run, p_outcome)
  on conflict (source_id, run_id) do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false;
  end if;
  perform public.record_source_fetch(p_source, p_outcome, p_latency_ms, p_items_new, p_error);
  return true;
end
$$;

drop function public.queue_move_exhausted(text, int);
create function public.queue_move_exhausted(p_queue text, p_max_reads int)
returns table (message jsonb, error text)
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
    returning message, error
  )
  select q.message, q.error from q;
$$;

revoke execute on function
  public.mark_fetch_enqueued(uuid, int, jsonb),
  public.record_source_fetch(uuid, text, int, int, text),
  public.record_source_fetch_once(uuid, text, text, int, int, text),
  public.queue_move_exhausted(text, int)
  from public, anon, authenticated;
grant execute on function
  public.mark_fetch_enqueued(uuid, int, jsonb),
  public.record_source_fetch(uuid, text, int, int, text),
  public.record_source_fetch_once(uuid, text, text, int, int, text),
  public.queue_move_exhausted(text, int)
  to service_role;
