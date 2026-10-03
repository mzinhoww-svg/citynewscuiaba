import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { forwardedFor } from "./own-ip";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("home abre em pt-BR com a manchete como h1", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/CityNews Cuiabá/);
});

test("home: conteúdo CityNews na dobra e agregado abaixo, rotulado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const agg = page.getByRole("region", { name: "Veja também em outros portais" });
  const box = await agg.boundingBox();
  expect(box!.y).toBeGreaterThan(844);
  await expect(agg.getByText("AGREGADO").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("celular: manchete, resumo e origem na 1ª dobra, página ≤ 4.700 px, h1 único", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Consentimento já decidido: o banner fica fechado e não entra na conta da dobra.
  await page.context().addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const lead = page.locator("main article").first();
  const dek = lead.locator("p.type-body-read");
  const origin = lead.getByText(/ORIGINAL CITYNEWS|Feito a partir de|AGREGADO/).first();
  for (const el of [page.getByRole("heading", { level: 1 }), dek, origin]) {
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  const agg = page.getByRole("region", { name: "Veja também em outros portais" });
  expect((await agg.boundingBox())!.y).toBeGreaterThan(844);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  // Folga de ~25 px no Chromium; a tipografia do WebKit quebra linhas diferentes (A-104), então o
  // teto vale só aqui.
  if (testInfo.project.name !== "mobile-webkit") expect(height).toBeLessThanOrEqual(4700);
});

test("desktop: lead (8 col) ao lado de Agora (4 col)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const lead = (await page.locator("main article").first().boundingBox())!;
  const now = (await page.getByRole("region", { name: "Agora", exact: true }).boundingBox())!;
  expect(now.x).toBeGreaterThan(lead.x + lead.width - 1);
  expect(Math.abs(now.y - lead.y)).toBeLessThan(40);
  expect(lead.width / now.width).toBeGreaterThan(1.8);
  expect(lead.width / now.width).toBeLessThan(2.2);
});

test("trilhos da home rolam por teclado, sem rolagem automática", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const rail = page.getByRole("list", { name: "Serviços", exact: true });
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toHaveAttribute("tabindex", "0");
  await rail.focus();
  const before = await rail.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(1500);
  expect(await rail.evaluate((el) => el.scrollLeft)).toBe(before);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  await page.keyboard.press("Home");
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBe(0);
});

test("editorias em abas no celular trocam o painel; no desktop, três colunas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Editorias" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("region", { name: "Política", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Economia", exact: true })).toBeHidden();
  await tabs.getByRole("tab", { name: "Economia" }).click();
  await expect(page.getByRole("region", { name: "Economia", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Política", exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(tabs).toBeHidden();
  for (const n of ["Política", "Economia", "Cultura"]) {
    await expect(page.getByRole("region", { name: n, exact: true })).toBeVisible();
  }
});

test("lead sem foto é cabeçalho tipográfico compacto (≤ 96 px) e a manchete sobe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const header = page.locator('[data-cover="header"]').first();
  if ((await header.count()) === 0) test.skip(true, "lead do seed tem foto");
  await expect(header).toBeVisible();
  await expect.poll(async () => (await header.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  const box = await header.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(96);
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(h1!.y).toBeLessThan(800 / 2);
});

test("sem urgente publicado, faixa não aparece", async ({ page }) => {
  // O seed não tem matéria urgente; o caso com urgente é coberto em tests/integration/queries.test.ts
  // e no teste do componente UrgentBar.
  await page.goto("/");
  await expect(page.getByRole("alert", { name: /Urgente/ })).toHaveCount(0);
});

test("home tem os blocos de P01 na ordem", async ({ page }) => {
  // Desktop: as três editorias aparecem juntas (no celular são abas, uma por vez).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const names = [
    "Agora",
    "Assuntos em destaque",
    "Coleções",
    "Perto de você",
    "Agenda",
    "Serviços",
    "Política",
    "Economia",
    "Cultura",
    "Mais lidas em Cuiabá",
    "Fontes em destaque",
    "Veja também em outros portais",
    "Receba a newsletter",
  ];
  const tops: number[] = [];
  for (const name of names) {
    const region = page.getByRole("region", { name, exact: true });
    await expect(region, name).toHaveCount(1);
    tops.push((await region.boundingBox())!.y);
  }
  // "Agora" fica ao lado da manchete no desktop; os demais seguem a ordem vertical.
  const rest = tops.slice(1);
  expect([...rest].sort((a, b) => a - b)).toEqual(rest);
});

test("todo card de matéria mostra a origem, com no máximo 1 plaqueta", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("main article:has(a[href^='/materia/'])");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(5);
  for (const card of await cards.all()) {
    const plaques = await card.getByTestId("origin-label").count();
    expect(plaques).toBeLessThanOrEqual(1);
    // Origem sempre visível em texto: plaqueta ORIGINAL ou "Feito a partir de n fontes".
    expect(await card.innerText()).toMatch(/ORIGINAL CITYNEWS|Feito a partir de/);
  }
});

test("agregados abrem o original em nova aba", async ({ page }) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Veja também em outros portais" });
  // A home é transmitida em streaming: espera o bloco existir antes de contar.
  await expect(region).toBeVisible();
  // Até 4 itens, um por veículo (home.ts). Todo link do bloco vai para fora, em nova aba.
  const links = region.locator("article a[href]");
  await expect(links.first()).toBeVisible();
  const n = await links.count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(4);
  const origin = new URL(page.url()).origin;
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    const href = (await link.getAttribute("href")) ?? "";
    expect(href).toMatch(/^https?:\/\/[^/]+\//);
    expect(href.startsWith(origin)).toBe(false);
  }
});

test("newsletter valida o e-mail e aceita inscrição sem login", async ({ page }) => {
  // IP próprio por execução: o limite de 5 envios por hora vale por conexão.
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/");
  const form = page.getByRole("region", { name: "Receba a newsletter" });
  await form.getByLabel("E-mail").fill("nao-e-email");
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByText(/Confira o e-mail/)).toBeVisible();
  await form.getByLabel("E-mail").fill(`leitora+${Date.now()}@exemplo.com`);
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByRole("status")).toContainText("Inscrição recebida");
});

test("home sem violações do axe @a11y", async ({ page }) => {
  await page.goto("/");
  // Espera o conteúdo substituir o loading.tsx (streaming) antes de auditar.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("home no modo escuro sem violações serious/critical @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});
