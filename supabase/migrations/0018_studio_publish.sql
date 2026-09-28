-- P4-T5 · Publicação e agendamento pelo Estúdio (docs/screens.md E06).
--
-- Destinos escolhidos na publicação (home, editoria, assunto, newsletter). Push de urgente não
-- é destino daqui: exige 2 aprovações no Control Center (P5 A09).
-- Agendadas: publish_due_scheduled() publica o que venceu (status scheduled → published, com a
-- data agendada). Roda a cada minuto pelo pg_cron quando existe e também no tick do pipeline,
-- que invalida o cache das matérias publicadas.

alter table articles
  add column if not exists publish_destinations text[] not null default '{home,section}'
    check (publish_destinations <@ array['home', 'section', 'topic', 'newsletter']);
create index if not exists articles_scheduled_idx on articles (scheduled_for) where status = 'scheduled';

create or replace function public.publish_due_scheduled()
returns table (id uuid, slug text, topic_id uuid, section_slug text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    update articles a
       set status = 'published', publish_mode = 'human', published_at = a.scheduled_for, updated_at = now()
     where a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= now()
    returning a.id, a.slug, a.topic_id, a.section_slug
  ), logged as (
    insert into audit_log (actor, action, object_ref, details)
    select 'system:scheduler', 'article.publish.scheduled', 'article:' || d.id, '{}'::jsonb from due d
  )
  select d.id, d.slug, d.topic_id, d.section_slug from due d;
end
$$;
revoke execute on function public.publish_due_scheduled() from public, anon, authenticated;
grant execute on function public.publish_due_scheduled() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'citynews-publish-scheduled';
    perform cron.schedule('citynews-publish-scheduled', '* * * * *', 'select public.publish_due_scheduled()');
  end if;
end $$;
