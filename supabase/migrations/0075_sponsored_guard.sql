-- MS-T1 (docs/media-slots.md §5.6) · Patrocinado nativo: flag e trava de editoria.
--
-- 1. `feature_flags.sponsored_native_enabled` (padrão desligada): o portal só mostra matéria
--    patrocinada fora da própria página com a flag ligada (B-003: nada é vendido no Hobby).
-- 2. Justiça entra nas editorias sem patrocinado, ao lado de Política, Segurança e Saúde
--    (CLAUDE.md §5.8/§5.9 e pedido do dono). Vale para campanhas (trigger de 0048) e, agora,
--    para `articles.sponsored`. Sem `drop`: a migration só cria ou substitui.
-- 3. `guard_article_sponsored`: matéria patrocinada nunca em editoria proibida (nem subeditoria
--    pela `autonomy_category` ou pelo prefixo do slug) e nunca urgente.

insert into public.feature_flags (key, enabled) values ('sponsored_native_enabled', false)
on conflict (key) do nothing;

-- Editoria (ou a categoria de autonomia dela) proibida para patrocinado. Mesma regra de
-- `isNeverSection` em src/lib/ads/rules.ts.
create or replace function public.is_never_sponsored_section(p_slug text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from unnest(array['politica', 'justica', 'seguranca', 'saude']) n
     where p_slug = n
        or p_slug like n || '-%'
        or exists (select 1 from public.sections sec
                    where sec.slug = p_slug and sec.autonomy_category = n)
  )
$$;
revoke execute on function public.is_never_sponsored_section(text) from public, anon;

-- Campanhas: a constraint `sponsored_sections_allowed` (0039) segue como está; Justiça entra
-- pelo trigger `guard_sponsored_sections`, que passa a usar a função acima.

create or replace function public.guard_sponsored_sections()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bad text;
begin
  select s into bad
    from unnest(new.allowed_sections) s
   where public.is_never_sponsored_section(s)
   limit 1;
  if bad is not null then
    raise exception 'publicidade: a editoria "%" (Política, Justiça, Segurança ou Saúde, com subeditorias) não recebe patrocinado', bad
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function public.guard_article_sponsored()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.sponsored then
    return new;
  end if;
  if public.is_never_sponsored_section(new.section_slug) then
    raise exception 'publicidade: matéria patrocinada não pode ficar em "%" (Política, Justiça, Segurança ou Saúde, com subeditorias)', new.section_slug
      using errcode = '23514';
  end if;
  if new.urgent then
    raise exception 'publicidade: matéria patrocinada não pode ser urgente'
      using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.guard_article_sponsored() from public, anon;

create or replace trigger articles_sponsored_guard before insert or update of sponsored, section_slug, urgent
  on public.articles
  for each row execute function public.guard_article_sponsored();
