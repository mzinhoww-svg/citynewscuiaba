-- Gate do P4 (complemento): texto alternativo e legenda da imagem na matéria, editáveis no
-- editor (E04) e no detalhe da imagem (E10). O checklist exige texto alternativo; sem campo, a
-- publicação ficava travada.
--
-- Convenção: `alt` nulo = ainda não escrito (bloqueia); `alt = ''` = imagem decorativa,
-- marcada de propósito (não bloqueia; o portal renderiza alt vazio). Até 250 caracteres.
-- Legenda opcional, até 300. Grava só por studio_set_image_text (security definer, mesmo
-- caminho da troca de imagem): papel, status e vínculo conferidos por dentro.

alter table article_media add column if not exists caption text;
alter table article_media drop constraint if exists article_media_alt_len;
alter table article_media add constraint article_media_alt_len check (alt is null or length(alt) <= 250);
alter table article_media drop constraint if exists article_media_caption_len;
alter table article_media add constraint article_media_caption_len check (caption is null or length(caption) <= 300);

create or replace function public.studio_set_image_text(
  p_article uuid,
  p_media uuid,
  p_alt text,
  p_caption text,
  p_decorative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a articles%rowtype;
  v_alt text := case when coalesce(p_decorative, false) then '' else trim(coalesce(p_alt, '')) end;
  v_caption text := nullif(trim(coalesce(p_caption, '')), '');
begin
  if uid is null then
    raise exception 'studio_set_image_text: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into a from articles where id = p_article for update;
  if not found or not public.is_staff(uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- article.edit: editoria (também em publicada: texto alternativo é acessibilidade, não muda o
  -- texto da matéria) ou jornalista autor enquanto a matéria está com a redação.
  if not public.studio_can_edit(uid, a, null) then
    raise exception 'studio_set_image_text: sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from article_media am where am.article_id = p_article and am.media_id = p_media) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if (not coalesce(p_decorative, false) and v_alt = '') or length(v_alt) > 250
     or length(coalesce(v_caption, '')) > 300 then
    return jsonb_build_object('status', 'invalid');
  end if;
  update article_media set alt = v_alt, caption = v_caption
   where article_id = p_article and media_id = p_media;
  return jsonb_build_object('status', 'ok', 'public', a.status in ('published', 'updated'),
                            'decorative', v_alt = '');
end
$$;
revoke execute on function public.studio_set_image_text(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.studio_set_image_text(uuid, uuid, text, text, boolean) to authenticated, service_role;

-- Troca de imagem mantém texto alternativo e legenda da anterior.
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
  old_caption text;
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
  select array_agg(media_id), (array_agg(alt))[1], (array_agg(caption))[1]
    into old_ids, old_alt, old_caption
    from article_media where article_id = p_article;
  delete from article_media where article_id = p_article;
  insert into article_media (article_id, media_id, rationale, chosen_by, alt, caption)
  values (p_article, p_media, 'Troca pela redação', uid::text, old_alt, old_caption);
  return jsonb_build_object('status', 'ok', 'from', to_jsonb(coalesce(old_ids, '{}')));
end
$$;

-- Checklist no banco: alt vazio de propósito (decorativa) passa; nulo ou só espaços bloqueia.
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
               and (coalesce(trim(m.credit), '') = '' or am.alt is null
                    or (am.alt <> '' and trim(am.alt) = ''))) then
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
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text'
  ]::text[]
$$;
