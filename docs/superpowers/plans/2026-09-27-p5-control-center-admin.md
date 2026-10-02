# P5 Control Center e Administração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operação supervisionável: visão geral, tempo real, fontes, regras de autonomia com aprovação dupla, falhas e reprocessamento, execuções, logs, IA (agentes, modelos, prompts, bases, avaliações, playground, custos, governança), recomendação de fontes com A/B, e administração completa.

**Architecture:** Rotas em `src/app/estudio/control/*` e `src/app/estudio/admin/*`. Mudanças críticas passam por `requestApproval` / `approve` (tabela `approvals`, aprovador ≠ solicitante). Tempo real por polling de 5 s (sem websockets no MVP). Gráficos em SVG próprio com resumo textual.

**Tech Stack:** Next.js, Supabase, zod, Radix, Vitest, Playwright.

**Spec:** spec §6, §7, §8 · Telas: `docs/screens.md` §D (O01–O18) e §E (A01–A15) · Tracking: `docs/tracking-plan.md` §6

## Global Constraints

- Mudança crítica (lista da spec §8) só entra em vigor com `approvals.approved_by <> requested_by` e justificativa não vazia.
- Toda ação grava `audit_log`. IPs mascarados para quem não é `admin`.
- Botões de contingência pedem confirmação digitando o nome da ação.
- Pesos de recomendação: soma = 1,00 (±0,001) para salvar.
- Tabelas com `<th scope="col">`, ordenação acessível e resumo textual de todo gráfico.

## Review Focus

1. Operador propõe e tenta aprovar a própria regra → bloqueado com mensagem "A aprovação precisa ser de outra pessoa" → teste em Task 1.
2. Pesos que somam 0,99 → salvar desabilitado com a soma exibida → teste em Task 8.
3. Reprocessar itens que já têm decisão humana → decisões mantidas por padrão → teste em Task 3.
4. Pausar publicação automática durante um ciclo em andamento → itens restantes do ciclo vão para revisão → teste em Task 10.
5. Simulação de regra nova com os últimos 7 dias → mostra quantos itens mudariam de destino antes de propor → teste em Task 2.

---

### Task 1: Aprovações

> **Nota (Painel de Fontes, FS-T6):** `source.critical` já existe em `src/lib/approvals` (`createApprovals(db)` com `requestApproval`/`approve`/`reject`/`pending`, erros `self_approval`/`forbidden`/`not_pending`/`invalid`, mensagem "A aprovação precisa ser de outra pessoa"). Esta tarefa estende o mesmo módulo com os demais `CriticalKind` em vez de recriá-lo.

**Files:** Create `src/lib/approvals/index.ts`, `src/components/studio/ApprovalBanner.tsx` · Test `tests/integration/approvals.test.ts`

**Interfaces:** Produces `requestApproval({ kind: CriticalKind; targetRef; justification }): Promise<Result<{ id }, "invalid">>`; `approve({ id }): Promise<Result<void, "self_approval" | "forbidden" | "not_pending">>`; `type CriticalKind = "rules.activate" | "prompt.publish" | "rec.weights" | "role.admin" | "safety.disable" | "force_review.disable" | "push.urgent"`.

- [ ] **Step 1–4:** testes: autoaprovação → `self_approval` com mensagem "A aprovação precisa ser de outra pessoa"; justificativa vazia → `invalid`; aprovação válida ativa o alvo e audita as duas pessoas → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): aprovação dupla para mudanças críticas`

### Task 2: Regras de autonomia

**Files:** Create `src/app/estudio/control/regras/page.tsx`, `src/components/studio/RuleMatrix.tsx`, `src/lib/rules/simulate.ts` · Test `src/lib/rules/simulate.test.ts`, `tests/e2e/control-rules.spec.ts`

**Interfaces:** Consumes `decidePublication` (P0 T5), `requestApproval` (T1). Produces `simulateRules(next: RuleSet, sample: Candidate[], current: RuleSet): { changed: number; byRoute: Record<string, { from: string; to: string; count: number }[]> }`.

- [ ] **Step 1–4:** testes: simulação com amostra de 100 candidatos de fixture muda o destino de N itens conhecidos; e2e de proposta por Diego, bloqueio de autoaprovação, aprovação por Marina → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): regras de autonomia com simulação`

