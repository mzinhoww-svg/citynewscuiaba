-- UI-T16 · imagens da matéria: capa e imagem no texto (spec 2026-10-02-ui-publica §4.10).
-- `role`: 'cover' (capa, sob o título) ou 'inline' (depois do parágrafo `position` do corpo).
-- As linhas existentes ficam como capa. Cada matéria tem no máximo 1 capa e 1 imagem no texto;
-- remover (bloquear) um ativo não mexe no outro: cada um é uma linha de article_media.
-- RLS: `article_media_read_public` (0002) é por linha, sem lista de colunas; as colunas novas são
-- lidas pela mesma política (anon só vê matéria publicada).

alter table article_media
  add column if not exists role text not null default 'cover',
  add column if not exists position int;

alter table article_media drop constraint if exists article_media_role_check;
alter table article_media add constraint article_media_role_check check (role in ('cover', 'inline'));

-- `position` (índice, a partir de 1, do parágrafo depois do qual a imagem entra) só vale para a imagem no texto.
alter table article_media drop constraint if exists article_media_position_check;
alter table article_media add constraint article_media_position_check
  check ((role = 'inline' and position is not null and position >= 1) or (role = 'cover' and position is null));

create unique index if not exists article_media_one_cover on article_media (article_id) where role = 'cover';
create unique index if not exists article_media_one_inline on article_media (article_id) where role = 'inline';

-- Troca de imagem pela redação (0026): troca só a capa, mantém a imagem do texto, o texto
-- alternativo e a legenda da capa anterior. Se a nova imagem já era a do texto, ela vira capa.
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
    from article_media where article_id = p_article and role = 'cover';
  delete from article_media where article_id = p_article and (role = 'cover' or media_id = p_media);
  insert into article_media (article_id, media_id, rationale, chosen_by, alt, caption, role)
  values (p_article, p_media, 'Troca pela redação', uid::text, old_alt, old_caption, 'cover');
  return jsonb_build_object('status', 'ok', 'from', to_jsonb(coalesce(old_ids, '{}')));
end
$$;
revoke execute on function public.studio_replace_image(uuid, uuid) from public, anon;
grant execute on function public.studio_replace_image(uuid, uuid) to authenticated, service_role;

-- Matéria como a etapa de imagem a enxerga (0004), agora com capa e imagem do texto atuais, número
-- de parágrafos do corpo, mídia escolhida por pessoa e edição humana (o reprocesso não toca nelas).
create or replace function pipeline_media_context(p_article uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'articleId', a.id,
    'topicId', a.topic_id,
    'title', a.title,
    'sectionSlug', a.section_slug,
    'category', coalesce(s.autonomy_category, a.section_slug),
    'sensitive', coalesce(bool_or(ci.sensitive), false),
    'tags', coalesce((select jsonb_agg(distinct t) from collected_items c2, unnest(c2.tags) t
                      where c2.topic_id = a.topic_id and c2.duplicate_of is null and c2.quarantined_at is null), '[]'::jsonb),
    'hasMedia', exists (select 1 from article_media am where am.article_id = a.id),
    'cover', (select jsonb_build_object('mediaId', am.media_id, 'sourceId', m.source_id,
                                        'originUrl', m.origin_url, 'status', m.status,
                                        'kind', m.kind::text, 'phash', m.phash::text)
              from article_media am join media_assets m on m.id = am.media_id
              where am.article_id = a.id and am.role = 'cover'),
    'inline', (select jsonb_build_object('mediaId', am.media_id, 'sourceId', m.source_id,
                                         'originUrl', m.origin_url, 'status', m.status,
                                         'kind', m.kind::text, 'phash', m.phash::text)
               from article_media am join media_assets m on m.id = am.media_id
               where am.article_id = a.id and am.role = 'inline'),
    'bodyParagraphs', (select count(*) from jsonb_array_elements(
                         case when jsonb_typeof(a.body -> 'content') = 'array' then a.body -> 'content' else '[]'::jsonb end) n
                       where n ->> 'type' = 'paragraph'
                         and trim(coalesce(jsonb_path_query_first(n, '$.**.text') #>> '{}', '')) <> ''),
    'humanMedia', exists (select 1 from article_media am where am.article_id = a.id and am.chosen_by not like 'pipeline%'),
    'humanEdited', exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human'),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'itemId', ci.id,
        'title', ci.original_title,
        'imageUrl', ci.image_url,
        'pageUrl', ci.canonical_url,
        'author', ci.author,
        'source', jsonb_build_object(
          'id', so.id, 'slug', so.slug, 'name', coalesce(so.display_name, so.name), 'baseUrl', so.base_url,
          'imagePolicy', so.image_policy, 'agreementUntil', so.agreement_until,
          'rateLimitPerHour', so.rate_limit_per_hour))
        order by (so.reliability = 'primary') desc, ci.published_at desc nulls last, ci.id)
      filter (where ci.id is not null and so.id is not null), '[]'::jsonb))
  from articles a
  left join sections s on s.slug = a.section_slug
  left join collected_items ci
    on ci.topic_id = a.topic_id and a.topic_id is not null
   and ci.duplicate_of is null and ci.quarantined_at is null
  left join sources so on so.id = ci.source_id and so.status <> 'blocked'
  where a.id = p_article
  group by a.id, s.autonomy_category;
