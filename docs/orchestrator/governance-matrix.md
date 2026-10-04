# Matriz de governança (aprovações)

Definição efetiva = última migration que define cada função (0149, aplicada em produção em
04/10/2026). Levantamento por subagente só de leitura, reconferido pelo orquestrador no texto
integral de `0149_single_approver.sql` e por consulta em produção (0 CHECK de aprovador diferente).

**A-128: EXISTE** — `.planning/DECISIONS.md:115`, commits `87b4cc2` e `2b81258` (PR #37), CLAUDE.md
regra 8, migration 0149, `requestAndApproveCommand` em `src/lib/studio/approvals.ts:173-195`.

| Ação | Quem pede | Quem aprova/executa | Auto-aprovação | 2ª pessoa | Audit log | RLS | UI | Função (def. vigente) | Decisão | Classe |
|---|---|---|---|---|---|---|---|---|---|---|
| Ativar regras / desligar `forceReview` | admin, editor_chefe, operador_ia | admin, editor_chefe | sim | não | na aplicação; sem trigger em `rules` | sim | Control Center → Regras | `guard_proposal`, `approval_apply` (0149) | A-128 | AUTO_APPROVE (operador_ia → HUMAN_EXCEPTION) |
| Afrouxar Segurança (`safety.disable`, `rules:N`) | idem | só admin | sim (admin) | não | aplicação | sim | Regras | `approval_apply` (0149) | A-128 | AUTO_APPROVE / HUMAN_EXCEPTION |
| Religar `auto_publish` | — | admin direto | n/a | não | `flag.set` | sim | Contingência, Interruptores | trigger removido (0145) | A-125 | SYSTEM_POLICY |
| Rollback de regras | — | admin | n/a | não | aplicação | definer | Contingência | `rules_rollback` (0149) | A-128 | SYSTEM_POLICY (recusa destino mais frouxo) |
| Publicar prompt | operador_ia escreve; admin/editor_chefe/operador_ia pedem | admin, editor_chefe | sim | não | aplicação | sim | Prompts | `guard_ai_prompts`, `prompt_publish` (0149) | A-128 | AUTO_APPROVE |
| Pesos de recomendação | admin, operador_ia | admin (na prática) | sim | não | aplicação | sim | Recomendação | `rec_weights_activate` (0149) | A-128 | AUTO_APPROVE |
| Conceder/revogar admin | admin | admin | sim (nunca o próprio papel) | não | `user.role.*` | sim | Usuários | `guard_user_roles*`, `consume_role_admin_ref` (0149) | A-128 | AUTO_APPROVE; próprio papel = SYSTEM_POLICY |
| Mudança crítica de fonte | `source.manage` | admin, editor_chefe | sim | não | trigger `sources_audit` | sim | Painel de Fontes | `guard_source_changes`, `consume_source_critical_approval` (0149) | A-128 / A-127 | AUTO_APPROVE |
| Ativar fonte sem termos revisados | `source.manage` | — | n/a | não | `sources_audit` | sim | Painel (a tela pede a caixa) | `guard_source_changes` (0149) | A-127 | SYSTEM_POLICY |
| Push urgente / Destaque | admin, editor_chefe (urgente); + editor da editoria (Destaque) | `push.approve` (admin, editor_chefe) | sim | não | `push_sends_audit` | sim | E06, A09 | `guard_push_*`, `push_dispatch_due` (0149) | A-128 | AUTO_APPROVE (editor → HUMAN_EXCEPTION) |
| Retomar push | `push.settings` | `push.approve` | sim | não | `push.resume_applied` | sim | A09 | `push_resume_apply` (0149) | A-128 | AUTO_APPROVE |
| Fila editorial | pipeline | regras v3; `article.publish` | n/a | não | `decisions` | sim | `/estudio/fila` | `decidePublication` | A2/A4, A-125, A-126 | AUTOMATABLE / HUMAN_EXCEPTION |
| Aprovar imagem | — | editor_chefe, revisor, editor da editoria | n/a | não | aplicação | sim | Mídia | `can_approve_media` (0023) | — | HUMAN_EXCEPTION |
| Evento da Agenda | coletor ou leitor | regra automática | n/a | não | — | — | — | `src/lib/agenda/approve.ts`, `event-auto-approve.ts` | AGE-T1 | AUTOMATABLE |

## Inconsistências (abertas)

1. Spec mestre `2026-09-27-citynews-design.md:179` e specs do painel e do PWA ainda exigem duas pessoas (L-011).
2. `docs/architecture.md:125-141`, `docs/screens.md:188,257`, `PRODUCT.md:23` desatualizados (L-011).
3. `APPROVER_ACTION` de `push.*` → `article.publish` em `src/lib/approvals/targets.ts:64-66` (L-013).
4. Caminho direto pela tabela em `rules`/`rec_weights` sem `approvals` nem `audit_log` (L-012).
5. A-027, A-067, A-068 sem nota de substituição; A-127/A-128 com colunas faltando (L-014).
