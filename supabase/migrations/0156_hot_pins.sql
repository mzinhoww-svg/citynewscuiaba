-- HOT-T3 · Pauta quente vira destaque: precedência e admin (spec 2026-10-03-destaques-e-profundidade
-- R8, R10, R11; plano 2026-10-04-retomada-ui-e-pauta-quente). Aditiva e idempotente, sem DELETE.
--
-- 1. `featured_items.hot_sources`: portais distintos que sustentam o pino quente (o Estúdio mostra
--    "Em alta · n portais"; `front_signals` não é legível pela equipe).
-- 2. Capacidade por tipo: o pino quente nunca impede o admin de fixar (manual vence, R8). O gatilho
--    passa a contar só os pinos ativos do mesmo `kind`; quem resolve a posição (`resolveSlot`)
--    põe o manual na frente. O pipeline (`applyHotPins`) só grava quente em vaga livre de manual.
-- 3. `featured_dismiss_hot(p_id)`: o admin dispensa a pauta quente; encerra todos os pinos quentes
--    vigentes do mesmo assunto e grava `dismissed_at` (o mesmo sinal não a traz de volta). Mesmo
--    papel das outras ações de destaque (admin ou editor_chefe).
-- 4. Auditoria: `featured.dismiss_hot` na lista fechada.

-- ---------------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------------
alter table public.featured_items add column if not exists hot_sources int null
  check (hot_sources is null or hot_sources >= 0);

-- ---------------------------------------------------------------------------
-- 2. Capacidade por tipo
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
       and i.kind = new.kind
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

-- `featured_pin` (0090) calcula a posição só entre os manuais vigentes.
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
   where slot_key = p_slot and section_slug is not distinct from p_section and kind = 'manual'
     and ended_at is null and (ends_at is null or ends_at > now());
  insert into featured_items (slot_key, section_slug, article_id, position, ends_at, created_by, note)
  values (p_slot, p_section, p_article, pos, p_ends_at, auth.uid(), coalesce(p_note, ''))
  returning id into new_id;
  return new_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Dispensar a pauta quente
-- ---------------------------------------------------------------------------
create or replace function public.featured_dismiss_hot(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid;
  n int;
begin
  perform featured_assert_role();
  select topic_id into t from featured_items where id = p_id and kind = 'hot';
  if not found then
    raise exception 'featured:not_found' using errcode = 'P0002';
  end if;
  update featured_items
     set dismissed_at = now(), ended_at = coalesce(ended_at, now())
   where kind = 'hot'
     and dismissed_at is null
     and (id = p_id or (t is not null and topic_id = t and ended_at is null));
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'featured:not_found' using errcode = 'P0002';
  end if;
  return n;
end
$$;
revoke execute on function public.featured_dismiss_hot(uuid) from public, anon;
grant execute on function public.featured_dismiss_hot(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Auditoria: ação nova na lista fechada (união com o que já existe)
-- ---------------------------------------------------------------------------
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['featured.dismiss_hot']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
