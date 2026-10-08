-- Rascunho sem redação nunca vai ao ar.
-- O redator, quando a IA falha, monta um rascunho com o texto das fontes (`ai_fallback`) para a
-- redação escrever. Ele nascia com o título provisório do assunto ("Assunto em apuração · Política")
-- e a "Publicação forçada" em lote (0054/0146) só barrava matéria sem corpo: em 03 e 04/10, 99
-- desses rascunhos foram ao ar, um deles no destaque da home.
--
-- 1) `article_unwritten`: título provisório ou texto ainda das fontes (`studio_fallback_pending`,
--    a mesma regra do checklist B-015).
-- 2) `forced_publish_batch` deixa de fora (motivo `unwritten`).
-- 3) Trava em `articles`: nenhuma entrada no ar (published/updated) de matéria sem redação, por
--    qualquer caminho (lote, Estúdio, pipeline, SQL). Só a transição; o que já está no ar sai pelo
--    script `scripts/ops/retirar-rascunhos-sem-redacao.sql`.

create or replace function public.article_unwritten(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.title like 'Assunto em apuração%'
            or (a.ai_fallback and public.studio_fallback_pending(a.id))
       from articles a where a.id = p_id),
    false)
$$;
revoke execute on function public.article_unwritten(uuid) from public, anon;
grant execute on function public.article_unwritten(uuid) to authenticated, service_role;

