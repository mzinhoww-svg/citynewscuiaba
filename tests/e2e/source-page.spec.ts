import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { skipInvite } from "./invite";
import { forwardedFor } from "./own-ip";

/*
 * Página da fonte (P15) e Panorama (P16), P2-T8: propriedade e política declaradas, itens como
 * cards AGREGADOS que abrem o original, comparação de coberturas em superfície neutra.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

test("página da fonte declara propriedade do conteúdo e política", async ({ page }) => {
  await page.goto("/fontes/folha-do-cerrado");
  await expect(page.getByRole("heading", { level: 1, name: "Folha do Cerrado" })).toBeVisible();
  await expect(page.getByText("Conteúdo pertence à Folha do Cerrado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sobre esta fonte no CityNews" })).toBeVisible();
  await expect(page.getByText("Exibição", { exact: true })).toBeVisible();
  await expect(page.getByText("Vigente até 31/12/2026")).toBeVisible();
  const open = page.getByRole("link", { name: /Abrir original/ });
  await expect(open.first()).toHaveAttribute("target", "_blank");
  await expect(open.first()).toHaveAttribute("rel", /noopener/);
  await expect(open.first()).toHaveAttribute("href", /^https:\/\/folhadocerrado\.example\//);
  await expect(page.getByRole("link", { name: /Abrir site de Folha do Cerrado/ })).toHaveAttribute(
    "target",
    "_blank",
  );
});

test("página da fonte é indexável e está no sitemap", async ({ page, request }) => {
  await page.goto("/fontes/mt-agora");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/fontes\/mt-agora$/,
  );
  expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
  const xml = await (await request.get("/sitemap-pages.xml")).text();
  expect(xml).toContain("/fontes/mt-agora");
  expect(xml).toContain("/panorama");
  expect((await request.get("/fontes/nao-existe")).status()).toBe(404);
});

test("seguir na página da fonte sem login e filtro por editoria", async ({ page }) => {
  await page.goto("/fontes/mt-agora");
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const follow = page.getByRole("button", { name: "Seguir MT Agora" });
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await skipInvite(page);
  await page.goto("/fontes?aba=seguidas");
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(
    page.locator('[role="tabpanel"]:not([hidden])').getByRole("link", { name: "MT Agora" }),
  ).toBeVisible();

  await page.goto("/fontes/mt-agora");
  await page
    .getByRole("navigation", { name: "Filtrar por editoria" })
    .getByRole("link", { name: "Economia" })
    .click();
  await expect(page).toHaveURL(/editoria=economia/);
});

test("link quebrado é avisado sem login", async ({ page }) => {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/fontes/mt-agora");
  await page
    .getByRole("button", { name: /^Avisar link quebrado/ })
    .first()
    .click();
  await expect(page.getByText("Obrigado. A redação confere em até 24 h.")).toBeVisible();
});

test("panorama usa superfície neutra e compara coberturas", async ({ page }) => {
  await page.goto("/panorama");
  await expect(page.getByRole("heading", { level: 1, name: "Panorama de fontes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comparar coberturas" })).toBeVisible();
  await expect(page.getByText("Sem cobertura").first()).toBeVisible();
  await expect(page.getByText("CityNews", { exact: true })).toBeVisible();
  const bg = await page
    .locator("main > div")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const token = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--surface-aggregated)";
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  });
  expect(bg).toBe(token);
  // Nenhum item sem rótulo AGREGADO; todo link de item abre fora do CityNews.
  const cards = page.locator("[data-item-source] article");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await expect(cards.nth(i).getByText(/^AGREGADO/)).toBeVisible();
    await expect(cards.nth(i).getByRole("link").first()).toHaveAttribute("target", "_blank");
  }
  for (const col of await page.locator('[data-coverage="covered"]').all()) {
    await expect(col.getByText(/^AGREGADO/)).toBeVisible();
    await expect(col.getByRole("link")).toHaveAttribute("target", "_blank");
  }
});

test("panorama: seletor de fontes fica no navegador e tema filtra", async ({ page }) => {
  await page.goto("/panorama");
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByText("Fontes exibidas").click();
  const total = await page.locator("[data-item-source]").count();
  await page.getByRole("checkbox", { name: "MT Agora" }).uncheck();
  await expect(page.locator('[data-item-source="mt-agora"]')).toHaveCount(0);
  expect(await page.locator("[data-item-source]").count()).toBeLessThan(total);
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-item-source="mt-agora"]')).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Temas" })
    .getByRole("link", { name: "Seca e fumaça na Baixada Cuiabana" })
    .click();
  await expect(page).toHaveURL(/assunto=seca-e-fumaca-na-baixada-cuiabana/);
  await expect(page.getByText(/Assunto mais ativo agora: Seca e fumaça/)).toBeVisible();
});

for (const path of ["/fontes/folha-do-cerrado", "/panorama"]) {
  test(`${path} sem violações graves de acessibilidade @a11y`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
  });
}
