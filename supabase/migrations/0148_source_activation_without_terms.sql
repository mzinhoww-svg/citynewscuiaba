-- A-127 · Decisão do dono (04/10/2026): o banco não recusa mais ativar fonte sem termos de uso
-- revisados. A recuperação A-126 parou em produção com "Ativar exige termos de uso revisados." e o
-- dono pediu para tirar a recusa. Esta migration recria `guard_source_changes` (0033) igual, menos
-- esse bloqueio. Seguem valendo: transições de status permitidas, motivo para arquivar e bloquear,
-- via rápida, duas pessoas nos campos críticos e o respeito a robots.txt e limites na coleta.

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

  -- Transições de status válidas (spec §6.4/§7.3), para qualquer caminho. Termos revisados,
  -- robots.txt e testConnection ficam com a aplicação (A-127: o banco não recusa mais ativar sem
  -- termos revisados).
  if new.status is distinct from old.status then
    if not (
      (old.status = 'paused' and new.status in ('active', 'blocked'))
      or (old.status = 'active' and new.status in ('degraded', 'paused', 'blocked'))
      or (old.status = 'degraded' and new.status in ('active', 'paused', 'blocked'))
      or (old.status = 'blocked' and new.status = 'paused')
    ) then
      raise exception 'transição de status % → % não é permitida', old.status, new.status using errcode = '42501';
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
