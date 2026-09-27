-- CityNews Cuiabá · schema inicial (spec §4, §6, §7; architecture §5)
create extension if not exists unaccent;
create extension if not exists pgcrypto;
create extension if not exists vector;
-- pgmq, pg_cron e pg_net são habilitados em 0003_pipeline.sql (dependem do projeto Supabase)

create type source_kind as enum ('rss','sitemap','api','page','newsletter','social','events');
create type source_reliability as enum ('primary','verified','standard','low');
create type source_status as enum ('active','paused','degraded','blocked');
create type image_policy as enum ('none','with_agreement','licensed_only','reproduction');
create type republish_policy as enum ('link_only','summary_2_sentences');
create type content_kind as enum ('original','normalized','aggregated');
create type article_status as enum ('draft','in_review','changes_requested','approved','scheduled','published','updated','archived','unpublished');
create type publish_mode as enum ('human','auto');
create type confidence_level as enum ('alta','média','baixa');
create type topic_state as enum ('em_apuracao','confirmado','corrigido','encerrado');
create type media_kind as enum ('original','licensed','illustrative','ai_generated','reproduction');
create type app_role as enum ('admin','editor_chefe','editor','jornalista','revisor','operador_ia','analista','moderador','leitura');

create table sections (
  slug text primary key,
  name text not null,
  parent_slug text references sections(slug),
  autonomy_category text not null
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  base_url text not null,
  kind source_kind not null,
  feed_url text,
  frequency_minutes int not null default 30 check (frequency_minutes >= 30),
  rate_limit_per_hour int not null default 60,
  priority smallint not null default 2 check (priority between 1 and 3),
  categories text[] not null default '{}',
  locality text not null,
  reliability source_reliability not null default 'standard',
  image_policy image_policy not null default 'none',
  republish_policy republish_policy not null default 'link_only',
  may_be_sole_source boolean not null default false,
  status source_status not null default 'active',
  owner_id uuid,
  agreement_until date,
  display_name text,
  logo_path text,
  rec_pinned boolean not null default false,
  rec_local_highlight boolean not null default false,
  rec_excluded boolean not null default false,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  window_start timestamptz not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','partial','failed')),
  stats jsonb not null default '{}'
);

create table raw_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingest_runs(id),
  source_id uuid not null references sources(id),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  state text not null default 'new' check (state in ('new','valid','quarantine','extracted'))
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  state topic_state not null default 'em_apuracao',
  confidence confidence_level not null default 'baixa',
  confidence_score numeric(3,2) not null default 0,
  section_slug text references sections(slug),
  centroid vector,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table collected_items (
  id uuid primary key default gen_random_uuid(),
  raw_id uuid references raw_items(id),
  source_id uuid not null references sources(id),
  canonical_url text unique not null,
  original_title text not null,
  excerpt text,
  author text,
  published_at timestamptz,
  image_url text,
  locality text,
  section_slug text references sections(slug),
  simhash bigint,
  embedding vector,
  duplicate_of uuid references collected_items(id),
  topic_id uuid references topics(id),
  created_at timestamptz not null default now()
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind content_kind not null check (kind in ('original','normalized')),
  topic_id uuid references topics(id),
  section_slug text not null references sections(slug),
  title text not null,
  dek text not null,
  body jsonb not null,
  ai_summary text[],
  ai_summary_reviewed_by uuid,
  status article_status not null default 'draft',
  publish_mode publish_mode,
  confidence confidence_level not null default 'baixa',
  confidence_score numeric(3,2) not null default 0,
  author_id uuid,
  agent_id text,
  urgent boolean not null default false,
  sponsored boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  scheduled_for timestamptz,
  rules_version int,
  tsv tsvector,
  embedding vector
);
create index articles_tsv_idx on articles using gin (tsv);
create index articles_status_pub_idx on articles (status, published_at desc);

