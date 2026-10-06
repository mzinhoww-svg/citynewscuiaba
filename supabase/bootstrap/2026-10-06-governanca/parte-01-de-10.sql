select 'parte 1 de 10' as inicio;
create or replace function public.governance_log(
  p_kind text, p_subject text, p_decision text, p_rule text, p_reason text,
  p_inputs jsonb default '{}'::jsonb, p_confidence numeric default null, p_approval uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_staff(uid) then
    raise exception 'governança: sessão de equipe necessária' using errcode = '42501';
  end if;
  if p_decision not in ('auto_approved', 'auto_review', 'human_exception', 'rejected') then
    raise exception 'governança: decisão % inválida', p_decision using errcode = '22023';
  end if;
  if p_approval is not null then
    update public.approvals
       set decision_mode = 'system',
           outcome = case p_decision when 'auto_approved' then 'auto_apply' else p_decision end,
           policy_version = (public.governance_policy()->>'version')::int,
           rule_id = p_rule, reason = left(p_reason, 1000), policy_inputs = coalesce(p_inputs, '{}'::jsonb),
           confidence = p_confidence
     where id = p_approval and requested_by = uid;
  end if;
  return public.governance_record(p_kind, p_subject, p_decision, p_rule, left(p_reason, 1000),
    coalesce(p_inputs, '{}'::jsonb), p_confidence, p_approval, uid);
end
$$;
revoke execute on function public.governance_log(text, text, text, text, text, jsonb, numeric, uuid) from public, anon;
grant execute on function public.governance_log(text, text, text, text, text, jsonb, numeric, uuid) to authenticated, service_role;
drop policy if exists approvals_decide on public.approvals;
create policy approvals_decide on public.approvals for update to authenticated
  using (
    public.has_any_role((select auth.uid()), '{admin,editor_chefe}')
    or (kind = 'rec.weights' and public.has_role((select auth.uid()), 'operador_ia'))
  )
  with check (
    (public.has_any_role((select auth.uid()), '{admin,editor_chefe}')
     or (kind = 'rec.weights' and public.has_role((select auth.uid()), 'operador_ia')))
    and approved_by = (select auth.uid())
  );
select 'parte 1 de 10 ok' as fim;
