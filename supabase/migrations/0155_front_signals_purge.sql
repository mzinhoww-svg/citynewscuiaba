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
