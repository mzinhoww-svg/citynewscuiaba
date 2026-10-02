-- P3-T10 · Busca híbrida (ADR-006; A-028: esta migration é a 0007).
-- FTS em português sem acento (to_tsvector('portuguese', unaccent(...))) + vetores (pgvector),
-- fundidos por RRF com k = 60. Matérias, assuntos, eventos e itens de outros veículos.
-- As funções de leitura são security definer e repetem os filtros públicos da RLS e das views
-- (matéria publicada, evento confirmado, agregado não duplicado, fora de quarentena e de fonte não
-- bloqueada, assunto `public` com matéria publicada): devolvem só ids e pontuação; o conteúdo é
-- lido depois pelo cliente anônimo, com RLS.
-- Revisão P3-GATE (A-051): o índice de agregados usa só o título e o `summary` próprio do CityNews,
-- nunca o `excerpt` (texto da fonte); assunto `internal` nunca aparece em busca, sugestões ou
-- "você quis dizer".

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Vetores de texto
-- ---------------------------------------------------------------------------

-- Texto do corpo (documento do editor: todos os nós "text").
create or replace function article_body_text(p_body jsonb)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(x #>> '{}', ' '), '')
  from jsonb_path_query(coalesce(p_body, '{}'::jsonb), 'strict $.**.text') x
$$;

create or replace function article_tsv(p_title text, p_dek text, p_body jsonb)
returns tsvector
language sql
stable
set search_path = public, extensions
as $$
  select setweight(to_tsvector('portuguese', unaccent(coalesce(p_title, ''))), 'A')
      || setweight(to_tsvector('portuguese', unaccent(coalesce(p_dek, ''))), 'B')
      || setweight(to_tsvector('portuguese', unaccent(article_body_text(p_body))), 'C')
$$;

-- Matéria: título (A), linha fina (B) e corpo (C). Antes só título e linha fina (0001).
create or replace function articles_tsv_update() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.tsv := article_tsv(new.title, new.dek, new.body);
  return new;
end $$;
drop trigger if exists articles_tsv on articles;
create trigger articles_tsv before insert or update of title, dek, body on articles
  for each row execute function articles_tsv_update();
update articles set tsv = article_tsv(title, dek, body);

-- Etapa 19 (indexar) usa a mesma fórmula do gatilho.
create or replace function index_article(p_id uuid, p_embedding vector default null)
returns void
language sql
set search_path = public, extensions
as $$
  update articles a
     set tsv = article_tsv(a.title, a.dek, a.body),
         embedding = coalesce(p_embedding, a.embedding)
   where a.id = p_id;
$$;
revoke execute on function index_article(uuid, vector) from public, anon, authenticated;
grant execute on function index_article(uuid, vector) to service_role;

-- Item de outro veículo: título original (A) e o resumo próprio do CityNews (`summary`) só quando
-- a política da fonte permite exibi-lo (summary_2_sentences, como a view public_aggregated). O
-- `excerpt` (texto da fonte) nunca entra no índice: o trecho destacado sairia dele.
alter table collected_items add column if not exists tsv tsvector;
create or replace function collected_items_tsv_update() returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  shown text;
begin
  select case when s.republish_policy = 'summary_2_sentences' then new.summary end
    into shown from sources s where s.id = new.source_id;
  new.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(new.original_title, ''))), 'A')
          || setweight(to_tsvector('portuguese', unaccent(coalesce(shown, ''))), 'B');
  return new;
end $$;
drop trigger if exists collected_items_tsv on collected_items;
create trigger collected_items_tsv before insert or update of original_title, summary, source_id
  on collected_items for each row execute function collected_items_tsv_update();
update collected_items set original_title = original_title;
create index if not exists collected_items_tsv_idx on collected_items using gin (tsv);

-- Assunto: título (A) e resumo (B).
alter table topics add column if not exists tsv tsvector;
create or replace function topics_tsv_update() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(new.title, ''))), 'A')
          || setweight(to_tsvector('portuguese', unaccent(coalesce(new.summary, ''))), 'B');
  return new;
