# P2 Fontes, Personalização, Privacidade e Conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fontes em destaque com ranking explicável, Panorama, Favoritos, Alertas, Newsletter, consentimento granular, perfil anônimo local e login opcional com migração.

**Architecture:** Domínio puro em `src/lib/{consent,anon,events,ranking}`. Perfil anônimo em IndexedDB (`idb-keyval`). Eventos enviados a `/api/events` só com consentimento. Ranking calculado no servidor a partir de `source_stats_daily` + sinais individuais consentidos, com fallback no cliente. Supabase Auth para conta.

**Tech Stack:** Next.js, Supabase Auth, idb-keyval, zod, Radix (Switch, Tabs, Dialog, Popover), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-citynews-design.md` §5.2–5.4 e §7 · Telas: `docs/screens.md` P14–P23, C01–C06 · Eventos: `docs/tracking-plan.md`

## Global Constraints

- Login nunca é exigido para: navegar, ler, pesquisar, busca tradicional, agenda, fontes agregadas, recomendações básicas, portal anônimo.
- Textos fixos (copiar exatamente): "Quer manter suas fontes e notícias salvas em qualquer dispositivo?" · "Criar conta" · "Entrar" · "Agora não" · "Você pode continuar sem fazer login." · "Para sincronizar essa preferência entre dispositivos, é necessário entrar ou criar uma conta. Você pode continuar usando o CityNews sem cadastro." · "Personalize suas fontes e receba uma experiência mais relevante." · "Escolher fontes agora" · "Continuar sem personalizar" · "Entrar ou criar conta".
- Pesos `rec-v1`: popularity 0,35 · individual 0,25 · recency 0,15 · engagement 0,10 · operational 0,10 · diversity 0,05. Teto 25% por fonte. Descoberta 1 a cada 5.
- Sinal fraco: `seconds < 10` ou `scrollPct < 25` ou interação isolada ou retorno < 5 s. Leitura qualificada: (≥ 30 s e rolagem ≥ 50%) ou ≥ 60 s.
- Consentimento: cookie `cn_consent` = `v1|m0|p0` (versão, métricas, personalização). Sem resposta = `m0|p0`.
- Nunca usar o verbo "gostar" em justificativas. Nunca inferir atributos sensíveis.
- Convite de login: no máximo 1 por gatilho a cada 7 dias; sempre com "Agora não".

## Review Focus

1. Leitor com personalização desligada abre a aba "Recomendadas para você" → vê populares da região com rótulo "Popular entre leitores da sua região", nunca lista vazia → teste em Task 7.
2. Navegador com IndexedDB indisponível (modo privado antigo, cota cheia) → salvar e seguir caem para memória da sessão com aviso "Não conseguimos salvar neste navegador" → teste em Task 2.
3. Uma única fonte com 80% dos cliques da semana → lista "Mais acessadas" com 8 itens mostra essa fonte no máximo 2 vezes quando a lista é de itens, e 1 vez quando é de fontes → teste em Task 4.
4. Leitor faz login num aparelho onde a conta já tem 1 das 2 fontes locais → migração não duplica e informa "2 fontes sincronizadas" → teste em Task 11.
5. Recusa "Não quero recomendações personalizadas" ao ocultar um card → personalização desliga, evento `personalization_disabled` com `from: "dismiss"` → teste em Task 7.

---

### Task 1: Consentimento

**Files:**
- Create: `src/lib/consent/index.ts`, `src/components/editorial/ConsentBanner.tsx`, `src/app/(public)/privacidade/page.tsx`
- Test: `src/lib/consent/consent.test.ts`, `tests/e2e/consent.spec.ts`

**Interfaces:**
- Produces: `type Consent = { version: "v1"; metrics: boolean; personalization: boolean; decided: boolean }`; `parseConsent(cookie?: string): Consent`; `serializeConsent(c): string`; `useConsent(): [Consent, (next: Partial<Consent>) => void]` (client).

- [ ] **Step 1: Write the failing tests**

```ts
it("sem cookie = só necessário e não decidido", () =>
  expect(parseConsent(undefined)).toEqual({ version: "v1", metrics: false, personalization: false, decided: false }));
