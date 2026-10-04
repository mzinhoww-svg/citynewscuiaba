# Matriz normativa de publicação

Fonte: CLAUDE.md regra 8 (main `e30f542`), DECISIONS A-110, A-125, A-126, A-128, código
`src/lib/rules/index.ts` (`decidePublication`) e o estado de produção lido em 04/10/2026 ~13h40 UTC.

## Estado real em produção

| Item | Valor | Fonte |
|---|---|---|
| Regras ativas | v3 (`proposal: aut-v3`), aprovada, `force_review = false`, `neverAuto = []`, `minScore` 0,3 por categoria, `minSources` 1 | tabela `rules` |
| `auto_publish` | **desligado** | `feature_flags` (desde o disparo do disjuntor às 04h45 UTC) |
| Disjuntor | **60/h e 800/dia**, disparado às 04h45 UTC (motivo `hourly`, 100 na hora) | `publish_breaker` |
| Limites do dono | 300/h e 3.000/dia (A-126) | CLAUDE.md regra 8; padrão da tabela já 300/3000 (0146) |
| `read_only` | desligado | `feature_flags` |
| Publicação forçada | grava versão `ai`; decisão humana em `decisions.human_decision = 'forced_publish'` | 0146 aplicada |
| Reescrita no ar | `save_pipeline_draft(live)` só em matéria `auto` nunca editada por pessoa | 0147 aplicada |

## Ordem dos portões (`decidePublication`, regras v3)

`invalid_input` → `breaking` (só se a regra mantém `breakingReview`; v3 não mantém) → tema sensível
(`sensitiveTopics` / flag `sensitive` só se a regra liga) → `forceReview` → `neverAuto` →
`unknown_category` → `blocked` → `conflict` (fontes divergentes) → `dubious` → fonte não confiável
com assunto grave e sem segunda fonte → `min_sources` / `primary` → `image` → `min_score` (< 0,30)
→ modo da categoria.

| Situação | Regras v3 (ativas) | Regras antigas (sem `neverAuto` no corpo) |
|---|---|---|
| Segurança, política, saúde, tema sensível, urgente local | publica sozinho, com "Com informações de {fonte}" | segurança e breaking vão para revisão |
| Fontes divergentes confirmadas | revisão | revisão |
| `dubious` | revisão | revisão |
| Rascunho sem IA (`ai_fallback`) | revisão (nunca publica sozinho; B-015) | revisão |
| `read_only` ligado ou `auto_publish` desligado | revisão | revisão |
| Fonte não confiável + assunto grave + uma fonte só | revisão | revisão |
| Score < 0,30 | revisão | revisão (limite da versão) |
| Disjuntor (300/h ou 3.000/dia pelos limites do dono) | pausa a publicação automática | idem |

## Quem religa e quem muda

| Ação | Quem | Segunda pessoa | Decisão |
|---|---|---|---|
| Religar `auto_publish` | admin, direto (Contingência ou Interruptores), zera o disjuntor, auditado `flag.set` | não | A-125 (0145 aplicada) |
| Mudar limites do disjuntor | admin (`publish_breaker_set_limits`) | não | A-110 / A-126 |
| Alterar regras de publicação | admin ou editor-chefe pede, aprova e aplica numa ação | não | A-128 (0149 aplicada) |
| Afrouxar Segurança das regras (`safety.disable`) | só admin | não | A-128 |
| Publicação forçada da fila | `article.publish` | não | A-113 / A-126 |

## Divergências encontradas

1. Produção roda com o disjuntor em 60/800, não nos 300/3.000 do dono: a recuperação A-126 nunca
   rodou (L-009). Script v2 pronto: `scripts/ops/recuperar-materias-v2.sql`.
2. `auto_publish` desligado desde 04h45: tudo o que as regras mandariam publicar vai para a fila de
   revisão (671 em `in_review`). Religar é ação do admin (L-010), depois da recuperação.
3. Spec mestre §8 ainda descreve duas pessoas para mudar regras (L-011).
4. Caminho direto `update rules` permite aprovar a própria versão sem linha em `approvals` e sem a
   exigência "só admin" para afrouxar segurança (L-012).
