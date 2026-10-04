-- MS-T2 (docs/media-slots.md §5.6) · Anunciante estruturado e creative com `kind`.
--
-- 1. `advertisers`: cadastro do anunciante (nome único sem diferenciar caixa, CNPJ e contato
--    opcionais), lido e gerido só por admin e editor-chefe, como as campanhas (0039).
-- 2. `sponsored_campaigns.advertiser_id`: preenchido pelo trigger a partir do nome digitado no
--    painel A07 (o formulário não muda); campanhas existentes ganham o vínculo aqui.
-- 3. `creative.kind`: campanhas antigas viram `native`; só os tipos de `src/lib/ads/creative.ts`
--    entram (resposta patrocinada é proibida, spec D17). Sem `drop`: só cria e acrescenta.

create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  document text check (document is null or document ~ '^[0-9./-]{11,18}$'),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists advertisers_name_key on public.advertisers (lower(btrim(name)));
alter table public.advertisers enable row level security;
create policy advertisers_manage on public.advertisers for all to authenticated
  using (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (public.has_any_role((select auth.uid()), '{admin,editor_chefe}'));

alter table public.sponsored_campaigns
  add column if not exists advertiser_id uuid references public.advertisers(id) on delete restrict;
create index if not exists sponsored_campaigns_advertiser_idx
  on public.sponsored_campaigns (advertiser_id);

-- Nome digitado → anunciante (cria se for novo). Roda como quem grava: a política acima já
-- restringe a admin e editor-chefe.
create or replace function public.link_campaign_advertiser()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if tg_op = 'UPDATE' and new.advertiser = old.advertiser and new.advertiser_id is not null then
    return new;
  end if;
  insert into public.advertisers (name, created_by)
  values (btrim(new.advertiser), new.created_by)
  on conflict ((lower(btrim(name)))) do nothing;
  select id into v_id from public.advertisers where lower(btrim(name)) = lower(btrim(new.advertiser));
  new.advertiser_id := v_id;
  if not (new.creative ? 'kind') then
    new.creative := new.creative || '{"kind":"native"}'::jsonb;
  end if;
  return new;
end
$$;
revoke execute on function public.link_campaign_advertiser() from public, anon;

create or replace trigger sponsored_campaigns_advertiser
  before insert or update of advertiser, creative on public.sponsored_campaigns
  for each row execute function public.link_campaign_advertiser();

-- Campanhas existentes: vínculo e kind (o update passa pelo trigger).
update public.sponsored_campaigns set advertiser = advertiser where advertiser_id is null;
update public.sponsored_campaigns set creative = creative where not (creative ? 'kind');

alter table public.sponsored_campaigns add constraint sponsored_creative_kind
  check (creative->>'kind' in ('native', 'display', 'tile', 'newsletter', 'video')) not valid;
alter table public.sponsored_campaigns validate constraint sponsored_creative_kind;
