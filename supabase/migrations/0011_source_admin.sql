-- Painel de Fontes (spec docs/superpowers/specs/2026-09-27-painel-de-fontes.md; plano FS-T1).
--
-- Ordem: colunas e checks de `sources` → dados → tabelas novas → `ingest_runs` (via rápida) →
-- funções → triggers de duas pessoas e auditoria → RPCs `security invoker` → views e grants →
-- agente de IA → storage → flag → `schedule_pipeline_cron()`.
--
-- Duas pessoas (D-F3/D-F4/D-F5): igual ao padrão de A-027 (0002_rls.sql). `guard_source_changes`
-- e `audit_source_changes` valem para qualquer caminho (Estúdio, REST, SQL como `authenticated`).
-- `postgres` e `service_role` (migrations, seed, pipeline) não passam por `critical_actor()`, então
-- ficam de fora das regras de negócio impostas aqui — só o bookkeeping (versão, `updated_at`) vale
-- sempre.

-- ---------------------------------------------------------------------------
-- 1. `sources`: colunas e checks (D-F14, D-F15, D-F19, D-F22, D-F23, D-F27, §6.1)
-- ---------------------------------------------------------------------------
alter table sources
  alter column frequency_minutes drop not null,
  alter column frequency_minutes drop default;
alter table sources drop constraint if exists sources_frequency_minutes_check;
update sources set frequency_minutes = null where frequency_minutes = 30;
alter table sources add constraint sources_frequency_minutes_check
  check (
    frequency_minutes is null
    or frequency_minutes in (10, 15, 20)
    or (frequency_minutes between 30 and 1440 and frequency_minutes % 30 = 0)
  );

alter table sources
  add column terms_min_interval_minutes int check (terms_min_interval_minutes between 1 and 1440),
  add column editorial_score smallint not null default 3 check (editorial_score between 1 and 5),
  add column layer smallint check (layer between 1 and 4),
  add column consumption jsonb not null default '{}',
  add column status_reason text check (
    status_reason in ('pending_activation', 'manual', 'auto_failures', 'robots', 'opt_out', 'legal', 'quality', 'other')
  ),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column consecutive_failures int not null default 0,
  add column last_fetch_started_at timestamptz,
  add column last_fetch_run_id uuid,
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

alter table sources add constraint sources_archived_status_check
  check (archived_at is null or status in ('paused', 'blocked'));

-- ---------------------------------------------------------------------------
-- 2. Dados: fontes já pausadas ganham motivo; camada e score editorial das 32 fontes reais
-- (docs/sources-registry.md, colunas Relev. e Camada). Em dev/CI os slugs não existem: no-op.
-- ---------------------------------------------------------------------------
update sources set status_reason = 'pending_activation' where status = 'paused' and status_reason is null;

update sources s set layer = v.layer, editorial_score = v.editorial_score
from (values
  ('secom-mt', 1, 5), ('prefeitura-cuiaba', 1, 5), ('prefeitura-vg', 1, 5),
  ('almt', 1, 4), ('camara-cuiaba', 1, 4),
  ('tjmt', 1, 3), ('mpmt', 1, 3), ('tce-mt', 1, 3), ('tre-mt', 1, 3), ('iomat', 1, 3),
  ('defesa-civil-mt', 1, 4), ('inmet', 1, 4),
  ('agencia-brasil', 4, 3),
  ('gazeta-digital', 2, 5), ('olhar-direto', 2, 5), ('rdnews', 2, 5), ('midianews', 2, 5), ('g1-mt', 2, 5),
  ('folhamax', 2, 4), ('hipernoticias', 2, 4),
  ('reporter-mt', 2, 3), ('diario-de-cuiaba', 2, 3), ('circuito-mt', 2, 3), ('o-documento', 2, 3), ('leiagora', 2, 3),
  ('so-noticias', 3, 3), ('olhar-conceito', 3, 4), ('agro-olhar', 3, 4), ('olhar-esportivo', 3, 3), ('imea', 3, 3),
  ('canal-rural', 4, 2), ('cnn-brasil-mt', 4, 2)
) as v(slug, layer, editorial_score)
where s.slug = v.slug;

