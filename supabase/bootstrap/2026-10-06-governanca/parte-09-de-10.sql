select 'parte 9 de 10' as inicio;
alter table public.pipeline_quarantine add column if not exists next_retry_at timestamptz;
alter table public.pipeline_quarantine add column if not exists auto_retries int not null default 0;
create index if not exists pipeline_quarantine_retry_idx on public.pipeline_quarantine (next_retry_at)
  where resolved_at is null and next_retry_at is not null;
create table if not exists public.pipeline_incidents (
  id bigserial primary key,
  signature text not null,
  step text not null,
  error_class text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count int not null default 0,
  status text not null default 'open' check (status in ('open', 'mitigated', 'resolved')),
  diagnosis text,
  action text,
  resolved_at timestamptz
);
create unique index if not exists pipeline_incidents_open_sig on public.pipeline_incidents (signature)
  where status <> 'resolved';
alter table public.pipeline_incidents enable row level security;
drop policy if exists pipeline_incidents_read_staff on public.pipeline_incidents;
create policy pipeline_incidents_read_staff on public.pipeline_incidents for select to authenticated
  using (public.is_staff((select auth.uid())));
create or replace function public.autonomy_queue_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'queueDepth', (select count(*) from jobs),
    'oldestAgeSec', (select coalesce(extract(epoch from (p_now - min(enqueued_at)))::int, 0) from jobs),
    'retrying', (select count(*) from jobs where last_error is not null),
    'deadLetters', (select count(*) from pipeline_quarantine where resolved_at is null),
    'failuresLastHour', (select count(*) from pipeline_events
                          where at > p_now - interval '1 hour' and level in ('error', 'security')),
    'eventsLastHour', (select count(*) from pipeline_events where at > p_now - interval '1 hour'),
    'reprocessing', (select count(*) from articles
                      where next_attempt_at is not null and quarantined_at is null and status = 'draft'),
    'quarantined24h', (select count(*) from articles where quarantined_at > p_now - interval '24 hours'),
    'humanExceptions', (select count(*) from articles where status = 'in_review'),
    'autoDecisions24h', (select count(*) from decisions
                          where step in ('rules', 'publish') and created_at > p_now - interval '24 hours'),
    'openIncidents', (select count(*) from pipeline_incidents where status = 'open')
  )
$$;
revoke execute on function public.autonomy_queue_health(timestamptz) from public, anon;
grant execute on function public.autonomy_queue_health(timestamptz) to authenticated, service_role;
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(public.studio_audit_actions() || array['breaker.auto_recover']) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
insert into supabase_migrations.schema_migrations (version, name) values ('20261006000170', '0170_autonomous_governance'), ('20261006000171', '0171_autonomy_engine') on conflict do nothing;
select 'parte 9 de 10 ok' as fim;
