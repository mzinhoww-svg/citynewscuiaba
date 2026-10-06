select 'parte 6 de 10' as inicio;
alter table public.articles add column if not exists quarantined_at timestamptz;
alter table public.articles add column if not exists quarantine_reason text;
alter table public.articles add column if not exists autonomy_level text;
alter table public.articles add column if not exists degraded_reason text;
alter table public.articles drop constraint if exists articles_autonomy_level_check;
alter table public.articles add constraint articles_autonomy_level_check
  check (autonomy_level is null or autonomy_level in ('A0', 'A1', 'A2', 'A3', 'A4'));
alter table public.articles drop constraint if exists articles_next_action_check;
alter table public.articles add constraint articles_next_action_check
  check (next_action is null or next_action in ('rewrite', 'reevaluate', 'await_auto_publish', 'breaker_recovery'));
create index if not exists articles_next_attempt_idx on public.articles (next_attempt_at)
  where next_attempt_at is not null and quarantined_at is null;
create or replace function public.autonomy_due_articles(p_now timestamptz default now(), p_limit int default 50)
returns table (id uuid, topic_id uuid, next_action text, ai_fallback boolean, reprocess_count int)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.topic_id, a.next_action, a.ai_fallback, a.reprocess_count
    from articles a
   where a.status = 'draft'
     and a.next_attempt_at is not null and a.next_attempt_at <= p_now
     and a.quarantined_at is null
     and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
   order by a.next_attempt_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.autonomy_due_articles(timestamptz, int) from public, anon, authenticated;
grant execute on function public.autonomy_due_articles(timestamptz, int) to service_role;
create or replace function public.autonomy_claim_article(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update articles set next_attempt_at = null where id = p_id
$$;
revoke execute on function public.autonomy_claim_article(uuid) from public, anon, authenticated;
grant execute on function public.autonomy_claim_article(uuid) to service_role;
alter table public.publish_breaker add column if not exists auto_resume boolean not null default true;
alter table public.publish_breaker add column if not exists cooldown_minutes int not null default 30;
alter table public.publish_breaker add column if not exists disabled_by_trip boolean not null default false;
select 'parte 6 de 10 ok' as fim;
