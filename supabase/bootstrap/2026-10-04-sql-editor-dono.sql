-- SQL para o dono rodar no SQL Editor do Supabase (projeto citynews-prod), 04/10/2026, A-152.
-- O conector do Supabase usado pelo agente trava em qualquer instrução com DELETE (pede uma
-- confirmação humana que a sessão não consegue dar), então estas duas partes ficam para o editor.
-- As duas são idempotentes: rodar de novo não muda nada. Rode o arquivo inteiro de uma vez.
--
-- 1. 0143 parte C: o expurgo de contas só apaga os dados ligados ao e-mail (newsletter, alertas
--    "email:", fila de e-mails) quando a posse do e-mail foi provada. As partes A e B da 0143 já
--    foram aplicadas pelo agente.
-- 2. 0155: limpeza diária dos sinais da pauta quente com mais de 7 dias.
--
-- Conferir depois:
--   select prosrc like '%email_ownership_proven%' from pg_proc where proname = 'purge_deleted_accounts';
--   select schedule from cron.job where jobname = 'front-signals-purge';

-- Mesma versão de 0024; o dado do e-mail só é apagado com prova de posse. A conta, o perfil e o
-- que é guardado pelo id continuam sendo apagados sempre.
create or replace function purge_deleted_accounts(p_days int default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint := 0;
  v_email text;
begin
  for r in
    select p.id
      from profiles p
     where p.delete_requested_at is not null
       and p.delete_requested_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (select 1 from user_roles ur where ur.user_id = p.id)
  loop
    begin
      select u.email into v_email from auth.users u where u.id = r.id;
      delete from follows where owner_ref = r.id::text;
      delete from saved_items where owner_ref = r.id::text;
      delete from alerts where owner_ref = r.id::text;
      delete from collections where owner_ref = r.id::text and not is_editorial;
      if email_ownership_proven(r.id) then
        perform purge_email_data(v_email);
      end if;
      update events set user_id = null where user_id = r.id;
      -- Ex-integrante da equipe: some da origem por campo (a tela mostra "Ex-integrante").
      update articles set field_origins = scrub_field_origins(field_origins, r.id::text)
       where field_origins::text like '%' || r.id::text || '%';
      delete from profiles where id = r.id;
      delete from auth.users where id = r.id;
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.deleted', 'profile:' || r.id::text,
              jsonb_build_object('after_days', p_days));
      n := n + 1;
    exception when others then
      -- Sem o texto do erro nem o e-mail no log: só o código, para investigar sem expor dados.
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.delete_failed', 'profile:' || r.id::text,
              jsonb_build_object('sqlstate', sqlstate));
    end;
  end loop;
  return n;
end $$;

revoke all on function purge_deleted_accounts(int) from public, anon, authenticated;
grant execute on function purge_deleted_accounts(int) to service_role;

-- HOT-T1 · Limpeza de `front_signals` (linhas com mais de 7 dias). Arquivo separado da 0154 porque
-- tem DELETE, que o conector Supabase retém: aplicado pelo dono no SQL Editor. A pauta quente não
-- depende dele (toda leitura já ignora sinais com mais de 7 dias).

create or replace function public.front_signals_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.front_signals where seen_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.front_signals_purge() from public, anon, authenticated;
grant execute on function public.front_signals_purge() to service_role;

-- Diariamente às 4h50 (UTC) quando há pg_cron. Não depende de segredo nem de rede.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'front-signals-purge'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'front-signals-purge', '50 4 * * *',
      'select public.front_signals_purge()');
  end if;
end $$;