it("round-trip", () => expect(parseConsent(serializeConsent({ version: "v1", metrics: true, personalization: true, decided: true })).personalization).toBe(true));
it("cookie malformado = padrão", () => expect(parseConsent("lixo").decided).toBe(false));
```

```ts
test("Só o necessário não envia eventos", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/events")) calls.push(r.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Só o necessário" }).click();
  await page.goto("/materia/plano-onibus-cpa-centro");
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});
```

- [ ] **Step 2–4:** FAIL → implementar (banner é `region` fixa no rodapé, não modal; não cobre o h1 em 360 px) → PASS.
- [ ] **Step 5: Commit** `feat(consent): consentimento granular e banner`

### Task 2: Perfil anônimo local

**Files:**
- Create: `src/lib/anon/store.ts`, `src/lib/anon/types.ts`
- Test: `src/lib/anon/store.test.ts`

**Interfaces:**
- Consumes: `Consent` (T1).
- Produces: `interface AnonProfile { anonId: string | null; createdAt: string; follows: { kind: "source"|"topic"|"section"|"collection"; id: string; at: string }[]; saved: { ref: string; at: string; progress: number }[]; history: { ref: string; sourceSlug?: string; section?: string; at: string; seconds: number; scrollPct: number }[]; searches: string[]; interests: { key: string; evidence: string; weak: boolean }[]; hidden: { sourceSlug: string; reason: DismissReason; at: string }[] }`; `createAnonStore(backend?: KV): AnonStore` com `get()`, `follow()`, `unfollow()`, `save()`, `recordRead()`, `hide()`, `clearHistory()`, `reset()`, `ensureAnonId(consent)`; `type DismissReason = "not_interested" | "already_know" | "hide_topic" | "no_personalization"`. Backend padrão IndexedDB; fallback em memória com `degraded: true`.

- [ ] **Step 1: Write the failing tests**

```ts
it("sem personalização não cria anonId, mas segue e salva localmente", async () => {
  const s = createAnonStore(memoryKV());
  await s.ensureAnonId({ version: "v1", metrics: false, personalization: false, decided: true });
  await s.follow("source", "folha-do-cerrado");
  const p = await s.get();
  expect(p.anonId).toBeNull();
  expect(p.follows).toHaveLength(1);
});
it("histórico guarda só 30 dias e 20 buscas", async () => { /* inserir 25 buscas e leitura de 40 dias atrás; esperar 20 e 0 */ });
it("backend indisponível cai para memória e sinaliza", async () => {
  const s = createAnonStore(failingKV());
  await s.save("article:1");
  expect(s.degraded).toBe(true);
  expect((await s.get()).saved).toHaveLength(1);
});
```

- [ ] **Step 2–4:** FAIL → implementar (`crypto.randomUUID()`) → PASS.
- [ ] **Step 5: Commit** `feat(anon): perfil anônimo local com fallback`

### Task 3: Eventos

**Files:**
- Create: `src/lib/events/schema.ts`, `src/lib/events/track.ts`, `src/lib/events/weak.ts`, `src/app/api/events/route.ts`
- Test: `src/lib/events/events.test.ts`, `tests/integration/events-api.test.ts`

**Interfaces:**
- Produces: `EventName` (17 eventos de `docs/tracking-plan.md` §2), `EventEnvelope` (zod), `track(name, props, ctx)` (client; respeita consentimento, `navigator.sendBeacon`), `isWeakSignal(r: { seconds: number; scrollPct: number; isolated: boolean; bouncedMs?: number }): boolean`, `isQualifiedRead(seconds, scrollPct): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([[9, 90, false, false, true], [40, 20, false, false, true], [40, 60, false, false, false], [40, 60, true, false, true]])
  ("isWeakSignal(%d s, %d%%, isolado=%s) = %s", (s, p, iso, _, exp) => expect(isWeakSignal({ seconds: s, scrollPct: p, isolated: iso })).toBe(exp));
