-- Painel de Fontes: correções da revisão final do merge (docs/reports/painel-fontes-final-review.md).
-- Bloco 0030–0039 (Ruling R7). Aditiva e reexecutável: `create or replace`, `if not exists` e
-- blocos `do` com verificação. Nenhum `raise` da classe 40001.
--
-- 1. `studio_audit_actions()` com as ações do painel e `source.approve_critical` (I-1).
-- 2. `slug`/`created_by` imutáveis por pessoa; arquivar e bloquear exigem motivo (I-3, I-5).
-- 3. Aprovação `source.critical` aprovada expira em 24 h se não for aplicada (I-4):
--    `approvals.decided_at` preenchido pelo trigger na decisão.
-- 4. `editor` lê `source_health_daily` (spec §6.3, M-1).
-- 5. `rate_limit_per_hour` entre 1 e 120 no banco (M-4).
-- 6. `source_fetch_outcomes.source_id` com `on delete cascade` (FS-T5 N2).

-- ---------------------------------------------------------------------------
-- 1. Ações auditadas (src/lib/audit/actions.ts; tests/integration/studio-audit.test.ts confere
--    as duas listas nos dois sentidos).
-- ---------------------------------------------------------------------------
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- permissões (ACTIONS)
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'source.approve_critical', 'rules.propose', 'rules.approve', 'prompt.publish',
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view',
    -- Estúdio (P4)
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    -- Painel de fontes (triggers `audit_source_changes`/`app_setting_set` e Server Actions)
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- 2/3. Aprovações: `decided_at` na decisão; consumo só de aprovação recente.
-- ---------------------------------------------------------------------------
alter table public.approvals add column if not exists decided_at timestamptz;

-- Mesma regra de 0002 (`guard_approvals`), mais `decided_at`: preenchido aqui, na saída de
-- `pending`, para qualquer caminho (inclusive service_role), e fora da checagem de imutabilidade.
create or replace function public.guard_approvals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
begin
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status is distinct from old.status then
    new.decided_at := now();
  end if;
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.requested_by is distinct from uid then
      perform two_person_error('approvals: requested_by deve ser quem pede');
    end if;
    if new.approved_by is not null or new.status <> 'pending' then
      perform two_person_error('approvals: pedido nasce pendente e sem aprovador');
    end if;
    new.decided_at := null;
    return new;
  end if;

  if (to_jsonb(new) - '{approved_by,status,decided_at}'::text[]) is distinct from (to_jsonb(old) - '{approved_by,status,decided_at}'::text[]) then
    perform two_person_error('approvals: pedido é imutável (tipo, alvo, solicitante, justificativa)');
  end if;
  if new.status is not distinct from old.status and new.approved_by is not distinct from old.approved_by then
    new.decided_at := old.decided_at;
    return new;
  end if;
  if old.status <> 'pending' then
    perform two_person_error('approvals: decisão já tomada é final');
  end if;
  if new.status not in ('approved', 'rejected') then
    perform two_person_error('approvals: decisão é approved ou rejected');
  end if;
  if new.approved_by is distinct from uid then
    perform two_person_error('approvals: decisão só em nome próprio');
  end if;
  if uid = old.requested_by then
    perform two_person_error('approvals: quem pede não decide');
  end if;
  return new;
end
$$;

-- Aprovação aprovada e não aplicada expira (I-4, spec §7.5.5): só conta se decidida há menos de
-- 24 h (`created_at` para linhas anteriores a esta migration, sem `decided_at`).
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
    and coalesce(a.decided_at, a.created_at) > now() - interval '24 hours'
  order by coalesce(a.decided_at, a.created_at) desc
  limit 1
  for update;
  if hit is null then
    return null;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return hit;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. `guard_source_changes` (0011) + slug/created_by imutáveis por pessoa + motivos obrigatórios.
