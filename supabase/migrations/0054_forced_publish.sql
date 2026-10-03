-- REV-T1 · "Publicar mesmo assim" na fila de revisão do Estúdio.
--
-- Quem tem `article.publish` pode publicar de uma vez toda a seleção da fila de revisão, mesmo
-- as que as regras segurariam. O pedido vira um trabalho (`forced_publish_jobs`) e a publicação
-- roda em lotes de 50 na fila `pipeline` (passo `forced_publish`), nunca síncrona. Cada matéria
-- publicada recebe a decisão humana `forced_publish` (quem, quando, resumo de riscos no trabalho)
-- e publish_mode 'auto' para que "Despublicar" (1 clique, `article.unpublish_auto`) continue
-- valendo. Matéria sem corpo algum não publica e é listada no resultado.

-- ---------------------------------------------------------------------------
-- 1. Trabalho
-- ---------------------------------------------------------------------------
create table if not exists public.forced_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done')),
  total int not null check (total >= 0),
  done int not null default 0,
  failed int not null default 0,
  -- ids em lotes de 50: [[uuid, ...], ...]
  batches jsonb not null default '[]'::jsonb,
  -- Fora da publicação: [{id, title, reason}] (sem corpo, fora do escopo de editoria)
  excluded jsonb not null default '[]'::jsonb,
  -- Falhas na hora de publicar: [{id, reason}]
  failures jsonb not null default '[]'::jsonb,
  -- Lotes já aplicados: nova tentativa de um lote concluído não conta duas vezes
  batches_done int[] not null default '{}',
  risks jsonb not null default '{}'::jsonb,
  finished_at timestamptz
);
alter table public.forced_publish_jobs enable row level security;
create policy forced_publish_jobs_read_own on public.forced_publish_jobs for select to authenticated
  using (requested_by = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
revoke all on public.forced_publish_jobs from anon, public;
grant select on public.forced_publish_jobs to authenticated;
grant all on public.forced_publish_jobs to service_role;

-- ---------------------------------------------------------------------------
-- 2. Auditoria: ação nova na lista fechada (união da 0045 + article.force_publish)
-- ---------------------------------------------------------------------------
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'source.approve_critical', 'rules.propose', 'rules.approve', 'prompt.publish',
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view', 'site.manage',
    'push.request', 'push.approve', 'push.settings', 'push.metrics',
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update',
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case',
    'approval.requested', 'approval.approved', 'approval.rejected', 'approval.applied',
    'flag.set', 'rules.rollback',
    'prompt.create', 'prompt.request', 'prompt.rollback', 'ai.playground.run',
    'ai.agent.update', 'ai.model.update',
    'rec.weights.activate', 'rec.campaign.create', 'rec.experiment.create', 'rec.experiment.end',
    'rec.experiment.promote', 'rec.explain',
    'user.invite', 'user.role.grant', 'user.role.revoke', 'team.save', 'team.delete',
    'taxonomy.save', 'taxonomy.merge', 'home.save', 'home.publish',
    'ads.campaign.save', 'ads.campaign.delete', 'seo.redirect.save', 'seo.redirect.delete',
    'audit.export', 'privacy.request.save', 'security.key.rotate',
    'push.reject', 'push.cancel', 'push.dispatch', 'push.finish', 'push.pause', 'push.expire',
    'push.resume_requested', 'push.resume_applied',
    -- Publicação forçada da fila de revisão (REV-T1, 0054)
    'article.force_publish'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- 3. Fila: o passo `forced_publish` é lido primeiro (não espera a fila de coleta esvaziar)
-- ---------------------------------------------------------------------------
create or replace function queue_read(p_queue text, p_n int, p_vt_sec int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql
set search_path = public
as $$
  with picked as (
    select id from jobs
    where queue = p_queue and visible_at <= clock_timestamp()
    order by coalesce(array_position(
               array['tick','fetch','validate','extract','normalize','enrich','dedupe','cluster','classify',
                     'locate','verify','summarize','headline','image','image_rights','rules',
                     'route','publish','record','index','notify','forced_publish'],
               message->>'step'), 0) desc,
             visible_at, id
    limit greatest(p_n, 0)
    for update skip locked
  ), upd as (
    update jobs j
       set read_ct = j.read_ct + 1,
           visible_at = clock_timestamp() + make_interval(secs => greatest(p_vt_sec, 0))
      from picked
     where j.id = picked.id
    returning j.id, j.read_ct, j.message
  )
  select upd.id, upd.read_ct, upd.message from upd
  order by coalesce(array_position(
             array['tick','fetch','validate','extract','normalize','enrich','dedupe','cluster','classify',
                   'locate','verify','summarize','headline','image','image_rights','rules',
                   'route','publish','record','index','notify','forced_publish'],
             upd.message->>'step'), 0) desc,
           upd.id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Um lote do trabalho (até 50 matérias). Só o worker (service_role) chama; a pessoa que pediu
-- vale como ator: editoria conferida de novo aqui (`can_edit_section`). Idempotente: matéria que
-- já está pública conta como feita; nova tentativa do mesmo lote não duplica versão nem decisão.
-- ---------------------------------------------------------------------------
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
    values (rid, cur + 1, public.studio_snapshot(a), 'human', j.requested_by, 'edit');
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
revoke execute on function public.forced_publish_batch(uuid, int) from public, anon, authenticated;
grant execute on function public.forced_publish_batch(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Matérias com denúncia aberta entre as informadas. `reports` só é legível por editor-chefe
-- e moderação; o resumo de riscos precisa da contagem para qualquer papel que publica.
-- ---------------------------------------------------------------------------
create or replace function public.studio_reported_articles(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct substring(r.content_ref from 9)::uuid
    from reports r
   where public.is_staff(auth.uid())
     and r.status = 'open'
     and r.content_ref ~ '^article:[0-9a-f-]{36}$'
     and substring(r.content_ref from 9)::uuid = any (p_ids)
$$;
revoke execute on function public.studio_reported_articles(uuid[]) from public, anon;
grant execute on function public.studio_reported_articles(uuid[]) to authenticated, service_role;