it("leitura qualificada", () => { expect(isQualifiedRead(30, 50)).toBe(true); expect(isQualifiedRead(29, 90)).toBe(false); expect(isQualifiedRead(60, 5)).toBe(true); });
it("envelope rejeita anonId sem consentimento de personalização", () => {
  const r = EventEnvelope.safeParse({ ...validEvent, anonId: crypto.randomUUID(), consent: { version: "v1", metrics: true, personalization: false } });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 2–4:** FAIL → implementar (refinement zod: `anonId !== null ⇒ consent.personalization`; API grava em `events` com `received_at` e retorna 204; 400 em payload inválido) → PASS.
- [ ] **Step 5: Commit** `feat(events): schema, sinal fraco e API consentida`

### Task 4: Ranking de fontes

**Files:**
- Create: `src/lib/ranking/score.ts`, `src/lib/ranking/rank.ts`, `src/lib/ranking/explain.ts`, `src/content/pt-BR/recommendations.ts`
- Test: `src/lib/ranking/ranking.test.ts`

**Interfaces:**
- Produces:
  - `type Weights = { popularity: number; individual: number; recency: number; engagement: number; operational: number; diversity: number }`; `REC_V1: Weights`
  - `interface SourceSignals { slug: string; locality: string; popularity: number; individual: number; recency: number; engagement: number; operational: number; diversity: number; followed: boolean; pinned: boolean; excluded: boolean; blocked: boolean; isNewForUser: boolean }` (componentes já normalizados 0–1)
  - `scoreSource(s: SourceSignals, w: Weights, personalization: boolean): number`
  - `rankSources(list: SourceSignals[], opts: { list: "popular"|"trending"|"recommended"|"followed"|"local"|"verified"|"new"; limit: number; cap?: number; discoveryEvery?: number; hidden: string[]; weights: Weights; personalization: boolean }): RankedSource[]` com `RankedSource = SourceSignals & { score: number; reason: ReasonKey; discovery: boolean }`
  - `capItems<T extends { sourceSlug: string }>(items: T[], limit: number, cap: number): T[]`
  - `explainRecommendation(r: RankedSource, ctx: { topic?: string }): string`

- [ ] **Step 1: Write the failing tests**

```ts
it("sem personalização o peso individual some e os demais somam 1", () => {
  const s = { ...sig("fc"), popularity: 1, individual: 1, recency: 0, engagement: 0, operational: 0, diversity: 0 };
  expect(scoreSource(s, REC_V1, false)).toBeCloseTo(0.35 / 0.75, 5);
  expect(scoreSource(s, REC_V1, true)).toBeCloseTo(0.60, 5);
});
it("teto de 25% em lista de itens", () => {
  const items = [...Array(6)].map(() => ({ sourceSlug: "fc" })).concat([{ sourceSlug: "ma" }, { sourceSlug: "db" }, { sourceSlug: "rp" }]);
  expect(capItems(items, 8, 0.25).filter(i => i.sourceSlug === "fc")).toHaveLength(2);
});
it("recomendadas: 1 descoberta a cada 5", () => {
  const r = rankSources(fixtureTen(), { list: "recommended", limit: 10, hidden: [], weights: REC_V1, personalization: true });
  expect(r.slice(0, 5).filter(x => x.discovery)).toHaveLength(1);
  expect(r.slice(5, 10).filter(x => x.discovery)).toHaveLength(1);
});
it("ocultadas, bloqueadas e excluídas não aparecem; fixadas vêm primeiro", () => {
  const r = rankSources(fixtureWithFlags(), { list: "popular", limit: 5, hidden: ["pv"], weights: REC_V1, personalization: false });
  expect(r.map(x => x.slug)).not.toContain("pv");
  expect(r[0]!.pinned).toBe(true);
});
it("justificativa nunca usa 'gosta'", () => {
  for (const x of rankSources(fixtureTen(), { list: "recommended", limit: 10, hidden: [], weights: REC_V1, personalization: true }))
    expect(explainRecommendation(x, { topic: "política local" })).not.toMatch(/gost/i);
});
it("fonte seguida explica como seguida", () => {
  expect(explainRecommendation({ ...ranked("fc"), followed: true, reason: "followed" }, {})).toBe("Veículo seguido por você");
});
```

- [ ] **Step 2–4:** FAIL → implementar conforme `docs/tracking-plan.md` §4–5 → PASS.
- [ ] **Step 5: Commit** `feat(ranking): score composto, teto, descoberta e justificativas`

### Task 5: Dados de fontes no servidor

**Files:**
- Create: `supabase/migrations/0004_source_stats.sql` (função `refresh_source_stats_daily()` e job `pg_cron` diário às 3h), `src/lib/db/queries/sources.ts`
- Test: `tests/integration/sources.test.ts`

**Interfaces:**
- Consumes: `SourceSignals` (T4).
- Produces: `getSourceSignals({ window: "1d" | "7d"; locality?: "cuiaba" | "mt" | "nacional"; category?: string; anonId?: string }): Promise<SourceSignals[]>` (normalização por percentil; meia-vida de 3 dias na janela 7 d); `getSource(slug)`; `listSourceItems(slug, section?)`.

- [ ] **Step 1: Write the failing test**

```ts
it("fonte com 3 falhas seguidas tem operational ≤ 0,2", async () => {
  const s = (await getSourceSignals({ window: "7d" })).find(x => x.slug === "cena-cuiabana")!;
  expect(s.operational).toBeLessThanOrEqual(0.2);
});
it("sem anonId, individual = 0", async () => {
  expect((await getSourceSignals({ window: "7d" })).every(s => s.individual === 0)).toBe(true);
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(fontes): sinais de fonte a partir de estatísticas diárias`

### Task 6: Componentes de fonte [paralelo]

**Files:**
- Create: `src/components/editorial/SourceCard.tsx`, `SourceRow.tsx`, `PopularSourcesRail.tsx`, `DismissMenu.tsx`, `RecommendationReason.tsx`
- Test: `src/components/editorial/sources.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("SourceCard mostra alcance aproximado, tendência, matérias hoje, atualização e justificativa", () => {
  render(<SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} />);
  for (const t of ["~18 mil", "estável", "42 hoje", "há 12 min", "Mais acessada em Cuiabá esta semana"])
    expect(screen.getByText(new RegExp(t))).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Seguir Folha do Cerrado" })).toHaveAttribute("aria-pressed", "false");
});
it("ocultar pede motivo com as 4 opções", async () => {
  render(<DismissMenu onChoose={vi.fn()} sourceName="MT Agora" />);
  await userEvent.click(screen.getByRole("button", { name: "Ocultar MT Agora" }));
  for (const t of ["Não tenho interesse", "Já conheço esta fonte", "Não quero ver este tema", "Não quero recomendações personalizadas"])
    expect(screen.getByRole("menuitem", { name: t })).toBeInTheDocument();
});
```

- [ ] **Step 2–4:** FAIL → implementar (DESIGN.md §6) → PASS.
- [ ] **Step 5: Commit** `feat(ui): cards e listas de fontes`

### Task 7: Tela Fontes em destaque

**Files:**
- Create: `src/app/(public)/fontes/page.tsx`, `src/app/(public)/fontes/SourcesClient.tsx`
- Test: `tests/e2e/sources.spec.ts`

**Interfaces:**
- Consumes: `getSourceSignals` (T5), `rankSources` (T4), `createAnonStore` (T2), `useConsent` (T1), componentes (T6).

- [ ] **Step 1: Write the failing tests**

```ts
const tabs = ["Mais acessadas", "Em alta nesta semana", "Recomendadas para você", "Fontes que você segue", "Fontes locais", "Fontes verificadas", "Novas para descobrir"];
test("7 abas e aviso de que popularidade não é qualidade", async ({ page }) => {
  await page.goto("/fontes");
  for (const t of tabs) await expect(page.getByRole("tab", { name: t })).toBeVisible();
  await expect(page.getByText("Popularidade não é selo de qualidade")).toBeVisible();
});
test("personalização desligada: Recomendadas não fica vazia", async ({ page }) => {
  await page.goto("/fontes");
  await page.getByRole("switch", { name: "Recomendações personalizadas" }).click();
  await page.getByRole("tab", { name: "Recomendadas para você" }).click();
  await expect(page.getByText("Popular entre leitores da sua região").first()).toBeVisible();
});
test("seguir sem login aparece em Fontes que você segue", async ({ page }) => {
  await page.goto("/fontes");
  await page.getByRole("button", { name: "Seguir MT Agora" }).click();
  await page.getByRole("tab", { name: "Fontes que você segue" }).click();
  await expect(page.getByText("MT Agora")).toBeVisible();
});
test("ocultar com 'Não quero recomendações personalizadas' desliga personalização", async ({ page }) => {
  await page.goto("/fontes");
  await page.getByRole("tab", { name: "Recomendadas para você" }).click();
  await page.getByRole("button", { name: /^Ocultar / }).first().click();
  await page.getByRole("menuitem", { name: "Não quero recomendações personalizadas" }).click();
  await expect(page.getByRole("switch", { name: "Recomendações personalizadas" })).toHaveAttribute("aria-checked", "false");
});
```

- [ ] **Step 2–4:** FAIL → implementar (abas na URL `?aba=`; filtros hoje, semana, tendência, Cuiabá, MT, nacionais, cultura, esporte, economia, serviços) → PASS.
- [ ] **Step 5: Commit** `feat(fontes): Fontes em destaque com 7 listas e personalização`

### Task 8: Página da fonte e Panorama

**Files:**
- Create: `src/app/(public)/fontes/[slug]/page.tsx`, `src/app/(public)/panorama/page.tsx`, `src/components/editorial/CoverageCompare.tsx`, `src/components/editorial/BrokenLinkReport.tsx`
- Test: `tests/e2e/source-page.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("página da fonte declara propriedade do conteúdo e política", async ({ page }) => {
  await page.goto("/fontes/folha-do-cerrado");
  await expect(page.getByText("Conteúdo pertence à Folha do Cerrado")).toBeVisible();
  await expect(page.getByText("Exibição")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir original" }).first()).toHaveAttribute("target", "_blank");
});
test("panorama usa superfície neutra e compara coberturas", async ({ page }) => {
  await page.goto("/panorama");
  await expect(page.getByRole("heading", { name: "Comparar coberturas" })).toBeVisible();
  await expect(page.getByText("Sem cobertura")).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(fontes): página da fonte e Panorama de fontes`

### Task 9: Favoritos, Alertas e Newsletter

**Files:**
- Create: `src/app/(public)/favoritos/page.tsx`, `src/app/(public)/alertas/page.tsx`, `src/app/(public)/newsletter/page.tsx`, `newsletter/preferencias/page.tsx`, `src/app/api/newsletter/route.ts`, `src/lib/newsletter/token.ts`, `public/sw.js`
- Test: `src/lib/newsletter/token.test.ts`, `tests/e2e/favorites-alerts.spec.ts`

**Interfaces:**
- Produces: `signNewsletterToken(email, lists, expSec)`, `verifyNewsletterToken(token): Result<{ email; lists }, "expired" | "invalid">`.

- [ ] **Step 1: Write the failing tests**

```ts
it("token expira", () => {
  const t = signNewsletterToken("a@b.com", ["diaria"], -1);
  expect(verifyNewsletterToken(t)).toEqual({ ok: false, error: "expired" });
});
```

```ts
test("salvos anônimos mostram aviso de aparelho e funcionam", async ({ page }) => {
  await page.goto("/materia/plano-onibus-cpa-centro");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();
  await page.goto("/favoritos");
  await expect(page.getByText("Salvos só neste aparelho")).toBeVisible();
  await expect(page.getByText(/Prefeitura apresenta plano/)).toBeVisible();
});
test("alerta de navegador sem conta; permissão negada explica", async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto("/alertas");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Seu navegador bloqueou as notificações/)).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar (service worker guarda as 20 últimas salvas para leitura offline) → PASS.
- [ ] **Step 5: Commit** `feat: favoritos, alertas e newsletter sem conta`

### Task 10: Convites (primeira visita e login contextual)

**Files:**
- Create: `src/components/editorial/LoginInvite.tsx`, `FirstVisitInvite.tsx`, `src/lib/anon/invites.ts`
- Test: `src/lib/anon/invites.test.ts`, `tests/e2e/login-invite.spec.ts`

**Interfaces:**
- Produces: `shouldShowInvite(trigger: InviteTrigger, history: { trigger: InviteTrigger; at: string }[], now: Date): boolean` (1 por gatilho a cada 7 dias); `shouldShowFirstVisit(qualifiedReadsThisSession: number, decided: boolean): boolean` (true quando ≥ 3 e ainda não decidido).

- [ ] **Step 1: Write the failing tests**

```ts
it("mesmo gatilho não repete em 7 dias", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  expect(shouldShowInvite("save", [{ trigger: "save", at: "2026-09-22T12:00:00Z" }], now)).toBe(false);
  expect(shouldShowInvite("save", [{ trigger: "save", at: "2026-09-20T11:00:00Z" }], now)).toBe(true);
  expect(shouldShowInvite("follow", [{ trigger: "save", at: "2026-09-27T11:00:00Z" }], now)).toBe(true);
});
```

```ts
test("convite após salvar tem as três ações e o texto fixo", async ({ page }) => {
  await page.goto("/materia/plano-onibus-cpa-centro");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Quer manter suas fontes e notícias salvas em qualquer dispositivo?")).toBeVisible();
  for (const b of ["Criar conta", "Entrar", "Agora não"]) await expect(page.getByRole("button", { name: b })).toBeVisible();
  await expect(page.getByText("Você pode continuar sem fazer login.")).toBeVisible();
});
```

- [ ] **Step 2–4:** FAIL → implementar (sheet no mobile, popover no desktop, foco preso e `Esc` fecha como "Agora não", evento `login_skipped`) → PASS.
- [ ] **Step 5: Commit** `feat: convites contextuais sem bloqueio`

### Task 11: Conta: entrar, criar, recuperar, confirmar e migrar

**Files:**
- Create: `src/app/(public)/{entrar,criar-conta,recuperar-senha,redefinir-senha,confirmar}/page.tsx`, `src/app/(public)/entrar/migrar/page.tsx`, `src/lib/anon/migrate.ts`, `src/app/auth/callback/route.ts`
- Test: `src/lib/anon/migrate.test.ts`, `tests/e2e/login-migrate.spec.ts`

**Interfaces:**
- Produces: `planMigration(local: AnonProfile, remote: { follows: string[]; saved: string[] }, choice: { follows: boolean; saved: boolean; interests: boolean; history: boolean; conversations: boolean }): { follows: string[]; saved: string[]; interests: string[]; history: number; summary: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("não duplica e resume em pt-BR", () => {
  const p = planMigration(localWith(["fc", "db"], ["a1", "a2", "a3"]), { follows: ["fc"], saved: [] }, { follows: true, saved: true, interests: true, history: false, conversations: false });
  expect(p.follows).toEqual(["db"]);
  expect(p.summary).toBe("2 fontes e 3 salvos sincronizados");
});
```

```ts
test("erro de login é claro e há saída sem login", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("paulo.rezende@email.com");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar sem login" })).toBeVisible();
});
test("anônimo cria conta e migra", async ({ page }) => { /* seguir 2 fontes, salvar 3, criar conta, migrar, ver "2 fontes e 3 salvos sincronizados" */ });
```

- [ ] **Step 2–4:** FAIL → implementar (Supabase Auth e-mail/senha, link mágico, Google; recuperação com mensagem neutra) → PASS.
- [ ] **Step 5: Commit** `feat(conta): login opcional, recuperação e migração`

### Task 12: Perfil e Como usamos suas recomendações

**Files:**
- Create: `src/app/(public)/perfil/page.tsx`, `src/app/(public)/privacidade/recomendacoes/page.tsx`, `src/app/(public)/perfil/actions.ts` (exportar, excluir)
- Test: `tests/e2e/privacy.spec.ts`, `tests/a11y/p2.spec.ts`, `docs/reports/P2.md`

- [ ] **Step 1: Write the failing tests**

```ts
test("remover interesse, redefinir e desativar", async ({ page }) => {
  await seedAnonWithInterests(page, ["Política local", "Mobilidade"]);
  await page.goto("/privacidade/recomendacoes");
  await page.getByRole("button", { name: "Remover Política local" }).click();
  await expect(page.getByText("Política local")).toHaveCount(0);
  await page.getByRole("button", { name: "Redefinir recomendações" }).click();
  await expect(page.getByRole("status")).toContainText("Recomendações redefinidas");
  await page.getByRole("button", { name: "Desativar recomendações personalizadas" }).click();
  await expect(page.getByRole("switch", { name: "Recomendações pelo que você lê" })).toHaveAttribute("aria-checked", "false");
});
test("excluir conta exige digitar EXCLUIR", async ({ page }) => { /* login de seed, abrir dialog, botão desabilitado até digitar */ });
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. `@a11y` em `/fontes`, `/fontes/folha-do-cerrado`, `/panorama`, `/favoritos`, `/alertas`, `/newsletter`, `/perfil`, `/privacidade/recomendacoes`, `/entrar`, `/criar-conta`.
- [ ] **Step 5:** `pnpm verify`, PR, preview, roteiro agent-browser P2, `impeccable audit` nas telas da fase, relatório `docs/reports/P2.md`, merge.
- [ ] **Step 6: Commit** `feat(privacidade): perfil e controle das recomendações`
