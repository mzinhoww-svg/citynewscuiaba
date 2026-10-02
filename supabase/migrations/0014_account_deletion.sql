-- Exclusão de conta do leitor (P2-T12, docs/screens.md P20): o leitor pede em /perfil digitando
-- EXCLUIR; a conta fica marcada (profiles.delete_requested_at, gravado pelo próprio leitor via
-- profiles_update_self) e é apagada 7 dias depois, a menos que ele cancele.
--
-- O que sai: seguidas, salvos, alertas, coleções pessoais, perfil e o usuário do Auth. Eventos
-- ficam só para contagem (user_id = null). Contas da equipe (com papel em user_roles) não são
-- apagadas por aqui: a remoção passa pela administração (A02, regra de duas pessoas).

alter table profiles add column if not exists delete_requested_at timestamptz;

create or replace function purge_deleted_accounts(p_days int default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint := 0;
begin
  for r in
    select p.id
      from profiles p
     where p.delete_requested_at is not null
       and p.delete_requested_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (select 1 from user_roles ur where ur.user_id = p.id)
  loop
    delete from follows where owner_ref = r.id::text;
    delete from saved_items where owner_ref = r.id::text;
    delete from alerts where owner_ref = r.id::text;
    delete from collections where owner_ref = r.id::text and not is_editorial;
    update events set user_id = null where user_id = r.id;
    delete from profiles where id = r.id;
    delete from auth.users where id = r.id;
    insert into audit_log (actor, action, object_ref, details)
    values ('system', 'account.deleted', 'profile:' || r.id::text, jsonb_build_object('after_days', p_days));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function purge_deleted_accounts(int) from public, anon, authenticated;
grant execute on function purge_deleted_accounts(int) to service_role;

-- Diariamente às 4h10 (UTC) quando há pg_cron.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'account-deletion'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'account-deletion', '10 4 * * *',
      'select purge_deleted_accounts(7)');
  end if;
end $$;
