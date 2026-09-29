-- 0045 · União de `studio_audit_actions()` com TODOS os nomes atuais (PWA, PW-T15).
-- A função é redefinida por inteiro a cada migration que acrescenta ações (0025, 0026, 0033,
-- 0034, 0038, 0039, 0041). A 0041 (push) nasceu antes de 0038/0039 (administração) serem
-- mescladas e, aplicada depois delas, apagava os nomes de P5-T8/T9. Esta migration fecha a
-- lista: base de 0039 + push (permissões e trigger `audit_push_changes`). Espelho em
-- `src/lib/audit/actions.ts` (teste de integração confere os dois sentidos).
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
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view', 'site.manage',
    'push.request', 'push.approve', 'push.settings', 'push.metrics',
    -- Estúdio (P4)
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    -- Painel de fontes (0033)
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update',
    -- Control Center (P5-T3) e governança da IA (P5-T6)
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case',
    -- Aprovações (P5-T1)
    'approval.requested', 'approval.approved', 'approval.rejected', 'approval.applied',
    -- Contingência (P5-T10)
    'flag.set', 'rules.rollback',
    -- Agentes, modelos, prompts e playground (P5-T5, 0036)
    'prompt.create', 'prompt.request', 'prompt.rollback', 'ai.playground.run',
    'ai.agent.update', 'ai.model.update',
    -- Recomendação (P5-T7, 0037)
    'rec.weights.activate', 'rec.campaign.create', 'rec.experiment.create', 'rec.experiment.end',
    'rec.experiment.promote', 'rec.explain',
    -- Administração (P5-T8)
    'user.invite', 'user.role.grant', 'user.role.revoke', 'team.save', 'team.delete',
    'taxonomy.save', 'taxonomy.merge', 'home.save', 'home.publish',
    -- Administração (P5-T9)
    'ads.campaign.save', 'ads.campaign.delete', 'seo.redirect.save', 'seo.redirect.delete',
    'audit.export', 'privacy.request.save', 'security.key.rotate',
    -- Push (0041: trigger audit_push_changes, pausa e retomada)
    'push.reject', 'push.cancel', 'push.dispatch', 'push.finish', 'push.pause', 'push.expire',
    'push.resume_requested', 'push.resume_applied'
  ]::text[]
$$;

-- `app_setting_set` por prefixo: união de 0039 (SEO, publicidade, segurança) com 0041 (push).
-- A 0041 redefinia a função sem as chaves da administração; aqui ficam todas.
create or replace function public.app_setting_set(
  p_key text, p_value jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_person boolean := coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated');
begin
  if p_key = 'push.paused' then
    raise exception 'push.paused só muda por pausar/retomar envios' using errcode = '22023';
  end if;
  if p_key in ('sources.default_frequency_minutes', 'sources.fast_lane_max') then
    if v_person and not has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia}') then
      raise exception 'sem permissão para gerenciar fontes (source.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('seo.title_template', 'ads.max_per_page') then
    if v_person and not has_any_role(auth.uid(), '{admin,editor_chefe}') then
      raise exception 'sem permissão para administrar o site (site.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('security.session_hours', 'security.retention_days', 'security.require_2fa') then
    if v_person and not has_role(auth.uid(), 'admin') then
      raise exception 'sem permissão (users.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('push.default_daily_limit', 'push.quiet_start', 'push.quiet_end', 'push.templates') then
    if v_person and not push_can(auth.uid(), 'push.settings') then
      raise exception 'sem permissão para configurar avisos (push.settings)' using errcode = '42501';
    end if;
  else
    raise exception 'chave % não suportada', p_key using errcode = '22023';
  end if;
  select value into v_old from app_settings where key = p_key;
  insert into app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into audit_log (actor, action, object_ref, details, ip_hash)
  values (coalesce(auth.uid()::text, 'sistema'), 'settings.update', 'setting:' || p_key,
          jsonb_build_object('from', v_old, 'to', p_value, 'reason', coalesce(p_ctx, '{}'::jsonb)->>'reason'),
          p_ip_hash);
end
$$;

-- `guard_app_settings`: união de 0039 (SEO, segurança, publicidade) com 0041 (push). Mesma
-- razão: a 0041 redefinia o trigger sem as chaves da administração.
create or replace function public.guard_app_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  t jsonb;
  n numeric;
  v_txt text;
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
  elsif new.key = 'seo.title_template' then
    if jsonb_typeof(new.value) <> 'string' or position('{title}' in (new.value #>> '{}')) = 0
       or length(new.value #>> '{}') > 120 then
      raise exception 'seo.title_template deve ser um texto de até 120 caracteres com {title}' using errcode = '23514';
    end if;
  elsif new.key in ('security.session_hours', 'security.retention_days', 'ads.max_per_page') then
    if jsonb_typeof(new.value) <> 'number' then
      raise exception '% deve ser um número inteiro', new.key using errcode = '23514';
    end if;
    n := (new.value)::text::numeric;
    if n <> floor(n)
       or (new.key = 'security.session_hours' and n not between 1 and 720)
       or (new.key = 'security.retention_days' and n not between 30 and 3650)
       or (new.key = 'ads.max_per_page' and n not between 0 and 3) then
      raise exception '% fora da faixa permitida', new.key using errcode = '23514';
    end if;
  elsif new.key = 'security.require_2fa' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'security.require_2fa deve ser verdadeiro ou falso' using errcode = '23514';
    end if;
  elsif new.key = 'push.default_daily_limit' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric not in (1, 2, 3) then
      raise exception 'push.default_daily_limit deve ser 1, 2 ou 3' using errcode = '23514';
    end if;
  elsif new.key = 'push.quiet_start' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 18 and 22 then
      raise exception 'push.quiet_start deve ser uma hora entre 18 e 22 (o silêncio sempre contém 22h–7h)' using errcode = '23514';
    end if;
  elsif new.key = 'push.quiet_end' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 7 and 10 then
      raise exception 'push.quiet_end deve ser uma hora entre 7 e 10 (o silêncio sempre contém 22h–7h)' using errcode = '23514';
    end if;
  elsif new.key = 'push.templates' then
    if jsonb_typeof(new.value) <> 'array' or jsonb_array_length(new.value) > 20 then
      raise exception 'push.templates deve ser uma lista com até 20 modelos' using errcode = '23514';
    end if;
    for t in select * from jsonb_array_elements(new.value) loop
      if jsonb_typeof(t) <> 'object'
         or coalesce(length(t->>'name'), 0) not between 1 and 60
         or coalesce(length(t->>'title'), 0) not between 1 and 60
         or coalesce(length(t->>'body'), 0) not between 1 and 120 then
        raise exception 'modelo de push precisa de nome (≤ 60), título (≤ 60) e texto (≤ 120)' using errcode = '23514';
      end if;
      v_txt := replace(replace((t->>'title') || ' ' || (t->>'body'), '{titulo}', ''), '{linha_fina}', '');
      if v_txt like '%{%' or v_txt like '%}%' then
        raise exception 'modelo de push só aceita {titulo} e {linha_fina}' using errcode = '23514';
      end if;
    end loop;
  elsif new.key = 'push.paused' then
    if jsonb_typeof(new.value) <> 'object' or jsonb_typeof(new.value->'on') <> 'boolean' then
      raise exception 'push.paused deve ser um objeto com "on" booleano' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
