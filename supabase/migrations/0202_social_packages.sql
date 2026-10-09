-- ARD-T1 (spec §3, C2): pacote semanal do Instagram. Só a seção `agenda` lê e escreve (mesmo
-- predicado de `event_listings_write`); os PNGs ficam no bucket privado `social-packages`.
create table if not exists social_packages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('instagram_agenda')),
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'discarded')),
  items jsonb not null default '[]'::jsonb,
  caption text not null default '',
  assets jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_url text,
  created_at timestamptz not null default now(),
  unique (kind, week_start)
);

alter table social_packages enable row level security;
create policy social_packages_agenda on social_packages for all to authenticated
  using (can_edit_section((select auth.uid()), 'agenda'))
  with check (can_edit_section((select auth.uid()), 'agenda'));

do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public) values ('social-packages', 'social-packages', false)
             on conflict (id) do update set public = false$q$;
  end if;
end $$;
