-- P4-T3 · Revisão de item autônomo e editor (docs/screens.md E03, E04; plano P4 Task 3).
--
-- 1. Campos do checklist de publicação: tags, SEO (título e descrição) e texto alternativo da
--    imagem na matéria. `field_origins` guarda a origem de cada campo (IA aceita por pessoa ou
--    edição humana) para a tela mostrar "Sugerido pela IA · aceito por …".
-- 2. Sugestões de IA por campo, que só entram na matéria com clique humano.
-- 3. studio_save_draft: salvamento com versão base. Roda com os direitos de quem chama (RLS de
--    articles e article_versions valendo); versão base desatualizada devolve conflito sem gravar.

alter table articles
  add column if not exists tags text[] not null default '{}',
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists field_origins jsonb not null default '{}'::jsonb
    check (jsonb_typeof(field_origins) = 'object');

alter table article_media add column if not exists alt text;

create table if not exists article_suggestions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  field text not null check (field in ('title', 'dek', 'seo_title', 'seo_description', 'body')),
  value text not null check (length(value) between 1 and 4000),
  rationale text,
  agent_id text not null,
  prompt_version int,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists article_suggestions_open_idx on article_suggestions (article_id) where status = 'open';

alter table article_suggestions enable row level security;
revoke all on article_suggestions from anon;
create policy article_suggestions_read_staff on article_suggestions for select to authenticated
  using (is_staff((select auth.uid())));
-- Sugestões nascem do pipeline (service role) ou da redação; decidir é de quem edita a matéria.
create policy article_suggestions_write on article_suggestions for all to authenticated
  using (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
  )
  with check (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
  );

create or replace function public.studio_save_draft(
  p_id uuid,
  p_base int,
  p_patch jsonb,
  p_change_kind text default 'edit',
  p_public_note text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  cur int;
  snap jsonb;
  a articles%rowtype;
begin
  -- FOR UPDATE passa pela política de UPDATE: sem permissão de editar, a matéria "não existe".
  perform 1 from articles where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = p_id;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = p_id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;

  update articles set
    title = coalesce(p_patch->>'title', title),
    dek = coalesce(p_patch->>'dek', dek),
    body = coalesce(p_patch->'body', body),
    section_slug = coalesce(p_patch->>'sectionSlug', section_slug),
    tags = case when p_patch ? 'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end,
    neighborhoods = case when p_patch ? 'neighborhoods'
                         then array(select jsonb_array_elements_text(p_patch->'neighborhoods')) else neighborhoods end,
    seo_title = case when p_patch ? 'seoTitle' then nullif(trim(p_patch->>'seoTitle'), '') else seo_title end,
    seo_description = case when p_patch ? 'seoDescription' then nullif(trim(p_patch->>'seoDescription'), '') else seo_description end,
    topic_id = case when p_patch ? 'topicId' then nullif(p_patch->>'topicId', '')::uuid else topic_id end,
    field_origins = coalesce(p_patch->'fieldOrigins', field_origins),
    status = coalesce((p_patch->>'status')::article_status, status),
    updated_at = now()
  where id = p_id
  returning * into a;
  if not found then
    raise exception 'studio_save_draft: sem permissão para editar' using errcode = '42501';
  end if;

  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note)
  values (p_id, cur + 1,
          jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body, 'sectionSlug', a.section_slug,
                             'tags', to_jsonb(a.tags), 'neighborhoods', to_jsonb(a.neighborhoods),
                             'seoTitle', a.seo_title, 'seoDescription', a.seo_description,
                             'fieldOrigins', a.field_origins),
          'human', auth.uid(), p_change_kind, p_public_note);
  return jsonb_build_object('status', 'ok', 'version', cur + 1);
end
$$;

revoke execute on function public.studio_save_draft(uuid, int, jsonb, text, text) from public, anon;
grant execute on function public.studio_save_draft(uuid, int, jsonb, text, text) to authenticated, service_role;

-- "Reprocessar" na revisão de item autônomo: devolve o assunto à etapa de redação do pipeline.
-- Só para matéria do pipeline sem edição humana, por quem edita a editoria. Security definer
-- porque a fila (jobs) é só do service role; a checagem de papel fica aqui dentro.
create or replace function public.studio_request_reprocess(p_article uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  job bigint;
begin
  select id, topic_id, section_slug, agent_id, status into a from articles where id = p_article;
  if not found then
    raise exception 'studio_request_reprocess: matéria não encontrada' using errcode = 'P0002';
  end if;
  if not public.can_edit_section(auth.uid(), a.section_slug) then
    raise exception 'studio_request_reprocess: sem permissão' using errcode = '42501';
  end if;
  if a.agent_id is null or a.topic_id is null
     or exists (select 1 from article_versions v where v.article_id = p_article and v.origin = 'human') then
    raise exception 'studio_request_reprocess: só matéria do pipeline sem edição humana' using errcode = '22023';
  end if;
  update articles set status = 'draft', review_reason = null, updated_at = now() where id = p_article;
  select queue_enqueue('pipeline', 'summarize:topic:' || a.topic_id,
                       jsonb_build_object('runId', 'estudio-' || to_char(now(), 'YYYYMMDDHH24MISS'),
                                          'step', 'summarize', 'itemRef', 'topic:' || a.topic_id, 'attempt', 1))
    into job;
  return job;
end
$$;
revoke execute on function public.studio_request_reprocess(uuid) from public, anon;
grant execute on function public.studio_request_reprocess(uuid) to authenticated, service_role;
