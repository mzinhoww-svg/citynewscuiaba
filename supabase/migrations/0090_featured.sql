-- FD-T1 · Destaques estáveis por posição (spec 2026-10-03-destaques-e-profundidade; R28, R39 e R40
-- do dono). Faixa 0090+ (acordo com os outros agentes). Aditiva e idempotente; sem DELETE nas
-- funções novas (o conector Supabase retém DELETE): remover um pino grava `ended_at`.
--
-- * `featured_slots`: posições cadastradas (home.lead, home.destaques, editoria.lead, explorar.topo).
-- * `featured_items`: pinos. `ends_at` nulo = fica até o admin remover (R28: manual não expira sozinho).
-- * Leitura pública só do pino ativo cuja matéria está publicada; escrita só pelas funções abaixo,
--   com checagem de papel (admin ou editor_chefe).
-- * `featured_request_images`: R39, fila de busca de imagem das candidatas sem capa.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.featured_slots (
  key text primary key,
  page text not null check (page in ('home', 'editoria', 'explorar')),
  label text not null,
  capacity int not null check (capacity >= 1),
  position int not null default 0
);

create table if not exists public.featured_items (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null references public.featured_slots (key),
  -- Só `editoria.lead`: a editoria da posição.
  section_slug text,
  article_id uuid not null references public.articles (id) on delete cascade,
  position int not null default 0,
  starts_at timestamptz not null default now(),
  -- Nulo = até remover (R28).
  ends_at timestamptz,
  ended_at timestamptz,
  -- `manual` (admin) ou `hot` (pauta quente, tarefa HOT).
  kind text not null default 'manual' check (kind in ('manual', 'hot')),
  created_by uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists featured_items_slot_ends_idx on public.featured_items (slot_key, ends_at);
create index if not exists featured_items_article_idx on public.featured_items (article_id);

insert into public.featured_slots (key, page, label, capacity, position) values
  ('home.lead', 'home', 'Início · manchete', 1, 0),
  ('home.destaques', 'home', 'Início · destaques', 3, 1),
  ('editoria.lead', 'editoria', 'Editoria · destaque', 1, 2),
  ('explorar.topo', 'explorar', 'Explorar · topo', 1, 3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. RLS: leitura pública só de pino ativo de matéria publicada; escrita só por função
-- ---------------------------------------------------------------------------
alter table public.featured_slots enable row level security;
alter table public.featured_items enable row level security;

drop policy if exists featured_slots_read on public.featured_slots;
create policy featured_slots_read on public.featured_slots for select to anon, authenticated using (true);

drop policy if exists featured_items_read_public on public.featured_items;
create policy featured_items_read_public on public.featured_items for select to anon, authenticated
  using (
    ended_at is null
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and exists (
      select 1 from public.articles a
      where a.id = featured_items.article_id and a.status in ('published', 'updated') and not a.sponsored
    )
  );

drop policy if exists featured_items_read_staff on public.featured_items;
create policy featured_items_read_staff on public.featured_items for select to authenticated
  using (public.is_staff((select auth.uid())));

revoke all on public.featured_slots, public.featured_items from anon, authenticated, public;
grant select on public.featured_slots, public.featured_items to anon, authenticated;
grant all on public.featured_slots, public.featured_items to service_role;

-- ---------------------------------------------------------------------------
-- 3. Capacidade: nunca mais pinos ativos que a capacidade da posição
-- ---------------------------------------------------------------------------
create or replace function public.featured_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cap int;
  n int;
begin
  select capacity into cap from featured_slots where key = new.slot_key for update;
  if new.ended_at is null and (new.ends_at is null or new.ends_at > now()) then
    select count(*) into n from featured_items i
     where i.slot_key = new.slot_key
       and i.section_slug is not distinct from new.section_slug
       and i.ended_at is null
       and (i.ends_at is null or i.ends_at > now())
       and i.id <> new.id;
    if n >= cap then
      raise exception 'featured:capacity' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists featured_items_guard on public.featured_items;
create trigger featured_items_guard before insert or update on public.featured_items
  for each row execute function public.featured_items_guard();

-- ---------------------------------------------------------------------------
-- 4. Funções do admin (security definer, papel admin ou editor_chefe)
-- ---------------------------------------------------------------------------
create or replace function public.featured_assert_role()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated')
     and not public.has_any_role(auth.uid(), '{admin,editor_chefe}') then
    raise exception 'featured:forbidden' using errcode = '42501';
  end if;
end
$$;

-- Capa aprovada de verdade (R39): foto, reprodução ou ilustração aprovada.
create or replace function public.featured_has_cover(p_article uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from article_media am join media_assets m on m.id = am.media_id
     where am.article_id = p_article and am.role = 'cover' and m.status = 'approved'
  )
$$;

create or replace function public.featured_pin(
  p_slot text,
  p_section text,
  p_article uuid,
  p_ends_at timestamptz,
  p_note text default '',
  p_replace uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s featured_slots%rowtype;
  a articles%rowtype;
  new_id uuid;
  pos int;
begin
  perform featured_assert_role();
  select * into s from featured_slots where key = p_slot;
  if not found or ((s.page = 'editoria') <> (p_section is not null)) then
    raise exception 'featured:slot' using errcode = 'P0002';
  end if;
  if p_ends_at is not null and (p_ends_at <= now() or p_ends_at > now() + interval '14 days') then
    raise exception 'featured:duration' using errcode = '22023';
  end if;
  select * into a from articles where id = p_article;
  if not found or a.status not in ('published', 'updated') or a.sponsored then
    raise exception 'featured:ineligible' using errcode = '22023';
  end if;
  if not featured_has_cover(p_article) then
    raise exception 'featured:no_cover' using errcode = '22023';
  end if;
  if p_replace is not null then
    update featured_items set ended_at = now() where id = p_replace and ended_at is null;
  end if;
  select coalesce(max(position) + 1, 0) into pos from featured_items
   where slot_key = p_slot and section_slug is not distinct from p_section
     and ended_at is null and (ends_at is null or ends_at > now());
  insert into featured_items (slot_key, section_slug, article_id, position, ends_at, created_by, note)
  values (p_slot, p_section, p_article, pos, p_ends_at, auth.uid(), coalesce(p_note, ''))
  returning id into new_id;
  return new_id;
end
$$;

create or replace function public.featured_unpin(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform featured_assert_role();
  update featured_items set ended_at = now() where id = p_id and ended_at is null;
  if not found then
    raise exception 'featured:not_found' using errcode = 'P0002';
  end if;
  return true;
end
$$;

-- Reordena os pinos ativos de uma posição pela ordem de `p_ids` (todos têm de estar ativos nela).
create or replace function public.featured_reorder(p_slot text, p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform featured_assert_role();
  select count(*) into n from featured_items
   where id = any (p_ids) and slot_key = p_slot and ended_at is null
     and (ends_at is null or ends_at > now());
  if n <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'featured:not_found' using errcode = 'P0002';
  end if;
  update featured_items f set position = u.ord - 1
    from unnest(p_ids) with ordinality as u(id, ord)
   where f.id = u.id;
  return n;
end
$$;

revoke execute on function public.featured_assert_role(), public.featured_has_cover(uuid),
  public.featured_pin(text, text, uuid, timestamptz, text, uuid), public.featured_unpin(uuid),
  public.featured_reorder(text, uuid[]) from public, anon;
grant execute on function public.featured_has_cover(uuid) to authenticated, service_role;
grant execute on function public.featured_assert_role(), public.featured_pin(text, text, uuid, timestamptz, text, uuid),
  public.featured_unpin(uuid), public.featured_reorder(text, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. R39: busca de imagem para candidata a destaque sem capa
-- ---------------------------------------------------------------------------
-- Pedidos recentes (no máximo um por matéria a cada 3 h): a home renderiza a cada minuto e não
-- pode reenfileirar a busca a cada vez. Tabela interna, sem acesso direto.
create table if not exists public.featured_image_requests (
  article_id uuid primary key references public.articles (id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.featured_image_requests enable row level security;
revoke all on public.featured_image_requests from anon, authenticated, public;
grant all on public.featured_image_requests to service_role;

create or replace function public.featured_request_images(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id from articles a
     where a.id = any (p_ids[1:5]) and a.status in ('published', 'updated') and not a.sponsored
       and not featured_has_cover(a.id)
  loop
    insert into featured_image_requests as q (article_id) values (r.id)
    on conflict (article_id) do update set requested_at = now()
      where q.requested_at < now() - interval '3 hours';
    if found then
      perform queue_enqueue(
        'media', 'image:article:' || r.id,
        jsonb_build_object('runId', 'featured', 'step', 'image', 'itemRef', 'article:' || r.id, 'attempt', 1),
        0);
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;
revoke execute on function public.featured_request_images(uuid[]) from public;
grant execute on function public.featured_request_images(uuid[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Auditoria: ações novas na lista fechada (união com o que já existe, sem repetir a lista)
-- ---------------------------------------------------------------------------
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['featured.manage', 'featured.pin', 'featured.unpin', 'featured.update']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
