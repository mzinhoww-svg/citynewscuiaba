# P1 Portal Público Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todas as telas públicas de leitura (P01–P11, P24, P25) navegáveis sem conta, com rótulos de origem, estados completos e SEO técnico.

**Architecture:** Server Components com ISR e `revalidateTag`. Queries tipadas em `src/lib/db/queries/*`. Componentes editoriais sem acesso a banco. Formulários públicos por Server Actions com rate limit e honeypot.

**Tech Stack:** Next.js App Router, Supabase JS, zod, Radix (Dialog, Tabs, Popover), Vitest, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-09-27-citynews-design.md` · Telas: `docs/screens.md` §A · Design: `DESIGN.md`

## Global Constraints

- Tudo de P0 Global Constraints.
- Nenhuma rota pública exige sessão. Nenhum modal bloqueante na primeira visita.
- Todo card exibe `labelsFor(...).shown`; o restante fica acessível no bloco "Como esta matéria foi feita".
- Agregado: link com `target="_blank" rel="noopener noreferrer"` para o domínio da fonte; sem página própria de leitura.
- ISR: home 60 s, editoria 60 s, matéria 300 s + tag `article:<id>`, assunto 120 s.
- Corpo de matéria `max-width: 68ch`; títulos com `text-wrap: balance`.
- Datas exibidas no fuso `America/Cuiaba`, formato "27/09/2026, 9h12"; relativas até 24 h ("há 12 min").

## Review Focus

1. Matéria atualizada entre o carregamento e a leitura → aviso "Esta matéria foi atualizada às hh:mm" aparece via polling de `updated_at` a cada 120 s → teste em Task 6.
2. Slug antigo de matéria arquivada → 410 com motivo, não 404 → teste em Task 10.
3. Filtros da editoria com valor inválido na URL (`?periodo=abc`) → ignorados sem erro 500 → teste em Task 5.
4. Evento que atravessa meia-noite no `.ics` com fuso Cuiabá → `DTSTART;TZID=America/Cuiaba` correto → teste em Task 8.
5. Formulário "Informar problema" enviado 6 vezes em 1 h do mesmo IP → 6ª recusada com mensagem clara → teste em Task 6.

---

### Task 1: Queries de leitura

**Files:**
- Create: `src/lib/db/queries/articles.ts`, `topics.ts`, `sections.ts`, `events.ts`, `aggregated.ts`, `src/lib/format/date.ts`
- Test: `tests/integration/queries.test.ts`, `src/lib/format/date.test.ts`

**Interfaces:**
- Consumes: `createServerClient` (P0 T7), `labelsFor` (P0 T3).
- Produces: `getHomeData(): Promise<HomeData>`; `getArticleBySlug(slug): Promise<ArticleView | { gone: true; reason: string } | null>`; `getTopicBySlug(slug)`; `listSection(slug, filters: SectionFilters, page: number)`; `listEvents(filters: EventFilters)`; `getEvent(slug)`; `listAggregated({ sourceSlugs?, section?, limit })`; `formatWhen(iso: string, now?: Date): string`. `ArticleView` inclui `labels: { shown: Label[]; hidden: Label[] }`, `confidence`, `sources: { name; role; url; publishedAt }[]`, `versions: number`.

- [ ] **Step 1: Write the failing tests**

```ts
import { formatWhen } from "./date";
const now = new Date("2026-09-27T18:00:00Z"); // 14h em Cuiabá (UTC−4)
it("relativo até 24 h", () => expect(formatWhen("2026-09-27T17:48:00Z", now)).toBe("há 12 min"));
it("absoluto após 24 h, no fuso de Cuiabá", () => expect(formatWhen("2026-09-25T13:12:00Z", now)).toBe("25/09/2026, 9h12"));
```

```ts
it("home traz manchete publicada e agregados só de fontes com política", async () => {
  const h = await getHomeData();
  expect(h.lead.status).toMatch(/published|updated/);
  expect(h.aggregated.every(a => a.labels.shown[0]!.kind === "aggregated")).toBe(true);
});
it("matéria arquivada retorna gone", async () => {
  expect(await getArticleBySlug("materia-arquivada-seed")).toEqual({ gone: true, reason: expect.any(String) });
});
```

- [ ] **Step 2–4:** FAIL → implementar (datas com `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Cuiaba" })`) → PASS.
- [ ] **Step 5: Commit** `feat(db): queries públicas e formatação de datas`

### Task 2: Componentes de origem e confiança [paralelo]

**Files:**
- Create: `src/components/editorial/OriginLabel.tsx`, `ConfidenceMeter.tsx`, `TopicStatus.tsx`, `MadeHow.tsx`
- Test: `src/components/editorial/origin.test.tsx`

