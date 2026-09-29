-- Painel de fontes no banco (P5-T4 / FS-T1, spec painel-de-fontes §6; A-073 a A-080).
--
-- A numeração 0011 estava reservada; a migration roda depois de 0001–0010 e antes de 0012–0029, então
-- só usa o que já existe até 0010 (sources, ingest_runs, approvals, audit_log, rate_limits, ai_agents,
-- schedule_pipeline_cron de 0004). Nada aqui redefine objetos de 0012–0029: a view `source_fetch_health`
-- (0005) e as funções `control_*` (0029) continuam lendo `sources.frequency_minutes` (agora nula) e
-- calculam falhas seguidas pelos eventos; a coluna nova `sources.consecutive_failures` é o contador da
-- pausa automática (FS-T5), sem relação com a view.
--
-- Ordem: colunas e check → dados → tabelas → ingest_runs → funções → triggers → RPCs → views → grants →
-- IA → storage → flag → agendamento. Reexecutar é seguro nas partes de dados (on conflict / if not exists).

-- ---------------------------------------------------------------------------
-- 1. sources: colunas novas, grade de frequência (com via rápida) e dados de partida
-- ---------------------------------------------------------------------------
alter table sources drop constraint if exists sources_frequency_minutes_check;
alter table sources alter column frequency_minutes drop not null;
alter table sources alter column frequency_minutes drop default;
-- Padrão global vira `null`; qualquer outro valor antigo cai na grade do ciclo normal (30, 60, … 1440).
update sources set frequency_minutes = null where frequency_minutes = 30;
update sources
   set frequency_minutes = least(1440, ceil(frequency_minutes / 30.0)::int * 30)
 where frequency_minutes is not null
   and not (frequency_minutes in (10, 15, 20) or (frequency_minutes between 30 and 1440 and frequency_minutes % 30 = 0));
alter table sources add constraint sources_frequency_grid check (
  frequency_minutes is null
  or frequency_minutes in (10, 15, 20)
  or (frequency_minutes between 30 and 1440 and frequency_minutes % 30 = 0)
);

alter table sources
  add column terms_min_interval_minutes int check (terms_min_interval_minutes between 1 and 1440),
  add column last_fetch_started_at timestamptz,
  add column last_fetch_run_id uuid,
  add column editorial_score smallint not null default 3 check (editorial_score between 1 and 5),
  add column layer smallint check (layer between 1 and 4),
  add column consumption jsonb not null default '{}',
  add column status_reason text check (status_reason in
    ('pending_activation', 'manual', 'auto_failures', 'robots', 'opt_out', 'legal', 'quality', 'other')),
  add column status_changed_at timestamptz not null default now(),
  add column status_changed_by uuid,
  add column consecutive_failures int not null default 0,
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column archive_reason text,
  add column terms_url text,
  add column terms_reviewed_at timestamptz,
  add column terms_reviewed_by uuid,
  add column agreement_note text,
  add column created_by uuid,
  add column updated_at timestamptz not null default now(),
  add column version int not null default 1;
alter table sources add constraint sources_archived_status
  check (archived_at is null or status in ('paused', 'blocked'));

comment on column sources.frequency_minutes is
  'null = padrão global (app_settings sources.default_frequency_minutes); 10, 15, 20 = via rápida; 30 a 1440 em múltiplos de 30 = ciclo normal.';
comment on column sources.last_fetch_started_at is 'Trava contra coleta dupla (claim_source_fetch). Operacional: fora da auditoria.';

-- Fontes que já existem e estão pausadas esperam ativação.
update sources set status_reason = 'pending_activation' where status = 'paused' and status_reason is null;

-- Relevância (score) e camada das 32 fontes reais (docs/sources-registry.md). Em dev e CI não há linhas.
update sources s
   set editorial_score = v.score, layer = v.layer
  from (values
    ('secom-mt', 5, 1), ('prefeitura-cuiaba', 5, 1), ('prefeitura-vg', 5, 1),
    ('almt', 4, 1), ('camara-cuiaba', 4, 1), ('defesa-civil-mt', 4, 1), ('inmet', 4, 1),
    ('tjmt', 3, 1), ('mpmt', 3, 1), ('tce-mt', 3, 1), ('tre-mt', 3, 1), ('iomat', 3, 1),
    ('gazeta-digital', 5, 2), ('olhar-direto', 5, 2), ('rdnews', 5, 2), ('midianews', 5, 2), ('g1-mt', 5, 2),
    ('folhamax', 4, 2), ('hipernoticias', 4, 2),
    ('reporter-mt', 3, 2), ('diario-de-cuiaba', 3, 2), ('circuito-mt', 3, 2), ('o-documento', 3, 2), ('leiagora', 3, 2),
    ('olhar-conceito', 4, 3), ('agro-olhar', 4, 3),
    ('so-noticias', 3, 3), ('olhar-esportivo', 3, 3), ('imea', 3, 3),
    ('agencia-brasil', 3, 4), ('canal-rural', 2, 4), ('cnn-brasil-mt', 2, 4)
  ) as v(slug, score, layer)
 where s.slug = v.slug;

