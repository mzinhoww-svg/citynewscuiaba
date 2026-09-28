-- Gate do P4, achados 8 e 9.
--
-- 8. studio_queue_reader_email: destinatário e texto vêm do registro de origem (sugestão
--    rejeitada ou denúncia respondida), nunca do chamador; a ref precisa existir. Corpo de
--    modelo fixo, com os campos do leitor e da redação escapados. Papel conforme o tipo
--    (agenda para sugestão; reports.moderate para denúncia). Uma mensagem por ref e tipo.
-- 9. studio_audit: ação em lista fechada (as do Estúdio, com `.denied` opcional). Conta fora da
--    equipe só grava negação, com detalhes até 1 KB, sem repetir a mesma negação em 10 min e
--    até 20 por minuto (o excedente é descartado: audit_log não aceita delete).

create or replace function public.email_escape(p text, p_max int)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(replace(replace(
           left(regexp_replace(coalesce(p, ''), '[[:cntrl:]]+', ' ', 'g'), p_max),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;
revoke execute on function public.email_escape(text, int) from public, anon, authenticated;

drop function if exists public.studio_queue_reader_email(text, text, text, text, text);
create or replace function public.studio_queue_reader_email(p_kind text, p_ref text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ref_id uuid;
  v_to text;
  v_subject text;
  v_body text;
  s event_submissions%rowtype;
  r reports%rowtype;
  new_id uuid;
begin
  if uid is null then
    raise exception 'studio_queue_reader_email: sem permissão' using errcode = '42501';
  end if;
  if p_kind = 'event_rejected' and coalesce(p_ref, '') ~ '^submission:[0-9a-f-]{36}$' then
    if not public.can_edit_section(uid, 'agenda') then
      raise exception 'studio_queue_reader_email: sem permissão' using errcode = '42501';
    end if;
    ref_id := substr(p_ref, 12)::uuid;
    select * into s from event_submissions where id = ref_id;
    if not found or s.status <> 'rejected' then
      raise exception 'studio_queue_reader_email: sugestão não encontrada ou não rejeitada' using errcode = 'P0002';
    end if;
    v_to := s.contact_email;
    v_subject := 'Sua sugestão de evento no CityNews';
    v_body := 'Obrigado por sugerir "' || email_escape(s.payload->>'title', 200)
              || '". Desta vez não vamos publicar o evento na agenda do CityNews Cuiabá. Motivo: '
              || email_escape(s.decision_reason, 500);
  elsif p_kind = 'report_response' and coalesce(p_ref, '') ~ '^report:[0-9a-f-]{36}$' then
    if not public.has_any_role(uid, '{editor_chefe,moderador}') then
      raise exception 'studio_queue_reader_email: sem permissão' using errcode = '42501';
    end if;
    ref_id := substr(p_ref, 8)::uuid;
    select * into r from reports where id = ref_id;
    if not found or r.status <> 'answered' or coalesce(trim(r.response), '') = '' then
      raise exception 'studio_queue_reader_email: denúncia não encontrada ou sem resposta' using errcode = 'P0002';
    end if;
    v_to := r.contact_email;
    v_subject := 'Resposta do CityNews à sua mensagem';
    v_body := 'Recebemos sua mensagem sobre um conteúdo do CityNews Cuiabá. Nossa resposta: '
              || email_escape(r.response, 2000);
  else
    raise exception 'studio_queue_reader_email: tipo ou ref inválidos' using errcode = '22023';
  end if;
  if coalesce(trim(v_to), '') = '' then
    return null;
  end if;
  select e.id into new_id from reader_emails e where e.kind = p_kind and e.ref = p_ref limit 1;
  if found then
    return new_id;
  end if;
  insert into reader_emails (kind, to_email, subject, body, ref)
  values (p_kind, lower(trim(v_to)), v_subject, v_body, p_ref)
  returning id into new_id;
  return new_id;
end
$$;
revoke execute on function public.studio_queue_reader_email(text, text) from public, anon;
grant execute on function public.studio_queue_reader_email(text, text) to authenticated, service_role;

-- Ações que o Estúdio audita (src/lib/audit/actions.ts; o teste de integração confere as duas
-- listas).
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'rules.propose', 'rules.approve', 'prompt.publish', 'rec.weights', 'reports.moderate',
    'users.manage', 'metrics.view', 'audit.view',
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond'
  ]::text[]
$$;

create index if not exists audit_log_actor_at_idx on audit_log (actor, at desc);

create or replace function public.studio_audit(p_actor text, p_action text, p_object_ref text, p_details jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  denied boolean := p_action like '%.denied';
  staff boolean;
  new_id bigint;
begin
  if uid is null then
    raise exception 'studio_audit: exige usuário autenticado' using errcode = '42501';
  end if;
  if p_actor is distinct from uid::text then
    raise exception 'studio_audit: auditoria só em nome próprio' using errcode = '42501';
  end if;
  if regexp_replace(coalesce(p_action, ''), '\.denied$', '') <> all (public.studio_audit_actions()) then
    raise exception 'studio_audit: ação desconhecida' using errcode = '22023';
  end if;
  if length(p_object_ref) > 200 or pg_column_size(p_details) > 16384 then
    raise exception 'studio_audit: registro grande demais' using errcode = '22001';
  end if;
  staff := public.is_staff(uid);
  if not staff then
    if not denied then
      raise exception 'studio_audit: só a equipe audita ações' using errcode = '42501';
    end if;
    if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 1024 then
      raise exception 'studio_audit: detalhes grandes demais' using errcode = '22001';
    end if;
    select l.id into new_id from audit_log l
     where l.actor = uid::text and l.action = p_action and l.object_ref = p_object_ref
       and l.at > now() - interval '10 minutes'
     order by l.at desc limit 1;
    if found then
      return new_id;
    end if;
    if not public.hit_rate_limit('studio_audit_denied', md5(uid::text), 20, 60) then
      return null;
    end if;
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, p_action, p_object_ref, coalesce(p_details, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end
$$;
revoke execute on function public.studio_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.studio_audit(text, text, text, jsonb) to authenticated, service_role;
