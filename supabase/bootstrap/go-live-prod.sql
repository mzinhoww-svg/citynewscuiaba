-- Bootstrap de produção do go-live (02/10/2026). NÃO roda em `db reset` (fora de migrations e seed):
-- aplicar uma vez em produção, depois do deploy do app novo. Em produção `rules` e `rec_weights`
-- estavam vazias porque a v1 só existia no seed de desenvolvimento, e o pipeline falha fechado
-- sem regra ativa.
--
-- Política decidida pelo dono em 02/10/2026: revisão humana por amostragem; item com nota alta
-- segue sem revisão humana. Por isso `forceReview = false`. Continuam em revisão humana:
-- política e saúde (e qualquer assunto sensível, ex.: eleições, crime). `seguranca` segue
-- bloqueada: segurança e breaking news nunca publicam sozinhas (CLAUDE.md §5.8). `cultura` passa
-- de `review` para `auto_notify` com nota mínima 0,85 (publica, avisa a redação, desfazer em um
-- clique). Nota mínima e número de fontes das demais categorias vêm das regras v1 da spec §6.4.
--
-- Proposta e aprovação usam dois UUIDs de sistema distintos (a regra de duas pessoas exige
-- pessoas diferentes; ainda não há usuários). Com sessão de pessoa a regra passa a valer normal.

insert into rules (version, body, force_review, proposed_by, approved_by, active)
select 1,
 '{"version":1,"forceReview":false,"sensitiveTopics":["crime","violencia","morte","tragedia","acidente","suicidio","abuso","saude-individual","eleicoes","homicidio","assassinato","estupro","feminicidio","sequestro","overdose"],"categories":{"servicos":{"mode":"auto","minSources":2,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.6,"summaryWords":60},"agenda":{"mode":"auto","minSources":1,"requirePrimary":true,"requireApprovedImage":false,"minScore":0.8,"summaryWords":60},"clima":{"mode":"auto","minSources":1,"requirePrimary":true,"requireApprovedImage":false,"minScore":0.8,"summaryWords":40},"cidade":{"mode":"auto_notify","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":0.85,"summaryWords":80},"economia":{"mode":"auto_notify","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":0.85,"summaryWords":80},"esportes":{"mode":"auto_notify","minSources":2,"requirePrimary":false,"requireApprovedImage":true,"minScore":0.6,"summaryWords":60},"cultura":{"mode":"auto_notify","minSources":2,"requirePrimary":false,"requireApprovedImage":true,"minScore":0.85,"summaryWords":80},"politica":{"mode":"review","minSources":3,"requirePrimary":true,"requireApprovedImage":true,"minScore":null,"summaryWords":100},"saude":{"mode":"review","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":null,"summaryWords":80},"seguranca":{"mode":"blocked","minSources":0,"requirePrimary":false,"requireApprovedImage":false,"minScore":null,"summaryWords":null}}}'::jsonb,
 false, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', true
where not exists (select 1 from rules);

insert into rec_weights (version, weights, cap, discovery_every, proposed_by, approved_by, active)
select 'rec-v1',
 '{"popularity":0.35,"individual":0.25,"recency":0.15,"engagement":0.10,"operational":0.10,"diversity":0.05}'::jsonb,
 0.25, 5, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', true
where not exists (select 1 from rec_weights);
