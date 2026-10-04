-- A-123 · Reescrita de matéria no ar. `save_pipeline_draft` (0004) só aceitava rascunho ou
-- revisão; agora, com `live = true`, atualiza o texto de matéria publicada pelas regras
-- (`publish_mode = 'auto'`) e nunca editada por pessoa, sem tirar do ar. As 550 matérias
-- publicadas com texto de uma frase (antes de A-114) são refeitas com o texto completo da fonte.

create or replace function save_pipeline_draft(p jsonb)
returns table (article_id uuid, version int)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_status article_status;
  v_slug text := p->>'slug';
  v_version int;
  v_mode publish_mode;
  v_live boolean := coalesce((p->>'live')::boolean, false);
begin
  select a.id, a.status, a.publish_mode into v_id, v_status, v_mode from articles a
  where a.topic_id = (p->>'topicId')::uuid and a.agent_id = 'write' for update;
  if v_id is not null then
    -- A-123: a reescrita de matéria publicada pelas regras (nunca editada por pessoa) atualiza
    -- o texto no ar; status, publicação e motivo de revisão ficam como estão.
    v_live := v_live and v_status in ('published', 'updated') and v_mode = 'auto';
    if (v_status not in ('draft', 'in_review') and not v_live)
       or exists (select 1 from article_versions v where v.article_id = v_id and v.origin = 'human') then
      raise exception 'matéria % já está com a redação', v_id using errcode = '55000';
    end if;
    update articles set title = p->>'title', dek = p->>'dek', body = p->'body',
           ai_summary = case when jsonb_typeof(p->'aiSummary') = 'array'
                             then array(select jsonb_array_elements_text(p->'aiSummary')) end,
           section_slug = p->>'sectionSlug', confidence = (p->>'confidence')::confidence_level,
           confidence_score = (p->>'confidenceScore')::numeric,
           status = case when v_live then status else (p->>'status')::article_status end,
           ai_fallback = (p->>'aiFallback')::boolean,
           review_reason = case when v_live then review_reason else p->>'reviewReason' end,
           updated_at = now()
     where id = v_id;
  else
    if exists (select 1 from articles a where a.slug = v_slug) then
      v_slug := left(v_slug, 180) || '-' || left(md5(p->>'topicId'), 6);
    end if;
    insert into articles (slug, kind, topic_id, section_slug, title, dek, body, ai_summary, status, confidence,
                          confidence_score, agent_id, ai_fallback, review_reason)
    values (v_slug, 'normalized', (p->>'topicId')::uuid, p->>'sectionSlug', p->>'title', p->>'dek', p->'body',
            case when jsonb_typeof(p->'aiSummary') = 'array'
                 then array(select jsonb_array_elements_text(p->'aiSummary')) end,
            (p->>'status')::article_status, (p->>'confidence')::confidence_level,
            (p->>'confidenceScore')::numeric, 'write', (p->>'aiFallback')::boolean, p->>'reviewReason')
    returning id into v_id;
  end if;

  delete from article_sources s where s.article_id = v_id;
  insert into article_sources (article_id, item_id, role, confirmed)
  select v_id, (x->>'itemId')::uuid, x->>'role', false from jsonb_array_elements(p->'sources') x;

  select coalesce(max(v.number), 0) + 1 into v_version from article_versions v where v.article_id = v_id;
  insert into article_versions (article_id, number, snapshot, origin, change_kind)
  values (v_id, v_version, jsonb_build_object('title', p->>'title', 'dek', p->>'dek', 'body', p->'body',
                                              'aiSummary', p->'aiSummary', 'aiFallback', p->'aiFallback'),
          'ai', 'edit');
  return query select v_id, v_version;
end $$;