create table article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  number int not null,
  snapshot jsonb not null,
  origin text not null check (origin in ('human','ai')),
  author_id uuid,
  change_kind text not null default 'edit' check (change_kind in ('edit','update','correction')),
  public_note text,
  created_at timestamptz not null default now(),
  unique (article_id, number)
);

create table article_sources (
  article_id uuid not null references articles(id) on delete cascade,
  item_id uuid not null references collected_items(id),
  role text not null check (role in ('primary','secondary','context')),
  confirmed boolean not null default false,
  primary key (article_id, item_id)
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  kind media_kind not null,
  storage_path text not null,
  origin_url text,
  license text not null,
  credit text,
  captured_at timestamptz not null default now(),
  allowed_use text not null,
  width int, height int,
  phash bigint,
  risk text not null default 'baixo' check (risk in ('baixo','medio','alto')),
  status text not null default 'pending' check (status in ('pending','approved','blocked')),
  license_until date
);

create table article_media (
  article_id uuid not null references articles(id) on delete cascade,
  media_id uuid not null references media_assets(id),
  rationale text not null,
  chosen_by text not null,
  chosen_at timestamptz not null default now(),
  primary key (article_id, media_id)
);

create table rules (
  version int primary key,
  body jsonb not null,
  force_review boolean not null default true,
  proposed_by uuid not null,
  approved_by uuid,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> proposed_by)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  object_ref text not null,
  step text not null,
  agent_id text,
  prompt_version int,
  rules_version int,
  input_hash text,
  output jsonb,
  rationale text,
  recommended text,
  human_decision text,
  human_id uuid,
  created_at timestamptz not null default now()
);

create table ai_models (id text primary key, provider text not null, name text not null, version text not null, max_tokens int, temperature numeric(2,1), cost_per_1k_in numeric(10,5), cost_per_1k_out numeric(10,5), status text not null default 'active', updated_at timestamptz not null default now(), updated_by uuid);
create table ai_prompts (id uuid primary key default gen_random_uuid(), agent_id text not null, version int not null, body text not null, rationale text not null, author_id uuid not null, approved_by uuid[] not null default '{}', status text not null default 'draft' check (status in ('draft','pending','production','archived','reverted')), created_at timestamptz not null default now(), unique(agent_id, version));
create table ai_agents (id text primary key, function text not null, model_id text not null references ai_models(id), fallback_model_id text references ai_models(id), prompt_version int, daily_budget_brl numeric(10,2) not null, enabled boolean not null default true);
create table ai_calls (id bigserial primary key, agent_id text not null, model_id text not null, prompt_version int, latency_ms int, tokens_in int, tokens_out int, cost_brl numeric(10,4), ok boolean not null, fallback_used boolean not null default false, error text, created_at timestamptz not null default now());

create table events (
  id bigserial,
  name text not null,
  anon_id uuid,
  user_id uuid,
  at timestamptz not null,
  received_at timestamptz not null default now(),
  source_slug text,
  content_ref text,
  session jsonb not null,
  consent jsonb not null,
  algo_version text not null,
  props jsonb not null default '{}',
  primary key (id, received_at)
) partition by range (received_at);
create table events_default partition of events default;

create table source_stats_daily (
  day date not null,
  source_id uuid not null references sources(id),
  locality text,
  sessions int not null default 0,
  clicks int not null default 0,
  reads int not null default 0,
  avg_read_seconds numeric(6,1),
  saves int not null default 0,
  shares int not null default 0,
  returns int not null default 0,
  follows int not null default 0,
  primary key (day, source_id)
);

create table rec_weights (version text primary key, weights jsonb not null, cap numeric(3,2) not null default 0.25, discovery_every int not null default 5, proposed_by uuid not null, approved_by uuid, active boolean not null default false, created_at timestamptz not null default now(), check (approved_by is null or approved_by <> proposed_by));