-- ---------------------------------------------------------------------------
-- 3. Tabelas novas (§6.3)
-- ---------------------------------------------------------------------------
create table source_health_daily (
  day date not null,
  source_id uuid not null references sources(id),
  fetch_ok int not null default 0,
  fetch_not_modified int not null default 0,
  fetch_failed int not null default 0,
  items_new int not null default 0,
  latency_ms_sum bigint not null default 0,
  latency_samples int not null default 0,
  last_error text,
  primary key (day, source_id)
);
alter table source_health_daily enable row level security;
revoke all on source_health_daily from anon, authenticated;
grant select on source_health_daily to authenticated;
create policy source_health_daily_read on source_health_daily for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,analista,leitura}'));

create table source_discoveries (
  id uuid primary key default gen_random_uuid(),
  input_url text not null,
  final_url text,
  source_id uuid references sources(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  preview jsonb not null default '[]',
  suggestion jsonb not null default '{}',
  prompt_version int,
  accepted_fields text[] not null default '{}'
);
alter table source_discoveries enable row level security;
revoke all on source_discoveries from anon;
revoke update, delete on source_discoveries from authenticated;
create policy source_discoveries_read on source_discoveries for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy source_discoveries_insert on source_discoveries for insert to authenticated
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}') and created_by = (select auth.uid()));

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('sources.default_frequency_minutes', '30'),
  ('sources.fast_lane_max', '10')
on conflict (key) do nothing;
alter table app_settings enable row level security;
revoke all on app_settings from anon;
revoke delete on app_settings from authenticated;
create policy app_settings_manage on app_settings for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));

-- Grade de cada chave: vale para qualquer caminho (RPC ou update direto).
create or replace function public.guard_app_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key = 'sources.default_frequency_minutes' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 30 and 1440
       or (new.value)::text::int % 30 <> 0 then
      raise exception 'sources.default_frequency_minutes deve ser múltiplo de 30 entre 30 e 1440' using errcode = '23514';
    end if;
  elsif new.key = 'sources.fast_lane_max' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 0 and 20 then
      raise exception 'sources.fast_lane_max deve ser um inteiro entre 0 e 20' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
create trigger app_settings_guard before insert or update on app_settings
  for each row execute function public.guard_app_settings();

-- ---------------------------------------------------------------------------
-- 4. `ingest_runs`: via rápida (D-F21, D-F28, D-F29, §6.4)
-- ---------------------------------------------------------------------------
alter table ingest_runs
  add column trigger text not null default 'cron' check (trigger in ('cron', 'manual', 'fast'));
alter table ingest_runs drop constraint ingest_runs_window_start_key;
create unique index ingest_runs_cron_window_uidx on ingest_runs (window_start) where trigger = 'cron';
create unique index ingest_runs_fast_window_uidx on ingest_runs (window_start) where trigger = 'fast';

-- Um run `cron` por janela de 30 min (Review Focus 2 do P3, continua valendo).
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

-- Um run `fast` por janela de 10 min (Review Focus 6: coincide com o `cron` às :00 e :30, mas
-- cada um tem seu próprio índice único parcial e não enxerga a mensagem do outro).
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

-- "Coletar agora" (D-F21): run próprio, nunca reaproveita o run da janela.
create or replace function start_manual_run(p_source uuid)
returns table (run_id uuid, created boolean, stats jsonb)
language sql
set search_path = public
as $$
  insert into ingest_runs (window_start, trigger, stats)
  values (clock_timestamp(), 'manual', jsonb_build_object('source', p_source))
  returning id, true, stats;
$$;

revoke execute on function start_fast_run(timestamptz), start_manual_run(uuid) from public, anon, authenticated;
grant execute on function start_fast_run(timestamptz), start_manual_run(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Funções de coleta e limites (D-F17, D-F28, D-F29; só `service_role`)
-- ---------------------------------------------------------------------------

-- Trava contra coleta dupla: uma coleta por janela de 10 min, salvo retentativa do mesmo run.
create or replace function public.claim_source_fetch(p_source uuid, p_run uuid, p_since timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  update sources
     set last_fetch_started_at = now(), last_fetch_run_id = p_run
   where id = p_source
     and (last_fetch_started_at is null or last_fetch_started_at < p_since or last_fetch_run_id = p_run);
  get diagnostics v_count = row_count;
  return v_count > 0;
end
$$;

-- Consulta a cota de `rate_limits` (0003) sem consumir: o tick rápido pula fonte sem cota.
create or replace function public.peek_rate_limit(p_bucket text, p_key_hash text, p_limit int, p_window_seconds int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.hits < p_limit
       from rate_limits r
      where r.bucket = p_bucket and r.key_hash = p_key_hash
        and r.window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)),
    true
  );
$$;

