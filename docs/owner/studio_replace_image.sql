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