**Interfaces:**
- Consumes: `Label`, `LabelKind` (P0 T3).
- Produces: `<OriginLabel label size="sm"|"md" />`; `<ConfidenceMeter level />`; `<TopicStatus state />`; `<MadeHow labels={{shown, hidden}} reviewer? agentVersion? versionsHref />`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("rótulo de IA tem borda tracejada e texto", () => {
  render(<OriginLabel label={{ kind: "ai_summary", text: "RESUMO POR IA" }} />);
  const el = screen.getByText("RESUMO POR IA");
  expect(el.closest("[data-kind='ai_summary']")).toHaveStyle({ borderStyle: "dashed" });
});
it("confiança não depende de cor: tem texto", () => {
  render(<ConfidenceMeter level="média" />);
  expect(screen.getByText("Confiança média")).toBeInTheDocument();
});
```

- [ ] **Step 2–4:** FAIL → implementar conforme DESIGN.md §5 → PASS.
- [ ] **Step 5: Commit** `feat(ui): OriginLabel, ConfidenceMeter, TopicStatus, MadeHow`

### Task 3: Cards editoriais [paralelo]

**Files:**
- Create: `src/components/editorial/ArticleCard.tsx` (variants `lead`, `standard`, `compact`, `list`), `AggregatedCard.tsx`, `TopicCard.tsx`, `CollectionCard.tsx`, `NowList.tsx`, `EventDateBadge.tsx`, `ServiceTile.tsx`, `SourceAvatar.tsx`
- Test: `src/components/editorial/cards.test.tsx`

**Interfaces:**
- Produces: props tipadas a partir de `ArticleView`, `AggregatedView`, `TopicView` (Task 1).

- [ ] **Step 1: Write the failing tests**

```tsx
it("card agregado abre o original em nova aba e informa a origem", () => {
  render(<AggregatedCard item={fixtureAgg} />);
  const link = screen.getByRole("link", { name: /Abrir no Folha/ });
  expect(link).toHaveAttribute("href", "https://folhadocerrado.example/materia-1");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  expect(screen.getByText("AGREGADO")).toBeInTheDocument();
});
it("card de matéria mostra no máximo 4 rótulos", () => {
  render(<ArticleCard variant="standard" article={fixtureWith6Labels} />);
  expect(screen.getAllByTestId("origin-label")).toHaveLength(4);
});
it("SourceAvatar sem logotipo usa monograma com nome acessível", () => {
  render(<SourceAvatar name="Folha do Cerrado" code="FC" />);
  expect(screen.getByLabelText("Folha do Cerrado")).toHaveTextContent("FC");
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(ui): cards editoriais e agregados`

### Task 4: Home

**Files:**
- Create: `src/app/(public)/page.tsx`, `src/components/editorial/UrgentBar.tsx`, `src/components/editorial/AggregatedSection.tsx`, `src/components/editorial/NewsletterForm.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `getHomeData` (T1), cards (T3), labels (T2).

- [ ] **Step 1: Write the failing test**

```ts
test("home: conteúdo CityNews na dobra e agregado abaixo, rotulado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const agg = page.getByRole("region", { name: "Veja também em outros portais" });
  const box = await agg.boundingBox();
  expect(box!.y).toBeGreaterThan(844);
  await expect(agg.getByText("AGREGADO").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
test("sem urgente publicado, faixa não aparece", async ({ page }) => {
  await page.goto("/?fixture=sem-urgente");
  await expect(page.getByRole("alert", { name: /Urgente/ })).toHaveCount(0);
});
```

- [ ] **Step 2–4:** FAIL → implementar blocos na ordem de `docs/screens.md` P01 com `export const revalidate = 60` → PASS. (O parâmetro `fixture` só é lido quando `NODE_ENV !== "production"`.)
- [ ] **Step 5: Commit** `feat(home): home com hierarquia e Panorama abaixo da dobra`

### Task 5: Editoria

**Files:**
- Create: `src/app/(public)/[editoria]/page.tsx`, `src/lib/filters/section.ts`, `src/components/editorial/NewItemsPill.tsx`
- Test: `src/lib/filters/section.test.ts`, `tests/e2e/section.spec.ts`

**Interfaces:**
- Produces: `parseSectionFilters(sp: URLSearchParams): SectionFilters` (valores inválidos descartados); `serializeSectionFilters(f): string`.

- [ ] **Step 1: Write the failing tests**

```ts
it("descarta valores inválidos", () => {
  expect(parseSectionFilters(new URLSearchParams("periodo=abc&bairro=coxipo&ordem=relevancia")))
    .toEqual({ period: "7d", neighborhood: "coxipo", order: "relevance", origin: "all", page: 1 });
});
```

```ts
test("estado vazio com filtro oferece ampliar período", async ({ page }) => {
  await page.goto("/cidade?sub=mobilidade&bairro=coxipo&periodo=7d");
  await expect(page.getByText(/Nenhuma matéria de Mobilidade no Coxipó/)).toBeVisible();
  await page.getByRole("link", { name: "Ver últimos 30 dias" }).click();
  await expect(page).toHaveURL(/periodo=30d/);
});
```

- [ ] **Step 2–4:** FAIL → implementar (404 para editoria desconhecida) → PASS.
- [ ] **Step 5: Commit** `feat(editoria): filtros na URL, carregar mais e estado vazio`

### Task 6: Matéria, histórico e informar problema

**Files:**
- Create: `src/app/(public)/materia/[slug]/page.tsx`, `historico/page.tsx`, `src/components/editorial/AiSummaryBlock.tsx`, `UpdateNote.tsx`, `CorrectionNote.tsx`, `SourcesList.tsx`, `ReportProblemForm.tsx`, `ShareSheet.tsx`, `ReadingSettings.tsx`, `UpdatedWhileReading.tsx`, `src/app/(public)/materia/[slug]/actions.ts`, `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`, `tests/e2e/article.spec.ts`

**Interfaces:**
- Produces: `reportProblem(formData): Promise<{ ok: true } | { ok: false; error: "rate_limited" | "invalid" }>`; `checkRateLimit(key: string, limit: number, windowSec: number, now?: number): Promise<boolean>`; `articleJsonLd(a: ArticleView): object`.

- [ ] **Step 1: Write the failing tests**

```ts
it("6ª tentativa em 1 h é recusada", async () => {
  for (let i = 0; i < 5; i++) expect(await checkRateLimit("ip:abc", 5, 3600, 1000 + i)).toBe(true);
  expect(await checkRateLimit("ip:abc", 5, 3600, 2000)).toBe(false);
});
```

```ts
test("matéria mostra resumo por IA, fontes e JSON-LD", async ({ page }) => {
  await page.goto("/materia/plano-onibus-cpa-centro");
  await expect(page.getByText("RESUMO POR IA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fontes" })).toBeVisible();
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().innerText());
  expect(ld["@type"]).toBe("NewsArticle");
  expect(ld.dateModified).toBeTruthy();
});
test("informar problema funciona sem login", async ({ page }) => {
  await page.goto("/materia/plano-onibus-cpa-centro");
  await page.getByRole("button", { name: "Informar problema" }).click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("status")).toContainText("Resposta da redação em até 24 h");
});
test("aviso de atualização durante a leitura", async ({ page }) => {
  await page.clock.install();
  await page.goto("/materia/plano-onibus-cpa-centro?fixture=vai-atualizar");
  await page.clock.fastForward("02:05");
  await expect(page.getByRole("status")).toContainText("Esta matéria foi atualizada às");
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(materia): leitura, resumo IA, fontes, correções e informar problema`

### Task 7: Assunto e lista de assuntos

**Files:**
- Create: `src/app/(public)/assunto/[slug]/page.tsx`, `src/app/(public)/assuntos/page.tsx`, `src/components/editorial/ConvergenceBlock.tsx`, `Timeline.tsx`, `TopicFaq.tsx`
- Test: `tests/e2e/topic.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("assunto mostra concordam, divergem, não confirmado e cobertura externa rotulada", async ({ page }) => {
  await page.goto("/assunto/obra-viaduto-miguel-sutil");
  for (const h of ["As fontes concordam", "As fontes divergem", "Ainda não confirmado"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText("Em apuração")).toBeVisible();
  const ext = page.getByRole("region", { name: "Cobertura de outros veículos" });
  await expect(ext.getByText("AGREGADO").first()).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(assunto): página de assunto e lista de assuntos`

### Task 8: Agenda, evento, .ics e sugerir evento

**Files:**
- Create: `src/app/(public)/agenda/page.tsx`, `agenda/[slug]/page.tsx`, `agenda/sugerir/page.tsx`, `agenda/sugerir/actions.ts`, `src/app/api/ics/[slug]/route.ts`, `src/lib/ics.ts`, `src/components/editorial/AgendaCalendar.tsx`
- Test: `src/lib/ics.test.ts`, `tests/e2e/agenda.spec.ts`

**Interfaces:**
- Produces: `toIcs(e: { uid; title; startsAt: string; endsAt?: string; venue; url }): string`.

- [ ] **Step 1: Write the failing tests**

```ts
it("ics no fuso de Cuiabá atravessando meia-noite", () => {
  const ics = toIcs({ uid: "e1", title: "Noite do Rasqueado", startsAt: "2026-10-04T00:00:00Z", endsAt: "2026-10-04T03:30:00Z", venue: "Orla do Porto", url: "https://x" });
  expect(ics).toContain("DTSTART;TZID=America/Cuiaba:20261003T200000");
  expect(ics).toContain("DTEND;TZID=America/Cuiaba:20261003T233000");
});
```

```ts
test("lista e calendário mantêm filtro de gratuitos na URL", async ({ page }) => {
  await page.goto("/agenda?gratuito=1");
  await page.getByRole("button", { name: "Calendário" }).click();
  await expect(page).toHaveURL(/view=cal/);
  await expect(page).toHaveURL(/gratuito=1/);
});
test("sugerir evento sem login", async ({ page }) => {
  await page.goto("/agenda/sugerir");
  await page.getByLabel("Nome do evento").fill("Feira de discos");
  await page.getByRole("button", { name: "Enviar sugestão" }).click();
  await expect(page.getByText(/Informe a data de início/)).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(agenda): lista, calendário, evento, ics e sugestão`

### Task 9: Explorar e coleções [paralelo]

**Files:**
- Create: `src/app/(public)/explorar/page.tsx`, `src/app/(public)/colecoes/[slug]/page.tsx`
- Test: `tests/e2e/explore.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("explorar leva a editorias, assuntos, coleções, fontes e agenda", async ({ page }) => {
  await page.goto("/explorar");
  for (const n of ["Cidade", "Assuntos em destaque", "Coleções", "Fontes", "Agenda"])
    await expect(page.getByRole("link", { name: new RegExp(n) }).first()).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(explorar): hub de descoberta e coleções`

### Task 10: Institucionais e estados de sistema [paralelo]

**Files:**
- Create: `src/app/(public)/{sobre,principios-editoriais,metodologia,como-usamos-ia,correcoes,direito-de-resposta,anuncie,contato,termos}/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/(public)/materia/[slug]/gone.tsx`, `public/offline.html`
- Test: `tests/e2e/system-states.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("matéria arquivada responde 410 com motivo", async ({ page }) => {
  const r = await page.goto("/materia/materia-arquivada-seed");
  expect(r!.status()).toBe(410);
  await expect(page.getByText(/foi retirada/)).toBeVisible();
});
test("404 oferece busca", async ({ page }) => {
  const r = await page.goto("/materia/nao-existe");
  expect(r!.status()).toBe(404);
  await expect(page.getByRole("searchbox")).toBeVisible();
});
test("correções públicas listam a do seed", async ({ page }) => {
  await page.goto("/correcoes");
  await expect(page.getByText(/20 minutos, não 18/)).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar (410 via `Response` em route handler de fallback ou `notFound` customizado com status definido em `generateMetadata` + middleware; escolher a opção que o Next.js atual suportar e documentar no relatório) → PASS.
- [ ] **Step 5: Commit** `feat: páginas institucionais e estados de sistema`

### Task 11: SEO técnico

**Files:**
- Create: `src/app/sitemap.ts`, `src/app/sitemap-news.xml/route.ts`, `src/app/robots.ts`, `src/lib/seo/jsonld.ts`
- Test: `src/lib/seo/jsonld.test.ts`, `tests/e2e/seo.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("sitemap de notícias só contém últimas 48 h", async () => {
  const xml = await buildNewsSitemap(new Date("2026-09-27T18:00:00Z"));
  expect(xml).toContain("plano-onibus-cpa-centro");
  expect(xml).not.toContain("materia-de-agosto-seed");
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(seo): sitemaps, robots e dados estruturados`

### Task 12: Acessibilidade, verificação e relatório da fase

**Files:**
- Create: `tests/a11y/public.spec.ts`, `docs/reports/P1.md`

- [ ] **Step 1: Write the failing test**

```ts
const routes = ["/", "/cidade", "/materia/plano-onibus-cpa-centro", "/assunto/obra-viaduto-miguel-sutil", "/assuntos", "/agenda", "/agenda/noite-do-rasqueado", "/agenda/sugerir", "/explorar", "/colecoes/fim-de-semana-na-orla", "/correcoes", "/metodologia"];
for (const r of routes) test(`@a11y ${r}`, async ({ page }) => {
  await page.goto(r);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(res.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
});
```

- [ ] **Step 2:** Run `pnpm test:a11y` → corrigir violações até PASS.
- [ ] **Step 3:** `pnpm verify`; PR; preview; roteiro agent-browser P1 (`docs/testing.md` §3); Lighthouse CI nas 4 rotas.
- [ ] **Step 4:** Rodar `impeccable audit` nas rotas da fase e aplicar correções de severidade alta.
- [ ] **Step 5:** `docs/reports/P1.md` com URLs, prints, resultados e pendências. Merge.
- [ ] **Step 6: Commit** `test(a11y): portal público sem violações graves`
