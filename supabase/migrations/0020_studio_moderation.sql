-- P4-T8 · Sugestões de evento (E13) e denúncias de leitores (E14).
--
-- 1. Decisão sobre a sugestão de evento: quem decidiu, quando, motivo (enviado ao remetente na
--    rejeição) e o evento criado na aprovação.
-- 2. Resposta à denúncia: texto, quem respondeu e quando; respondida sai da fila.
-- 3. Mensagem ao leitor (motivo da rejeição, resposta à denúncia) na fila reader_emails (sem
--    envio até haver provedor, B-005). reader_emails é só do servidor: a função abaixo grava em
--    nome da equipe que modera, com a checagem de papel aqui dentro.

alter table event_submissions
  add column if not exists decided_by uuid references profiles(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists event_id uuid references event_listings(id) on delete set null;
create index if not exists event_submissions_pending_idx on event_submissions (created_at) where status = 'pending';

alter table reports
  add column if not exists response text,
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by uuid references profiles(id);
create index if not exists reports_open_idx on reports (due_at) where status = 'open';

alter table reader_emails drop constraint if exists reader_emails_kind_check;
alter table reader_emails add constraint reader_emails_kind_check
  check (kind in ('newsletter_confirm', 'newsletter_manage', 'alert_confirm', 'event_rejected', 'report_response'));

create or replace function public.studio_queue_reader_email(p_kind text, p_to text, p_subject text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null or not public.has_any_role(uid, '{editor_chefe,editor,moderador}') then
    raise exception 'studio_queue_reader_email: sem permissão' using errcode = '42501';
  end if;
  if p_kind not in ('event_rejected', 'report_response') then
    raise exception 'studio_queue_reader_email: tipo inválido' using errcode = '22023';
  end if;
  insert into reader_emails (kind, to_email, subject, body)
  values (p_kind, lower(trim(p_to)), left(p_subject, 200), left(p_body, 4000))
  returning id into new_id;
  return new_id;
end
$$;
revoke execute on function public.studio_queue_reader_email(text, text, text, text) from public, anon;
grant execute on function public.studio_queue_reader_email(text, text, text, text) to authenticated, service_role;
