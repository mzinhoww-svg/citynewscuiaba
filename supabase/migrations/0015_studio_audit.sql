-- P4-T1 · Auditoria das Server Actions do Estúdio (spec §8; architecture §6).
--
-- Toda mutação do Estúdio grava audit_log, inclusive a tentativa negada (Review Focus 2). A
-- política audit_log_insert (0002) só aceita equipe; uma conta de leitor que chame uma Server
-- Action do Estúdio também precisa deixar rastro da negação. Esta função grava sempre em nome
-- de auth.uid() (nunca de outra pessoa) e, para quem não é da equipe, só aceita ações `*.denied`.

create or replace function public.studio_audit(p_actor text, p_action text, p_object_ref text, p_details jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then
    raise exception 'studio_audit: exige usuário autenticado' using errcode = '42501';
  end if;
  if p_actor is distinct from uid::text then
    raise exception 'studio_audit: auditoria só em nome próprio' using errcode = '42501';
  end if;
  if length(p_action) > 80 or length(p_object_ref) > 200 or pg_column_size(p_details) > 16384 then
    raise exception 'studio_audit: registro grande demais' using errcode = '22001';
  end if;
  if not public.is_staff(uid) and p_action not like '%.denied' then
    raise exception 'studio_audit: só a equipe audita ações' using errcode = '42501';
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, p_action, p_object_ref, coalesce(p_details, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end
$$;

revoke execute on function public.studio_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.studio_audit(text, text, text, jsonb) to authenticated, service_role;