end $$;
drop trigger if exists topics_tsv on topics;
create trigger topics_tsv before insert or update of title, summary on topics
  for each row execute function topics_tsv_update();
update topics set title = title;
create index if not exists topics_tsv_idx on topics using gin (tsv);

-- Evento: título (A), local, bairro e categoria (B), descrição (C).
alter table event_listings add column if not exists tsv tsvector;
create or replace function event_listings_tsv_update() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(new.title, ''))), 'A')
          || setweight(to_tsvector('portuguese', unaccent(
               concat_ws(' ', new.venue, new.neighborhood, new.category))), 'B')
          || setweight(to_tsvector('portuguese', unaccent(coalesce(new.description, ''))), 'C');
  return new;
end $$;
drop trigger if exists event_listings_tsv on event_listings;
create trigger event_listings_tsv
  before insert or update of title, venue, neighborhood, category, description on event_listings
  for each row execute function event_listings_tsv_update();
update event_listings set title = title;
create index if not exists event_listings_tsv_idx on event_listings using gin (tsv);

-- Assunto visível ao público (mesma regra da RLS `topics_read_public`, 0004): `public` e com ao
-- menos uma matéria publicada. Usado pelas funções de busca (security definer, sem RLS).
create or replace function search_topic_is_public(p_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_id is not null and exists (
    select 1 from topics t
    where t.id = p_id and t.visibility = 'public'
      and exists (select 1 from articles a
                  where a.topic_id = t.id and a.status in ('published', 'updated'))
  )
$$;
revoke execute on function search_topic_is_public(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_hybrid: FTS e kNN separados, fundidos por RRF (score = Σ 1 / (k + posição))
--
-- p_filters (tudo opcional):
--   type        all | articles | topics | events | services | aggregated
--   origin      all | citynews | others
--   section     slug da editoria (inclui subeditorias)
--   source      slug do veículo (só agregados)
--   period      24h | 7d | 30d
--   min_match   quantos termos da consulta o documento precisa ter (padrão: todos)
--   min_similarity  cosseno mínimo da parte vetorial (padrão 0,35)
--   exclude_sponsored  true tira matérias patrocinadas (busca com IA)
-- ---------------------------------------------------------------------------
create or replace function search_hybrid(
  p_q text,
  p_embedding vector default null,
  p_filters jsonb default '{}'::jsonb,
  p_k int default 60,
  p_limit int default 50
)
returns table (kind text, id uuid, topic_id uuid, score double precision, fts_rank int, vec_rank int, matched int)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select
      coalesce(p_filters ->> 'type', 'all') as f_type,
      coalesce(p_filters ->> 'origin', 'all') as f_origin,
      nullif(p_filters ->> 'section', '') as f_section,
      nullif(p_filters ->> 'source', '') as f_source,
      case p_filters ->> 'period'
        when '24h' then now() - interval '24 hours'
        when '7d' then now() - interval '7 days'
        when '30d' then now() - interval '30 days'
      end as f_since,
      coalesce((p_filters ->> 'exclude_sponsored')::boolean, false) as f_no_sponsored,
      coalesce((p_filters ->> 'min_similarity')::float8, 0.35) as f_min_sim,
      greatest(1, least(coalesce(p_k, 60), 1000)) as k,
      greatest(1, least(coalesce(p_limit, 50), 100)) as lim
  ),
  terms as (
    select coalesce(array_agg(t.lexeme), '{}') as lexemes
    from (
      select lexeme from unnest(to_tsvector('portuguese', unaccent(coalesce(left(p_q, 200), ''))))
      limit 12
    ) t
  ),
  q as (
    select t.lexemes,
           case when cardinality(t.lexemes) > 0 then to_tsquery('simple',
             array_to_string(array(select quote_literal(l) from unnest(t.lexemes) l), ' | '))
           end as anyq,
           greatest(1, least(coalesce((p_filters ->> 'min_match')::int, cardinality(t.lexemes)),
                             cardinality(t.lexemes))) as need
    from terms t
  ),
  sect as (
    select s.slug from sections s, params p
    where p.f_section is not null and (s.slug = p.f_section or s.parent_slug = p.f_section)
  ),
  services as (
    select slug from sections
    where slug in ('servicos', 'guia-cuiaba') or parent_slug in ('servicos', 'guia-cuiaba')
  ),
  docs as (
    select 'article'::text as kind, a.id, a.topic_id, a.tsv, a.embedding as emb,
           coalesce(a.published_at, a.updated_at) as at
    from articles a, params p
    where a.status in ('published', 'updated')
      and p.f_type in ('all', 'articles', 'services')
      and p.f_origin in ('all', 'citynews')
      and p.f_source is null
      and (p.f_section is null or a.section_slug in (select slug from sect))
      and (p.f_type <> 'services' or a.section_slug in (select slug from services))
      and (p.f_since is null or coalesce(a.published_at, a.updated_at) >= p.f_since)
      and not (p.f_no_sponsored and a.sponsored)
    union all
    select 'aggregated', ci.id, ci.topic_id, ci.tsv, ci.embedding, ci.published_at
    from collected_items ci
    join sources s on s.id = ci.source_id
    cross join params p
    where ci.duplicate_of is null and ci.quarantined_at is null and s.status <> 'blocked'
      and p.f_type in ('all', 'aggregated')
      and p.f_origin in ('all', 'others')
      and (p.f_source is null or s.slug = p.f_source)
      and (p.f_section is null or ci.section_slug in (select slug from sect))
      and (p.f_since is null or ci.published_at >= p.f_since)
    union all
    select 'topic', t.id, t.id, t.tsv, t.centroid, t.updated_at
    from topics t, params p
    where search_topic_is_public(t.id)
      and p.f_type in ('all', 'topics')
      and p.f_origin in ('all', 'citynews')
      and p.f_source is null
      and (p.f_section is null or t.section_slug in (select slug from sect))
      and (p.f_since is null or t.updated_at >= p.f_since)
    union all
    select 'event', e.id, null::uuid, e.tsv, null::vector, e.starts_at
    from event_listings e, params p
    where e.confirmed_at is not null
      and p.f_type in ('all', 'events')
      and p.f_origin in ('all', 'citynews')
      and p.f_source is null
      and p.f_section is null
      and (p.f_since is null or e.starts_at >= p.f_since)
  ),
  fts as (
    select x.kind, x.id, x.topic_id, x.matched,
           row_number() over (order by x.matched desc, x.rank desc, x.at desc nulls last, x.id)::int as r
    from (
      select d.kind, d.id, d.topic_id, d.at, m.matched, ts_rank_cd(d.tsv, q.anyq, 32) as rank
      from docs d
      cross join q
      cross join lateral (
        select count(*)::int as matched from unnest(q.lexemes) l
        where d.tsv @@ to_tsquery('simple', quote_literal(l))
      ) m
      where q.anyq is not null and d.tsv @@ q.anyq and m.matched >= q.need
    ) x
  ),
  vec as (
    select y.kind, y.id, y.topic_id, row_number() over (order by y.dist, y.id)::int as r
    from (
      select d.kind, d.id, d.topic_id, d.emb <=> p_embedding as dist
      from docs d, params p
      where p_embedding is not null and d.emb is not null
        and vector_dims(d.emb) = vector_dims(p_embedding)
        and 1 - (d.emb <=> p_embedding) >= p.f_min_sim
      order by d.emb <=> p_embedding
      limit 50
    ) y
  ),
  fused as (
    select u.kind, u.id, u.topic_id,
           sum(1.0 / ((select k from params) + u.r))::float8 as score,
           min(u.fts_r) as fts_rank, min(u.vec_r) as vec_rank, max(u.matched) as matched
    from (
      select kind, id, topic_id, r, r as fts_r, null::int as vec_r, matched from fts where r <= 200
      union all
      select kind, id, topic_id, r, null::int, r, null::int from vec
    ) u
    group by u.kind, u.id, u.topic_id
  )
  -- Assunto interno não agrupa nem aparece como cabeçalho: o id dele não sai daqui.
  select f.kind, f.id, case when search_topic_is_public(f.topic_id) then f.topic_id end,
         f.score, f.fts_rank, f.vec_rank, f.matched
  from fused f
  order by f.score desc, f.fts_rank nulls last, f.id
  limit (select lim from params)
$$;

-- ---------------------------------------------------------------------------
-- Sugestões (autocomplete): títulos de assuntos, matérias e eventos cujas palavras começam
-- com o que foi digitado, sem acento.
-- ---------------------------------------------------------------------------
create or replace function search_suggest(p_prefix text, p_limit int default 6)
returns table (suggestion text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with words as (
    select coalesce(array_agg(w), '{}') as ws
    from (
      select w from regexp_split_to_table(lower(unaccent(coalesce(left(p_prefix, 80), ''))), '[^a-z0-9]+') w
      where w <> '' limit 6
    ) x
  ),
  titles as (
    select t.title, 0 as prio, t.updated_at as at from topics t where search_topic_is_public(t.id)
    union all
    select a.title, 1, coalesce(a.published_at, a.updated_at) from articles a
    where a.status in ('published', 'updated')
    union all
    select e.title, 2, e.starts_at from event_listings e where e.confirmed_at is not null
  ),
  hits as (
    select distinct on (lower(t.title)) t.title, t.prio, t.at
    from titles t, words w
    where cardinality(w.ws) > 0
      and not exists (
        select 1 from unnest(w.ws) x where lower(unaccent(t.title)) !~ ('\m' || x)
      )
    order by lower(t.title), t.prio, t.at desc
  )
  select h.title from hits h
  order by h.prio, h.at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 6), 10))
