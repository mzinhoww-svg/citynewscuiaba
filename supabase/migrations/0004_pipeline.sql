-- Pipeline de ingestão (P3-T1, A-028): extensões, filas, quarentena, eventos e agendamento.
--
-- Filas: tabela `jobs` própria com `select ... for update skip locked` (contorno de docs/AUTONOMY.md §4,
-- A-017). Funciona igual no Supabase real e na pilha local sem pgmq/pg_net. `pgmq` e `pg_net` são
-- habilitados quando existem, mas a fila do app não depende do `pgmq`.
--
-- Semântica (igual à do pgmq): `queue_read` torna a mensagem invisível por `vt` segundos e soma
-- `read_ct`; `queue_ack` apaga; `queue_fail` reagenda com espera; `queue_quarantine` move para
-- `pipeline_quarantine`. Idempotência de enfileiramento por `(queue, dedupe_key)`, com
-- `dedupe_key = '<etapa>:<item>'`: a mesma etapa do mesmo item nunca fica duas vezes na fila.

-- ---------------------------------------------------------------------------
-- Extensões (só se o servidor oferece)
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select from pg_available_extensions where name = 'pgmq') then
    create extension if not exists pgmq;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fila
-- ---------------------------------------------------------------------------
-- `queue` = 'pipeline' | 'media' | 'notify', com prefixo opcional '<namespace>:' (isolamento de testes).
create table jobs (
  id bigserial primary key,
  queue text not null check (queue ~ '^([a-z0-9-]{1,64}:)?(pipeline|media|notify)$'),
  dedupe_key text not null check (length(dedupe_key) between 1 and 512),
  message jsonb not null,
  read_ct int not null default 0,
  enqueued_at timestamptz not null default now(),
  visible_at timestamptz not null default now(),
  last_error text,
  unique (queue, dedupe_key)
);
create index jobs_ready_idx on jobs (queue, visible_at, id);
create index jobs_run_idx on jobs ((message ->> 'runId'));

create table pipeline_quarantine (
  id bigserial primary key,
  queue text not null,
  msg_id bigint not null,
  dedupe_key text not null,
  message jsonb not null,
  read_ct int not null,
  error text not null,
  quarantined_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index pipeline_quarantine_open_idx on pipeline_quarantine (quarantined_at desc) where resolved_at is null;

-- Registro append-only das etapas (etapa 18 "registrar").
create table pipeline_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  run_id uuid references ingest_runs(id),
  step text not null,
  item_ref text,
  level text not null check (level in ('info','warn','error','security')),
  message text not null,
  details jsonb not null default '{}'
);
create index pipeline_events_run_idx on pipeline_events (run_id, at);
create index pipeline_events_security_idx on pipeline_events (at desc) where level = 'security';

create or replace function pipeline_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'pipeline_events é somente inserção'; end $$;
create trigger pipeline_events_immutable before update or delete on pipeline_events
  for each row execute function pipeline_events_immutable();

-- ---------------------------------------------------------------------------
-- Operações da fila (chamadas só pelo servidor com service_role)
-- ---------------------------------------------------------------------------
create or replace function queue_enqueue(p_queue text, p_dedupe_key text, p_message jsonb, p_delay_sec int default 0)
returns bigint
language sql
set search_path = public
as $$
  insert into jobs (queue, dedupe_key, message, visible_at)
  values (p_queue, p_dedupe_key, p_message, now() + make_interval(secs => greatest(p_delay_sec, 0)))
  on conflict (queue, dedupe_key) do nothing
  returning id;
$$;

