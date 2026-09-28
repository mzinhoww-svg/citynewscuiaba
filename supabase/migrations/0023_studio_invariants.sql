-- Gate do P4 (docs/reports/P4-gate-review.md, achados 1–4, 7, 11–16): invariantes editoriais
-- no banco. A camada TS (studioAction) continua dando mensagem e auditoria; o banco garante.
--
-- Princípio: o conteúdo de uma matéria só muda por funções security definer do Estúdio
-- (salvar, aceitar sugestão, publicar, Atualização, Correção, fontes, troca de imagem). Elas
-- conferem papel, status e versão base e gravam a versão numa transação. Dentro delas
-- current_user é o dono (postgres); os gatilhos abaixo só barram anon/authenticated, isto é,
-- UPDATE/INSERT direto pelo PostgREST com o JWT do navegador. Pipeline (service_role) e
-- migrations não passam pelos gatilhos.
--
-- B-015 · "Reescrito" (regra concreta): enquanto `ai_fallback` estiver ligado, o corpo não pode
-- conter nenhuma sequência de 8 palavras seguidas (normalizadas: minúsculas, sem acento, sem
-- pontuação) do rascunho sem IA (última versão `ai` com aiFallback) nem do título + trecho dos
-- itens coletados ligados à matéria. Parágrafo de referência com menos de 8 palavras conta
-- inteiro. Corpo vazio também bloqueia (nada foi escrito). Não depende de marca no documento
-- (o editor pode descartar atributos desconhecidos) nem de quem salvou.

