# P4 Estúdio Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redação completa: newsroom, fila de exceção, revisão de item autônomo, editor com fontes e sugestões de IA marcadas, versões, publicação, calendário, correções, mídia e aprovação de imagem, sugestões de evento e denúncias.

**Architecture:** Rotas em `src/app/estudio/*` com `requireRole`. Server Actions para mutações, cada uma grava `audit_log` e `article_versions`. Editor rico com Tiptap (conteúdo em JSON), marcas `aiSuggestion` e `humanEdit` no documento.

**Tech Stack:** Next.js, Supabase (RLS por papel), Tiptap, Radix, zod, Vitest, Playwright.

**Spec:** spec §4, §6.4–6.5, §8 · Telas: `docs/screens.md` §C (E01–E14)

## Global Constraints

- Estúdio: `dynamic = "force-dynamic"`, sem cache público.
- Toda mutação: `requireRole(action, scope)` + `audit_log` + versão quando alterar conteúdo.
- Sugestão de IA nunca é aplicada sem clique humano; ao aplicar, a marca `aiSuggestion` guarda `agentId`, `promptVersion` e `acceptedBy`.
- Aprovar fica desabilitado com motivo visível enquanto o checklist não estiver completo.
- Despublicar item automático: 1 clique + motivo obrigatório; gera `decisions.human_decision = "unpublish"`.
- Push de urgente exige 2 aprovações (P5 A09); publicar no Estúdio não dispara push sozinho.

## Review Focus

1. Dois editores abrem a mesma matéria e salvam → segundo salvamento avisa conflito com diff e não sobrescreve → teste em Task 3.
2. Jornalista tenta publicar via chamada direta à Server Action → 403 e `audit_log` com tentativa negada → teste em Task 1.
3. Correção em matéria publicada gera nota pública e avisa quem salvou → teste em Task 6.
4. Imagem com licença vencida em matéria publicada → alerta na biblioteca e troca sugerida → teste em Task 7.
5. Agendamento para horário passado → recusado com mensagem → teste em Task 5.

---

### Task 1: Guardas e auditoria do Estúdio

**Files:**
- Create: `src/lib/studio/action.ts` (wrapper `studioAction(action, scope, fn)`), `src/lib/audit/index.ts`
- Test: `tests/integration/studio-guard.test.ts`

**Interfaces:**
- Consumes: `can`, `requireRole` (P0 T8).
- Produces: `studioAction<I, O>(action: Action, scopeOf: (i: I) => Scope, fn: (i: I, ctx: { userId: string }) => Promise<O>): (i: I) => Promise<Result<O, "forbidden" | "conflict" | "invalid">>`; `audit(actor, action, objectRef, details)`.

- [ ] **Step 1: Write the failing test**

```ts
it("jornalista chamando publish recebe forbidden e fica auditado", async () => {
  const r = await asUser("rafael", () => publishArticle({ id: seedArticle.id }));
  expect(r).toEqual({ ok: false, error: "forbidden" });
  expect(await lastAudit()).toMatchObject({ action: "article.publish.denied" });
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): guarda de papel e auditoria`

### Task 2: Newsroom e fila

**Files:**
- Create: `src/app/estudio/page.tsx`, `src/app/estudio/fila/page.tsx`, `src/components/studio/{QueueTable,KpiStrip,QueueTabs}.tsx`, `src/lib/db/queries/queue.ts`
- Test: `tests/e2e/newsroom.spec.ts`

**Interfaces:**
- Produces: `listQueue(filter: { tab: "all"|"exceptions"|"auto24h"|"mine"|"sensitive"; section?; confidence?; assignee? }): Promise<QueueRow[]>`; `unpublishAuto({ id, reason })`; `assign({ ids, userId })`.

- [ ] **Step 1: Write the failing test**

```ts
test("editora vê exceções e despublica automático com motivo", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/fila?aba=auto24h");
  await page.getByRole("row", { name: /baixa umidade/ }).getByRole("button", { name: "Despublicar" }).click();
  await page.getByLabel("Motivo").fill("Data incorreta no alerta");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status")).toContainText("Despublicada");
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): newsroom e fila de matérias`

### Task 3: Revisão de item autônomo e editor

**Files:**
- Create: `src/app/estudio/fila/[id]/page.tsx`, `src/app/estudio/materias/[id]/page.tsx`, `src/components/studio/{DecisionPanel,FieldDiff,ChecklistPanel,SourcesEditor,AiSuggestionInline}.tsx`, `src/components/studio/editor/{Editor.tsx,marks.ts}`, `src/lib/studio/checklist.ts`, `src/lib/studio/save.ts`
- Test: `src/lib/studio/checklist.test.ts`, `tests/integration/save-conflict.test.ts`, `tests/e2e/review.spec.ts`