create or replace function public.forced_publish_batch(p_job uuid, p_batch int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j forced_publish_jobs%rowtype;
  ids jsonb;
  rid uuid;
  a articles%rowtype;
  cur int;
  last record;
  names text;
  has_attr boolean;
  n_done int := 0;
  fails jsonb := '[]'::jsonb;
  pub jsonb := '[]'::jsonb;
begin
  select * into j from forced_publish_jobs where id = p_job for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_batch = any (j.batches_done) then
    return jsonb_build_object('status', 'already', 'done', 0, 'failures', '[]'::jsonb, 'published', '[]'::jsonb);
  end if;
  ids := j.batches -> p_batch;
  if ids is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  update forced_publish_jobs set status = 'running' where id = p_job and status = 'queued';

  for rid in select (e #>> '{}')::uuid from jsonb_array_elements(ids) e loop
    select * into a from articles where id = rid for update;
    if not found then
      fails := fails || jsonb_build_object('id', rid, 'reason', 'not_found');
      continue;
    end if;
    if a.status in ('published', 'updated') then
      n_done := n_done + 1;
      continue;
    end if;
    if a.status not in ('draft', 'in_review') then
      fails := fails || jsonb_build_object('id', rid, 'reason', 'status');
      continue;
    end if;
    if not public.can_edit_section(j.requested_by, a.section_slug) then
      fails := fails || jsonb_build_object('id', rid, 'reason', 'forbidden');
      continue;
    end if;
    if public.studio_doc_text(a.body) = '' then
      fails := fails || jsonb_build_object('id', rid, 'reason', 'no_body');
      continue;
    end if;
    if public.article_unwritten(rid) then
      fails := fails || jsonb_build_object('id', rid, 'reason', 'unwritten');
      continue;
    end if;

    -- Atribuição: "Com informações de {fonte}" quando o texto não traz nenhuma.
    select exists (
      select 1 from jsonb_path_query(coalesce(a.body, '{}'::jsonb), 'strict $.**.text') t
       where jsonb_typeof(t) = 'string' and (t #>> '{}') ~* '^\s*(com informações de|segundo)'
    ) into has_attr;
    if not has_attr then
      select string_agg(x.name, ', ' order by x.name) into names
        from (select distinct s.name
                from article_sources r
                join collected_items c on c.id = r.item_id
                join sources s on s.id = c.source_id
               where r.article_id = rid
               order by s.name limit 3) x;
      if names is not null then
        a.body := jsonb_set(
          coalesce(a.body, '{"type":"doc","content":[]}'::jsonb),
          '{content}',
          coalesce(a.body -> 'content', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'type', 'paragraph',
            'attrs', jsonb_build_object('citations', '[]'::jsonb),
            'content', jsonb_build_array(jsonb_build_object(
              'type', 'text', 'text', 'Com informações de ' || names || '.'))))
        );
      end if;
    end if;

    update articles set
      body = a.body,
      status = 'published',
      publish_mode = 'auto',
      published_at = now(),
      scheduled_for = null,
      review_reason = null,
      updated_at = now()
    where id = rid
    returning * into a;
    select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = rid;
    insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind)
    values (rid, cur + 1, public.studio_snapshot(a), 'ai', j.requested_by, 'edit');
    select d.rules_version, d.recommended into last from decisions d
     where d.object_ref = 'article:' || rid and d.step = 'rules' order by d.created_at desc limit 1;
    insert into decisions (object_ref, step, rules_version, input_hash, output, rationale, recommended,
                           human_decision, human_id)
    values ('article:' || rid, 'publish', last.rules_version, md5('forced:' || p_job || ':' || rid),
            jsonb_build_object('action', 'forced_publish', 'forced', true, 'job', p_job,
                               'publishMode', 'auto', 'attributed', not has_attr and names is not null),
            'Publicação forçada pela pessoa responsável (fila de revisão).', last.recommended,
            'forced_publish', j.requested_by);
    n_done := n_done + 1;
    pub := pub || jsonb_build_object('id', a.id, 'slug', a.slug, 'topicId', a.topic_id,
                                     'sectionSlug', a.section_slug);
  end loop;

  update forced_publish_jobs set
    done = done + n_done,
    failed = failed + jsonb_array_length(fails),
    failures = failures || fails,
    batches_done = batches_done || p_batch,
    status = case when done + n_done + failed + jsonb_array_length(fails) >= total then 'done' else 'running' end,
    finished_at = case when done + n_done + failed + jsonb_array_length(fails) >= total then now() end
  where id = p_job;

  return jsonb_build_object('status', 'ok', 'done', n_done, 'failures', fails, 'published', pub);
end
$$;

create or replace function public.guard_unwritten_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('published', 'updated') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('published', 'updated') then return new; end if;
  -- Título conferido na linha nova; o texto das fontes, pela regra do checklist (corpo gravado).
  if new.title like 'Assunto em apuração%'
     or (new.ai_fallback and tg_op = 'UPDATE' and public.studio_fallback_pending(new.id)) then
    raise exception 'Matéria sem redação não vai ao ar (rascunho das fontes ou título provisório).'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.guard_unwritten_publish() from public, anon, authenticated;
create or replace trigger articles_guard_unwritten_publish
  before insert or update of status on public.articles
  for each row execute function public.guard_unwritten_publish();

-- 4) Assunto que abriu com título provisório (pela matéria sem redação) ficava com ele para sempre:
--    `promote_topic_on_publish` só agia na primeira publicação. Agora a matéria publicada também
--    dá título ao assunto público que ainda está "Assunto em apuração". O slug público não muda
--    (links já circulam); só o provisório interno (`apuracao-*`) é trocado, como antes.
create or replace function promote_topic_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic topics%rowtype;
begin
  if new.topic_id is null or new.status not in ('published', 'updated') then return new; end if;
  if new.title like 'Assunto em apuração%' then return new; end if;
  select * into v_topic from topics where id = new.topic_id for update;
  if not found then return new; end if;
  if v_topic.visibility = 'public' and v_topic.title not like 'Assunto em apuração%' then
    return new;
  end if;
  update topics t
     set visibility = 'public',
         title = case when t.title like 'Assunto em apuração%' then left(new.title, 300) else t.title end,
         slug = case when t.slug like 'apuracao-%'
                     then left(trim(both '-' from regexp_replace(lower(unaccent(new.title)), '[^a-z0-9]+', '-', 'g')), 70)
                          || '-' || left(replace(t.id::text, '-', ''), 8)
                     else t.slug end,
         updated_at = greatest(t.updated_at, now())
   where t.id = new.topic_id;
  return new;
end $$;
revoke execute on function promote_topic_on_publish() from public, anon, authenticated;
