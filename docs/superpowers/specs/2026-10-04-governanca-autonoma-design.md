# Governança autônoma e motor de decisão de IA (A-142, A-143)

**Data:** 04/10/2026 · **Autor:** Claude Code · **Decisão do dono:** "AUTONOMY FIRST, HUMAN EXCEPTION SECOND"
**Complementa:** A-125 (religar sem segunda pessoa), A-127 (ativar fonte sem termos revisados), A-128 (uma pessoa pede, aprova e aplica; 0149).
**Migrations:** `0157_autonomous_governance.sql`, `0158_autonomy_engine.sql`.

## 1. Modelo

```
PEDIDO → MOTOR DE POLÍTICA → VALIDAÇÃO → APLICAÇÃO → AUDITORIA     (padrão)
PEDIDO → MOTOR DE POLÍTICA → EXCEÇÃO HUMANA (com prazo)              (só o que o sistema não resolve)
```

Saídas da política (`src/lib/governance/policy.ts`, `evaluateGovernance`):

| Saída | Quando | Efeito |
|---|---|---|
| `auto_apply` | seguro pela política e quem pede tem o papel | aprovação pelo sistema (`approvals.decision_mode = 'system'`) e aplicação na mesma ação |
| `auto_review` | precisa de nova checagem automática (ex.: fonte fora do ar) | nova tentativa, sem pessoa |
| `human_exception` | o sistema não resolve com segurança (ex.: afrouxar segurança sem ser admin; sem o papel) | pedido pendente **com prazo** (`expires_at`) e próxima ação |
| `rejected` | inválido ou inseguro | recusado na hora, sem pedido; o estado em vigor continua |

Nunca existe "aguardando aprovação" como padrão. Todo pedido pendente nasce com prazo (72 h; 60 min para push urgente) e a varredura (`governance_sweep`, 15 min) o leva a `expired`, estado terminal, registrado na trilha.

## 2. Aprovação pelo sistema e trilha

Cada decisão automática vai para `governance_decisions` (somente-inserção, sem chave estrangeira para sobreviver ao pedido apagado) com `actor = system`, `decision`, `policy`, `policy_version`, `rule_id`, `inputs`, `input_hash` (sha256), `confidence`, `reason`, `model`, `prompt`, `fallback_level`, `approval_id` e data. O audit_log recebe `governance.<decisão>`. A política é versionada em `governance_policies` (v1 ativa).

## 3. Matriz da auditoria (guardas de duas pessoas)

| Objeto | Antes | Agora | Classe |
|---|---|---|---|
| CHECK `approved_by <> requested_by/proposed_by` (0001) | proibia autoaprovação | removido (0149) | REMOVE |
| `guard_proposal` (regras, pesos) | "quem propõe não aprova" | papel, nome próprio, imutável depois de aprovado (0149) | REPLACE WITH SYSTEM RULE |
| `guard_approvals` | "quem pede não decide" | decisão em nome próprio e final; colunas da política só pelo sistema (0149, 0157) | REPLACE WITH SYSTEM RULE |
| `guard_ai_prompts`, `prompt_publish` | 2ª assinatura de outra pessoa | checagens de segurança do motor (tamanho, instrução contra a regra 6, regressão quando houver) e assinatura de quem tem o papel | REPLACE WITH AUTO-APPROVAL |
| `rec_weights_activate`, RLS `approvals_decide` | 2ª pessoa (admin) | validar → simular → ativar → auditar; mudança brusca (L1 > 0,6) recusada; operador de IA decide | REPLACE WITH AUTO-APPROVAL |
| `approval_apply`, `rules_rollback` | outra pessoa; rollback que afrouxa recusado | regras válidas aplicam na hora; afrouxar segurança é ação do admin | REPLACE WITH SYSTEM RULE / KEEP AS HUMAN EXCEPTION (só sem papel de admin) |
| `consume_role_admin_ref`, `guard_user_roles` | pedido `role.admin` decidido por outra pessoa | ação direta do admin, auditada; ninguém se dá papel (0149) | REPLACE WITH SYSTEM RULE |
| `require/consume_source_critical_approval` | outra pessoa | quem tem `source.approve_critical` aplica (0149); sem o papel, exceção com prazo | REPLACE WITH SYSTEM RULE |
| `guard_push_approvals`, `guard_push_sends`, `push_dispatch_due` | aprovador com `push.approve` diferente de quem pede | política de avisos no `push_request` (papel, limite por hora/dia, matéria no ar); aprovação pelo sistema aceita no despacho | REPLACE WITH AUTO-APPROVAL |
| `push_resume_*` | outra pessoa | quem tem `push.settings`/`push.approve` retoma | REPLACE WITH SYSTEM RULE |
| `guard_feature_flags` (religar `auto_publish`) | duas pessoas | ação direta do admin (0145) + religamento automático do disjuntor (0158) | REMOVE |
| Ativação de fonte (termos) | exigia termos revisados | termos em 3 estados (`unknown`, `acknowledged`, `restricted`); modo de uso `FULL`/`ATTRIBUTED`/`EXCERPT`/`BLOCKED`; só `restricted` impede ativar | REPLACE WITH SYSTEM RULE |

