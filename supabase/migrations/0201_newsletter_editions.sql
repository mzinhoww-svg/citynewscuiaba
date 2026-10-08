-- ARD-T1 (spec §3, C1): edições semanais da newsletter da Agenda. O público lê só edição já
-- publicada; a escrita é da service role (job de montagem) e a equipe da Agenda lê rascunhos.
create table if not exists newsletter_editions (
  id uuid primary key default gen_random_uuid(),
  list text not null,
  edition_date date not null,
  subject text not null,
  html text not null,
  text text not null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'aguardando_provedor', 'sent', 'failed')),
  published_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (list, edition_date)
);
create index if not exists newsletter_editions_list_idx on newsletter_editions (list, edition_date desc);

alter table newsletter_editions enable row level security;
create policy newsletter_editions_read_public on newsletter_editions for select to anon, authenticated
  using (status in ('published', 'aguardando_provedor', 'sent'));
create policy newsletter_editions_read_staff on newsletter_editions for select to authenticated
  using (can_edit_section((select auth.uid()), 'agenda'));