-- Saúde diária por fonte (idempotente: soma no dia em fuso de Cuiabá).
create or replace function public.record_source_fetch(
  p_source uuid, p_outcome text, p_latency_ms int, p_items_new int, p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Cuiaba')::date;
begin
  insert into source_health_daily
    (day, source_id, fetch_ok, fetch_not_modified, fetch_failed, items_new, latency_ms_sum, latency_samples, last_error)
  values (
    v_day, p_source,
    case when p_outcome = 'ok' then 1 else 0 end,
    case when p_outcome = 'not_modified' then 1 else 0 end,
    case when p_outcome = 'failed' then 1 else 0 end,
    coalesce(p_items_new, 0),
    coalesce(p_latency_ms, 0),
    case when p_latency_ms is not null then 1 else 0 end,
    p_error
  )
  on conflict (day, source_id) do update set
    fetch_ok = source_health_daily.fetch_ok + excluded.fetch_ok,
    fetch_not_modified = source_health_daily.fetch_not_modified + excluded.fetch_not_modified,
    fetch_failed = source_health_daily.fetch_failed + excluded.fetch_failed,
    items_new = source_health_daily.items_new + excluded.items_new,
    latency_ms_sum = source_health_daily.latency_ms_sum + excluded.latency_ms_sum,
    latency_samples = source_health_daily.latency_samples + excluded.latency_samples,
    last_error = coalesce(excluded.last_error, source_health_daily.last_error);
end
$$;

revoke execute on function public.claim_source_fetch(uuid, uuid, timestamptz), public.peek_rate_limit(text, text, int, int),
  public.record_source_fetch(uuid, text, int, int, text)
  from public, anon, authenticated;
grant execute on function public.claim_source_fetch(uuid, uuid, timestamptz), public.peek_rate_limit(text, text, int, int),
  public.record_source_fetch(uuid, text, int, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Regra de duas pessoas e auditoria em `sources` (D-F3 a D-F5, D-F22, D-F23, D-F28)
-- ---------------------------------------------------------------------------

-- Ordem de negócio das políticas (D-F3), diferente da ordem de declaração dos enums.
create or replace function public.image_policy_rank(p image_policy)
returns int
language sql
immutable
as $$
  select case p
    when 'none' then 1 when 'licensed_only' then 2 when 'with_agreement' then 3 when 'reproduction' then 4
  end
$$;

create or replace function public.source_reliability_rank(p source_reliability)
returns int
language sql
immutable
as $$
  select case p when 'low' then 1 when 'standard' then 2 when 'verified' then 3 when 'primary' then 4 end
$$;

-- Consome uma aprovação `source.critical` para o campo e valor (uso único). Security definer para
-- driblar `guard_approvals` (a decisão já foi tomada; isto só fecha o ciclo), como
-- `consume_role_admin_approval` em 0002. Só dentro de um trigger.
create or replace function public.consume_source_critical_approval(p_target text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
begin
  if pg_trigger_depth() = 0 then
    return null;
  end if;
  select a.id into hit
  from public.approvals a
  where a.kind = 'source.critical' and a.target_ref = p_target and a.status = 'approved'
    and a.approved_by is not null and a.approved_by <> a.requested_by
  order by a.created_at
  limit 1
  for update;
  if hit is null then
    return null;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return hit;
end
$$;

-- Exige e consome a aprovação, ou recusa com a mensagem da regra de duas pessoas.
create or replace function public.require_source_critical_approval(p_id uuid, p_field text, p_value text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_target text := format('source:%s:%s=%s', p_id, p_field, p_value);
  v_approval uuid;
begin
  v_approval := public.consume_source_critical_approval(v_target);
  if v_approval is null then
    perform public.two_person_error(
      format('Alterar %s exige aprovação de outra pessoa antes de aplicar (source.critical).', p_field)
    );
  end if;
  return v_approval;
end
$$;

create or replace function public.guard_source_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  v_fast_max int;
  v_count int;
  v_approval uuid;
  v_last_approval uuid;
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    new.updated_at := now();
    new.created_by := coalesce(new.created_by, uid);
    if new.status_changed_at is null then
      new.status_changed_at := now();
    end if;
    if uid is not null then
      if new.frequency_minutes is not null and new.frequency_minutes < 30 then
        perform public.two_person_error('Fonte nova não pode nascer na via rápida.');
      end if;
    end if;
    return new;
  end if;

  -- Fonte arquivada só aceita restaurar (voltar archived_at para null); qualquer outra mudança
  -- enquanto continua arquivada é recusada (mesmo por service_role/postgres: histórico intacto).
  if old.archived_at is not null and new.archived_at is not null
     and (to_jsonb(new) - '{updated_at,version}'::text[]) is distinct from (to_jsonb(old) - '{updated_at,version}'::text[]) then
    raise exception 'fonte arquivada só aceita restaurar' using errcode = '42501';
  end if;

  -- Via rápida (D-F28): entrar (de null/≥30 para <30) exige active/degraded e vaga; trocar entre
  -- 10, 15 e 20 não ocupa vaga nova. `for update` na linha de app_settings serializa duas
  -- marcações simultâneas (Review Focus 6).
  if new.frequency_minutes is distinct from old.frequency_minutes
     and new.frequency_minutes is not null and new.frequency_minutes < 30
     and (old.frequency_minutes is null or old.frequency_minutes >= 30) then
    if new.status not in ('active', 'degraded') or new.archived_at is not null then
      raise exception 'Ative a fonte antes de colocá-la na via rápida.' using errcode = '42501';
    end if;
    perform 1 from app_settings where key = 'sources.fast_lane_max' for update;
    select coalesce((value #>> '{}')::int, 10) into v_fast_max from app_settings where key = 'sources.fast_lane_max';
    select count(*) into v_count from sources
     where archived_at is null and frequency_minutes is not null and frequency_minutes < 30 and id <> new.id;
    if v_count >= v_fast_max then
      raise exception 'A via rápida está cheia: % de % fontes.', v_count, v_fast_max using errcode = '42501';
    end if;
  end if;

  if uid is not null then
    -- Mudança crítica (D-F3): afrouxar image_policy; liberar resumo; confiabilidade para
    -- verified/primary; ligar fonte única; desbloquear.
    if new.image_policy is distinct from old.image_policy
       and public.image_policy_rank(new.image_policy) > public.image_policy_rank(old.image_policy) then
      v_last_approval := public.require_source_critical_approval(new.id, 'image_policy', new.image_policy::text);
    end if;
    if old.republish_policy = 'link_only' and new.republish_policy = 'summary_2_sentences' then
      v_last_approval := public.require_source_critical_approval(new.id, 'republish_policy', new.republish_policy::text);
    end if;
    if new.reliability is distinct from old.reliability
       and new.reliability in ('verified', 'primary')
       and public.source_reliability_rank(new.reliability) > public.source_reliability_rank(old.reliability) then
      v_last_approval := public.require_source_critical_approval(new.id, 'reliability', new.reliability::text);
    end if;
    if old.may_be_sole_source = false and new.may_be_sole_source = true then
      v_last_approval := public.require_source_critical_approval(new.id, 'may_be_sole_source', 'true');
    end if;
    if old.status = 'blocked' and new.status is distinct from 'blocked' then
      v_last_approval := public.require_source_critical_approval(new.id, 'status', new.status::text);
    end if;
    -- Guarda o último id consumido para a auditoria (details.approvalId); RPCs passam o próprio
    -- approvalId em p_ctx quando o chamador já sabe qual é.
    if v_last_approval is not null then
      perform set_config(
        'citynews.audit_ctx',
        jsonb_set(
          coalesce(nullif(current_setting('citynews.audit_ctx', true), '')::jsonb, '{}'::jsonb),
          '{approvalId}', to_jsonb(v_last_approval::text), true
        )::text,
        true
      );
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := uid;
  end if;
  return new;
end
$$;

create trigger sources_guard before insert or update on sources
  for each row execute function public.guard_source_changes();

-- Diff dos campos de configuração e status para audit_log; campos operacionais do pipeline nunca
-- entram (D-F22). `security definer` porque o ator pode ser 'sistema' (service_role sem auth.uid()).
create or replace function public.audit_source_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := coalesce(nullif(current_setting('citynews.audit_ctx', true), '')::jsonb, '{}'::jsonb);
  v_actor text := coalesce(auth.uid()::text, 'sistema');
  v_blacklist text[] := array[
    'id', 'slug', 'created_at', 'created_by', 'updated_at', 'version',
    'last_fetched_at', 'last_error', 'etag', 'last_modified', 'consecutive_failures',
    'last_fetch_started_at', 'last_fetch_run_id', 'status_changed_at', 'status_changed_by'
  ];
  v_changes jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor, action, object_ref, details)
    values (v_actor, 'source.create', 'source:' || new.id,
            jsonb_build_object('reason', v_ctx->>'reason', 'batchId', v_ctx->>'batchId'));
    return new;
  end if;

  select jsonb_agg(jsonb_build_object('field', o.key, 'from', o.value, 'to', n.value) order by o.key)
    into v_changes
  from jsonb_each(to_jsonb(old)) o
  join jsonb_each(to_jsonb(new)) n on n.key = o.key
  where not (o.key = any (v_blacklist)) and o.value is distinct from n.value;

  if v_changes is null then
    return new;
  end if;

  if old.archived_at is null and new.archived_at is not null then
    v_action := 'source.archive';
  elsif old.archived_at is not null and new.archived_at is null then
    v_action := 'source.restore';
  elsif old.status is distinct from new.status then
    v_action := 'source.status';
  else
    v_action := 'source.update';
  end if;

  insert into audit_log (actor, action, object_ref, details)
  values (v_actor, v_action, 'source:' || new.id,
          jsonb_build_object('changes', v_changes, 'reason', v_ctx->>'reason',
                              'batchId', v_ctx->>'batchId', 'approvalId', v_ctx->>'approvalId'));
  return new;
end
$$;

create trigger sources_audit after insert or update on sources
  for each row execute function public.audit_source_changes();

revoke execute on function
  public.image_policy_rank(image_policy), public.source_reliability_rank(source_reliability),
  public.consume_source_critical_approval(text), public.require_source_critical_approval(uuid, text, text),
  public.guard_source_changes(), public.audit_source_changes(), public.guard_app_settings()
  from public, anon;
grant execute on function
  public.image_policy_rank(image_policy), public.source_reliability_rank(source_reliability)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. RPCs `security invoker` do painel (§6.4, §7)
-- ---------------------------------------------------------------------------

-- Cadastro por link (§7.1): nasce sempre `paused`/`pending_activation`, nunca na via rápida.
create or replace function public.source_admin_create(p jsonb, p_ctx jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true);
  insert into sources (
    slug, name, base_url, kind, feed_url, categories, locality, reliability,
    image_policy, republish_policy, may_be_sole_source, status, status_reason,
    frequency_minutes, rate_limit_per_hour, priority, layer, editorial_score, consumption,
    owner_id, agreement_until, display_name, terms_url, agreement_note
  ) values (
    p->>'slug', p->>'name', p->>'baseUrl', (p->>'kind')::source_kind, p->>'feedUrl',
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'categories', '[]'::jsonb)) x), '{}'),
    coalesce(p->>'locality', 'mt'),
    coalesce((p->>'reliability')::source_reliability, 'standard'),
    coalesce((p->>'imagePolicy')::image_policy, 'none'),
    coalesce((p->>'republishPolicy')::republish_policy, 'link_only'),
    coalesce((p->>'mayBeSoleSource')::boolean, false),
    'paused', 'pending_activation',
    nullif(p->>'frequencyMinutes', '')::int,
    coalesce((p->>'rateLimitPerHour')::int, 60),
    coalesce((p->>'priority')::smallint, 2),
    nullif(p->>'layer', '')::smallint,
    coalesce((p->>'editorialScore')::smallint, 3),
    coalesce(p->'consumption', '{}'::jsonb),
    nullif(p->>'ownerId', '')::uuid, nullif(p->>'agreementUntil', '')::date, p->>'displayName',
    p->>'termsUrl', p->>'agreementNote'
  ) returning id into v_id;
  return v_id;
end
$$;

-- Edição (§7.2): versão otimista (D-F23); campos críticos passam pelo trigger `guard_source_changes`.
create or replace function public.source_admin_update(p_id uuid, p_version int, p_patch jsonb, p_ctx jsonb default '{}'::jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current int;
  v_new_version int;
begin
  select version into v_current from sources where id = p_id;
  if v_current is null then
    raise exception 'fonte % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_current <> p_version then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue';
  end if;

  perform set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true);

  update sources s set
    name = coalesce(p_patch->>'name', s.name),
    display_name = case when p_patch ? 'displayName' then nullif(p_patch->>'displayName', '') else s.display_name end,
    logo_path = case when p_patch ? 'logoPath' then nullif(p_patch->>'logoPath', '') else s.logo_path end,
    owner_id = case when p_patch ? 'ownerId' then nullif(p_patch->>'ownerId', '')::uuid else s.owner_id end,
    layer = case when p_patch ? 'layer' then nullif(p_patch->>'layer', '')::smallint else s.layer end,
    categories = case when p_patch ? 'categories'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'categories') x), '{}')
      else s.categories end,
    locality = coalesce(p_patch->>'locality', s.locality),
    reliability = case when p_patch ? 'reliability' then (p_patch->>'reliability')::source_reliability else s.reliability end,
    image_policy = case
      when p_patch ? 'imagePolicy' then (p_patch->>'imagePolicy')::image_policy
      when p_patch ? 'image_policy' then (p_patch->>'image_policy')::image_policy
      else s.image_policy end,
    republish_policy = case
      when p_patch ? 'republishPolicy' then (p_patch->>'republishPolicy')::republish_policy
      when p_patch ? 'republish_policy' then (p_patch->>'republish_policy')::republish_policy
      else s.republish_policy end,
    may_be_sole_source = case
      when p_patch ? 'mayBeSoleSource' then (p_patch->>'mayBeSoleSource')::boolean
      when p_patch ? 'may_be_sole_source' then (p_patch->>'may_be_sole_source')::boolean
      else s.may_be_sole_source end,
    agreement_until = case when p_patch ? 'agreementUntil' then nullif(p_patch->>'agreementUntil', '')::date else s.agreement_until end,
    agreement_note = case when p_patch ? 'agreementNote' then p_patch->>'agreementNote' else s.agreement_note end,
    terms_url = case when p_patch ? 'termsUrl' then p_patch->>'termsUrl' else s.terms_url end,
    terms_reviewed_at = case when p_patch ? 'termsReviewedAt' then nullif(p_patch->>'termsReviewedAt', '')::timestamptz else s.terms_reviewed_at end,
    terms_reviewed_by = case when p_patch ? 'termsReviewedBy' then nullif(p_patch->>'termsReviewedBy', '')::uuid else s.terms_reviewed_by end,
    terms_min_interval_minutes = case
      when p_patch ? 'termsMinIntervalMinutes' then nullif(p_patch->>'termsMinIntervalMinutes', '')::int
      else s.terms_min_interval_minutes end,
    frequency_minutes = case
      when p_patch ? 'frequencyMinutes' or p_patch ? 'frequency_minutes'
      then nullif(coalesce(p_patch->>'frequencyMinutes', p_patch->>'frequency_minutes'), '')::int
      else s.frequency_minutes end,
    rate_limit_per_hour = case when p_patch ? 'rateLimitPerHour' then (p_patch->>'rateLimitPerHour')::int else s.rate_limit_per_hour end,
    priority = case when p_patch ? 'priority' then (p_patch->>'priority')::smallint else s.priority end,
    editorial_score = case
      when p_patch ? 'editorialScore' then (p_patch->>'editorialScore')::smallint
      when p_patch ? 'editorial_score' then (p_patch->>'editorial_score')::smallint
      else s.editorial_score end,
    rec_pinned = case when p_patch ? 'recPinned' then (p_patch->>'recPinned')::boolean else s.rec_pinned end,
    rec_local_highlight = case when p_patch ? 'recLocalHighlight' then (p_patch->>'recLocalHighlight')::boolean else s.rec_local_highlight end,
    rec_excluded = case when p_patch ? 'recExcluded' then (p_patch->>'recExcluded')::boolean else s.rec_excluded end,
    consumption = case when p_patch ? 'consumption' then p_patch->'consumption' else s.consumption end
  where s.id = p_id and s.version = p_version
  returning s.version into v_new_version;

  if v_new_version is null then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue';
  end if;
  return v_new_version;
