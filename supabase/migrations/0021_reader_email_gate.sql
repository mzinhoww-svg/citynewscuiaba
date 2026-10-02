-- Revisão do gate P2: e-mails para leitores e exclusão de conta.
--
-- I4  · reader_emails.ref: o dedupe de 10 min passa a ser por endereço, tipo e alvo (o alerta ou
--       as listas). Um segundo alerta ou outra lista ganha a própria confirmação.
-- I5  · Exclusão e exportação da conta cobrem o que é guardado pelo e-mail da conta:
--       newsletter_subscriptions, alertas `email:<endereço>` e a fila reader_emails.
-- M5  · Retenção agendada: purge_reader_emails roda todo dia (pg_cron) e também apaga mensagens
--       ainda na fila depois de 30 dias e alertas por e-mail nunca confirmados depois de 7 dias
--       (o link já expirou).
-- M7  · purge_deleted_accounts trata cada conta no próprio bloco: uma falha fica no audit_log
--       (account.delete_failed) e não impede as demais.

alter table reader_emails add column if not exists ref text not null default ''
  check (length(ref) <= 300);
drop index if exists reader_emails_dedupe_idx;
create index if not exists reader_emails_dedupe_idx
  on reader_emails (to_email, kind, ref, created_at desc);
create index if not exists reader_emails_to_idx on reader_emails (to_email);

-- Alertas não tinham data; sem ela não há como expirar o que nunca foi confirmado.
alter table alerts add column if not exists created_at timestamptz not null default now();

create or replace function purge_reader_emails(p_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  m bigint;
begin
  delete from reader_emails
   where created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  delete from alerts
   where owner_ref like 'email:%' and not active
     and created_at < now() - interval '7 days';
  get diagnostics m = row_count;
  return n + m;
end $$;

revoke all on function purge_reader_emails(int) from public, anon, authenticated;
grant execute on function purge_reader_emails(int) to service_role;

-- Dados guardados pelo e-mail de uma conta (apaga). Uso interno da exclusão.
create or replace function purge_email_data(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(trim(p_email));
begin
  if e is null or e = '' then return; end if;
  delete from newsletter_subscriptions where lower(email) = e;
  delete from alerts where owner_ref = 'email:' || e;
  delete from reader_emails where lower(to_email) = e;
end $$;

revoke all on function purge_email_data(text) from public, anon, authenticated;
grant execute on function purge_email_data(text) to service_role;

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
      perform purge_email_data(v_email);
      update events set user_id = null where user_id = r.id;
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

-- Exportação (LGPD): o que está guardado pelo e-mail da conta que chama, só com e-mail
-- confirmado. Da fila, só metadados: o corpo tem links assinados.
create or replace function export_email_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e text;
begin
  select lower(u.email) into e from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if e is null then return null; end if;
  return jsonb_build_object(
    'newsletter', coalesce((select jsonb_agg(jsonb_build_object(
        'list', s.list, 'confirmed_at', s.confirmed_at, 'unsubscribed_at', s.unsubscribed_at)
        order by s.list)
      from newsletter_subscriptions s where lower(s.email) = e), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'target_kind', a.target_kind, 'target_id', a.target_id, 'frequency', a.frequency,
        'channel', a.channel, 'active', a.active, 'created_at', a.created_at)
        order by a.created_at)
      from alerts a where a.owner_ref = 'email:' || e), '[]'::jsonb),
    'emails', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', m.kind, 'subject', m.subject, 'status', m.status, 'created_at', m.created_at,
        'sent_at', m.sent_at)
        order by m.created_at)
      from reader_emails m where lower(m.to_email) = e), '[]'::jsonb)
  );
end $$;

revoke all on function export_email_data() from public, anon;
grant execute on function export_email_data() to authenticated;

-- Diariamente às 4h25 (UTC) quando há pg_cron (mesma guarda de 0014).
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'reader-emails-retention'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'reader-emails-retention', '25 4 * * *',
      'select purge_reader_emails(30)');
  end if;
end $$;
