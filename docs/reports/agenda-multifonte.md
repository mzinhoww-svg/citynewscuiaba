# Relatório · Agenda multifonte (AGM-T1 a AGM-T9)

Spec: `docs/superpowers/specs/2026-10-08-agenda-coletor-multifonte-design.md`. Plano: `docs/superpowers/plans/2026-10-08-agenda-coletor-multifonte.md`. Decisão: A-218.

Execução por subagentes, com revisão de especificação e qualidade a cada tarefa (AGM-T1 a T7) e rodadas de correção; a AGM-T8 entra na revisão final do branch.

## Critérios de aceite (spec §10)

| # | Critério | Evidência |
|---|---|---|
| 1 | Fontes de eventos no painel com filtro Eventos; Sympla ativa, Radar em `pending_activation`, bloqueadas com motivo | `0196_agenda_sources_seed.sql`; `tests/integration/agenda-multifonte-schema.test.ts`; `tests/e2e/control-event-sources.spec.ts` |
| 2 | Ativar mostra prévia com evidência antes de ligar | `src/lib/sources/event-source.ts`, `EventSourcePreview`; `tests/integration/event-source-panel.test.ts`, `event-source-actions.test.ts`; e2e acima |
| 3 | Coletor lê fontes do banco; `sources.ts` sem fontes de produção | `src/lib/db/agenda-sources.ts`, `src/lib/agenda/sources.ts` (só fixtures); `tests/integration/agenda-collect-db.test.ts` |
| 4 | Nenhum evento `ai_page` sem ano na página ou com campo sem trecho verificável | `src/lib/agenda/extract/ai-page.ts`, `evidence.ts`; `ai-page.test.ts` (sem ano, trecho ausente, valor que não confere, texto além do corte) |
| 5 | "Confirmado por {venue}" / "Confirme na fonte" | `src/lib/agenda/origin-note.ts` + testes; `confirm.ts`, `reconcile.ts`; `tests/e2e/agenda-coletor.spec.ts` |
| 6 | Estúdio lista, cria, edita e retira com auditoria; coleta respeita `locked_fields` e `withdrawn_at` | `src/app/estudio/agenda/*`, `src/lib/db/queries/studio-events.ts`, `0198_agenda_studio_audit.sql`; `tests/integration/studio-events.test.ts`; `tests/e2e/studio-agenda.spec.ts` |
| 7 | Teto de IA respeitado e cache evita reprocessar | `src/lib/agenda/collect-ai.ts`; `collect.test.ts` (teto por execução, cache, prazo de 45 s, HTTP lento) |
| 8 | `pnpm verify` verde, axe sem serious/critical | `pnpm verify` em banco limpo: 550 arquivos, 5054 testes; `tests/a11y/control-sources.spec.ts`, `studio-agenda.spec.ts`, axe em `/agenda` e `/agenda/[slug]` |

## Pendências

- Produção: aplicar 0195 a 0199 e ativar, pela prévia do painel, as fontes do Radar que passarem; o painel do Sesc respondeu 404 em 08/10 (URL a reconferir na ativação).
- `src/lib/db/types.ts` foi ajustado à mão com as colunas novas; `pnpm db:types` na pilha local gera um arquivo muito diferente do versionado. Regenerar na pilha canônica.
- Menores adiados das revisões (não bloqueiam): data ISO no trecho recusada (falha fechada); conflito registra um campo só; Crawl-delay não gravado para fontes de eventos; datas relativas das fixtures podem oscilar numa virada de semana.
- Subprojetos B (agenda mais rica) e C (newsletter e Instagram) seguem como próximos.
