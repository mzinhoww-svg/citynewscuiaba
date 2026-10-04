-- A-123 · Publicação forçada não é edição humana. `forced_publish_batch` (0054) gravava a versão
-- com origin 'human', e qualquer versão humana impede o pipeline de reescrever a matéria
-- (`write`, `studio_request_reprocess`). Resultado: as 710 matérias publicadas à força em 03/10 e
-- depois retiradas do ar por texto curto ficaram presas, sem poder ser refeitas com o texto
-- completo da fonte (A-114). Publicar não muda o texto (só acrescenta a linha de crédito); a
-- decisão humana continua registrada em `decisions.human_decision = 'forced_publish'`.

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

-- Dados: a versão que a publicação forçada gravou (mesma transação da decisão forced_publish)
-- passa a 'ai'. Versões humanas de edição de verdade (outra transação) ficam como estão.
update article_versions v
   set origin = 'ai'
  from decisions d
 where v.origin = 'human'
   and d.human_decision = 'forced_publish'
   and d.object_ref = 'article:' || v.article_id
   and v.created_at = d.created_at;

-- Disjuntor: padrão da tabela alinhado aos limites do dono (300 por hora, 3.000 por dia; A-123).
-- O valor em produção é ajustado em `scripts/ops/recuperar-materias.sql`.
alter table public.publish_breaker alter column hourly_limit set default 300;
alter table public.publish_breaker alter column daily_limit set default 3000;
