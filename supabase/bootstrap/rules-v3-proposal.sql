-- Proposta INATIVA das regras v3 de autonomia alta (AUT-T1). NÃO roda em `db reset` (fora de
-- migrations e seed). Aplicar em produção só depois das migrations 0070 a 0073 e do deploy do app
-- novo. Pré-aprovada pelo dono (rodada 3, v3), mas a ATIVAÇÃO continua com duas pessoas: este
-- script cria a versão com `active = false` e `approved_by = null`, e abre o pedido
-- `safety.disable` (a v3 tira `neverAuto`, breaking e sensível, e zera `sensitiveTopics`) para o
-- dono aprovar no painel de governança (aprovador diferente do proponente de sistema).
--
-- Conteúdo: score mínimo 0,30; `minSources` 1; `requirePrimary` e `requireApprovedImage` falsos;
-- modo `auto` em todas as editorias, segurança incluída; `forceReview` falso; `sensitiveTopics`
-- vazia; `neverAuto` vazio; breaking e sensível deixam de ser portão (A1 a A8). Idempotente: uma
-- única proposta v3 (marcada em `body.proposal`). O JSON espelha `RULES_V3` em
-- `src/lib/rules/defaults.ts` (teste `rules-v3-proposal.test.ts` confere os dois).

with next as (
  select coalesce(max(version), 0) + 1 as version from rules
), ins as (
  insert into rules (version, body, force_review, proposed_by, approved_by, active)
  select n.version,
         '{"forceReview":false,"neverAuto":[],"breakingReview":false,"sensitiveFlagReview":false,"sensitiveTopics":[],"categories":{"servicos":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"agenda":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"clima":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":40},"cidade":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"economia":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"esportes":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":60},"cultura":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"politica":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":100},"saude":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80},"seguranca":{"mode":"auto","minSources":1,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.3,"summaryWords":80}}}'::jsonb
           || jsonb_build_object('version', n.version, 'proposal', 'aut-v3'),
         false, '00000000-0000-4000-8000-0000000000a1', null, false
    from next n
   where not exists (select 1 from rules where body ->> 'proposal' = 'aut-v3')
  returning version
)
insert into approvals (kind, target_ref, requested_by, justification, status)
select 'safety.disable', 'rules:' || ins.version, '00000000-0000-4000-8000-0000000000a1',
       'Regras v3 de autonomia alta, pré-aprovadas pelo dono (spec 2026-10-03, A1 a A16). Ativar libera segurança, política, saúde, sensível e urgente local para publicação automática, com score mínimo 0,30.',
       'pending'
  from ins;