end
$$;

-- Ciclo de vida (§7.3): ativar, pausar, retomar, bloquear, arquivar, restaurar.
create or replace function public.source_admin_status(
  p_id uuid, p_version int, p_action text, p_reason text default null, p_ctx jsonb default '{}'::jsonb
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row sources%rowtype;
  v_new_version int;
begin
  select * into v_row from sources where id = p_id;
  if not found then
    raise exception 'fonte % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_row.version <> p_version then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue';
  end if;

  perform set_config('citynews.audit_ctx', coalesce(p_ctx, '{}'::jsonb)::text, true);

  if p_action = 'archive' then
    if v_row.status not in ('paused', 'blocked') then
      raise exception 'Arquivar exige que a fonte esteja pausada ou bloqueada.' using errcode = '42501';
    end if;
    update sources set
      archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason,
      frequency_minutes = case when frequency_minutes is not null and frequency_minutes < 30 then null else frequency_minutes end
    where id = p_id and version = p_version
    returning version into v_new_version;
  elsif p_action = 'restore' then
    if v_row.archived_at is null then
      raise exception 'esta fonte não está arquivada' using errcode = '42501';
    end if;
    update sources set archived_at = null, archived_by = null, archive_reason = null,
           status = 'paused', status_reason = 'manual'
    where id = p_id and version = p_version
    returning version into v_new_version;
  elsif p_action = 'pause' then
    if v_row.status not in ('active', 'degraded') then
      raise exception 'só uma fonte ativa ou com falhas pode ser pausada' using errcode = '42501';
    end if;
    update sources set status = 'paused', status_reason = coalesce(nullif(p_reason, ''), 'manual'),
           consecutive_failures = 0
    where id = p_id and version = p_version
    returning version into v_new_version;
  elsif p_action = 'resume' then
    if v_row.status <> 'paused' or v_row.archived_at is not null then
      raise exception 'só uma fonte pausada pode ser retomada' using errcode = '42501';
    end if;
    update sources set status = 'active', status_reason = null, consecutive_failures = 0
    where id = p_id and version = p_version
    returning version into v_new_version;
  elsif p_action = 'block' then
    if v_row.archived_at is not null then
      raise exception 'fonte arquivada não pode ser bloqueada' using errcode = '42501';
    end if;
    update sources set status = 'blocked', status_reason = coalesce(nullif(p_reason, ''), 'other'),
           image_policy = case when p_reason = 'opt_out' then 'none'::image_policy else image_policy end
    where id = p_id and version = p_version
    returning version into v_new_version;
  elsif p_action = 'unblock' then
    if v_row.status <> 'blocked' then
      raise exception 'só uma fonte bloqueada pode ser desbloqueada' using errcode = '42501';
    end if;
    update sources set status = 'paused', status_reason = 'manual'
    where id = p_id and version = p_version
    returning version into v_new_version;
  else
    raise exception 'ação % desconhecida', p_action using errcode = '22023';
  end if;

  if v_new_version is null then
    raise exception 'conflito de versão: esta fonte foi alterada por outra pessoa; recarregue';
  end if;
  return v_new_version;
end
$$;

-- Ações em lote (§7.6): até 50 fontes, resultado por fonte, um batchId liga a auditoria.
-- FS-T1 cobre o contrato de banco (isolamento por linha, versão, batchId); a elegibilidade fina de
-- "ativar em lote" e os motivos de "ignorada" da tela ficam com o Server Action (FS-T6/FS-T7).
create or replace function public.source_admin_bulk(p_ids uuid[], p_action text, p_value jsonb, p_ctx jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_row sources%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_batch_ctx jsonb := jsonb_set(coalesce(p_ctx, '{}'::jsonb), '{batchId}', to_jsonb(gen_random_uuid()::text), true);
begin
  foreach v_id in array coalesce(p_ids, '{}'::uuid[])
  loop
    begin
      select * into v_row from sources where id = v_id for update;
      if not found then
        v_result := v_result || jsonb_build_object('id', v_id, 'ok', false, 'reason', 'fonte não encontrada');
        continue;
      end if;
      perform set_config('citynews.audit_ctx', v_batch_ctx::text, true);
      if p_action = 'pause' then
        if v_row.status not in ('active', 'degraded') then
          raise exception 'já não está ativa';
        end if;
        update sources set status = 'paused', status_reason = 'manual', consecutive_failures = 0
          where id = v_id and version = v_row.version;
      elsif p_action = 'activate' then
        if v_row.status <> 'paused' or v_row.archived_at is not null then
          raise exception 'não está pausada';
        end if;
        update sources set status = 'active', status_reason = null, consecutive_failures = 0
          where id = v_id and version = v_row.version;
      elsif p_action = 'frequency' then
        update sources set frequency_minutes = nullif(p_value->>'frequencyMinutes', '')::int
          where id = v_id and version = v_row.version;
      else
        raise exception 'ação % desconhecida', p_action;
      end if;
      v_result := v_result || jsonb_build_object('id', v_id, 'ok', true);
    exception when others then
      v_result := v_result || jsonb_build_object('id', v_id, 'ok', false, 'reason', sqlerrm);
    end;
  end loop;
  return v_result;
end
$$;

-- Padrão global e vagas da via rápida (§7.7); audita como `settings.update`.
create or replace function public.app_setting_set(p_key text, p_value jsonb, p_ctx jsonb default '{}'::jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old jsonb;
begin
  if p_key not in ('sources.default_frequency_minutes', 'sources.fast_lane_max') then
    raise exception 'chave % não suportada', p_key using errcode = '22023';
  end if;
  select value into v_old from app_settings where key = p_key;
  insert into app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into audit_log (actor, action, object_ref, details)
  values (coalesce(auth.uid()::text, 'sistema'), 'settings.update', 'setting:' || p_key,
          jsonb_build_object('from', v_old, 'to', p_value, 'reason', coalesce(p_ctx, '{}'::jsonb)->>'reason'));
end
$$;

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
-- 8. Views e grants (D-F19)
-- ---------------------------------------------------------------------------
revoke delete on sources from authenticated;

create or replace view public_sources as
  select s.id, s.slug, coalesce(s.display_name, s.name) as name, s.base_url, s.kind, s.categories, s.locality,
         s.reliability, s.image_policy, s.republish_policy, s.status, s.logo_path, s.rec_pinned,
         s.rec_local_highlight, s.rec_excluded, s.last_fetched_at
  from sources s
  where s.status <> 'blocked' and s.archived_at is null;

create or replace view public_aggregated as
  select ci.id, ci.source_id, s.slug as source_slug, coalesce(s.display_name, s.name) as source_name,
         ci.canonical_url, ci.original_title, ci.published_at, ci.section_slug, ci.locality, ci.topic_id,
         case when s.republish_policy = 'summary_2_sentences' then ci.summary end as summary,
         case when s.image_policy <> 'none' then ci.image_url end as image_url,
         s.image_policy, s.editorial_score as source_editorial_score
  from collected_items ci
  join sources s on s.id = ci.source_id
  where ci.duplicate_of is null and ci.quarantined_at is null and s.status <> 'blocked';

grant select on public_sources, public_aggregated to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Agente de IA `source_profiler` (D-F11, D-F12, D-F26)
-- ---------------------------------------------------------------------------
insert into ai_agents (id, function, model_id, fallback_model_id, prompt_version, daily_budget_brl) values
 ('source_profiler', 'Sugere editorias, localidade, alertas de qualidade e seletores de página para uma fonte nova',
  'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 1)
on conflict (id) do nothing;
-- Redistribuição do teto global de R$ 30/dia (A-006): write cede R$ 1 ao novo agente.
update ai_agents set daily_budget_brl = 10 where id = 'write';

insert into ai_prompts (agent_id, version, body, rationale, author_id, status) values
 ('source_profiler', 1,
  'Você analisa uma fonte de notícias nova para o CityNews, portal de Cuiabá e Várzea Grande, usando só metadados (títulos, datas, host, og:site_name, meta description e esqueleto de página, nunca corpo de matéria). Sugira editorias entre as existentes, a localidade (cuiaba, varzea-grande, mt ou nacional), alertas de qualidade (caça-clique, agregador de terceiros, paywall, pouca relevância local, conteúdo patrocinado, itens sem data) e, quando pedido, seletores CSS de uma lista de matérias. Nunca sugira política de imagem, política de republicação, confiabilidade, fonte única ou frequência de coleta: essas decisões são humanas.',
  'v1 do plano Painel de Fontes (migration 0011); FS-T4 reusa este texto em src/lib/ai/schemas/source-profile.ts',
  '00000000-0000-0000-0000-000000000000', 'production')
on conflict (agent_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- 10. Storage (D-F25) e flag (D-F1, riscos)
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public) values ('source-logos', 'source-logos', true)
             on conflict (id) do update set public = true$q$;
  end if;
end $$;

insert into feature_flags (key, enabled) values ('source_link_analysis', true) on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Agendamento: recria `schedule_pipeline_cron()` com o job `ingest-fast-tick` (§7.8.4)
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

  execute format('select cron.schedule(%L, %L, %L)', 'ingest-tick', '*/30 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);

  -- Tick rápido a cada 10 min, só para o `fetch` das fontes da via rápida (§7.8).
  execute format('select cron.schedule(%L, %L, %L)', 'ingest-fast-tick', '*/10 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/fast-tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $cmd$);

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
-- Só o console (postgres) e o servidor (service_role, para o teste de integração e um eventual
-- botão de operação) chamam; nunca exposta a anon/authenticated via API.
revoke execute on function schedule_pipeline_cron() from public, anon, authenticated;
grant execute on function schedule_pipeline_cron() to service_role;

select schedule_pipeline_cron();
