-- Proposta INATIVA das regras v4: níveis de risco editorial (D-05, decisão do dono de 04/10/2026).
-- NÃO roda em `db reset` (fora de migrations e seed). A v4 é a v3 com `riskLevels: true`:
-- divergência secundária entre fontes deixa de segurar a publicação (o texto atribui as versões),
-- e divergência sobre fato central em assunto grave (segurança, acusação a pessoa, saúde
-- individual) vai para revisão (nível 3). Duvidoso, fonte não confiável com assunto grave sem
-- segunda fonte e score < 0,30 continuam em revisão; rascunho sem IA continua fora (nível 4).
--
-- Ativação: aplicar a migration 0151 e o deploy do app antes; rodar este script; no painel de
-- governança, conferir a simulação de 7 dias e aprovar e aplicar o pedido (uma pessoa, A-128).
-- Rollback: `rules_rollback()` volta para a v3 ativa antes (a v4 afrouxa só o portão de
-- conflito; voltar restringe e é aceito). Idempotente: uma única proposta (`body.proposal`).
-- O JSON espelha `RULES_V4` em `src/lib/rules/defaults.ts` (teste `v4.test.ts` confere).

with next as (
  select coalesce(max(version), 0) + 1 as version from rules
), ins as (
  insert into rules (version, body, force_review, proposed_by, approved_by, active)
  select n.version,
         '{"forceReview":false,"riskLevels":true,"neverAuto":[],"breakingReview":false,"sensitiveFlagReview":false,"sensitiveTopics":[],"categories":{"servicos":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"agenda":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"clima":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":40},"cidade":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"economia":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"esportes":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"cultura":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"politica":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":100},"saude":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"seguranca":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80}}}'::jsonb
           || jsonb_build_object('version', n.version, 'proposal', 'aut-v4'),
         false, '00000000-0000-4000-8000-0000000000a1', null, false
    from next n
   where not exists (select 1 from rules where body ->> 'proposal' = 'aut-v4')
  returning version
)
insert into approvals (kind, target_ref, requested_by, justification, status)
select 'safety.disable', 'rules:' || ins.version, '00000000-0000-4000-8000-0000000000a1',
       'Regras v4 (D-05): níveis de risco. Divergência secundária publica com as versões atribuídas; divergência central em assunto grave vai para revisão. Demais portões da v3 mantidos.',
       'pending'
  from ins;
