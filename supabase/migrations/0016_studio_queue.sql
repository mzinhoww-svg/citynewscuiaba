-- P4-T2 · Newsroom e fila de matérias (docs/screens.md E01, E02).
--
-- Responsável e prazo por matéria (atribuição em lote e filtro "Minha fila") e a visão da fila
-- que o Estúdio lê: matéria + editoria + pessoas + última recomendação das regras + sensibilidade.
-- A visão roda com os direitos de quem consulta (security_invoker): a RLS de cada tabela vale.

alter table articles
  add column if not exists assignee_id uuid references profiles(id),
  add column if not exists due_at timestamptz;
create index if not exists articles_assignee_idx on articles (assignee_id) where assignee_id is not null;
create index if not exists articles_updated_idx on articles (updated_at desc);

create or replace view studio_queue with (security_invoker = true) as
  select a.id, a.slug, a.kind, a.title, a.section_slug, sec.name as section_name,
         coalesce(sec.autonomy_category, a.section_slug) as category,
         a.status, a.publish_mode, a.confidence, a.confidence_score, a.agent_id, a.author_id,
         au.display_name as author_name, a.assignee_id, asg.display_name as assignee_name,
         a.due_at, a.updated_at, a.published_at, a.scheduled_for, a.review_reason, a.ai_fallback,
         a.urgent, a.topic_id,
         (coalesce(sec.autonomy_category, a.section_slug) = 'seguranca'
           or exists (select 1 from article_sources s join collected_items c on c.id = s.item_id
                      where s.article_id = a.id and c.sensitive)) as sensitive,
         (select d.recommended from decisions d
           where d.object_ref = 'article:' || a.id and d.step = 'rules'
           order by d.created_at desc limit 1) as recommended,
         (select d.rationale from decisions d
           where d.object_ref = 'article:' || a.id and d.step = 'rules'
           order by d.created_at desc limit 1) as recommended_rationale
  from articles a
  left join sections sec on sec.slug = a.section_slug
  left join profiles au on au.id = a.author_id
  left join profiles asg on asg.id = a.assignee_id;

revoke all on studio_queue from anon, public;
grant select on studio_queue to authenticated, service_role;

-- Equipe do Estúdio (nome e papéis) para atribuição e filtros. user_roles só mostra a própria
-- linha a quem não é admin; esta função expõe nome e papéis da equipe só para a equipe.
create or replace function public.studio_people()
returns table (id uuid, name text, roles app_role[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, array_agg(ur.role order by ur.role)
  from profiles p
  join user_roles ur on ur.user_id = p.id
  where public.is_staff(auth.uid())
  group by p.id, p.display_name
  order by p.display_name
$$;
revoke execute on function public.studio_people() from public, anon;
grant execute on function public.studio_people() to authenticated, service_role;
