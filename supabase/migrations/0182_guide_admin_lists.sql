-- A-213 · Ferramentas de operação do Guia, só para o servidor (service_role).
-- `guide_suspend_lists`: tira listas publicadas do ar e põe o índice, as listas e os lugares delas na
-- fila de revalidação (aplicada em produção em 08/10 para as listas com lugares de outro tipo).
-- `guide_refresh_now`: marca listas suspensas para a próxima atualização; quem decide se voltam ao
-- ar é `refreshList`, que recalcula com as regras atuais e suspende de novo se não passarem.

create or replace function public.guide_suspend_lists(p_slugs text[], p_reason text)
returns setof text language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.studio_revalidations (tags)
  select array['guide', 'sitemap'] || array_agg(distinct 'guide:list:' || l.slug)
         || coalesce(array_agg(distinct 'guide:venue:' || v.slug) filter (where v.slug is not null), '{}')
    from public.guide_lists l
    left join public.guide_list_items i on i.list_id = l.id
    left join public.venues v on v.id = i.venue_id
   where l.slug = any (p_slugs);
  return query
  update public.guide_lists
     set status = 'suspended', suspended_at = now(), suspended_reason = p_reason
   where slug = any (p_slugs) and status = 'published'
  returning slug;
end $fn$;
revoke execute on function public.guide_suspend_lists(text[], text) from public, anon, authenticated;
grant execute on function public.guide_suspend_lists(text[], text) to service_role;

create or replace function public.guide_refresh_now(p_slugs text[])
returns setof text language plpgsql security definer set search_path = public as $fn$
begin
  return query
  update public.guide_lists
     set status = 'published', suspended_at = null, suspended_reason = null,
         next_refresh_at = now() - interval '1 minute'
   where slug = any (p_slugs) and status = 'suspended'
  returning slug;
end $fn$;
revoke execute on function public.guide_refresh_now(text[]) from public, anon, authenticated;
grant execute on function public.guide_refresh_now(text[]) to service_role;