$$;

-- ---------------------------------------------------------------------------
-- "Você quis dizer…": troca cada palavra que não existe no acervo pela mais parecida
-- (trigramas, pg_trgm). Nulo quando nada muda.
-- ---------------------------------------------------------------------------
create or replace function search_did_you_mean(p_q text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  with lex as (
    select distinct w from (
      select regexp_split_to_table(lower(unaccent(a.title || ' ' || a.dek)), '[^a-z0-9]+') as w
      from articles a where a.status in ('published', 'updated')
      union all
      select regexp_split_to_table(lower(unaccent(t.title)), '[^a-z0-9]+') from topics t
      where search_topic_is_public(t.id)
      union all
      select regexp_split_to_table(lower(unaccent(ci.original_title)), '[^a-z0-9]+')
      from collected_items ci join sources s on s.id = ci.source_id
      where ci.duplicate_of is null and ci.quarantined_at is null and s.status <> 'blocked'
      union all
      select regexp_split_to_table(lower(unaccent(e.title)), '[^a-z0-9]+')
      from event_listings e where e.confirmed_at is not null
    ) x
    where length(w) >= 3
  ),
  words as (
    select t.w, t.ord
    from regexp_split_to_table(lower(unaccent(coalesce(left(p_q, 200), ''))), '[^a-z0-9]+')
      with ordinality as t(w, ord)
    where t.w <> ''
  ),
  fixed as (
    select wd.ord, wd.w,
           case
             when length(wd.w) < 3 or exists (select 1 from lex where lex.w = wd.w) then wd.w
             else coalesce(
               (select lex.w from lex where similarity(lex.w, wd.w) >= 0.3
                 order by similarity(lex.w, wd.w) desc, lex.w limit 1),
               wd.w)
           end as fx
    from words wd
  )
  select case when bool_or(fx <> w) then string_agg(fx, ' ' order by ord) end from fixed
$$;

revoke execute on function search_hybrid(text, vector, jsonb, int, int),
  search_suggest(text, int), search_did_you_mean(text) from public;
grant execute on function search_hybrid(text, vector, jsonb, int, int),
  search_suggest(text, int), search_did_you_mean(text) to anon, authenticated, service_role;
