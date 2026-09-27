# P6 Endurecimento e Lançamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produto pronto para produção: performance dentro dos orçamentos, WCAG 2.2 AA verificado, segurança revisada, observabilidade e recuperação testadas, polimento visual final e verificação ponta a ponta com agent-browser.

**Architecture:** Sem novas funcionalidades. Ajustes guiados por medições (Lighthouse CI, axe, testes de carga leves, auditoria impeccable) e por runbooks exercitados.

**Tech Stack:** Lighthouse CI, Playwright, axe, k6 (carga leve), Sentry (opcional), GitHub Actions.

**Spec:** spec §10–11 · `docs/testing.md` · `DESIGN.md` §9–10

## Global Constraints

- LCP p75 mobile ≤ 2,5 s; INP ≤ 200 ms; CLS ≤ 0,1; JS inicial da home ≤ 170 kB gzip.
- 0 violações axe `serious`/`critical` em todas as rotas.
- RPO 15 min, RTO 1 h demonstrados.
- Nenhuma mudança visual fora dos tokens.

## Review Focus

1. Home em 3G lento com fontes web → texto visível imediatamente (`display: swap`) e sem salto de layout → Task 1.
2. Navegação completa só por teclado no Estúdio, incluindo menus e diálogos → Task 2.
3. Página externa com instrução em texto oculto (`display:none`) → removida pela extração e detectada → Task 3.
4. Restauração de backup em projeto vazio → portal volta a responder com os dados do backup → Task 4.
5. Leitor que recusou tudo navega 20 páginas → zero requisições a `/api/events` → Task 5.

---

### Task 1: Performance

**Files:** Create `lighthouserc.json`, `.github/workflows/lighthouse.yml`; Modify imagens e fontes conforme medições · Test Lighthouse CI

- [ ] **Step 1:** Configurar budgets (LCP 2500, CLS 0.1, TBT 200, `resource-summary:script:size` 170 kB) para `/`, `/materia/plano-onibus-cpa-centro`, `/fontes`, `/busca?q=viaduto`.
- [ ] **Step 2:** Run → registrar falhas.
- [ ] **Step 3:** Corrigir (priorizar `next/image` com `sizes`, `priority` só na manchete, dividir componentes client, remover dependências pesadas do bundle público).
- [ ] **Step 4:** Run → PASS em todas as rotas.
- [ ] **Step 5: Commit** `perf: orçamentos de performance atendidos`

### Task 2: Acessibilidade completa

**Files:** Create `tests/a11y/all-routes.spec.ts`, `tests/e2e/keyboard.spec.ts`

- [ ] **Step 1:** Teste axe varrendo todas as rotas de `docs/screens.md` com dados de seed (públicas anônimas e Estúdio com cada papel).
- [ ] **Step 2:** Teste de teclado: Tab da home até ler uma matéria; no Estúdio, aprovar item da fila só com teclado; foco visível verificado por screenshot comparado.
- [ ] **Step 3:** Corrigir até PASS.
- [ ] **Step 4:** Revisão manual com leitor de tela (VoiceOver no Safari, NVDA no Firefox) das rotas `/`, `/materia/*`, `/fontes`, `/pergunte`, `/estudio/fila/*`; anotar em `docs/reports/a11y.md`.
- [ ] **Step 5: Commit** `a11y: WCAG 2.2 AA verificado`

### Task 3: Segurança

**Files:** Modify `next.config.ts` (headers), `src/lib/security/sanitize.ts`; Create `tests/security/*.test.ts`, `docs/reports/security.md`

- [ ] **Step 1:** Testes: CSP presente e sem `unsafe-inline` para scripts (usar nonce); rotas de cron sem segredo → 401; RLS: anon não lê `decisions`, `ai_calls`, `audit_log`, `events`; texto oculto por CSS em página externa é removido; 20 variações de injeção conhecidas detectadas.
- [ ] **Step 2–4:** FAIL → corrigir → PASS.
- [ ] **Step 5:** `pnpm audit --prod` sem vulnerabilidades altas; relatório.
- [ ] **Step 6: Commit** `security: headers, RLS e defesa contra injeção verificados`

### Task 4: Observabilidade e recuperação

**Files:** Create `.github/workflows/backup.yml` (se ainda não completo), `docs/runbooks/restore.md` (exercitado), alertas configurados · Test exercício documentado

- [ ] **Step 1:** Configurar alertas da `docs/architecture.md` §10 (e-mail do plantão).
- [ ] **Step 2:** Exercício: restaurar backup mais recente em projeto Supabase de teste e apontar um preview da Vercel para ele; medir tempo.
- [ ] **Step 3:** Expected: portal responde com dados do backup em ≤ 1 h; registro em `docs/reports/dr.md`.
- [ ] **Step 4: Commit** `ops: alertas e exercício de recuperação`

### Task 5: Privacidade

**Files:** Create `tests/e2e/privacy-strict.spec.ts`

- [ ] **Step 1:** Teste: recusar tudo e navegar 20 páginas → 0 requisições a `/api/events`, nenhum cookie além de `cn_consent` e de sessão do Supabase (se logado).
- [ ] **Step 2:** Teste: exportar dados gera JSON com follows, saved, alerts, profile; excluir agenda exclusão em 7 dias.
- [ ] **Step 3–4:** FAIL → corrigir → PASS.
- [ ] **Step 5: Commit** `privacy: modo estrito verificado`

### Task 6: Polimento visual e verificação final

**Files:** Create `docs/reports/final.md`

- [ ] **Step 1:** `impeccable audit` e `impeccable polish` em todas as rotas públicas (register brand) e do Estúdio (register product); aplicar correções de severidade alta e média.
- [ ] **Step 2:** `design-intelligence` e `ui-ux-pro-max`: checar hierarquia, densidade, estados e microcopy contra `DESIGN.md` e `PRODUCT.md`; registrar decisões.
- [ ] **Step 3:** agent-browser: executar todos os roteiros de `docs/testing.md` §3 em produção (ou preview de release), em 390 × 844 e 1280 × 800, com screenshots anexados ao relatório.
- [ ] **Step 4:** Checklist dos 12 critérios de aceite da spec §11, cada um com evidência (link, print ou teste).
- [ ] **Step 5:** Tag `v1.0.0`, release notes, deploy de produção.
- [ ] **Step 6: Commit** `release: v1.0.0`