create table profiles (id uuid primary key, display_name text not null, neighborhood text, migrated_from_anon uuid, created_at timestamptz not null default now());
create table user_roles (user_id uuid not null references profiles(id), role app_role not null, sections text[] not null default '{}', primary key (user_id, role));
create table follows (owner_ref text not null, target_kind text not null check (target_kind in ('source','topic','section','collection')), target_id text not null, created_at timestamptz not null default now(), primary key (owner_ref, target_kind, target_id));
create table saved_items (owner_ref text not null, content_ref text not null, progress numeric(3,2) not null default 0, created_at timestamptz not null default now(), primary key (owner_ref, content_ref));
create table alerts (id uuid primary key default gen_random_uuid(), owner_ref text not null, target_kind text not null, target_id text not null, frequency text not null check (frequency in ('immediate','daily','weekly')), channel text not null check (channel in ('browser','email')), active boolean not null default true);
create table newsletter_subscriptions (email text not null, list text not null, confirmed_at timestamptz, unsubscribed_at timestamptz, token_hash text not null, primary key (email, list));
create table reports (id uuid primary key default gen_random_uuid(), content_ref text not null, kind text not null check (kind in ('wrong_info','broken_link','image','right_of_reply','other')), message text, contact_email text, status text not null default 'open', due_at timestamptz not null default now() + interval '24 hours', created_at timestamptz not null default now());
create table corrections (id uuid primary key default gen_random_uuid(), article_id uuid not null references articles(id), kind text not null, public_note text not null, requested_by text not null, status text not null default 'open', published_at timestamptz);
create table event_listings (id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, starts_at timestamptz not null, ends_at timestamptz, venue text not null, neighborhood text, price_cents int, is_free boolean generated always as (coalesce(price_cents,0) = 0) stored, age_rating text not null default 'livre', category text not null, accessibility text, origin text not null check (origin in ('official','organizer','reader')), confirmed_at timestamptz, description text);
create table event_submissions (id uuid primary key default gen_random_uuid(), payload jsonb not null, contact_email text not null, status text not null default 'pending', created_at timestamptz not null default now());
create table collections (id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, description text not null, curator_id uuid, owner_ref text, is_editorial boolean not null default true);
create table collection_items (collection_id uuid not null references collections(id) on delete cascade, content_ref text not null, position int not null, primary key (collection_id, content_ref));
create table sponsored_campaigns (id uuid primary key default gen_random_uuid(), advertiser text not null, starts_on date not null, ends_on date not null, allowed_sections text[] not null, creative jsonb not null, check ('politica' <> all(allowed_sections)));
create table approvals (id uuid primary key default gen_random_uuid(), kind text not null, target_ref text not null, requested_by uuid not null, approved_by uuid, justification text not null, status text not null default 'pending', created_at timestamptz not null default now(), check (approved_by is null or approved_by <> requested_by));
create table audit_log (id bigserial primary key, at timestamptz not null default now(), actor text not null, action text not null, object_ref text not null, details jsonb not null default '{}', ip_hash text);
create table feature_flags (key text primary key, enabled boolean not null, updated_by uuid, updated_at timestamptz not null default now());
insert into feature_flags(key, enabled) values ('auto_publish', false), ('read_only', false), ('ai_enabled', true), ('personalization_enabled', true);

-- auditoria é append-only
create or replace function forbid_update_delete() returns trigger language plpgsql as $$ begin raise exception 'audit_log é somente inserção'; end $$;
create trigger audit_log_immutable before update or delete on audit_log for each row execute function forbid_update_delete();

-- FTS em português sem acento
create or replace function articles_tsv_update() returns trigger language plpgsql as $$
begin
  new.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(new.title,''))), 'A')
          || setweight(to_tsvector('portuguese', unaccent(coalesce(new.dek,''))), 'B');
  return new;
end $$;
create trigger articles_tsv before insert or update of title, dek on articles for each row execute function articles_tsv_update();
