-- E-mails para leitores sem conta (P2-T9): confirmação dupla da newsletter, link do centro de
-- preferências e confirmação de alerta por e-mail. Sem provedor de envio ainda (B-005): cada
-- mensagem fica `queued` aqui, a fila de saída do canal `notify` para leitores. Nada é enviado.
--
-- Só o servidor lê e grava (service role): o corpo tem link assinado e o endereço do leitor.
-- Retenção: mensagens enviadas ou com falha somem depois de 30 dias (purge_reader_emails).

create table if not exists reader_emails (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('newsletter_confirm', 'newsletter_manage', 'alert_confirm')),
  to_email text not null check (length(to_email) <= 254),
  subject text not null check (length(subject) <= 200),
  body text not null check (length(body) <= 4000),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists reader_emails_queued_idx on reader_emails (created_at)
  where status = 'queued';
-- Dedupe: no máximo uma mensagem do mesmo tipo por endereço a cada 10 min (checado no servidor).
create index if not exists reader_emails_dedupe_idx on reader_emails (to_email, kind, created_at desc);

alter table reader_emails enable row level security;
revoke all on reader_emails from anon, authenticated;

-- Alertas por e-mail de quem não tem conta: owner_ref = 'email:<endereço>' e active = false até a
-- confirmação pelo link assinado. Índice para achar os alertas de um endereço.
create index if not exists alerts_owner_idx on alerts (owner_ref);

create or replace function purge_reader_emails(p_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from reader_emails
   where status in ('sent', 'failed') and created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function purge_reader_emails(int) from public, anon, authenticated;