create or replace function queue_read(p_queue text, p_n int, p_vt_sec int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql
set search_path = public
as $$
  with picked as (
    select id from jobs
    where queue = p_queue and visible_at <= clock_timestamp()
    order by visible_at, id
    limit greatest(p_n, 0)
    for update skip locked
  )
  update jobs j
     set read_ct = j.read_ct + 1,
         visible_at = clock_timestamp() + make_interval(secs => greatest(p_vt_sec, 0))
    from picked
   where j.id = picked.id
  returning j.id, j.read_ct, j.message;
$$;

create or replace function queue_ack(p_queue text, p_msg_id bigint)
returns boolean
language sql
set search_path = public
as $$
  with d as (delete from jobs where queue = p_queue and id = p_msg_id returning 1)
  select exists (select 1 from d);
$$;

-- Falha com nova tentativa: reagenda a mensagem com espera e guarda o erro.
create or replace function queue_fail(p_queue text, p_msg_id bigint, p_error text, p_delay_sec int)
returns void
language sql
set search_path = public
as $$
  update jobs
     set visible_at = clock_timestamp() + make_interval(secs => greatest(p_delay_sec, 0)),
         last_error = left(p_error, 2000)
   where queue = p_queue and id = p_msg_id;
$$;

-- Devolve à fila uma mensagem lida e não processada (fim do tempo do drain): não conta como tentativa.
create or replace function queue_release(p_queue text, p_msg_id bigint)
returns void
language sql
set search_path = public
as $$
  update jobs
     set visible_at = clock_timestamp(), read_ct = greatest(read_ct - 1, 0)
   where queue = p_queue and id = p_msg_id;
$$;

create or replace function queue_quarantine(p_queue text, p_msg_id bigint, p_error text)
returns boolean
language sql
set search_path = public
as $$
  with d as (
    delete from jobs where queue = p_queue and id = p_msg_id
    returning queue, id, dedupe_key, message, read_ct
  ), q as (
    insert into pipeline_quarantine (queue, msg_id, dedupe_key, message, read_ct, error)
    select queue, id, dedupe_key, message, read_ct, left(p_error, 2000) from d
    returning 1
  )
  select exists (select 1 from q);
$$;

-- Varredura: mensagens com tentativas esgotadas que voltaram a ficar visíveis (o worker caiu ou
-- estourou o tempo sem registrar falha) vão para a quarentena.
create or replace function queue_move_exhausted(p_queue text, p_max_reads int)
returns int
language sql
set search_path = public
as $$
  with d as (
    delete from jobs
    where id in (
      select id from jobs
      where queue = p_queue and read_ct >= p_max_reads and visible_at <= clock_timestamp()
      for update skip locked
    )
    returning queue, id, dedupe_key, message, read_ct, last_error
  ), q as (
    insert into pipeline_quarantine (queue, msg_id, dedupe_key, message, read_ct, error)
    select queue, id, dedupe_key, message, read_ct,
           coalesce(last_error, 'tentativas esgotadas sem confirmação') from d
    returning 1
  )
  select count(*)::int from q;
$$;

-- Mensagens pendentes (visíveis ou em processamento), com filtro opcional por run e etapas.
create or replace function queue_pending(p_queue text, p_run_id text default null, p_steps text[] default null)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from jobs
  where queue = p_queue
    and (p_run_id is null or message ->> 'runId' = p_run_id)
    and (p_steps is null or message ->> 'step' = any (p_steps));
$$;

-- Um run por janela de 30 min (Review Focus 2): dois ticks na mesma janela recebem o mesmo run.
create or replace function start_ingest_run(p_window timestamptz)
returns table (run_id uuid, created boolean, stats jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ingest_runs (window_start) values (p_window)
  on conflict (window_start) do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, true, '{}'::jsonb;
  else
    return query select r.id, false, r.stats from ingest_runs r where r.window_start = p_window;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões: tabelas e funções só para o servidor; staff lê quarentena e eventos.
-- ---------------------------------------------------------------------------
alter table jobs enable row level security;
alter table pipeline_quarantine enable row level security;
alter table pipeline_events enable row level security;
revoke all on jobs, pipeline_quarantine, pipeline_events from anon, authenticated;
revoke all on sequence jobs_id_seq, pipeline_quarantine_id_seq, pipeline_events_id_seq from anon, authenticated;
grant select on pipeline_quarantine, pipeline_events to authenticated;
create policy pipeline_quarantine_read_ops on pipeline_quarantine for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy pipeline_events_read_staff on pipeline_events for select to authenticated
  using (is_staff((select auth.uid())));

revoke execute on function
  queue_enqueue(text, text, jsonb, int), queue_read(text, int, int), queue_ack(text, bigint),
  queue_fail(text, bigint, text, int), queue_release(text, bigint), queue_quarantine(text, bigint, text),
  queue_move_exhausted(text, int), queue_pending(text, text, text[]), start_ingest_run(timestamptz),
  pipeline_events_immutable()
  from public, anon, authenticated;
grant execute on function
  queue_enqueue(text, text, jsonb, int), queue_read(text, int, int), queue_ack(text, bigint),
  queue_fail(text, bigint, text, int), queue_release(text, bigint), queue_quarantine(text, bigint, text),
  queue_move_exhausted(text, int), queue_pending(text, text, text[]), start_ingest_run(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento (ADR-003): pg_cron + pg_net chamam o app com o segredo do Vault.
-- Só agenda quando pg_cron, pg_net e os segredos `app_url` e `cron_secret` existem no Vault.
-- Sem isso (pilha local, projeto novo sem segredos) nada é agendado e o watchdog do GitHub
-- (P3-T9) chama o tick. Depois de gravar os segredos no Vault, rode `select schedule_pipeline_cron();`.
-- A URL e o segredo são lidos do Vault a cada execução: nunca ficam gravados em cron.job.
-- ---------------------------------------------------------------------------
create or replace function schedule_pipeline_cron()
returns text
language plpgsql
set search_path = public
as $fn$
declare
  n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado (watchdog cobre o tick)';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;

  -- Tick a cada 30 min.
  execute format('select cron.schedule(%L, %L, %L)', 'ingest-tick', '*/30 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);

  -- Drain a cada minuto, só enquanto houver mensagem pronta nas filas de produção.
  execute format('select cron.schedule(%L, %L, %L)', 'jobs-drain', '* * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/drain',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
    where exists (
      select 1 from public.jobs
      where queue in ('pipeline', 'media', 'notify') and visible_at <= now())
  $cmd$);

  return 'agendado: ingest-tick e jobs-drain';
end $fn$;
revoke execute on function schedule_pipeline_cron() from public, anon, authenticated, service_role;

select schedule_pipeline_cron();

-- ---------------------------------------------------------------------------
-- Coleta (P3-T3): coleta condicional, entradas extraídas e idempotência do fetch
-- ---------------------------------------------------------------------------
alter table sources add column etag text, add column last_modified text;
alter table raw_items add column entries jsonb, add column error text;
-- Um documento por fonte e run (idempotência de `fetch`, architecture §4).
create unique index raw_items_run_source_uidx on raw_items (run_id, source_id);

-- ---------------------------------------------------------------------------
-- Entendimento (P3-T4): deduplicação e agrupamento em assuntos
-- Simhash guardado como bigint com sinal (64 bits); o app troca como texto (JSON perde precisão).
-- Embeddings sem dimensão fixa na coluna (EMBEDDING_DIM parametrizável, ADR-006); todos os
-- vetores de um ambiente têm a mesma dimensão. Sem índice vetorial: a busca é restrita a 72 h.
-- ---------------------------------------------------------------------------
create index collected_items_created_idx on collected_items (created_at desc) where duplicate_of is null;
create index collected_items_topic_idx on collected_items (topic_id);
create index topics_updated_idx on topics (updated_at desc);

create or replace function hamming64(a bigint, b bigint)
returns int
language sql
immutable
parallel safe
as $$ select bit_count((a # b)::bit(64))::int $$;

-- Item como as etapas dedupe/cluster o enxergam (simhash como texto, embedding como real[]).
create or replace function pipeline_item(p_id uuid)
returns table (
  id uuid, source_id uuid, title text, excerpt text, published_at timestamptz,
  simhash text, embedding real[], duplicate_of uuid, topic_id uuid
)
language sql
stable
set search_path = public
as $$
  select c.id, c.source_id, c.original_title, c.excerpt, c.published_at,
         c.simhash::text, c.embedding::real[], c.duplicate_of, c.topic_id
  from collected_items c where c.id = p_id;
$$;

create or replace function save_item_fingerprint(p_id uuid, p_simhash text, p_embedding vector)
returns void
language sql
set search_path = public
as $$
  update collected_items set simhash = p_simhash::bigint, embedding = p_embedding where id = p_id;
$$;

-- Candidatos a original: itens anteriores (created_at, id), não duplicados, desde p_since, com
-- simhash a distância ≤ p_max_hamming ou cosseno ≥ p_min_cosine. Os de simhash próximo primeiro.
create or replace function dedupe_candidates(
  p_id uuid, p_simhash text, p_since timestamptz, p_max_hamming int, p_min_cosine float8, p_limit int
)
returns table (id uuid, simhash text, cosine float8, topic_id uuid)
language sql
stable
set search_path = public
as $$
  with self as (select created_at, embedding from collected_items where id = p_id),
  cand as (
    select c.id, c.simhash, c.topic_id,
           hamming64(c.simhash, p_simhash::bigint) as ham,
           case when c.embedding is not null and s.embedding is not null
                then 1 - (c.embedding <=> s.embedding) end as cos
    from collected_items c, self s
    where c.duplicate_of is null
      and c.simhash is not null
      and c.id <> p_id
      and c.created_at >= p_since
      and (c.created_at, c.id) < (s.created_at, p_id)
  )
  select cand.id, cand.simhash::text, cand.cos, cand.topic_id
  from cand
  where cand.ham <= p_max_hamming or cand.cos >= p_min_cosine
  order by (cand.ham <= p_max_hamming) desc, cand.cos desc nulls last, cand.ham
  limit greatest(p_limit, 0);
$$;

-- Duplicado herda o assunto do original.
create or replace function mark_item_duplicate(p_id uuid, p_original uuid)
returns void
language sql
set search_path = public
as $$
  update collected_items c
     set duplicate_of = o.id, topic_id = coalesce(c.topic_id, o.topic_id)
    from collected_items o
   where c.id = p_id and o.id = p_original and c.duplicate_of is null;
$$;

-- Assuntos atualizados desde p_since, os de centróide mais próximo do item primeiro.
create or replace function topic_candidates(p_id uuid, p_since timestamptz, p_limit int)
returns table (topic_id uuid, centroid real[], updated_at timestamptz)
language sql
stable
set search_path = public
as $$
  select t.id, t.centroid::real[], t.updated_at
  from topics t, (select embedding from collected_items where id = p_id) s
  where t.updated_at >= p_since and t.centroid is not null and s.embedding is not null
    and vector_dims(t.centroid) = vector_dims(s.embedding)
  order by t.centroid <=> s.embedding
  limit greatest(p_limit, 0);
$$;

-- Centróide = média dos embeddings dos itens não duplicados do assunto.
create or replace function recompute_topic_centroid(p_topic uuid, p_now timestamptz)
returns void
language sql
set search_path = public
as $$
  update topics t
     set centroid = (select avg(c.embedding) from collected_items c
                      where c.topic_id = p_topic and c.duplicate_of is null and c.embedding is not null),
         updated_at = greatest(t.updated_at, p_now)
   where t.id = p_topic;
$$;

create or replace function attach_item_to_topic(p_id uuid, p_topic uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = public
as $$
begin
  update collected_items set topic_id = p_topic where id = p_id and topic_id is null;
  if found then perform recompute_topic_centroid(p_topic, p_now); end if;
end $$;

-- Cria o assunto com o item como semente. Idempotente: item que já tem assunto devolve o dele.
create or replace function create_topic_for_item(p_id uuid, p_slug text, p_title text, p_now timestamptz)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current uuid;
  v_topic uuid;
begin
  select topic_id into v_current from collected_items where id = p_id for update;
  if not found then raise exception 'item % não existe', p_id; end if;
  if v_current is not null then return v_current; end if;
  insert into topics (slug, title, centroid, first_seen_at, updated_at)
  values (p_slug, left(p_title, 300), (select embedding from collected_items where id = p_id), p_now, p_now)
  returning id into v_topic;
  update collected_items set topic_id = v_topic where id = p_id;
  return v_topic;
end $$;

revoke execute on function
  pipeline_item(uuid), save_item_fingerprint(uuid, text, vector),
  dedupe_candidates(uuid, text, timestamptz, int, float8, int), mark_item_duplicate(uuid, uuid),
  topic_candidates(uuid, timestamptz, int), recompute_topic_centroid(uuid, timestamptz),
  attach_item_to_topic(uuid, uuid, timestamptz), create_topic_for_item(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function
  pipeline_item(uuid), save_item_fingerprint(uuid, text, vector),
  dedupe_candidates(uuid, text, timestamptz, int, float8, int), mark_item_duplicate(uuid, uuid),
  topic_candidates(uuid, timestamptz, int), recompute_topic_centroid(uuid, timestamptz),
  attach_item_to_topic(uuid, uuid, timestamptz), create_topic_for_item(uuid, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Entendimento (P3-T6): classificação, localidade e verificação
-- Item com instrução embutida sai do fluxo (quarantined_at): assuntos e etapas seguintes o ignoram.
-- Decisões automáticas ficam em `decisions` (idempotência por objeto, etapa e hash da entrada).
-- ---------------------------------------------------------------------------
alter table collected_items
  add column relevance numeric(3,2) check (relevance between 0 and 1),
  add column sensitive boolean,
  add column neighborhood text,
  add column quarantined_at timestamptz,
  add column quarantine_reason text;
create index decisions_lookup_idx on decisions (object_ref, step, input_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Mídia e direitos de imagem (P3-T7, spec §6.5, A-010, A-037)
-- Política `reproduction`: imagem da matéria original copiada inteira para o bucket privado
-- `media`, com proveniência, crédito e link; desligável em 1 clique pela flag
-- `image_reproduction_enabled` (também esconde do portal as reproduções já publicadas);
-- remoção em 24 h a pedido = asset `blocked` (a URL de origem nunca volta a ser copiada).
-- ---------------------------------------------------------------------------
insert into feature_flags (key, enabled) values ('image_reproduction_enabled', true)
on conflict (key) do nothing;

-- Etiquetas do classify (temas sensíveis, imagem gerada, regras).
alter table collected_items add column tags text[] not null default '{}';

alter table media_assets
  add column source_id uuid references sources(id),
  add column source_name text,
  add column page_url text,
  add column author text,
  add column sha256 text,
  add column content_type text,
  add column provenance jsonb not null default '{}',
  add column tags text[] not null default '{}',
  add column removed_at timestamptz,
  add column removal_reason text;
create index media_assets_origin_idx on media_assets (origin_url);
create index media_assets_source_idx on media_assets (source_id) where kind = 'reproduction';
create index media_assets_archive_idx on media_assets using gin (tags) where kind = 'illustrative' and status = 'approved';

-- Reprodução só aparece no portal com a flag ligada (RLS; o Estúdio continua vendo tudo).
drop policy media_assets_read_public on media_assets;
create policy media_assets_read_public on media_assets for select to anon, authenticated
  using (
    status = 'approved'
    and (kind <> 'reproduction'
         or exists (select 1 from feature_flags f where f.key = 'image_reproduction_enabled' and f.enabled))
  );

-- Bucket privado `media` (ADR-009). A pilha local sem Docker não tem Storage (A-017): lá as cópias
-- ficam no MediaStore em memória e este bloco não faz nada.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public) values ('media', 'media', false)
             on conflict (id) do update set public = false$q$;
  end if;
end $$;

-- Matéria como a etapa de imagem a enxerga: editoria, categoria de autonomia, sensibilidade,
-- etiquetas e itens do assunto com a fonte (política de imagem, acordo), primárias primeiro.
create or replace function pipeline_media_context(p_article uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'articleId', a.id,
    'topicId', a.topic_id,
    'title', a.title,
    'sectionSlug', a.section_slug,
    'category', coalesce(s.autonomy_category, a.section_slug),
    'sensitive', coalesce(bool_or(ci.sensitive), false),
    'tags', coalesce((select jsonb_agg(distinct t) from collected_items c2, unnest(c2.tags) t
                      where c2.topic_id = a.topic_id and c2.duplicate_of is null and c2.quarantined_at is null), '[]'::jsonb),
    'hasMedia', exists (select 1 from article_media am where am.article_id = a.id),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'itemId', ci.id,
        'title', ci.original_title,
        'imageUrl', ci.image_url,
        'pageUrl', ci.canonical_url,
        'author', ci.author,
        'source', jsonb_build_object(
          'id', so.id, 'slug', so.slug, 'name', coalesce(so.display_name, so.name),
          'imagePolicy', so.image_policy, 'agreementUntil', so.agreement_until,
          'rateLimitPerHour', so.rate_limit_per_hour))
        order by (so.reliability = 'primary') desc, ci.published_at desc nulls last, ci.id)
      filter (where ci.id is not null and so.id is not null), '[]'::jsonb))
  from articles a
  left join sections s on s.slug = a.section_slug
  left join collected_items ci
    on ci.topic_id = a.topic_id and a.topic_id is not null
   and ci.duplicate_of is null and ci.quarantined_at is null
  left join sources so on so.id = ci.source_id and so.status <> 'blocked'
  where a.id = p_article
  group by a.id, s.autonomy_category;
$$;

-- Distâncias do dHash até assets não bloqueados de outras origens (duplicata no acervo).
create or replace function media_phash_neighbors(p_phash text, p_max int, p_exclude text)
returns table (distance int)
language sql
stable
set search_path = public
as $$
  select hamming64(m.phash, p_phash::bigint)
  from media_assets m
  where m.phash is not null and m.status <> 'blocked'
    and m.origin_url is distinct from p_exclude
    and hamming64(m.phash, p_phash::bigint) <= p_max;
$$;

-- Cópia de imagem de terceiro com proveniência (dHash trafega como texto: JSON perde precisão).
create or replace function media_insert_asset(p jsonb)
returns uuid
language sql
set search_path = public
as $$
  insert into media_assets (kind, storage_path, origin_url, page_url, source_id, source_name, author, license,
                            credit, allowed_use, width, height, phash, sha256, content_type, risk, status, provenance)
  values ((p->>'kind')::media_kind, p->>'storagePath', p->>'originUrl', p->>'pageUrl', (p->>'sourceId')::uuid,
          p->>'sourceName', p->>'author', p->>'license', p->>'credit', p->>'allowedUse', (p->>'width')::int,
          (p->>'height')::int, (p->>'phash')::bigint, p->>'sha256', p->>'contentType', p->>'risk', 'approved',
          coalesce(p->'provenance', '{}'::jsonb))
  returning id;
$$;

revoke execute on function pipeline_media_context(uuid), media_phash_neighbors(text, int, text), media_insert_asset(jsonb)
  from public, anon, authenticated;
grant execute on function pipeline_media_context(uuid), media_phash_neighbors(text, int, text), media_insert_asset(jsonb)
  to service_role;
