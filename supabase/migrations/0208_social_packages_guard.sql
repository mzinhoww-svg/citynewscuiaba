-- ARD-T6 (revisão; A-128: integridade sem segunda pessoa, com regra executável): o pacote do
-- Instagram só muda de estado pelas transições das ações do Estúdio, mesmo para quem tem a
-- editoria Agenda e escreve direto pelo PostgREST (a RLS `social_packages_agenda` libera a
-- tabela inteira para a editoria).
--   Sistema (service role: job e "Regerar", depois da checagem de papel): sem restrição.
--   Pessoa:
--     inserir      só rascunho vazio (sem aprovação, sem PNG, sem link);
--     draft → approved     sem erro de montagem; `approved_by = auth.uid()` e
--                          `approved_at = now()` forçados (ninguém aprova em nome de outro);
--     draft|approved → discarded   limpa a aprovação;
--     approved → published         com link de post do Instagram; aprovação intacta;
--     qualquer outra mudança (conteúdo, PNGs, geração, erro, exclusões, link fora da publicação,
--     outra transição) é recusada com 42501.
create or replace function public.social_packages_guard()
returns trigger
language plpgsql
-- `caller_is_system()` não é executável por `authenticated` (0188); a função de gatilho roda
-- como dona. `auth.uid()`/`auth.role()` continuam lendo o JWT da requisição.
security definer
set search_path = public
as $$
begin
  if public.caller_is_system() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.approved_by is not null or new.approved_at is not null
       or new.published_url is not null or new.assets <> '[]'::jsonb
       or new.generated_at is not null then
      raise exception 'social_packages: pacote novo só como rascunho vazio' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.kind is distinct from old.kind or new.week_start is distinct from old.week_start
     or new.items is distinct from old.items or new.caption is distinct from old.caption
     or new.assets is distinct from old.assets or new.error is distinct from old.error
     or new.excluded is distinct from old.excluded
     or new.generated_at is distinct from old.generated_at
     or new.created_at is distinct from old.created_at then
    raise exception 'social_packages: o conteúdo do pacote só muda pela montagem'
      using errcode = '42501';
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if old.error is not null then
      raise exception 'social_packages: pacote com erro não é aprovado' using errcode = '42501';
    end if;
    if new.published_url is distinct from old.published_url then
      raise exception 'social_packages: link só ao publicar' using errcode = '42501';
    end if;
    if new.approved_by is not null and new.approved_by is distinct from auth.uid() then
      raise exception 'social_packages: ninguém aprova em nome de outra pessoa'
        using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif old.status in ('draft', 'approved') and new.status = 'discarded' then
    if new.published_url is distinct from old.published_url then
      raise exception 'social_packages: link só ao publicar' using errcode = '42501';
    end if;
    new.approved_by := null;
    new.approved_at := null;
  elsif old.status = 'approved' and new.status = 'published' then
    if new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'social_packages: a aprovação não muda ao publicar' using errcode = '42501';
    end if;
    if new.published_url is null
       or new.published_url !~ '^https://www\.instagram\.com/(p|reel|tv)/[A-Za-z0-9_-]+/?$' then
      raise exception 'social_packages: link de post do Instagram inválido' using errcode = '42501';
    end if;
  else
    raise exception 'social_packages: mudança % → % não permitida', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function public.social_packages_guard() from public, anon, authenticated;

create or replace trigger social_packages_guard
  before insert or update on social_packages
  for each row execute function public.social_packages_guard();