**Interfaces:**
- Produces: `checklist(a: DraftView): { items: { key: string; ok: boolean; label: string }[]; complete: boolean; blocker?: string }` (itens do DESIGN/E02: título e linha fina, editoria/tags/local, fonte primária quando a regra exigir, crédito e alt nas imagens, SEO title e meta, sugestões de IA resolvidas); `saveDraft({ id, baseVersion, doc }): Result<{ version: number }, "conflict">`.

- [ ] **Step 1: Write the failing tests**

```ts
it("checklist bloqueia com motivo legível", () => {
  expect(checklist(draftSemCredito).blocker).toBe("Falta crédito da imagem");
});
it("salvar com versão base desatualizada retorna conflict", async () => {
  await saveDraft({ id, baseVersion: 7, doc: a }); 
  expect(await saveDraft({ id, baseVersion: 7, doc: b })).toEqual({ ok: false, error: "conflict" });
});
```

```ts
test("aceitar sugestão de título marca origem IA e autor humano", async ({ page }) => {
  await loginAs(page, "juliana");
  await page.goto(`/estudio/materias/${seedDraft.id}`);
  await page.getByRole("button", { name: "Aplicar título sugerido" }).click();
  await expect(page.getByText(/Sugerido pela IA · aceito por Juliana/)).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): revisão de item autônomo e editor com origem marcada`

### Task 4: Versões e histórico

**Files:**
- Create: `src/app/estudio/materias/[id]/versoes/page.tsx`, `src/lib/studio/diff.ts`, `src/components/studio/VersionDiff.tsx`
- Test: `src/lib/studio/diff.test.ts`

**Interfaces:**
- Produces: `diffText(a: string, b: string): { op: "eq"|"add"|"del"; text: string }[]` (por palavra).

- [ ] **Step 1–4:** teste `diffText("de 55 para 37 minutos", "de 55 para 35 minutos")` → `[eq "de 55 para ", del "37", add "35", eq " minutos"]` → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): comparação de versões`

### Task 5: Publicação e agendamento

**Files:**
- Create: `src/components/studio/PublishDialog.tsx`, `src/lib/studio/publish.ts`
- Test: `src/lib/studio/publish.test.ts`

**Interfaces:**
- Produces: `publishArticle({ id, when: "now" | { at: string }, destinations: ("home"|"section"|"topic"|"newsletter")[] })` via `studioAction("article.publish", ...)`.

- [ ] **Step 1–4:** testes: horário passado → `invalid` com mensagem "Escolha um horário futuro"; publicar define `publish_mode = "human"`, `status = "published"`, grava versão e dispara `revalidateTag` → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): publicação e agendamento`

### Task 6: Calendário, correções e direito de resposta

**Files:**
- Create: `src/app/estudio/calendario/page.tsx`, `src/app/estudio/correcoes/page.tsx`, `src/app/estudio/correcoes/[id]/page.tsx`, `src/lib/studio/corrections.ts`
- Test: `tests/integration/corrections.test.ts`

- [ ] **Step 1–4:** teste: publicar correção cria `article_versions.change_kind = "correction"` com `public_note`, aparece em `/correcoes` e cria notificação para quem salvou a matéria → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): calendário, correções e direito de resposta`

### Task 7: Mídia, licenças, aprovação e geração [paralelo]

**Files:**
- Create: `src/app/estudio/midia/page.tsx`, `midia/[id]/page.tsx`, `midia/licencas/page.tsx`, `src/components/studio/{MediaGrid,ImageApproval,GenerateImageDrawer}.tsx`, `src/lib/media/licenses.ts`
- Test: `src/lib/media/licenses.test.ts`, `tests/e2e/media.spec.ts`

**Interfaces:**
- Produces: `expiringLicenses(assets, today, days = 30)`; `approveImage({ id })`, `blockImage({ id, reason })`, `replaceImage({ articleId, mediaId })`, `generateIllustration({ articleId })` (usa agente `image`, rótulo `ai_generated`, restrições fixas).

- [ ] **Step 1–4:** testes: licença vencendo em 20 dias aparece; vencida em matéria publicada gera alerta; gerar ilustração para categoria `seguranca` é recusado → FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(estudio): biblioteca, licenças, aprovação e geração de imagem`

### Task 8: Sugestões de evento e denúncias [paralelo]

**Files:**
- Create: `src/app/estudio/agenda/sugestoes/page.tsx`, `src/app/estudio/denuncias/page.tsx`
- Test: `tests/e2e/submissions-reports.spec.ts`, `tests/a11y/studio-p4.spec.ts`, `docs/reports/P4.md`

- [ ] **Step 1–4:** testes: aprovar sugestão cria `event_listings` com `origin = "reader"`; denúncia respondida sai da fila e registra resposta → FAIL → implementar → PASS. `@a11y` em todas as rotas do Estúdio da fase (login de seed).
- [ ] **Step 5:** `pnpm verify`, PR, preview, roteiro agent-browser P4, `impeccable audit` (register product), relatório, merge.
- [ ] **Step 6: Commit** `feat(estudio): sugestões de evento e denúncias`