-- ---------------------------------------------------------------------------
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
  v_op text[] := public.source_operational_columns();
  v_content_changed boolean;
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
      -- Duas pessoas vale também na criação (D-F3/D-F5, Review Focus 2): sem isto, uma pessoa
      -- só cria já com os quatro campos críticos afrouxados e ativa sem segunda aprovação. Nasce
      -- sempre no padrão restrito; quem quiser mais do que isso pede pelo fluxo de atualização,
      -- que já exige aprovação de outra pessoa.
      if new.image_policy <> 'none' or new.republish_policy <> 'link_only'
         or new.reliability in ('verified', 'primary') or new.may_be_sole_source then
        perform public.two_person_error(
          'Fonte nova só nasce com direitos restritos (imagem nenhuma, só link, confiabilidade '
          || 'padrão, sem fonte única); mudanças críticas exigem aprovação de outra pessoa depois de criada.'
        );
      end if;
    end if;
    return new;
  end if;

  -- Identidade da fonte não muda por nenhuma pessoa (achado I-3 da revisão final): `slug` é chave
  -- de fila (`source:<slug>`), de `public_sources` e de URL, e `created_by` é histórico. Os dois
  -- estão em `source_operational_columns()` (sem auditoria nem versão), então o bloqueio é aqui.
  -- service_role/postgres (console, migrations) continuam podendo corrigir.
  if uid is not null then
    if new.slug is distinct from old.slug then
      raise exception 'O identificador (slug) da fonte não pode ser alterado.' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by da fonte não pode ser alterado.' using errcode = '42501';
    end if;
  end if;

  -- Motivo obrigatório vale no banco, para qualquer caminho (spec §7.3/§9, D-F5; achado I-5):
  -- arquivar exige `archive_reason`; bloquear exige um dos motivos de bloqueio em `status_reason`.
  if old.archived_at is null and new.archived_at is not null
     and coalesce(btrim(new.archive_reason), '') = '' then
    raise exception 'Arquivar exige um motivo.' using errcode = '42501';
  end if;
  if new.status = 'blocked' and old.status is distinct from 'blocked'
     and coalesce(new.status_reason, '') not in ('opt_out', 'legal', 'quality', 'other') then
    raise exception 'Bloquear exige um motivo: opt_out, legal, quality ou other.' using errcode = '42501';
  end if;

  -- Fonte arquivada só aceita restaurar (voltar archived_at para null); qualquer outra mudança
  -- enquanto continua arquivada é recusada (mesmo por service_role/postgres: histórico intacto).
  if old.archived_at is not null and new.archived_at is not null
     and (to_jsonb(new) - '{updated_at,version}'::text[]) is distinct from (to_jsonb(old) - '{updated_at,version}'::text[]) then
    raise exception 'fonte arquivada só aceita restaurar' using errcode = '42501';
  end if;

  -- Arquivar uma fonte da via rápida libera a vaga (§7.8.2): vale para qualquer caminho, direto
  -- no trigger (achado da revisão FS-T1; antes só `source_admin_status` fazia isto).
  if old.archived_at is null and new.archived_at is not null
     and new.frequency_minutes is not null and new.frequency_minutes < 30 then
    new.frequency_minutes := null;
  end if;

  -- Transições de status válidas (spec §6.4/§7.3), para qualquer caminho. Ativar (paused →
  -- active) exige termos revisados; o resto (robots.txt, testConnection) é checado pela aplicação
  -- antes de chamar a RPC, o banco não tem como testar conexão.
  if new.status is distinct from old.status then
    if not (
      (old.status = 'paused' and new.status in ('active', 'blocked'))
      or (old.status = 'active' and new.status in ('degraded', 'paused', 'blocked'))
      or (old.status = 'degraded' and new.status in ('active', 'paused', 'blocked'))
      or (old.status = 'blocked' and new.status = 'paused')
    ) then
      raise exception 'transição de status % → % não é permitida', old.status, new.status using errcode = '42501';
    end if;
    if old.status = 'paused' and new.status = 'active' and new.terms_reviewed_at is null then
      raise exception 'Ativar exige termos de uso revisados.' using errcode = '42501';
    end if;
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
    v_fast_max := public.lock_fast_lane_max();
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

  -- Versão otimista e `updated_at` só sobem quando algo que a tela mostra realmente mudou
  -- (achado da revisão FS-T1): um `claim_source_fetch` ou uma atualização só de
  -- `last_fetched_at`/`etag`/contadores nunca deve invalidar a versão de quem está editando.
  v_content_changed := (to_jsonb(new) - v_op) is distinct from (to_jsonb(old) - v_op);
  if v_content_changed then
    new.version := old.version + 1;
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := uid;
    end if;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. `source_health_daily`: `source.manage` e `metrics.view` (spec §6.3); `metrics.view` inclui editor.
-- ---------------------------------------------------------------------------
drop policy if exists source_health_daily_read on public.source_health_daily;
create policy source_health_daily_read on public.source_health_daily for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,editor,analista,leitura}'));

-- ---------------------------------------------------------------------------
-- 5. `rate_limit_per_hour` entre 1 e 120 (mesmo limite do zod de `sourceConfigSchema`).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sources_rate_limit_per_hour_check' and conrelid = 'public.sources'::regclass
  ) then
    update public.sources set rate_limit_per_hour = least(greatest(rate_limit_per_hour, 1), 120)
     where rate_limit_per_hour < 1 or rate_limit_per_hour > 120;
    alter table public.sources
      add constraint sources_rate_limit_per_hour_check check (rate_limit_per_hour between 1 and 120);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. `source_fetch_outcomes` segue a fonte (FS-T5 N2).
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.source_fetch_outcomes'::regclass and contype = 'f' and confdeltype <> 'c';
  if v_name is not null then
    execute format('alter table public.source_fetch_outcomes drop constraint %I', v_name);
    alter table public.source_fetch_outcomes
      add constraint source_fetch_outcomes_source_id_fkey
      foreign key (source_id) references public.sources(id) on delete cascade;
  end if;
end
$$;