### Task 3: Visão geral, tempo real, falhas, execuções e logs

**Files:** Create `src/app/estudio/control/{page,tempo-real/page,falhas/page,execucoes/page,execucoes/[id]/page,logs/page}.tsx`, `src/components/studio/{CycleStrip,JobTable,SourceHealthTable,LogExplorer}.tsx`, `src/lib/pipeline/reprocess.ts`, `src/app/api/control/run-now/route.ts` · Test `tests/integration/reprocess.test.ts`, `tests/e2e/control-live.spec.ts`

**Interfaces:** Produces `reprocess({ scope: { runId?; itemIds?; sourceId? }; fromStep: StepName; keepHumanDecisions: boolean }): Promise<{ enqueued: number }>`; `runNow({ sourceId? })`.

- [ ] **Step 1–4:** testes: `keepHumanDecisions = true` não altera `decisions.human_decision`; "Executar agora" cria run fora da janela com `window_start` próprio; e2e: tabela de fontes mostra "Pausada (auto)" para fonte com 3 falhas → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): monitoramento, falhas, execuções, logs e reprocessamento`

### Task 4: Fontes (lista, cadastro, teste de conexão, recomendação)

> **Coberta pelo Painel de Fontes, FS-T1…T8** (`docs/superpowers/specs/2026-09-27-painel-de-fontes.md`, plano `docs/superpowers/plans/2026-09-27-painel-de-fontes.md`, relatório `docs/reports/painel-fontes.md`): lista O03 com filtros e lote, cadastro por link com descoberta e agente `source_profiler`, `testConnection` com a mesma interface e as mesmas mensagens desta tarefa, aba Recomendação com auditoria, ciclo de vida completo, frequência por fonte e via rápida. Nada a implementar aqui; P5-T3 lê `source_health_daily`/`status_reason` (spec §11).

**Files:** Create `src/app/estudio/control/fontes/page.tsx`, `fontes/[id]/page.tsx`, `src/lib/sources/test-connection.ts` · Test `src/lib/sources/test-connection.test.ts`

**Interfaces:** Produces `testConnection(src: { kind; feedUrl; baseUrl }): Promise<{ ok: boolean; status: number; items: number; ms: number; message: string }>`.

- [ ] **Step 1–4:** testes com servidor HTTP local de fixture: feed válido → ok com contagem; 403 → mensagem "Acesso negado pela fonte (403)"; aba Recomendação altera `rec_pinned`, `rec_local_highlight`, `rec_excluded`, `display_name`, `logo_path` com auditoria → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): administração de fontes`

### Task 5: Agentes, modelos, prompts e playground

**Files:** Create `src/app/estudio/control/{agentes,modelos,prompts/[id],testes}/page.tsx`, `src/lib/ai/prompts.ts` · Test `tests/integration/prompts.test.ts`

**Interfaces:** Produces `createPromptVersion({ agentId, body, rationale })`, `diffPrompt(a, b)` (reusa `diffText` de P4 T4), `publishPrompt({ id })` (exige aprovação `prompt.publish`), `rollbackPrompt({ agentId, toVersion })`, `playground({ agentId, promptVersion, modelId, input })` → `{ sanitizedInput, output, valid, costBrl, latencyMs }`.

