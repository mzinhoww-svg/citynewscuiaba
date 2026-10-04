-- D-02 (decisão do dono de 04/10/2026): imagens da web com crédito e o aviso
-- "Foto: reprodução web", com um Media Registry para rastrear origem, direitos e usos.
-- Primeira etapa de uma gestão de ativos que pode evoluir (vídeo, áudio, outro storage, CDN).
--
-- O registro estende `media_assets` (origem, página, fonte, autor, crédito, licença, validade,
-- sha256, pHash, proveniência e status já existem) em vez de criar outra tabela:
--   rights_status  authorized | licensed | unknown | pending | expired | blocked
--   usage_scope    {editorial} para reprodução; {editorial,social,thumbnail} para o que é nosso
--   disclaimer     "Foto: reprodução web" na reprodução externa
--   updated_at, archived_at
-- e `article_media` ganha `credit_shown` (crédito exibido naquele uso; `chosen_at` já é a data).
--
-- Ter acesso à imagem não é autorização: reprodução sem autorização registrada fica `unknown`.
-- O status é derivado no banco (`media_rights_status_for`, espelhada em src/lib/media/rights.ts)
-- a cada inserção e mudança de status, licença ou retirada; nada aqui inventa licença ou autor.
-- `media_registry` reúne o ativo, o status efetivo (validade vencida hoje vira `expired`) e as
-- matérias que o usaram. Só aditiva. Reverter: drop da visão, dos gatilhos e das colunas novas.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_rights_status') then
    create type public.media_rights_status as enum
      ('authorized', 'licensed', 'unknown', 'pending', 'expired', 'blocked');
  end if;
end
$$;

alter table public.media_assets
  add column if not exists rights_status public.media_rights_status,
  add column if not exists usage_scope text[] not null default '{editorial}',
  add column if not exists disclaimer text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

alter table public.article_media
  add column if not exists credit_shown text;

comment on column public.media_assets.rights_status is
  'D-02: direitos conhecidos do ativo. Imagem da web sem autorização registrada fica unknown.';
comment on column public.media_assets.usage_scope is
  'D-02: usos permitidos (editorial, social, thumbnail). Reprodução externa: só editorial.';

-- Status pelo que está registrado. `stable` por causa da validade comparada com hoje.
create or replace function public.media_rights_status_for(
  p_kind public.media_kind, p_status text, p_license_until date, p_removed_at timestamptz
) returns public.media_rights_status
language sql
stable
set search_path = public
as $$
  select case
    when p_status = 'blocked' or p_removed_at is not null then 'blocked'
    when p_license_until is not null and p_license_until < current_date then 'expired'
    when p_kind in ('original', 'ai_generated') then 'authorized'
    when p_kind = 'licensed' then 'licensed'
    else 'unknown'
  end::public.media_rights_status
$$;

create or replace function public.media_assets_registry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.license_until is distinct from old.license_until
     or new.removed_at is distinct from old.removed_at
     or new.kind is distinct from old.kind
     or new.rights_status is null then
    -- `pending` é marcação manual (direitos em apuração): só bloqueio ou vencimento a sobrescreve.
    if new.rights_status = 'pending'
       and public.media_rights_status_for(new.kind, new.status, new.license_until, new.removed_at)
           not in ('blocked', 'expired') then
      null;
    else
      new.rights_status := public.media_rights_status_for(
        new.kind, new.status, new.license_until, new.removed_at);
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.disclaimer is null and new.kind = 'reproduction' then
      new.disclaimer := 'Foto: reprodução web';
    end if;
    if new.kind not in ('reproduction', 'illustrative') and new.usage_scope = '{editorial}'::text[] then
      new.usage_scope := '{editorial,social,thumbnail}'::text[];
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function public.media_assets_registry() from public, anon, authenticated;

drop trigger if exists media_assets_registry on public.media_assets;
create trigger media_assets_registry before insert or update on public.media_assets
  for each row execute function public.media_assets_registry();

-- Crédito exibido em cada uso: o do ativo no momento da associação (não muda se o ativo mudar).
create or replace function public.article_media_credit_shown()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.credit_shown is null then
    select coalesce(m.credit, m.source_name) into new.credit_shown
      from media_assets m where m.id = new.media_id;
  end if;
  return new;
end
$$;
revoke execute on function public.article_media_credit_shown() from public, anon, authenticated;

drop trigger if exists article_media_credit_shown on public.article_media;
create trigger article_media_credit_shown before insert on public.article_media
  for each row execute function public.article_media_credit_shown();

-- Dados existentes: status derivado, aviso e escopo pelo tipo, crédito dos usos já feitos.
update public.media_assets
   set rights_status = public.media_rights_status_for(kind, status, license_until, removed_at),
       disclaimer = case when kind = 'reproduction' then coalesce(disclaimer, 'Foto: reprodução web')
                         else disclaimer end,
       usage_scope = case when kind in ('reproduction', 'illustrative') then '{editorial}'::text[]
                          else '{editorial,social,thumbnail}'::text[] end
 where rights_status is null;

update public.article_media am
   set credit_shown = coalesce(m.credit, m.source_name)
  from public.media_assets m
 where m.id = am.media_id and am.credit_shown is null;

-- Registro consultável: ativo, status efetivo hoje, usos e matérias. Só equipe (RLS das tabelas).
create or replace view public.media_registry
with (security_invoker = true) as
select m.id,
       m.kind,
       coalesce(m.source_name, m.provenance ->> 'source') as origin,
       m.author,
       m.page_url as source_url,
       m.origin_url as original_url,
       m.storage_path,
       m.license,
       -- Gravado vale (inclui marcação manual), salvo bloqueio ou validade vencida hoje.
       case when public.media_rights_status_for(m.kind, m.status, m.license_until, m.removed_at)
                 in ('blocked', 'expired')
            then public.media_rights_status_for(m.kind, m.status, m.license_until, m.removed_at)
            else coalesce(m.rights_status,
                          public.media_rights_status_for(m.kind, m.status, m.license_until, m.removed_at))
       end as rights_status,
       m.usage_scope,
       m.license_until as expiration,
       m.credit,
       m.disclaimer,
       m.sha256 as content_hash,
       m.provenance as metadata,
       m.status,
       m.captured_at as created_at,
       m.updated_at,
       m.archived_at,
       count(am.article_id) as uses,
       coalesce(array_agg(am.article_id order by am.chosen_at) filter (where am.article_id is not null),
                '{}') as article_ids
  from public.media_assets m
  left join public.article_media am on am.media_id = m.id
 group by m.id;

comment on view public.media_registry is
  'D-02: Media Registry. Ativo, origem, autor, direitos efetivos hoje, escopo, crédito, aviso, hash e matérias que o usaram.';

revoke all on public.media_registry from public, anon;
grant select on public.media_registry to authenticated, service_role;
