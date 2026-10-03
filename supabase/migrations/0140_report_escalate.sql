-- AUT-T5 · Denúncias escalam (A9): a 3ª denúncia aberta em 24 h na mesma matéria abre um item
-- urgente na fila do admin (uma vez) e liga o banner público "Esta matéria está em revisão". A
-- matéria continua no ar. Resolver o item (pessoa da moderação) desliga o banner.
--
-- Faixa 0140+ (acordo com os outros agentes). Aditiva e idempotente; nenhum comando de remoção.
-- Avisos: `studio_notifications` ainda não existe; o aviso vai para `notifications` (Control
-- Center e plantão, via `notify_once`), para a auditoria (`report.escalate`) e para
-- `pg_notify('studio_event', …)`, o gancho que a central do Estúdio assina quando existir.

alter table public.articles add column if not exists review_banner boolean not null default false;

create table if not exists public.review_escalations (
  id uuid primary key default gen_random_uuid(),
  -- Sem chave estrangeira: apagar a matéria (teste, limpeza) nunca fica preso a um item de fila.
  article_id uuid not null,
  kind text not null default 'report_urgent' check (kind in ('report_urgent')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  report_count int not null default 3 check (report_count >= 1),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text check (char_length(resolution) <= 500),
  check ((status = 'open') = (resolved_at is null))
);
-- Um item aberto por matéria: a 4ª denúncia não abre outro.
create unique index if not exists review_escalations_open_uidx
  on public.review_escalations (article_id, kind) where status = 'open';
create index if not exists review_escalations_open_idx
  on public.review_escalations (opened_at) where status = 'open';

alter table public.review_escalations enable row level security;
revoke all on public.review_escalations from public, anon;
grant select on public.review_escalations to authenticated;
grant all on public.review_escalations to service_role;
do $$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'review_escalations'
                    and policyname = 'review_escalations_read') then
    create policy review_escalations_read on public.review_escalations for select to authenticated
      using (public.has_any_role((select auth.uid()), '{admin,editor_chefe,moderador}'));
  end if;
end $$;

-- Denúncias que contam: abertas, das últimas 24 h, na mesma matéria e posteriores à última
-- resolução humana. Direito de resposta tem
-- fluxo próprio (prazo legal) e não conta para o banner.
create or replace function public.report_escalate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article uuid;
  v_count int;
  v_esc uuid;
begin
  if new.content_ref !~ '^article:[0-9a-f-]{36}$' or new.kind = 'right_of_reply' then
    return new;
  end if;
  v_article := substring(new.content_ref from 9)::uuid;
  -- Duas denúncias simultâneas da mesma matéria não abrem dois itens.
  perform pg_advisory_xact_lock(hashtextextended('report_escalate:' || v_article::text, 0));
  select count(*) into v_count
    from reports r
   where r.content_ref = new.content_ref
     and r.kind <> 'right_of_reply'
     and r.status = 'open'
     and r.created_at >= now() - interval '24 hours'
     -- Depois que uma pessoa resolve, só denúncias novas voltam a contar.
     and r.created_at > coalesce((select max(e.resolved_at) from review_escalations e
                                   where e.article_id = v_article), '-infinity'::timestamptz);
  if v_count < 3 then
    return new;
  end if;
  if not exists (select 1 from articles where id = v_article) then
    return new;
  end if;
  insert into review_escalations (article_id, report_count)
  values (v_article, v_count)
  on conflict (article_id, kind) where status = 'open' do nothing
  returning id into v_esc;
  if v_esc is null then
    -- Já aberto: só atualiza a contagem, sem novo aviso.
    update review_escalations set report_count = v_count
     where article_id = v_article and kind = 'report_urgent' and status = 'open';
    return new;
  end if;
  update articles set review_banner = true where id = v_article and not review_banner;
  insert into audit_log (actor, action, object_ref, details)
  values ('sistema', 'report.escalate', 'article:' || v_article,
          jsonb_build_object('escalation', v_esc, 'reports', v_count));
  -- Central de avisos do Control Center e fila do plantão (mesmo molde do disjuntor).
  perform public.notify_once(jsonb_build_object(
    'kind', 'report_escalated', 'channel', ch, 'severity', 'critical',
    'objectRef', 'article:' || v_article, 'dedupeKey', 'report_escalated:article:' || v_article,
    'title', 'Urgente: matéria com 3 denúncias em 24 h',
    'body', 'A matéria segue no ar com o aviso "em revisão". Estúdio: /estudio/denuncias'), 3600)
    from unnest(array['control_center', 'oncall_email']) as ch;
  perform pg_notify('studio_event', jsonb_build_object(
    'type', 'report_escalated', 'article', v_article, 'escalation', v_esc, 'reports', v_count)::text);
  return new;
end
$$;
revoke execute on function public.report_escalate() from public, anon, authenticated;

create or replace trigger reports_escalate after insert on public.reports
  for each row execute function public.report_escalate();

-- Resolução humana: encerra o item e desliga o banner (se não restar outro item aberto).
create or replace function public.report_escalation_resolve(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e review_escalations%rowtype;
  a articles%rowtype;
begin
  if uid is null or not public.has_any_role(uid, '{admin,editor_chefe,moderador}') then
    raise exception 'denúncias: sem permissão' using errcode = '42501';
  end if;
  select * into e from review_escalations where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if e.status = 'resolved' then
    return jsonb_build_object('status', 'already_resolved');
  end if;
  update review_escalations
     set status = 'resolved', resolved_at = now(), resolved_by = uid, resolution = left(p_note, 500)
   where id = p_id;
  if not exists (select 1 from review_escalations
                  where article_id = e.article_id and status = 'open') then
    update articles set review_banner = false where id = e.article_id returning * into a;
  else
    select * into a from articles where id = e.article_id;
  end if;
  return jsonb_build_object('status', 'ok', 'articleId', e.article_id, 'slug', a.slug,
                            'topicId', a.topic_id, 'sectionSlug', a.section_slug);
end
$$;
revoke execute on function public.report_escalation_resolve(uuid, text) from public, anon;
grant execute on function public.report_escalation_resolve(uuid, text) to authenticated, service_role;
