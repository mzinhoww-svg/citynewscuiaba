-- ARD-T1 (spec 2026-10-08-agenda-rica-e-distribuicao-design.md §3): campos ricos do evento.
-- Imagem (media_assets), organização, vínculo com o Guia e destaque até uma data; faixa etária
-- passa a ter lista fechada (linhas fora dela viram 'consulte' antes do check).
alter table event_listings
  add column if not exists media_id uuid references media_assets(id) on delete set null,
  add column if not exists organizer text,
  add column if not exists venue_id uuid references venues(id) on delete set null,
  add column if not exists featured_until timestamptz;

update event_listings
   set age_rating = 'consulte'
 where age_rating not in ('livre', '10', '12', '14', '16', '18', 'consulte');

alter table event_listings
  add constraint event_listings_age_rating_check
  check (age_rating in ('livre', '10', '12', '14', '16', '18', 'consulte'));

create index if not exists event_listings_venue_idx on event_listings (venue_id) where venue_id is not null;
create index if not exists event_listings_featured_idx on event_listings (featured_until) where featured_until is not null;

-- Auditoria: destaque de evento e pacotes sociais (união com o que já existe, como na 0198).
-- `AGENDA_AUDIT_ACTIONS` em src/lib/audit/actions.ts espelha esta lista.
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions()
        || array['event.feature', 'social.approve', 'social.publish', 'social.discard']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