-- ---------------------------------------------------------------------------
-- 2. Tabelas novas: saúde diária, descobertas, configurações
-- ---------------------------------------------------------------------------
create table source_health_daily (
  day date not null,
  source_id uuid not null references sources(id) on delete cascade,
  fetch_ok int not null default 0,
  fetch_not_modified int not null default 0,
  fetch_failed int not null default 0,
  items_new int not null default 0,
  latency_ms_sum bigint not null default 0,
  latency_samples int not null default 0,
  last_error text,
  primary key (day, source_id)
);
create index source_health_daily_source_idx on source_health_daily (source_id, day desc);

-- Só títulos, datas e URLs na prévia (nunca corpo de matéria). Retenção de 90 dias.
create table source_discoveries (
  id uuid primary key default gen_random_uuid(),
  input_url text not null,
  final_url text,
  source_id uuid references sources(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  preview jsonb not null default '{}',
  suggestion jsonb not null default '{}',
  prompt_version int,
  accepted_fields text[] not null default '{}'
);
create index source_discoveries_created_idx on source_discoveries (created_at);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('sources.default_frequency_minutes', '30'::jsonb),
  ('sources.fast_lane_max', '10'::jsonb)
on conflict (key) do nothing;

alter table source_health_daily enable row level security;
alter table source_discoveries enable row level security;
alter table app_settings enable row level security;
revoke all on source_health_daily, source_discoveries, app_settings from anon, authenticated;
grant select on source_health_daily, source_discoveries to authenticated;
grant select, insert, update on app_settings to authenticated;
grant all on source_health_daily, source_discoveries, app_settings to service_role;

create policy source_health_daily_read on source_health_daily for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,editor,analista,leitura}'));
create policy source_discoveries_read on source_discoveries for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy app_settings_read on app_settings for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy app_settings_insert on app_settings for insert to authenticated
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}') and key like 'sources.%');
create policy app_settings_update on app_settings for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}') and key like 'sources.%')
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}') and key like 'sources.%');

-- ---------------------------------------------------------------------------
-- 3. ingest_runs: gatilho do run e índices únicos parciais por via
-- ---------------------------------------------------------------------------
alter table ingest_runs add column trigger text not null default 'cron'
  check (trigger in ('cron', 'manual', 'fast'));
alter table ingest_runs drop constraint if exists ingest_runs_window_start_key;
-- Um run por janela em cada via (dois ticks na mesma janela recebem o mesmo run); runs manuais não têm unicidade.
create unique index ingest_runs_cron_window_uidx on ingest_runs (window_start) where trigger = 'cron';
create unique index ingest_runs_fast_window_uidx on ingest_runs (window_start) where trigger = 'fast';