Exceção humana fica restrita a: remoção legal, violação de política confirmada, fontes primárias divergentes sem resolução, conteúdo corrompido, falha irrecuperável de proveniência, anomalia de segurança e ação explícita do dono (inclui desbloquear fonte bloqueada por motivo legal ou pedido do veículo, só admin).

## 4. Motor de decisão da publicação (`src/lib/rules/engine.ts`)

Entrada: regra que decidiu (`decidePublication`/`routeArticle`), candidato, rascunho sem IA, reprocessos feitos, idade da notícia, duplicata. Saída: `qualityScore`, `confidenceScore`, `riskScore` (0 a 1), nível e decisão. Política versionada `AUTONOMY_POLICY_V1`.

| Nível | Significado | Saída padrão |
|---|---|---|
| A0 | fonte primária confiável e confiança alta | PUBLISH |
| A1 | IA com confiança alta | PUBLISH |
| A2 | IA corroborada (regras satisfeitas) | PUBLISH |
| A3 | degradado, mas aceitável | PUBLISH_DEGRADED (ou REPROCESS enquanto houver tentativa) |
| A4 | sem solução automática | HUMAN_EXCEPTION ou QUARANTINE |

Mapa: fonte mínima, primária, imagem, confiança, categoria desconhecida, fonte não confiável com assunto grave e regras indisponíveis → REPROCESS (30 min, 2 h, 6 h) → esgotado: PUBLISH_DEGRADED com risco ≤ 0,5 e qualidade ≥ 0,5, senão QUARANTINE. Conteúdo `dubious` e duplicata → QUARANTINE com recomendação. Fontes divergentes: confiança ≥ 0,8, primária confiável e assunto não sensível publica com atribuição; senão HUMAN_EXCEPTION. Configuração explícita do dono (categoria em `review`, `forceReview`, portões das regras antigas) → HUMAN_EXCEPTION. `auto_publish` desligado ou modo leitura → rascunho com `await_auto_publish`. Notícia com mais de 72 h → QUARANTINE.

**Rascunho sem IA nunca publica** (a lista de trechos republicaria texto de terceiros, regra 4): falha de IA agenda nova redação (`topic:<id>#retry<n>`) e, esgotada, quarentena; a notícia continua no Panorama de fontes como link para o original.

## 5. Escada de IA

| Degrau | Onde |
|---|---|
| 0 modelo primário | `callAgent` |
| 1 nova tentativa | etapa `write` com espera do drain (1 e 4 min, A-126) |
| 2 modelo reserva | `callAgent` |
| 3 prompt alternativo | `callAgent`: formato errado em todos os modelos → instrução estrita de formato |
| 4 enriquecimento da fonte | `enrich` (feed curto) e `source_text` na redação |
| 5 pipeline determinístico | checklist automático, cartão tipográfico, matéria curta com `short_reason` |
| 6 publicação degradada | `PUBLISH_DEGRADED` (A3) |
| 7 exceção humana | só os casos do §3 |

## 6. Nada parado e recuperação

- Matéria: `next_action` (`rewrite`, `reevaluate`, `await_auto_publish`, `breaker_recovery`), `next_attempt_at`, `reprocess_count`, `quarantined_at`/`quarantine_reason`, `autonomy_level`, `degraded_reason`.
- Disjuntor: TRIP segura o ciclo como rascunho (`breaker_recovery`), sem revisão humana; `publish_breaker_auto_recover` religa depois do resfriamento (30 min) com contagens abaixo de 80% dos limites, só o que ele mesmo desligou. Falha de IA conta só a final.
- Itens mortos: classe, recomendação, nova tentativa automática (30 min, 2 h, 12 h; até 3).
- Incidentes: 5+ falhas com a mesma assinatura na hora viram 1 incidente (`pipeline_incidents`); sem falha nova por 30 min, resolvido.
- Saúde da fila: `autonomy_queue_health()` (profundidade, idade do mais antigo, novas tentativas, itens mortos, reprocessos, quarentena, exceções humanas, incidentes).
- Varredura (`runAutonomySweep`) a cada 5 min no `review-tick`.

## 7. Testes

Unitários: `src/lib/governance/policy.test.ts`, `src/lib/rules/engine.test.ts`, `src/lib/pipeline/autonomy-sweep.test.ts`, `src/lib/ai/call-agent.test.ts` (degrau 3), `publish.test.ts`/`publish-gate.test.ts` (falha de IA, disjuntor, flag). Integração: `tests/integration/governance.test.ts`, `tests/integration/autonomy-engine.test.ts`, push, pesos, contingência. e2e: `control-rec`, `a09-queue-history`, `publish`, `control-rules`.
