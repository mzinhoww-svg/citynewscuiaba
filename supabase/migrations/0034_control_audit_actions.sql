-- Integração P5-T3/P5-T6 × Painel de Fontes: lista fechada de auditoria (src/lib/audit/actions.ts).
--
-- `studio_audit_actions()` é redefinida por inteiro a cada migration que acrescenta ações (0025,
-- 0026, 0033). A 0033 (painel, já em produção) não conhece as ações do Control Center e as de
-- avaliação da IA; a 0027/0028 (P5, ainda não aplicadas) não conhecem as do painel. Como
-- produção aplica 0033 antes de 0027/0028 e a base local aplica em ordem numérica, a união fica
-- numa migration posterior às duas. `tests/integration/studio-audit.test.ts` confere banco × código.
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
    -- Painel de fontes (0033)
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update',
    -- Control Center (P5-T3) e governança da IA (P5-T6)
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case'
  ]::text[]
$$;
