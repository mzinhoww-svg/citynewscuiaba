select 'parte 5 de 10' as inicio;
alter table public.sources drop constraint if exists sources_terms_status_check;
alter table public.sources add constraint sources_terms_status_check
  check (terms_status in ('unknown', 'acknowledged', 'restricted'));
update public.sources set terms_status = 'acknowledged'
 where terms_reviewed_at is not null and terms_status = 'unknown';
create or replace function public.source_usage_mode(p_terms text, p_status text, p_republish text, p_image text)
returns text
language sql
immutable
as $$
  select case
    when p_terms = 'restricted' or p_status = 'blocked' then 'BLOCKED'
    when p_terms = 'unknown' then 'EXCERPT'
    when p_republish = 'summary_2_sentences' and p_image in ('with_agreement', 'reproduction') then 'FULL'
    else 'ATTRIBUTED'
  end
$$;
create or replace function public.sources_terms_status_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.terms_reviewed_at is not null and new.terms_status = 'unknown'
     and (tg_op = 'INSERT' or old.terms_reviewed_at is null) then
    new.terms_status := 'acknowledged';
  end if;
  return new;
end
$$;
drop trigger if exists sources_terms_status on public.sources;
create trigger sources_terms_status before insert or update on public.sources
  for each row execute function public.sources_terms_status_sync();
create or replace function public.guard_source_terms_restricted()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' and new.terms_status = 'restricted' then
    raise exception 'Termos de uso restritivos: a fonte não pode ser ativada.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists sources_terms_restricted on public.sources;
create trigger sources_terms_restricted before update on public.sources
  for each row execute function public.guard_source_terms_restricted();
create or replace function public.governance_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n_expired int := 0;
  n_push int := 0;
begin
  for r in
    select id, kind, target_ref, requested_by, outcome from public.approvals
     where status = 'pending' and expires_at is not null and expires_at < p_now
     for update skip locked
  loop
    update public.approvals
       set status = 'expired', decision_mode = 'system',
           next_action = case when r.outcome = 'human_exception'
             then 'expirou sem decisão humana; o pedido precisa ser refeito com dados novos'
             else 'expirou; o sistema reavalia no próximo pedido' end,
           reason = coalesce(reason, 'Prazo vencido')
     where id = r.id;
    perform public.governance_record(r.kind, r.target_ref, 'expired', r.kind || '.timeout',
      'Prazo do pedido vencido; estado terminal', jsonb_build_object('approvalId', r.id), null, r.id, r.requested_by);
    n_expired := n_expired + 1;
  end loop;
  for r in select id from public.push_sends where status = 'pending_approval' for update skip locked loop
    perform public.push_policy_dispatch(r.id);
    n_push := n_push + 1;
  end loop;
  return jsonb_build_object('expired', n_expired, 'pushEvaluated', n_push);
end
$$;
revoke execute on function public.governance_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.governance_sweep(timestamptz) to service_role;
do $$
begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('governance-sweep', '*/15 * * * *', 'select public.governance_sweep()');
  end if;
end
$$;
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions()
        || array['governance.auto_approved', 'governance.auto_review', 'governance.human_exception',
                 'governance.rejected', 'governance.expired', 'governance.auto_rollback', 'governance.apply']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
alter table public.articles add column if not exists next_action text;
alter table public.articles add column if not exists next_attempt_at timestamptz;
alter table public.articles add column if not exists reprocess_count int not null default 0;
select 'parte 5 de 10 ok' as fim;