create or replace function start_ingest_run(p_window timestamptz)
returns table (run_id uuid, created boolean, stats jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ingest_runs (window_start, trigger) values (p_window, 'cron')
  on conflict (window_start) where trigger = 'cron' do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, true, '{}'::jsonb;
  else
    return query select r.id, false, r.stats from ingest_runs r where r.window_start = p_window and r.trigger = 'cron';
  end if;
end $$;

-- Via rápida: janela de 10 min, mesmo retorno de start_ingest_run.
create or replace function start_fast_run(p_window timestamptz)
returns table (run_id uuid, created boolean, stats jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ingest_runs (window_start, trigger) values (p_window, 'fast')
  on conflict (window_start) where trigger = 'fast' do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, true, '{}'::jsonb;
  else
    return query select r.id, false, r.stats from ingest_runs r where r.window_start = p_window and r.trigger = 'fast';
  end if;
end $$;

-- "Coletar agora": run próprio no instante do clique (nunca colide com a janela de 30 min).
create or replace function start_manual_run(p_source uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ingest_runs (window_start, trigger, stats)
  values (now(), 'manual', jsonb_build_object('manual', true, 'source', p_source))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Funções de servidor: trava de coleta, cota sem consumo, saúde diária
-- ---------------------------------------------------------------------------
-- D-F29: só uma coleta da fonte por janela; o retry do mesmo run passa.
create or replace function claim_source_fetch(p_source uuid, p_run uuid, p_since timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  ok boolean;
begin
  update sources
     set last_fetch_started_at = now(), last_fetch_run_id = p_run
   where id = p_source
     and (last_fetch_started_at is null or last_fetch_started_at < p_since or last_fetch_run_id = p_run)
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- Diz se ainda cabe mais um uso (hits < limite) sem registrar nada.
create or replace function peek_rate_limit(p_bucket text, p_key_hash text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  select r.hits into n from rate_limits r
   where r.bucket = p_bucket and r.key_hash = p_key_hash and r.window_start = w;
  return coalesce(n, 0) < p_limit;
end $$;

create or replace function record_source_fetch(
  p_source uuid, p_outcome text, p_latency_ms int, p_items_new int, p_error text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_outcome not in ('ok', 'not_modified', 'failed') then
    raise exception 'record_source_fetch: resultado inválido (%)', p_outcome using errcode = '22023';
  end if;
  insert into source_health_daily as d
    (day, source_id, fetch_ok, fetch_not_modified, fetch_failed, items_new, latency_ms_sum, latency_samples, last_error)
  values ((now() at time zone 'America/Cuiaba')::date, p_source,
          (p_outcome = 'ok')::int, (p_outcome = 'not_modified')::int, (p_outcome = 'failed')::int,
          greatest(coalesce(p_items_new, 0), 0), greatest(coalesce(p_latency_ms, 0), 0),
          (p_latency_ms is not null)::int,
          case when p_outcome = 'failed' then left(p_error, 500) end)
  on conflict (day, source_id) do update
    set fetch_ok = d.fetch_ok + excluded.fetch_ok,
        fetch_not_modified = d.fetch_not_modified + excluded.fetch_not_modified,
        fetch_failed = d.fetch_failed + excluded.fetch_failed,
        items_new = d.items_new + excluded.items_new,
        latency_ms_sum = d.latency_ms_sum + excluded.latency_ms_sum,
        latency_samples = d.latency_samples + excluded.latency_samples,
        last_error = coalesce(excluded.last_error, d.last_error);
end $$;

-- Retenção de 90 dias das descobertas (job diário, se houver pg_cron).
create or replace function purge_source_discoveries()
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  delete from source_discoveries where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Regras do painel: auxiliares, trigger de guarda e trigger de auditoria
-- ---------------------------------------------------------------------------
create or replace function public.source_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::numeric::int end
                     from app_settings a where a.key = p_key), p_default)
$$;

-- Fontes na via rápida (frequência < 30, não arquivadas, em qualquer status). Volátil de propósito:
-- depois de esperar o lock, precisa enxergar o que a outra transação acabou de gravar.
create or replace function public.source_fast_lane_used(p_except uuid)
returns int
language sql
volatile
security definer
set search_path = public
as $$
  select count(*)::int from sources s
   where s.frequency_minutes < 30 and s.archived_at is null and s.id is distinct from p_except
$$;

create or replace function public.source_image_rank(p image_policy)
returns int language sql immutable set search_path = public
as $$ select case p when 'none' then 0 when 'licensed_only' then 1 when 'with_agreement' then 2 else 3 end $$;

create or replace function public.source_reliability_rank(p source_reliability)
returns int language sql immutable set search_path = public
as $$ select case p when 'low' then 0 when 'standard' then 1 when 'verified' then 2 else 3 end $$;

-- Campos que não contam como mudança de configuração (operacionais e derivados): não trocam a versão nem
-- entram na auditoria.
create or replace function public.source_ignored_keys()
returns text[] language sql immutable set search_path = public
as $$
  select array['id', 'created_at', 'version', 'updated_at', 'status_changed_at', 'status_changed_by',
               'last_fetched_at', 'etag', 'last_modified', 'last_error', 'consecutive_failures',
               'last_fetch_started_at', 'last_fetch_run_id']::text[]
$$;

-- Aprovação `source.critical` de uso único para 'source:<id>:<campo>=<valor>' (mesmo padrão de
-- consume_role_admin_approval, A-027). Só dentro de trigger, por quem tem source.manage. Registra quem
-- pediu e quem aprovou em `citynews.applied_approvals` para a auditoria.
create or replace function public.consume_source_critical_approval(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
  req uuid;
  appr uuid;
  prev text;
begin
  if pg_trigger_depth() = 0 or not public.has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia}') then
    return false;
  end if;
  select a.id, a.requested_by, a.approved_by into hit, req, appr
    from public.approvals a
   where a.kind = 'source.critical' and a.target_ref = p_ref and a.status = 'approved'
     and a.approved_by is not null and a.approved_by <> a.requested_by
   order by a.created_at
   limit 1
   for update;
  if hit is null then
    return false;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  prev := coalesce(nullif(current_setting('citynews.applied_approvals', true), ''), '[]');
  perform set_config('citynews.applied_approvals',
    (prev::jsonb || jsonb_build_array(jsonb_build_object('id', hit, 'requested_by', req, 'approved_by', appr)))::text,
    true);
  return true;
end
$$;

create or replace function public.guard_source_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor(); -- null para postgres/service_role (isentos, como A-027)
  ignored text[] := public.source_ignored_keys();
  n jsonb := to_jsonb(new);
  o jsonb;
  changed boolean;
  crit text[] := '{}';
  c text;
  enters_lane boolean;
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_at := now();
    new.status_changed_at := now();
    if new.status = 'paused' and new.status_reason is null then
      new.status_reason := 'pending_activation';
    end if;
    if uid is not null then
      new.created_by := uid;
      if new.status <> 'paused' or new.archived_at is not null then
        raise exception 'sources: fonte nova entra pausada e aguarda ativação' using errcode = '42501';
      end if;
      new.status_changed_by := uid;
      -- Nasce com os valores mais restritivos; ampliar direitos na criação também exige aprovação.
      if new.image_policy <> 'none' then crit := crit || format('image_policy=%s', new.image_policy); end if;
      if new.republish_policy = 'summary_2_sentences' then crit := crit || 'republish_policy=summary_2_sentences'::text; end if;
      if new.reliability in ('verified', 'primary') then crit := crit || format('reliability=%s', new.reliability); end if;
      if new.may_be_sole_source then crit := crit || 'may_be_sole_source=true'::text; end if;
    end if;
    enters_lane := new.frequency_minutes in (10, 15, 20);
  else
    o := to_jsonb(old);
    changed := (n - ignored) is distinct from (o - ignored);
    if not changed then
      -- Só campos operacionais: versão e data intactas (ninguém entra em conflito por causa da coleta).
      new.version := old.version;
      new.updated_at := old.updated_at;
      new.status_changed_at := old.status_changed_at;
      new.status_changed_by := old.status_changed_by;
      return new;
    end if;
    if uid is not null then
      new.created_at := old.created_at;
      new.created_by := old.created_by;
      new.slug := old.slug;
    end if;

    -- Arquivamento e restauração.
    if old.archived_at is null and new.archived_at is not null then
      if new.status not in ('paused', 'blocked') then
        raise exception 'Só fonte pausada ou bloqueada pode ser arquivada.' using errcode = '22023';
      end if;
      if uid is not null then
        new.archived_by := uid;
        if btrim(coalesce(new.archive_reason, '')) = '' then
          raise exception 'Informe o motivo do arquivamento.' using errcode = '22023';
        end if;
      end if;
      if new.frequency_minutes < 30 then
        new.frequency_minutes := null; -- libera a vaga da via rápida (aparece no diff da auditoria)
      end if;
    elsif old.archived_at is not null and new.archived_at is null then
      new.archived_by := null;
      new.archive_reason := null;
      if uid is not null and ((n - ignored - array['archived_at', 'archived_by', 'archive_reason'])
                              is distinct from (o - ignored - array['archived_at', 'archived_by', 'archive_reason'])) then
        raise exception 'Restaurar a fonte não altera outros campos.' using errcode = '22023';
      end if;
    elsif old.archived_at is not null and uid is not null then
      raise exception 'Fonte arquivada: restaure antes de alterar.' using errcode = '42501';
    end if;

    -- Estado.
    if new.status is distinct from old.status then
      if uid is not null then
        if not ((old.status = 'paused' and new.status in ('active', 'blocked'))
                or (old.status = 'active' and new.status in ('paused', 'degraded', 'blocked'))
                or (old.status = 'degraded' and new.status in ('active', 'paused', 'blocked'))
                or (old.status = 'blocked' and new.status = 'paused')) then
          raise exception 'Transição de estado inválida: % para %', old.status, new.status using errcode = '22023';
        end if;
        if new.status = 'active' and new.terms_reviewed_at is null then
          raise exception 'Revise os termos de uso da fonte antes de ativá-la.' using errcode = '22023';
        end if;
        new.status_changed_by := uid;
      end if;
      new.status_changed_at := now();
    else
      new.status_changed_at := old.status_changed_at;
      new.status_changed_by := old.status_changed_by;
    end if;

    -- Campos críticos (D-F3): ampliar direitos só com aprovação de outra pessoa.
    if uid is not null then
      if public.source_image_rank(new.image_policy) > public.source_image_rank(old.image_policy) then
        crit := crit || format('image_policy=%s', new.image_policy);
      end if;
      if old.republish_policy = 'link_only' and new.republish_policy = 'summary_2_sentences' then
        crit := crit || 'republish_policy=summary_2_sentences'::text;
      end if;
      if new.reliability in ('verified', 'primary')
         and public.source_reliability_rank(new.reliability) > public.source_reliability_rank(old.reliability) then
        crit := crit || format('reliability=%s', new.reliability);
      end if;
      if new.may_be_sole_source and not old.may_be_sole_source then
        crit := crit || 'may_be_sole_source=true'::text;
      end if;
      if old.status = 'blocked' and new.status <> 'blocked' then
        crit := crit || format('status=%s', new.status);
      end if;
    end if;
    enters_lane := new.frequency_minutes in (10, 15, 20)
                   and (old.frequency_minutes is null or old.frequency_minutes >= 30);
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  foreach c in array crit loop
    if not public.consume_source_critical_approval(format('source:%s:%s', new.id, c)) then
      raise exception 'Mudança crítica (%) exige aprovação source.critical de outra pessoa.', split_part(c, '=', 1)
        using errcode = '42501', hint = 'Regra de duas pessoas (spec §8).';
    end if;
  end loop;

  -- Via rápida (D-F28): só fonte ativa ou degradada e com vaga; o lock serializa marcações simultâneas.
  if enters_lane then
    if new.archived_at is not null or new.status not in ('active', 'degraded') then
      raise exception 'Ative a fonte antes de colocá-la na via rápida.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('citynews.sources.fast_lane'));
    if public.source_fast_lane_used(new.id) >= public.source_setting_int('sources.fast_lane_max', 10) then
      raise exception 'A via rápida está cheia: % de % fontes.',
        public.source_fast_lane_used(new.id), public.source_setting_int('sources.fast_lane_max', 10)
        using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;

create trigger sources_guard before insert or update on sources
  for each row execute function public.guard_source_changes();

-- Auditoria do diff de configuração e status (campos operacionais ficam de fora).
create or replace function public.audit_source_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ignored text[] := public.source_ignored_keys();
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  changes jsonb;
  ctx jsonb := coalesce(nullif(current_setting('citynews.audit_ctx', true), '')::jsonb, '{}'::jsonb);
  applied jsonb := coalesce(nullif(current_setting('citynews.applied_approvals', true), '')::jsonb, '[]'::jsonb);
  act text;
  details jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('field', k, 'from', o -> k, 'to', n -> k) order by k), '[]'::jsonb)
    into changes
    from jsonb_object_keys(n) k
   where k <> all (ignored)
     and (n -> k) is distinct from (o -> k)
     and (tg_op = 'UPDATE' or n -> k <> 'null'::jsonb);
  perform set_config('citynews.applied_approvals', '', true);
  if jsonb_array_length(changes) = 0 then
    return null;
  end if;
  act := case
    when tg_op = 'INSERT' then 'source.create'
    when old.archived_at is null and new.archived_at is not null then 'source.archive'
    when old.archived_at is not null and new.archived_at is null then 'source.restore'
    when new.status is distinct from old.status then 'source.status'
    else 'source.update' end;
  details := jsonb_build_object('changes', changes);
  if ctx ->> 'reason' is not null then details := details || jsonb_build_object('reason', ctx -> 'reason'); end if;
  if ctx ->> 'batchId' is not null then details := details || jsonb_build_object('batchId', ctx -> 'batchId'); end if;
  if jsonb_array_length(applied) > 0 then
    details := details || jsonb_build_object('approvalId', applied -> 0 -> 'id', 'approvals', applied);
  end if;
  insert into audit_log (actor, action, object_ref, details, ip_hash)
  values (coalesce(auth.uid()::text, 'sistema'), act, 'source:' || new.id, details, ctx ->> 'ipHash');
  return null;
end
$$;

create trigger sources_audit after insert or update on sources
  for each row execute function public.audit_source_changes();

-- Configurações globais: valida as duas chaves e audita como settings.update.
create or replace function public.validate_app_setting()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v jsonb := new.value;
  int_ok boolean := jsonb_typeof(new.value) = 'number' and (new.value #>> '{}') ~ '^[0-9]{1,5}$';
begin
  if new.key = 'sources.default_frequency_minutes' then
    if not int_ok or (v #>> '{}')::int not between 30 and 1440 or (v #>> '{}')::int % 30 <> 0 then
      raise exception 'Frequência padrão: use 30 a 1440 minutos em múltiplos de 30.' using errcode = '22023';
    end if;
  elsif new.key = 'sources.fast_lane_max' then
    if not int_ok or (v #>> '{}')::int not between 0 and 20 then
      raise exception 'Vagas da via rápida: use um inteiro de 0 a 20.' using errcode = '22023';
    end if;
  else
    raise exception 'app_settings: chave desconhecida (%)', new.key using errcode = '22023';
  end if;
  new.updated_at := now();
  if public.critical_actor() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end
$$;
create trigger app_settings_validate before insert or update on app_settings
  for each row execute function public.validate_app_setting();

create or replace function public.audit_app_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx jsonb := coalesce(nullif(current_setting('citynews.audit_ctx', true), '')::jsonb, '{}'::jsonb);
  details jsonb;
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return null;
  end if;
  details := jsonb_build_object('changes', jsonb_build_array(jsonb_build_object(
    'field', 'value', 'from', case when tg_op = 'UPDATE' then old.value end, 'to', new.value)));
  if ctx ->> 'reason' is not null then details := details || jsonb_build_object('reason', ctx -> 'reason'); end if;
  insert into audit_log (actor, action, object_ref, details, ip_hash)
  values (coalesce(auth.uid()::text, 'sistema'), 'settings.update', 'setting:' || new.key, details, ctx ->> 'ipHash');
  return null;
end
$$;
create trigger app_settings_audit after insert or update on app_settings
  for each row execute function public.audit_app_settings();

-- ---------------------------------------------------------------------------
-- 6. RPCs SECURITY INVOKER (RLS, guard e auditoria continuam valendo)
-- ---------------------------------------------------------------------------
create or replace function public.source_admin_check()
returns void
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia}') then
    raise exception 'sem permissão para gerir fontes' using errcode = '42501';
  end if;
end $$;

create or replace function public.source_admin_ctx(p_ctx jsonb)
returns void
language sql
set search_path = public
as $$ select set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true) $$;

create or replace function public.source_admin_load(p_id uuid, p_version int)
returns sources
language plpgsql
set search_path = public
as $$
declare
  cur sources;
begin
  select * into cur from sources where id = p_id for update;
  if not found then
    raise exception 'fonte não encontrada' using errcode = 'P0002';
  end if;
  if p_version is not null and cur.version <> p_version then
    raise exception 'conflito de versão: a fonte mudou (versão % em vez de %)', cur.version, p_version
      using errcode = 'CV409';
  end if;
  return cur;
end $$;

-- Campos que o painel edita (o resto tem RPC própria ou é operacional).
create or replace function public.source_admin_fields(p_create boolean)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case when p_create then array['id', 'slug'] else array[]::text[] end || array[
    'name', 'base_url', 'kind', 'feed_url', 'frequency_minutes', 'rate_limit_per_hour', 'priority', 'categories',
    'locality', 'reliability', 'image_policy', 'republish_policy', 'may_be_sole_source', 'owner_id',
    'agreement_until', 'display_name', 'logo_path', 'rec_pinned', 'rec_local_highlight', 'rec_excluded',
    'editorial_score', 'layer', 'consumption', 'terms_url', 'terms_reviewed_at', 'terms_reviewed_by',
    'terms_min_interval_minutes', 'agreement_note']::text[]
$$;

create or replace function public.source_admin_create(p jsonb, p_ctx jsonb default '{}'::jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  k text;
  r sources;
  new_id uuid;
begin
  perform public.source_admin_check();
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'source_admin_create: dados inválidos' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p) loop
    if k <> all (public.source_admin_fields(true)) then
      raise exception 'campo não editável: %', k using errcode = '22023';
    end if;
  end loop;
  r := jsonb_populate_record(null::sources, p);
  if r.slug is null or r.name is null or r.base_url is null or r.kind is null or r.locality is null then
    raise exception 'source_admin_create: slug, nome, endereço, tipo e localidade são obrigatórios' using errcode = '22023';
  end if;
  perform public.source_admin_ctx(p_ctx);
  insert into sources (id, slug, name, base_url, kind, feed_url, frequency_minutes, rate_limit_per_hour, priority,
                       categories, locality, reliability, image_policy, republish_policy, may_be_sole_source,
                       owner_id, agreement_until, display_name, logo_path, rec_pinned, rec_local_highlight,
                       rec_excluded, editorial_score, layer, consumption, terms_url, terms_reviewed_at,
                       terms_reviewed_by, terms_min_interval_minutes, agreement_note, status, status_reason)
  values (coalesce(r.id, gen_random_uuid()), r.slug, r.name, r.base_url, r.kind, r.feed_url, r.frequency_minutes,
          coalesce(r.rate_limit_per_hour, 60), coalesce(r.priority, 2), coalesce(r.categories, '{}'),
          r.locality, coalesce(r.reliability, 'standard'), coalesce(r.image_policy, 'none'),
          coalesce(r.republish_policy, 'link_only'), coalesce(r.may_be_sole_source, false), r.owner_id,
          r.agreement_until, r.display_name, r.logo_path, coalesce(r.rec_pinned, false),
          coalesce(r.rec_local_highlight, false), coalesce(r.rec_excluded, false),
          coalesce(r.editorial_score, 3), r.layer, coalesce(r.consumption, '{}'), r.terms_url,
          r.terms_reviewed_at, r.terms_reviewed_by, r.terms_min_interval_minutes, r.agreement_note,
          'paused', 'pending_activation')
  returning id into new_id;
  perform public.source_admin_ctx('{}');
  return new_id;
end $$;

create or replace function public.source_admin_update(p_id uuid, p_version int, p_patch jsonb, p_ctx jsonb default '{}'::jsonb)
returns int
language plpgsql
set search_path = public
as $$
declare
  k text;
  sets text;
  v int;
begin
  perform public.source_admin_check();
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb then
    raise exception 'source_admin_update: nada para alterar' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (public.source_admin_fields(false)) then
      raise exception 'campo não editável: %', k using errcode = '22023';
    end if;
  end loop;
  perform public.source_admin_load(p_id, p_version);
  select string_agg(format('%1$I = r.%1$I', key), ', ') into sets from jsonb_object_keys(p_patch) key;
  perform public.source_admin_ctx(p_ctx);
  execute format('update sources s set %s from (select (jsonb_populate_record(null::sources, $1)).*) r where s.id = $2', sets)
    using p_patch, p_id;
  perform public.source_admin_ctx('{}');
  select version into v from sources where id = p_id;
  return v;
end $$;

-- Aplica uma ação de estado (sem versão nem contexto: quem chama cuida disso).
create or replace function public.source_admin_status_apply(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
declare
  why text := nullif(btrim(coalesce(p_reason, '')), '');
  reasons constant text[] := array['pending_activation', 'manual', 'auto_failures', 'robots', 'opt_out', 'legal', 'quality', 'other'];
begin
  if p_action = 'activate' then
    update sources set status = 'active', status_reason = null where id = p_id;
  elsif p_action = 'pause' then
    why := coalesce(why, 'manual');
    if why <> all (reasons) then raise exception 'motivo de estado inválido: %', why using errcode = '22023'; end if;
    update sources set status = 'paused', status_reason = why where id = p_id;
  elsif p_action = 'block' then
    if why is null or why <> all (reasons) then
      raise exception 'Informe o motivo do bloqueio.' using errcode = '22023';
    end if;
    update sources set status = 'blocked', status_reason = why,
           image_policy = case when why = 'opt_out' then 'none' else image_policy end
     where id = p_id;
  elsif p_action = 'unblock' then
    update sources set status = 'paused', status_reason = 'manual' where id = p_id;
  elsif p_action = 'archive' then
    if why is null then raise exception 'Informe o motivo do arquivamento.' using errcode = '22023'; end if;
    update sources set archived_at = now(), archived_by = auth.uid(), archive_reason = why where id = p_id;
  elsif p_action = 'restore' then
    update sources set archived_at = null, archived_by = null, archive_reason = null where id = p_id;
  else
    raise exception 'ação de estado desconhecida: %', p_action using errcode = '22023';
  end if;
end $$;

create or replace function public.source_admin_status(
  p_id uuid, p_version int, p_action text, p_reason text default null, p_ctx jsonb default '{}'::jsonb
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v int;
begin
  perform public.source_admin_check();
  perform public.source_admin_load(p_id, p_version);
  perform public.source_admin_ctx(p_ctx);
  perform public.source_admin_status_apply(p_id, p_action, p_reason);
  perform public.source_admin_ctx('{}');
  select version into v from sources where id = p_id;
  return v;
end $$;

-- Lote (até 50): 'pause', 'activate' ou 'frequency' (p_value = {"frequency_minutes": 10}). Aplica fonte a
-- fonte, na ordem recebida; cada uma em sua subtransação, com resultado e motivo por fonte.
create or replace function public.source_admin_bulk(p_ids uuid[], p_action text, p_value jsonb default '{}'::jsonb, p_ctx jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  cur sources;
  items jsonb := '[]'::jsonb;
  applied int := 0;
  skipped int := 0;
  reason text;
  msg text;
  target int;
begin
  perform public.source_admin_check();
  if p_action not in ('pause', 'activate', 'frequency') then
    raise exception 'ação em lote desconhecida: %', p_action using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 50 then
    raise exception 'O lote aceita de 1 a 50 fontes.' using errcode = '22023';
  end if;
  if p_action = 'frequency' then
    if p_value is null or not (p_value ? 'frequency_minutes') then
      raise exception 'Informe frequency_minutes.' using errcode = '22023';
    end if;
    target := nullif(p_value ->> 'frequency_minutes', '')::int;
  end if;
  perform public.source_admin_ctx(p_ctx);
  foreach v_id in array p_ids loop
    reason := null;
    msg := null;
    select * into cur from sources s where s.id = v_id for update;
    if not found then
      reason := 'not_found';
    elsif cur.archived_at is not null then
      reason := 'archived';
    elsif p_action = 'pause' then
      reason := case cur.status when 'blocked' then 'blocked' when 'paused' then 'already_paused' end;
    elsif p_action = 'activate' then
      reason := case
        when cur.status = 'blocked' then 'blocked'
        when cur.status in ('active', 'degraded') then 'already_active'
        when cur.terms_reviewed_at is null or (cur.feed_url is null and cur.consumption = '{}'::jsonb) then 'not_activated'
      end;
    elsif cur.frequency_minutes is not distinct from target then
      reason := 'unchanged';
    end if;
    if reason is null then
      begin
        if p_action = 'frequency' then
          update sources set frequency_minutes = target where sources.id = v_id;
        else
          perform public.source_admin_status_apply(v_id, p_action, 'manual');
        end if;
      exception when others then
        msg := sqlerrm;
        reason := case
          when msg like '%via rápida está cheia%' then 'fast_lane_full'
          when msg like '%Ative a fonte%' then 'not_active'
          when msg like '%aprovação%' then 'needs_approval'
          else 'error' end;
      end;
    end if;
    if reason is null then
      applied := applied + 1;
      items := items || jsonb_build_array(jsonb_build_object('id', v_id, 'slug', cur.slug, 'outcome', 'applied', 'reason', null));
    else
      skipped := skipped + 1;
      items := items || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'slug', cur.slug, 'outcome', 'skipped', 'reason', reason, 'message', msg));
    end if;
  end loop;
  perform public.source_admin_ctx('{}');
  return jsonb_build_object('applied', applied, 'skipped', skipped, 'items', items);
end $$;

create or replace function public.app_setting_set(p_key text, p_value jsonb, p_ctx jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform public.source_admin_check();
  perform public.source_admin_ctx(p_ctx);
  insert into app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
  perform public.source_admin_ctx('{}');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Views públicas
-- ---------------------------------------------------------------------------
revoke delete on sources from authenticated;

create or replace view public_sources as
  select s.id, s.slug, coalesce(s.display_name, s.name) as name, s.base_url, s.kind, s.categories, s.locality,
         s.reliability, s.image_policy, s.republish_policy, s.status, s.logo_path, s.rec_pinned,
         s.rec_local_highlight, s.rec_excluded, s.last_fetched_at
  from sources s
  where s.status <> 'blocked' and s.archived_at is null;

-- Mesmas colunas de 0004, com a relevância editorial da fonte no fim. Agregado de fonte arquivada
-- continua íntegro (assuntos e matérias que o citam); só a lista pública de fontes a esconde.
create or replace view public_aggregated as
  select ci.id, ci.source_id, s.slug as source_slug, coalesce(s.display_name, s.name) as source_name,
         ci.canonical_url, ci.original_title, ci.published_at, ci.section_slug, ci.locality, ci.topic_id,
         case when s.republish_policy = 'summary_2_sentences' then ci.summary end as summary,
         case when s.image_policy <> 'none' then ci.image_url end as image_url,
         s.image_policy,
         s.editorial_score as source_editorial_score
  from collected_items ci
  join sources s on s.id = ci.source_id
  where ci.duplicate_of is null and ci.quarantined_at is null and s.status <> 'blocked';

-- ---------------------------------------------------------------------------
-- 8. Permissões das funções
-- ---------------------------------------------------------------------------
revoke execute on function
  start_fast_run(timestamptz), start_manual_run(uuid), claim_source_fetch(uuid, uuid, timestamptz),
  peek_rate_limit(text, text, int, int), record_source_fetch(uuid, text, int, int, text), purge_source_discoveries()
  from public, anon, authenticated;
grant execute on function
  start_fast_run(timestamptz), start_manual_run(uuid), claim_source_fetch(uuid, uuid, timestamptz),
  peek_rate_limit(text, text, int, int), record_source_fetch(uuid, text, int, int, text), purge_source_discoveries()
  to service_role;

revoke execute on function
  public.source_setting_int(text, int), public.source_fast_lane_used(uuid), public.source_image_rank(image_policy),
  public.source_reliability_rank(source_reliability), public.source_ignored_keys(),
  public.consume_source_critical_approval(text), public.guard_source_changes(), public.audit_source_changes(),
  public.validate_app_setting(), public.audit_app_settings(), public.source_admin_check(),
  public.source_admin_ctx(jsonb), public.source_admin_load(uuid, int), public.source_admin_fields(boolean),
  public.source_admin_status_apply(uuid, text, text)
  from public, anon;
grant execute on function
  public.source_setting_int(text, int), public.source_fast_lane_used(uuid), public.source_image_rank(image_policy),
  public.source_reliability_rank(source_reliability), public.source_ignored_keys(),
  public.consume_source_critical_approval(text), public.source_admin_check(),
  public.source_admin_ctx(jsonb), public.source_admin_load(uuid, int), public.source_admin_fields(boolean),
  public.source_admin_status_apply(uuid, text, text)
  to authenticated, service_role;

revoke execute on function
  public.source_admin_create(jsonb, jsonb), public.source_admin_update(uuid, int, jsonb, jsonb),
  public.source_admin_status(uuid, int, text, text, jsonb), public.source_admin_bulk(uuid[], text, jsonb, jsonb),
  public.app_setting_set(text, jsonb, jsonb)
  from public, anon;
grant execute on function
  public.source_admin_create(jsonb, jsonb), public.source_admin_update(uuid, int, jsonb, jsonb),
  public.source_admin_status(uuid, int, text, text, jsonb), public.source_admin_bulk(uuid[], text, jsonb, jsonb),
  public.app_setting_set(text, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Agente source_profiler (prompt v1 idêntico ao de FS-T4) e orçamento (A-076: write 11 → 10, teto de R$ 30)
-- ---------------------------------------------------------------------------
insert into ai_agents (id, function, model_id, fallback_model_id, prompt_version, daily_budget_brl) values
  ('source_profiler', 'Sugere editorias, localidade, alertas de qualidade e seletores de página para uma fonte nova',
   'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 1)
on conflict (id) do nothing;
insert into ai_prompts (agent_id, version, body, rationale, author_id, status) values
  ('source_profiler', 1,
   'Você analisa a amostra de uma fonte de notícias para o CityNews, portal de Cuiabá e Várzea Grande. Com base só nos títulos, datas, endereços e na estrutura da página fornecidos, sugira editorias da lista dada, a localidade principal (cuiaba, varzea-grande, mt ou nacional), alertas de qualidade e, quando for uma página sem feed, seletores CSS para item, link, título e data. Não opine sobre direitos de uso, confiabilidade ou frequência. Explique em até 3 frases.',
   'v1 do plano do painel de fontes (migration 0011)', '00000000-0000-0000-0000-000000000000', 'production')
on conflict (agent_id, version) do nothing;
-- 0006 já tinha `write` em 11 (a redistribuição 12 → 11 do P3-GATE abriu espaço para aggregate_summary):
-- o R$ 1 do source_profiler sai do `write` de novo para a soma continuar no teto de R$ 30 (A-006).
update ai_agents set daily_budget_brl = 10 where id = 'write';

-- ---------------------------------------------------------------------------
-- 10. Bucket público de logotipos (escrita source.manage). A pilha local sem Docker não tem Storage.
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    begin
      execute $q$insert into storage.buckets (id, name, public) values ('source-logos', 'source-logos', true)
               on conflict (id) do update set public = true$q$;
      execute $q$drop policy if exists source_logos_read on storage.objects$q$;
      execute $q$create policy source_logos_read on storage.objects for select to anon, authenticated
                 using (bucket_id = 'source-logos')$q$;
      execute $q$drop policy if exists source_logos_write on storage.objects$q$;
      execute $q$create policy source_logos_write on storage.objects for all to authenticated
                 using (bucket_id = 'source-logos'
                        and public.has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))
                 with check (bucket_id = 'source-logos'
                        and public.has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))$q$;
    exception when insufficient_privilege then
      raise notice 'source-logos: sem privilégio para criar políticas em storage.objects; crie pelo painel do Supabase';
    end;
  end if;
end $$;

insert into feature_flags (key, enabled) values ('source_link_analysis', true) on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Agendamento: 0004 + job do tick rápido (a cada 10 min) e retenção das descobertas
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

  -- Via rápida: tick a cada 10 min só para o fetch das fontes com frequência < 30 min.
  execute format('select cron.schedule(%L, %L, %L)', 'ingest-fast-tick', '*/10 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/fast-tick',
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

  return 'agendado: ingest-tick, ingest-fast-tick e jobs-drain';
end $fn$;
revoke execute on function schedule_pipeline_cron() from public, anon, authenticated, service_role;

-- Retenção de 90 dias das descobertas: todo dia às 4h de Cuiabá (08:00 UTC). Sem pg_cron, nada é agendado.
do $$ begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'source-discoveries-retention'$q$;
    execute format('select cron.schedule(%L, %L, %L)', 'source-discoveries-retention', '0 8 * * *',
      'select public.purge_source_discoveries()');
  end if;
end $$;

select schedule_pipeline_cron();