-- ---------------------------------------------------------------------------
-- Texto e palavras
-- ---------------------------------------------------------------------------
create or replace function public.studio_doc_text(p_body jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(t #>> '{}', ' '), '')
  from jsonb_path_query(coalesce(p_body, '{}'::jsonb), 'strict $.**.text') t
  where jsonb_typeof(t) = 'string'
$$;

create or replace function public.studio_words(p text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_remove(regexp_split_to_array(lower(unaccent(coalesce(p, ''))), '[^a-z0-9]+'), ''), '{}')
$$;

-- ---------------------------------------------------------------------------
-- B-015: o corpo ainda tem texto das fontes?
-- ---------------------------------------------------------------------------
create or replace function public.studio_fallback_pending(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  ref jsonb;
  body_norm text;
  para text;
  w text[];
  n int;
  k int;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then
    return false;
  end if;
  select x.id, x.ai_fallback, x.body into a from articles x where x.id = p_id;
  if not found or not a.ai_fallback then
    return false;
  end if;
  body_norm := array_to_string(studio_words(studio_doc_text(a.body)), ' ');
  if body_norm = '' then
    return true;
  end if;
  body_norm := ' ' || body_norm || ' ';
  select v.snapshot->'body' into ref
    from article_versions v
   where v.article_id = p_id and v.origin = 'ai' and (v.snapshot->>'aiFallback') = 'true'
   order by v.number desc limit 1;
  for para in
    select studio_doc_text(p) from jsonb_array_elements(coalesce(ref->'content', '[]'::jsonb)) p
    union all
    select c.original_title || ' ' || coalesce(c.excerpt, '')
      from article_sources s join collected_items c on c.id = s.item_id
     where s.article_id = p_id
  loop
    w := studio_words(para);
    n := coalesce(array_length(w, 1), 0);
    continue when n = 0;
    k := least(8, n);
    for i in 1..(n - k + 1) loop
      if position(' ' || array_to_string(w[i:i + k - 1], ' ') || ' ' in body_norm) > 0 then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end
$$;
revoke execute on function public.studio_fallback_pending(uuid) from public, anon;
grant execute on function public.studio_fallback_pending(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Checklist de publicação no banco (mesmas chaves de src/lib/studio/checklist.ts). Vazio =
-- pode publicar. Usado por studio_publish e na hora de publicar a agendada.
-- ---------------------------------------------------------------------------
create or replace function public.studio_publish_blockers(p_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a articles%rowtype;
  cat text;
  req boolean;
  out text[] := '{}';
begin
  select * into a from articles where id = p_id;
  if not found then
    return array['not_found'];
  end if;
  select coalesce(s.autonomy_category, a.section_slug) into cat from sections s where s.slug = a.section_slug;
  cat := coalesce(cat, a.section_slug);
  -- Regra ativa da categoria exige fonte primária? Sem uma regra ativa única: exige (falha fechada).
  if (select count(*) from rules r where r.active) = 1 then
    select coalesce((r.body->'categories'->cat->>'requirePrimary')::boolean, false) into req
      from rules r where r.active;
  else
    req := true;
  end if;

  if public.studio_fallback_pending(p_id) then out := out || 'ai_fallback'::text; end if;
  if coalesce(trim(a.title), '') = '' or coalesce(trim(a.dek), '') = '' then out := out || 'title_dek'::text; end if;
  if a.section_slug is null
     or not exists (select 1 from unnest(a.tags) t where trim(t) <> '')
     or not exists (select 1 from unnest(a.neighborhoods) t where trim(t) <> '') then
    out := out || 'taxonomy'::text;
  end if;
  if req and not exists (select 1 from article_sources s where s.article_id = p_id and s.role = 'primary' and s.confirmed) then
    out := out || 'primary_source'::text;
  end if;
  if exists (select 1 from article_media am join media_assets m on m.id = am.media_id
             where am.article_id = p_id
               and (coalesce(trim(m.credit), '') = '' or coalesce(trim(am.alt), '') = '')) then
    out := out || 'images'::text;
  end if;
  if coalesce(trim(a.seo_title), '') = '' or coalesce(trim(a.seo_description), '') = ''
     or length(trim(a.seo_title)) > 70 or length(trim(a.seo_description)) > 160 then
    out := out || 'seo'::text;
  end if;
  if exists (select 1 from article_suggestions g where g.article_id = p_id and g.status = 'open') then
    out := out || 'ai_suggestions'::text;
  end if;
  return out;
end
$$;
revoke execute on function public.studio_publish_blockers(uuid) from public, anon, authenticated;
grant execute on function public.studio_publish_blockers(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Snapshot da versão (mesmo formato em salvar, publicar, Atualização e Correção).
-- ---------------------------------------------------------------------------
create or replace function public.studio_snapshot(a articles)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body, 'sectionSlug', a.section_slug,
                            'tags', to_jsonb(a.tags), 'neighborhoods', to_jsonb(a.neighborhoods),
                            'seoTitle', a.seo_title, 'seoDescription', a.seo_description,
                            'fieldOrigins', a.field_origins)
$$;
revoke execute on function public.studio_snapshot(articles) from public, anon, authenticated;

-- Quem pode editar o texto (article.edit): editoria (atual e, se mudar, a nova) ou jornalista
-- autor enquanto a matéria está com a redação.
create or replace function public.studio_can_edit(uid uuid, a articles, new_section text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.can_edit_section(uid, a.section_slug) and public.can_edit_section(uid, coalesce(new_section, a.section_slug)))
      or (public.has_role(uid, 'jornalista') and a.author_id = uid
          and a.status in ('draft', 'in_review', 'changes_requested'))
$$;
revoke execute on function public.studio_can_edit(uuid, articles, text) from public, anon, authenticated;

-- Marcas "sugerido pela IA · aceito por" no corpo: quem aceitou (ids) em cada marca.
create or replace function public.studio_ai_marks(p_body jsonb)
returns setof text
language sql
immutable
set search_path = public
as $$
  select m #>> '{}'
  from jsonb_path_query(coalesce(p_body, '{}'::jsonb),
                        'strict $.**.marks[*] ? (@.type == "aiSuggestion").attrs.acceptedBy') m
$$;
revoke execute on function public.studio_ai_marks(jsonb) from public, anon, authenticated;

-- Aplica o patch do editor à linha (sem gravar). Origem por campo calculada aqui: campo
-- alterado vira edição humana de `uid` (só o id; o nome é resolvido na leitura, achado 5).
-- `status` e `fieldOrigins` do patch são ignorados. Marca de sugestão de IA nova no corpo é
-- recusada: ela só entra por studio_accept_suggestion.
create or replace function public.studio_apply_patch(a articles, p_patch jsonb, uid uuid)
returns articles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n articles := a;
  at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  f record;
  human jsonb := jsonb_build_object('origin', 'human', 'editedBy', uid, 'at', at);
begin
  if p_patch ? 'body' and exists (
       select 1 from studio_ai_marks(p_patch->'body') x
       where x not in (select y from studio_ai_marks(a.body) y)) then
    raise exception 'studio: marca de sugestão de IA só entra pela aceitação' using errcode = '22023';
  end if;
  n.title := coalesce(p_patch->>'title', a.title);
  n.dek := coalesce(p_patch->>'dek', a.dek);
  n.body := coalesce(p_patch->'body', a.body);
  n.section_slug := coalesce(p_patch->>'sectionSlug', a.section_slug);
  if p_patch ? 'tags' then n.tags := array(select jsonb_array_elements_text(p_patch->'tags')); end if;
  if p_patch ? 'neighborhoods' then n.neighborhoods := array(select jsonb_array_elements_text(p_patch->'neighborhoods')); end if;
  if p_patch ? 'seoTitle' then n.seo_title := nullif(trim(p_patch->>'seoTitle'), ''); end if;
  if p_patch ? 'seoDescription' then n.seo_description := nullif(trim(p_patch->>'seoDescription'), ''); end if;
  if p_patch ? 'topicId' then n.topic_id := nullif(p_patch->>'topicId', '')::uuid; end if;

  n.field_origins := coalesce(a.field_origins, '{}'::jsonb);
  for f in select * from (values ('title', a.title, n.title), ('dek', a.dek, n.dek),
                                 ('seoTitle', coalesce(a.seo_title, ''), coalesce(n.seo_title, '')),
                                 ('seoDescription', coalesce(a.seo_description, ''), coalesce(n.seo_description, '')))
                  v(k, old_v, new_v) loop
    if f.old_v is distinct from f.new_v then
      n.field_origins := n.field_origins || jsonb_build_object(f.k, human);
    end if;
  end loop;
  n.updated_at := now();
  return n;
end
$$;
revoke execute on function public.studio_apply_patch(articles, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Salvar rascunho (article.edit). Security definer com a checagem de papel aqui dentro:
-- publicada só muda por Atualização/Correção; agendada editada perde o agendamento (precisa
-- reagendar, e o checklist roda de novo); só change_kind 'edit'.
-- ---------------------------------------------------------------------------
drop function if exists public.studio_save_draft(uuid, int, jsonb, text, text);
create or replace function public.studio_save_draft(p_id uuid, p_base int, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  n articles%rowtype;
  cur int;
  snap jsonb;
  unscheduled boolean := false;
begin
  if uid is null then
    raise exception 'studio_save_draft: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_id for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.studio_can_edit(uid, a, p_patch->>'sectionSlug') then
    raise exception 'studio_save_draft: sem permissão para editar' using errcode = '42501';
  end if;
  if a.status in ('published', 'updated') then
    return jsonb_build_object('status', 'public');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = p_id;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = p_id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;

  n := public.studio_apply_patch(a, coalesce(p_patch, '{}'::jsonb), uid);
  if a.status = 'scheduled' then
    n.status := 'in_review';
    n.scheduled_for := null;
    unscheduled := true;
  end if;
  update articles set title = n.title, dek = n.dek, body = n.body, section_slug = n.section_slug,
         tags = n.tags, neighborhoods = n.neighborhoods, seo_title = n.seo_title,
         seo_description = n.seo_description, topic_id = n.topic_id, field_origins = n.field_origins,
         status = n.status, scheduled_for = n.scheduled_for, updated_at = n.updated_at
   where id = p_id;
  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind)
  values (p_id, cur + 1, public.studio_snapshot(n), 'human', uid, 'edit');
  return jsonb_build_object('status', 'ok', 'version', cur + 1, 'unscheduled', unscheduled);
end
$$;
revoke execute on function public.studio_save_draft(uuid, int, jsonb) from public, anon;
grant execute on function public.studio_save_draft(uuid, int, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Aceitar sugestão de IA (clique humano): campo recebe o texto e a origem IA aceita por
-- auth.uid(); no corpo, parágrafo com a marca aiSuggestion. Sugestão decidida na mesma transação.
-- ---------------------------------------------------------------------------
create or replace function public.studio_accept_suggestion(p_suggestion uuid, p_article uuid, p_base int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s article_suggestions%rowtype;
  a articles%rowtype;
  cur int;
  snap jsonb;
  col text;
  at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  unscheduled boolean := false;
begin
  if uid is null then
    raise exception 'studio_accept_suggestion: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into s from article_suggestions where id = p_suggestion and article_id = p_article for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into a from articles where id = p_article for update;
  if not public.studio_can_edit(uid, a, null) then
    raise exception 'studio_accept_suggestion: sem permissão' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    return jsonb_build_object('status', 'decided');
  end if;
  if a.status in ('published', 'updated') then
    return jsonb_build_object('status', 'public');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = p_article;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = p_article and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;

  if s.field = 'body' then
    a.body := jsonb_build_object('type', 'doc', 'content',
      coalesce((select jsonb_agg(p order by o) from jsonb_array_elements(
                  case when jsonb_typeof(a.body->'content') = 'array' then a.body->'content' else '[]'::jsonb end)
                  with ordinality e(p, o)
                where not (p->>'type' = 'paragraph' and trim(studio_doc_text(p)) = '')), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
           jsonb_build_object('type', 'text', 'text', s.value, 'marks', jsonb_build_array(
             jsonb_build_object('type', 'aiSuggestion', 'attrs', jsonb_build_object(
               'agentId', s.agent_id, 'promptVersion', s.prompt_version, 'acceptedBy', uid))))))));
  else
    col := case s.field when 'title' then 'title' when 'dek' then 'dek'
                        when 'seo_title' then 'seoTitle' else 'seoDescription' end;
    case s.field
      when 'title' then a.title := s.value;
      when 'dek' then a.dek := s.value;
      when 'seo_title' then a.seo_title := s.value;
      else a.seo_description := s.value;
    end case;
    a.field_origins := coalesce(a.field_origins, '{}'::jsonb) || jsonb_build_object(col, jsonb_build_object(
      'origin', 'ai', 'agentId', s.agent_id, 'promptVersion', s.prompt_version, 'acceptedBy', uid, 'at', at));
  end if;
  if a.status = 'scheduled' then
    a.status := 'in_review';
    a.scheduled_for := null;
    unscheduled := true;
  end if;
  update articles set title = a.title, dek = a.dek, body = a.body, seo_title = a.seo_title,
         seo_description = a.seo_description, field_origins = a.field_origins, status = a.status,
         scheduled_for = a.scheduled_for, updated_at = now()
   where id = p_article;
  update article_suggestions set status = 'accepted', decided_by = uid, decided_at = now() where id = s.id;
  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind)
  values (p_article, cur + 1, public.studio_snapshot(a), 'human', uid, 'edit');
  return jsonb_build_object('status', 'ok', 'version', cur + 1, 'field', s.field, 'agentId', s.agent_id,
                            'unscheduled', unscheduled);
end
$$;
revoke execute on function public.studio_accept_suggestion(uuid, uuid, int) from public, anon;
grant execute on function public.studio_accept_suggestion(uuid, uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publicar ou agendar (article.publish), atômico (achado 12): checklist no banco, versão base
-- (quando informada), status, versão nova e decisão humana numa transação.
-- ---------------------------------------------------------------------------
create or replace function public.studio_publish(p_id uuid, p_destinations text[], p_base int default null,
                                                 p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  cur int;
  snap jsonb;
  b text[];
  last record;
begin
  if uid is null then
    raise exception 'studio_publish: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_id for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_edit_section(uid, a.section_slug) then
    raise exception 'studio_publish: sem permissão' using errcode = '42501';
  end if;
  if a.status in ('published', 'updated') then
    return jsonb_build_object('status', 'already_public');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = p_id;
  if p_base is not null and cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = p_id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;
  if p_at is not null and p_at <= now() then
    return jsonb_build_object('status', 'past');
  end if;
  b := public.studio_publish_blockers(p_id);
  if cardinality(b) > 0 then
    return jsonb_build_object('status', 'blocked', 'blockers', to_jsonb(b));
  end if;

  update articles set
    status = case when p_at is null then 'published' else 'scheduled' end::article_status,
    publish_mode = 'human',
    published_at = case when p_at is null then now() end,
    scheduled_for = p_at,
    publish_destinations = coalesce(p_destinations, '{}'),
    updated_at = now()
  where id = p_id
  returning * into a;
  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind)
  values (p_id, cur + 1, public.studio_snapshot(a), 'human', uid, 'edit');
  if a.agent_id is not null then
    select d.rules_version, d.recommended into last from decisions d
     where d.object_ref = 'article:' || p_id and d.step = 'rules' order by d.created_at desc limit 1;
    insert into decisions (object_ref, step, rules_version, input_hash, output, recommended, human_decision, human_id)
    values ('article:' || p_id, 'review', last.rules_version, md5('approve:' || p_id || ':' || now()),
            jsonb_build_object('action', 'approve'), last.recommended, 'approve', uid);
  end if;
  return jsonb_build_object('status', 'ok', 'version', cur + 1, 'articleStatus', a.status,
                            'publishedAt', a.published_at, 'scheduledFor', a.scheduled_for);
end
$$;
revoke execute on function public.studio_publish(uuid, text[], int, timestamptz) from public, anon;
grant execute on function public.studio_publish(uuid, text[], int, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atualização de matéria publicada (article.publish): texto novo, versão `update` com nota.
-- ---------------------------------------------------------------------------
create or replace function public.studio_publish_update(p_id uuid, p_base int, p_patch jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  n articles%rowtype;
  cur int;
  snap jsonb;
begin
  if uid is null then
    raise exception 'studio_publish_update: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_id for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not (public.can_edit_section(uid, a.section_slug)
          and public.can_edit_section(uid, coalesce(p_patch->>'sectionSlug', a.section_slug))) then
    raise exception 'studio_publish_update: sem permissão' using errcode = '42501';
  end if;
  if a.status not in ('published', 'updated') then
    return jsonb_build_object('status', 'not_public');
  end if;
  if coalesce(trim(p_note), '') = '' then
    return jsonb_build_object('status', 'note_required');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = p_id;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = p_id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;
  n := public.studio_apply_patch(a, coalesce(p_patch, '{}'::jsonb), uid);
  update articles set title = n.title, dek = n.dek, body = n.body, section_slug = n.section_slug,
         tags = n.tags, neighborhoods = n.neighborhoods, seo_title = n.seo_title,
         seo_description = n.seo_description, topic_id = n.topic_id, field_origins = n.field_origins,
         status = 'updated', updated_at = now()
   where id = p_id;
  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note)
  values (p_id, cur + 1, public.studio_snapshot(n), 'human', uid, 'update', left(trim(p_note), 1000));
  return jsonb_build_object('status', 'ok', 'version', cur + 1);
end
$$;
revoke execute on function public.studio_publish_update(uuid, int, jsonb, text) from public, anon;
grant execute on function public.studio_publish_update(uuid, int, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Correção: mesma função de 0019, com o snapshot completo (achado 16) para o E05 comparar
-- versões do mesmo formato.
-- ---------------------------------------------------------------------------
create or replace function public.studio_publish_correction(
  p_correction uuid,
  p_base int,
  p_patch jsonb,
  p_note text,
  p_notify boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c corrections%rowtype;
  a articles%rowtype;
  cur int;
  snap jsonb;
  changed text[] := '{}';
  n int := 0;
begin
  if uid is null then
    raise exception 'studio_publish_correction: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into c from corrections where id = p_correction for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into a from articles where id = c.article_id for update;
  if not (public.can_edit_section(uid, a.section_slug) or public.has_role(uid, 'revisor')) then
    raise exception 'studio_publish_correction: sem permissão' using errcode = '42501';
  end if;
  if c.published_at is not null then
    return jsonb_build_object('status', 'already_published');
  end if;
  if a.status not in ('published', 'updated') then
    return jsonb_build_object('status', 'not_public');
  end if;
  if coalesce(trim(p_note), '') = '' then
    return jsonb_build_object('status', 'note_required');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = a.id;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = a.id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;

  if p_patch ? 'title' and p_patch->>'title' is distinct from a.title then changed := array_append(changed, 'title'); end if;
  if p_patch ? 'dek' and p_patch->>'dek' is distinct from a.dek then changed := array_append(changed, 'dek'); end if;
  if p_patch ? 'body' and p_patch->'body' is distinct from a.body then changed := array_append(changed, 'body'); end if;

  update articles set
    title = coalesce(p_patch->>'title', title),
    dek = coalesce(p_patch->>'dek', dek),
    body = coalesce(p_patch->'body', body),
    status = 'updated',
    updated_at = now()
  where id = a.id
  returning * into a;

  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note)
  values (a.id, cur + 1, public.studio_snapshot(a), 'human', uid, 'correction', trim(p_note));

  if p_notify then
    insert into reader_notifications (owner_ref, kind, content_ref, title, body)
    select distinct s.owner_ref,
           case when c.kind = 'right_of_reply' then 'right_of_reply' else 'correction' end,
           'article:' || a.id,
           left(a.title, 300),
           left(trim(p_note), 2000)
    from saved_items s
    where s.content_ref = 'article:' || a.id;
    get diagnostics n = row_count;
  end if;

  update corrections set
    public_note = trim(p_note),
    status = 'published',
    published_at = now(),
    fields = changed,
    notified = n,
    handled_by = uid
  where id = c.id;

  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'correction.publish.db', 'article:' || a.id,
          jsonb_build_object('correction', c.id, 'version', cur + 1, 'fields', to_jsonb(changed), 'notified', n));

  return jsonb_build_object('status', 'ok', 'version', cur + 1, 'notified', n, 'fields', to_jsonb(changed),
                            'slug', a.slug, 'topicId', a.topic_id, 'section', a.section_slug);
end
$$;

-- ---------------------------------------------------------------------------
-- Reprocessar (achado 3): nunca para matéria pública ou agendada; não despublica em silêncio.
-- ---------------------------------------------------------------------------
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
  select id, topic_id, section_slug, agent_id, status into a from articles where id = p_article for update;
  if not found then
    raise exception 'studio_request_reprocess: matéria não encontrada' using errcode = 'P0002';
  end if;
  if not public.can_edit_section(auth.uid(), a.section_slug) then
    raise exception 'studio_request_reprocess: sem permissão' using errcode = '42501';
  end if;
  if a.status in ('published', 'updated', 'scheduled') then
    raise exception 'studio_request_reprocess: matéria pública ou agendada não volta ao pipeline' using errcode = '55000';
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

-- ---------------------------------------------------------------------------
-- Fontes (achado 13): troca atômica; matéria publicada só muda fontes por Atualização.
-- ---------------------------------------------------------------------------
create or replace function public.studio_set_sources(p_id uuid, p_sources jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  n int;
begin
  if uid is null then
    raise exception 'studio_set_sources: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_id for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.studio_can_edit(uid, a, null) then
    raise exception 'studio_set_sources: sem permissão' using errcode = '42501';
  end if;
  if a.status in ('published', 'updated') then
    return jsonb_build_object('status', 'public');
  end if;
  delete from article_sources where article_id = p_id;
  insert into article_sources (article_id, item_id, role, confirmed)
  select p_id, (x->>'itemId')::uuid, x->>'role', coalesce((x->>'confirmed')::boolean, false)
    from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) x;
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'count', n);
end
$$;
revoke execute on function public.studio_set_sources(uuid, jsonb) from public, anon;
grant execute on function public.studio_set_sources(uuid, jsonb) to authenticated, service_role;

-- Troca de imagem (achado 13): atômica, só por imagem aprovada e com licença válida hoje.
create or replace function public.studio_replace_image(p_article uuid, p_media uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  m media_assets%rowtype;
  old_ids uuid[];
  old_alt text;
begin
  if uid is null then
    raise exception 'studio_replace_image: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_article for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_edit_section(uid, a.section_slug) then
    raise exception 'studio_replace_image: sem permissão' using errcode = '42501';
  end if;
  select * into m from media_assets where id = p_media;
  if not found or m.status <> 'approved'
     or (m.license_until is not null and m.license_until < (now() at time zone 'America/Cuiaba')::date) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select array_agg(media_id), (array_agg(alt))[1] into old_ids, old_alt from article_media where article_id = p_article;
  delete from article_media where article_id = p_article;
  insert into article_media (article_id, media_id, rationale, chosen_by, alt)
  values (p_article, p_media, 'Troca pela redação', uid::text, old_alt);
  return jsonb_build_object('status', 'ok', 'from', to_jsonb(coalesce(old_ids, '{}')));
end
$$;
revoke execute on function public.studio_replace_image(uuid, uuid) from public, anon;
grant execute on function public.studio_replace_image(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Agendadas (achados 10, 11, 14): na hora de publicar, o checklist roda de novo; incompleta
-- volta para revisão com o motivo. Publicada ganha versão (aparece no histórico público) e
-- deixa invalidação pendente para a rota de revalidação e o tick.
-- ---------------------------------------------------------------------------
create table if not exists studio_revalidations (
  id bigserial primary key,
  tags text[] not null,
  created_at timestamptz not null default now()
);
alter table studio_revalidations enable row level security;
revoke all on studio_revalidations from anon, authenticated;

create or replace function public.take_studio_revalidations()
returns table (tags text[])
language sql
security definer
set search_path = public
as $$
  delete from studio_revalidations r
   where r.id in (select x.id from studio_revalidations x order by x.id limit 200 for update skip locked)
  returning r.tags
$$;
revoke execute on function public.take_studio_revalidations() from public, anon, authenticated;
grant execute on function public.take_studio_revalidations() to service_role;

create or replace function public.publish_due_scheduled()
returns table (id uuid, slug text, topic_id uuid, section_slug text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r articles%rowtype;
  b text[];
  cur int;
  who uuid;
begin
  for r in
    select * from articles x
     where x.status = 'scheduled' and x.scheduled_for is not null and x.scheduled_for <= now()
     order by x.scheduled_for
     for update skip locked
  loop
    b := public.studio_publish_blockers(r.id);
    if cardinality(b) > 0 then
      update articles x set status = 'in_review', scheduled_for = null, updated_at = now(),
             review_reason = 'Agendamento suspenso: checklist incompleto na hora de publicar (' || array_to_string(b, ', ') || ')'
       where x.id = r.id;
      insert into audit_log (actor, action, object_ref, details)
      values ('system:scheduler', 'article.publish.scheduled.blocked', 'article:' || r.id,
              jsonb_build_object('blockers', to_jsonb(b)));
      continue;
    end if;
    update articles x set status = 'published', publish_mode = 'human', published_at = r.scheduled_for,
           updated_at = now()
     where x.id = r.id
    returning * into r;
    select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = r.id;
    select v.author_id into who from article_versions v
     where v.article_id = r.id and v.origin = 'human' order by v.number desc limit 1;
    insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind)
    values (r.id, cur + 1, public.studio_snapshot(r), 'human', who, 'edit');
    insert into audit_log (actor, action, object_ref, details)
    values ('system:scheduler', 'article.publish.scheduled', 'article:' || r.id, '{}'::jsonb);
    insert into studio_revalidations (tags)
    values (array['article:' || r.id, 'article-slug:' || r.slug, 'section:' || r.section_slug, 'home']
            || case when r.topic_id is not null then array['topic:' || r.topic_id] else '{}'::text[] end);
    id := r.id; slug := r.slug; topic_id := r.topic_id; section_slug := r.section_slug;
    return next;
  end loop;
end
$$;
revoke execute on function public.publish_due_scheduled() from public, anon, authenticated;
grant execute on function public.publish_due_scheduled() to service_role;

-- O mesmo job do pg_cron chama a rota de revalidação (pg_net) quando há invalidação pendente
-- e os segredos existem no Vault; sem pg_net, o tick consome a fila.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'citynews-publish-scheduled';
    if exists (select 1 from pg_extension where extname = 'pg_net')
       and exists (select 1 from pg_namespace where nspname = 'vault') then
      perform cron.schedule('citynews-publish-scheduled', '* * * * *', $cmd$
        select public.publish_due_scheduled();
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/revalidate',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000)
        where exists (select 1 from public.studio_revalidations)
          and exists (select 1 from vault.decrypted_secrets where name = 'app_url');
      $cmd$);
    else
      perform cron.schedule('citynews-publish-scheduled', '* * * * *', 'select public.publish_due_scheduled()');
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Gatilhos: nada de conteúdo por UPDATE/INSERT direto (achado 2)
-- ---------------------------------------------------------------------------
create or replace function public.guard_articles_direct()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'in_review') or new.published_at is not null
       or new.scheduled_for is not null or new.field_origins <> '{}'::jsonb then
      raise exception 'articles: matéria nova nasce em rascunho ou revisão' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.title, new.dek, new.body, new.section_slug, new.slug, new.kind, new.topic_id, new.tags,
      new.neighborhoods, new.seo_title, new.seo_description, new.field_origins, new.ai_summary,
      new.ai_summary_reviewed_by, new.author_id, new.agent_id, new.ai_fallback, new.urgent, new.sponsored,
      new.published_at, new.publish_mode, new.scheduled_for, new.publish_destinations, new.confidence,
      new.confidence_score, new.rules_version)
     is distinct from
     (old.title, old.dek, old.body, old.section_slug, old.slug, old.kind, old.topic_id, old.tags,
      old.neighborhoods, old.seo_title, old.seo_description, old.field_origins, old.ai_summary,
      old.ai_summary_reviewed_by, old.author_id, old.agent_id, old.ai_fallback, old.urgent, old.sponsored,
      old.published_at, old.publish_mode, old.scheduled_for, old.publish_destinations, old.confidence,
      old.confidence_score, old.rules_version) then
    raise exception 'articles: conteúdo só muda pelas funções do Estúdio (salvar, publicar, Atualização, Correção)'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('published', 'updated', 'scheduled') then
      raise exception 'articles: publicar só pela função de publicação (checklist)' using errcode = '42501';
    end if;
    if old.status in ('published', 'updated') and new.status <> 'unpublished' then
      raise exception 'articles: matéria publicada só sai do ar por despublicação' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists articles_guard_direct on articles;
create trigger articles_guard_direct before insert or update on articles
  for each row execute function public.guard_articles_direct();

-- Versões só pelas funções (salvar, publicar, Atualização, Correção): sem INSERT direto, o
-- revisor não forja versão de correção nem credita outra pessoa.
drop policy if exists article_versions_insert on article_versions;

-- Fontes e imagens de matéria publicada não mudam por escrita direta.
create or replace function public.guard_article_children_direct()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  aid uuid := case when tg_op = 'DELETE' then old.article_id else new.article_id end;
begin
  if current_user in ('anon', 'authenticated')
     and exists (select 1 from articles a where a.id = aid and a.status in ('published', 'updated')) then
    raise exception '%: matéria publicada muda só por Atualização', tg_table_name using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
drop trigger if exists article_sources_guard_direct on article_sources;
create trigger article_sources_guard_direct before insert or update or delete on article_sources
  for each row execute function public.guard_article_children_direct();
drop trigger if exists article_media_guard_direct on article_media;
create trigger article_media_guard_direct before insert or update or delete on article_media
  for each row execute function public.guard_article_children_direct();

-- Correção publicada é registro público imutável; publicar só pela função (achado 2d).
create or replace function public.guard_corrections_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.published_at is not null or new.status = 'published' then
      raise exception 'corrections: correção só publica pela função de correção' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.published_at is not null and row(new.*) is distinct from row(old.*) then
    raise exception 'corrections: correção publicada não muda' using errcode = '42501';
  end if;
  if new.published_at is distinct from old.published_at
     or (new.status = 'published' and old.status is distinct from 'published') then
    raise exception 'corrections: correção só publica pela função de correção' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists corrections_guard_record on corrections;
create trigger corrections_guard_record before insert or update on corrections
  for each row execute function public.guard_corrections_record();

-- ---------------------------------------------------------------------------
-- Mídia (achados 7 e 15): imagem bloqueada (inclusive por remoção a pedido) não volta a
-- aprovada, e aprovada nunca com licença vencida; editor aprova só imagem usada apenas em
-- editorias dele.
-- ---------------------------------------------------------------------------
create or replace function public.guard_media_assets_direct()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if old.status = 'blocked' and new.status <> 'blocked' then
      raise exception 'media_assets: imagem bloqueada não volta ao portal' using errcode = '42501';
    end if;
    if new.status = 'approved' and new.license_until is not null
       and new.license_until < (now() at time zone 'America/Cuiaba')::date then
      raise exception 'media_assets: licença vencida' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists media_assets_guard_direct on media_assets;
create trigger media_assets_guard_direct before update on media_assets
  for each row execute function public.guard_media_assets_direct();

create or replace function public.can_approve_media(uid uuid, media uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(uid, '{editor_chefe,revisor}')
    or (exists (select 1 from public.article_media am where am.media_id = can_approve_media.media)
        and not exists (
          select 1
          from public.article_media am
          join public.articles a on a.id = am.article_id
          where am.media_id = can_approve_media.media and not public.has_role(uid, 'editor', a.section_slug)
        ))
$$;

revoke execute on function public.guard_articles_direct(), public.guard_article_children_direct(),
  public.guard_corrections_record(), public.guard_media_assets_direct()
  from public, anon;