- [ ] **Step 1–4:** testes: publicar sem aprovação falha; rollback cria nova versão com `status = "reverted"` na anterior; playground nunca grava em `articles` → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): agentes, modelos, prompts versionados e playground`

### Task 6: Bases, avaliações, custos e governança da IA [paralelo]

**Files:** Create `src/app/estudio/control/{conhecimento,avaliacoes,custos,governanca}/page.tsx`, `src/lib/ai/eval.ts`, `.github/workflows/regression.yml` · Test `src/lib/ai/eval.test.ts`

**Interfaces:** Produces `runRegression({ agentId, promptVersion, cases: EvalCase[] }): Promise<{ precision; coverage; unsourced; hallucinationsPer100; refusalsCorrect; refusalsWrong; p95 }>` com `FakeProvider` em CI.

- [ ] **Step 1–4:** testes: métricas calculadas corretamente sobre 5 casos de fixture; workflow de regressão roda em PR que altera `supabase/migrations/*ai*` ou `src/lib/ai/**` → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): bases, avaliação, custos e governança da IA`

### Task 7: Recomendação: painel, pesos, campanhas e A/B

**Files:** Create `src/app/estudio/control/recomendacao/page.tsx`, `recomendacao/testes/[id]/page.tsx`, `src/components/studio/{WeightSliders,AbTestCard,WhyThisDrawer}.tsx`, `src/lib/ranking/experiments.ts`, `src/lib/ranking/metrics.ts` · Test `src/lib/ranking/metrics.test.ts`, `tests/e2e/control-rec.spec.ts`

**Interfaces:** Produces `assignVariant(anonId: string, exp: { id; split: number[] }): number` (hash estável); `diversityIndex(shares: number[]): number` (1 − Σ share²); `concentrationTop3(shares): number`; `weightsValid(w: Weights): { ok: boolean; sum: number }`.

- [ ] **Step 1–4:** testes: `assignVariant` estável para o mesmo id; `diversityIndex([0.5, 0.5]) = 0.5`; pesos 0,99 → `ok: false, sum: 0.99`; alerta de concentração quando top-3 > 0,5; "Por que esta recomendação" mostra componentes do score para um `anonId` pseudonimizado → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(control): painel de recomendação, pesos, campanhas e testes A/B`

### Task 8: Administração (usuários, papéis, equipes, taxonomia, home) [paralelo]

**Files:** Create `src/app/estudio/admin/{page,usuarios,papeis,equipes,taxonomia,home}/page.tsx` · Test `tests/e2e/admin-core.spec.ts`

- [ ] **Step 1–4:** testes: convidar usuário envia link e aparece "Convite pendente"; conceder `admin` pede aprovação `role.admin`; mesclar tags duplicadas preserva vínculos; reordenar módulos da home por teclado (Alt + setas) e publicar → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(admin): usuários, papéis, equipes, taxonomia e home`

### Task 9: Administração (publicidade, SEO, notificações, auditoria, segurança, governança, integrações, configurações) [paralelo]

**Files:** Create `src/app/estudio/admin/{publicidade,seo,notificacoes,auditoria,seguranca,governanca,integracoes,configuracoes}/page.tsx`, `src/lib/ads/rules.ts` · Test `src/lib/ads/rules.test.ts`

**Interfaces:** Produces `placeSponsored(cards: Card[], campaign): Card[]` (máx. 1 a cada 6; nunca em Política, urgentes, manchete ou respostas de IA).

- [ ] **Step 1–4:** testes de `placeSponsored`; push urgente pede `push.urgent`; auditoria exporta CSV com IP mascarado para não admin → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(admin): publicidade, SEO, notificações, auditoria, segurança e integrações`

### Task 10: Contingência

**Files:** Create `src/app/estudio/admin/contingencia/page.tsx`, `src/lib/flags/index.ts`, `docs/runbooks/{pausar-automatico,modo-leitura,ia-fora,rollback-regras,restore}.md` · Test `tests/integration/contingency.test.ts`, `tests/a11y/studio-p5.spec.ts`, `docs/reports/P5.md`

**Interfaces:** Produces `getFlag(key)`, `setFlag(key, value, actor)`.

- [ ] **Step 1–4:** testes: `auto_publish = false` no meio de um ciclo faz `decide` rotear para revisão; `read_only = true` bloqueia Server Actions do Estúdio com mensagem e mantém o portal lendo do cache; `ai_enabled = false` faz `/pergunte` mostrar "indisponível" e oferecer busca tradicional → FAIL → implementar → PASS. `@a11y` nas rotas de Control Center e Admin.
- [ ] **Step 5:** `pnpm verify`, PR, preview, roteiro agent-browser P5, `impeccable audit`, relatório, merge.
- [ ] **Step 6: Commit** `feat(admin): contingência e runbooks`