$$;

-- Checklist de publicação (0026): ativo bloqueado não trava; crédito cai para o nome da fonte.
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
  -- Crédito: o do ativo ou, na reprodução, o nome da fonte. Ativo removido a pedido não conta.
  if exists (select 1 from article_media am join media_assets m on m.id = am.media_id
             where am.article_id = p_id and m.status <> 'blocked'
               and (coalesce(nullif(trim(m.credit), ''), nullif(trim(m.source_name), ''), '') = ''
                    or am.alt is null
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

-- Reprocesso de imagens (spec §4.10): matérias publicadas que ainda podem ganhar capa ou imagem do
-- texto, das mais recentes às mais antigas, paginadas por (published_at, id). Fora: escolha ou
-- edição de pessoa, ativo removido a pedido, capa que não é de fonte, imagem do texto já gravada,
-- sem fontes de imagem suficientes (1 sem capa; 2 de fontes distintas com capa) e corpo curto.
create or replace function media_reprocess_candidates(p_limit int, p_after_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, published_at timestamptz)
language sql
stable
set search_path = public
as $$
  select a.id, a.published_at
  from articles a
  where a.status in ('published', 'updated') and a.published_at is not null
    and (p_after_at is null or (a.published_at, a.id) < (p_after_at, p_after_id))
    and not exists (select 1 from article_media am where am.article_id = a.id and am.chosen_by not like 'pipeline%')
    and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
    and not exists (select 1 from article_media am join media_assets m on m.id = am.media_id
                    where am.article_id = a.id and (am.role = 'inline' or m.status = 'blocked'
                          or (am.role = 'cover' and m.kind not in ('original', 'reproduction'))))
    and (select count(distinct ci.source_id)
         from collected_items ci join sources so on so.id = ci.source_id
         where a.topic_id is not null and ci.topic_id = a.topic_id and ci.duplicate_of is null
           and ci.quarantined_at is null and ci.image_url is not null and so.status <> 'blocked'
           and so.image_policy in ('reproduction', 'with_agreement'))
        >= case when exists (select 1 from article_media am where am.article_id = a.id) then 2 else 1 end
    and (not exists (select 1 from article_media am where am.article_id = a.id)
         or (select count(*) from jsonb_array_elements(
               case when jsonb_typeof(a.body -> 'content') = 'array' then a.body -> 'content' else '[]'::jsonb end) n
             where n ->> 'type' = 'paragraph'
               and trim(coalesce(jsonb_path_query_first(n, '$.**.text') #>> '{}', '')) <> '') >= 2)
  order by a.published_at desc, a.id desc
  limit greatest(p_limit, 0);
$$;
revoke execute on function media_reprocess_candidates(int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function media_reprocess_candidates(int, timestamptz, uuid) to service_role;
