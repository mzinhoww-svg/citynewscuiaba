import { expect, test } from "@playwright/test";
import { openFilters } from "./helpers/filters";

/* P3-T10 · busca tradicional (docs/screens.md P12). Dados do seed (supabase/seed.sql). */

test("resultado destaca termo e mantém filtros na URL", async ({ page }) => {
  await page.goto("/busca?q=viaduto&origem=citynews");
  await expect(page.locator("mark", { hasText: /viaduto/i }).first()).toBeVisible();
  await expect(page.getByLabel("Origem")).toHaveValue("citynews");
  // Só CityNews: nenhum item de outro veículo.
  await expect(
    page.getByTestId("origin-label").and(page.locator('[data-kind="aggregated"]')),
  ).toHaveCount(0);
});

test("sem acento encontra com acento e agrupa por assunto", async ({ page }) => {
  await page.goto("/busca?q=onibus+cpa");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const group = page.getByRole("region", { name: /Novo plano de ônibus entre CPA e Centro/ });
  await expect(group).toBeVisible();
  await expect(group.locator("mark", { hasText: "ônibus" }).first()).toBeVisible();
  await expect(group.locator("mark", { hasText: "CPA" }).first()).toBeVisible();
  expect(await group.getByRole("listitem").count()).toBeGreaterThanOrEqual(2);
});

test("filtro de origem vai para a URL e só mostra outros veículos", async ({ page }) => {
  await page.goto("/busca?q=viaduto");
  await expect(page.locator("mark").first()).toBeVisible();
  await openFilters(page);
  await expect(page.locator("form[data-filter-bar][data-ready=true]")).toBeVisible();
  await page.getByLabel("Origem").selectOption("outros");
  await expect(page).toHaveURL(/origem=outros/);
  await expect(page).toHaveURL(/q=viaduto/);
  await expect(page.getByLabel("Origem")).toHaveValue("outros");
  const labels = page.getByTestId("origin-label");
  await expect(labels.first()).toBeVisible();
  for (const l of await labels.all()) await expect(l).toHaveAttribute("data-kind", "aggregated");
  const external = page.locator('a[target="_blank"]', { hasText: /viaduto/i }).first();
  await expect(external).toHaveAttribute("rel", /noopener/);
});

test("aba de tipo e editoria na URL", async ({ page }) => {
  await page.goto("/busca?q=cpa");
  await page
    .getByRole("navigation", { name: "Tipo de resultado" })
    .getByRole("link", {
      name: "Eventos",
    })
    .click();
  await expect(page).toHaveURL(/tipo=eventos/);
  await expect(page.getByRole("link", { name: /Corrida noturna do CPA/ })).toBeVisible();
});

test("nada encontrado sugere grafia e oferece caminhos", async ({ page }) => {
  await page.goto("/busca?q=viadutu");
  await expect(page.getByRole("heading", { name: /Nenhum resultado para/ })).toBeVisible();
  await page.getByRole("link", { name: "viaduto" }).click();
  await expect(page).toHaveURL(/q=viaduto/);
  await expect(page.locator("mark").first()).toBeVisible();
});

test("autocomplete sugere títulos e guarda buscas recentes removíveis", async ({ page }) => {
  await page.goto("/busca");
  // Espera a hidratação do campo (sem ela, o foco e o texto chegam antes do React).
  await expect(page.locator("form[role=search][data-ready=true]").first()).toBeVisible();
  const box = page.getByRole("combobox", { name: "Buscar no CityNews" });
  await box.fill("onib");
  const option = page.getByRole("option", { name: /ônibus/ }).first();
  await expect(option).toBeVisible();
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/busca\?q=/);
  await expect(page.locator("mark").first()).toBeVisible();

  await page.goto("/busca");
  await expect(page.locator("form[role=search][data-ready=true]").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Buscar no CityNews" }).focus();
  const recent = page.getByRole("region", { name: "Buscas recentes" });
  await expect(recent.getByRole("link").first()).toBeVisible();
  await recent
    .getByRole("button", { name: /Remover/ })
    .first()
    .click();
  await expect(recent).toHaveCount(0);
});

test("consulta com HTML aparece como texto e a página não é indexada", async ({ page }) => {
  let dialog = false;
  page.on("dialog", async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await page.goto("/busca?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  expect(dialog).toBe(false);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("atalho Perguntar ao CityNews leva o mesmo texto", async ({ page }) => {
  await page.goto("/busca?q=viaduto");
  await expect(page.getByRole("link", { name: /Perguntar ao CityNews/ })).toHaveAttribute(
    "href",
    "/pergunte?q=viaduto",
  );
});

test("filtros aplicam na hora, sem botão Aplicar, e ficam na URL", async ({ page }) => {
  await page.goto("/busca?q=viaduto");
  await openFilters(page);
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toHaveCount(0);
  await expect(page.locator("form[data-filter-bar][data-ready=true]")).toBeVisible();
  await page.getByLabel("Período").selectOption("30d");
  await expect(page).toHaveURL(/periodo=30d/);
  await expect(page).toHaveURL(/q=viaduto/);
  await expect(page.getByLabel("Período")).toHaveValue("30d");
  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(page).not.toHaveURL(/periodo=/);
});

test("abas do tipo são chips, com a ativa marcada", async ({ page }) => {
  await page.goto("/busca?q=cpa");
  const tabs = page.getByRole("navigation", { name: "Tipo de resultado" });
  const all = tabs.getByRole("link", { name: "Tudo" });
  await expect(all).toHaveAttribute("aria-current", "page");
  const radius = await all.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  const underline = await all.evaluate((el) => parseFloat(getComputedStyle(el).borderBottomWidth));
  expect(radius).toBeGreaterThan(12);
  expect(underline).toBe(0);
  expect((await all.boundingBox())!.height).toBeGreaterThanOrEqual(36);
});

test("resultados de matéria têm miniatura (foto ou capa tipográfica)", async ({ page }) => {
  await page.goto("/busca?q=onibus+cpa&tipo=materias");
  const articles = page.getByRole("region", { name: /resultados/i }).locator("article");
  await expect(articles.first()).toBeVisible();
  for (const card of await articles.all()) {
    await expect(card.locator('img, [data-testid="typographic-cover"]').first()).toBeAttached();
  }
});

test("desktop: Perguntar ao CityNews é a linha de destaque no topo, acima dos filtros", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/busca?q=viaduto");
  const ask = page.getByRole("link", { name: /Perguntar ao CityNews/ });
  await expect(ask).toHaveAttribute("href", "/pergunte?q=viaduto");
  const askBox = (await ask.boundingBox())!;
  const tabsBox = (await page
    .getByRole("navigation", { name: "Tipo de resultado" })
    .boundingBox())!;
  const heading = (await page.getByRole("heading", { name: /resultados? para/ }).boundingBox())!;
  expect(askBox.y).toBeLessThan(tabsBox.y);
  expect(askBox.y).toBeLessThan(heading.y);
  // Linha inteira: ocupa a largura da coluna, não um botão pequeno.
  const column = (await page.getByRole("heading", { level: 1 }).locator("xpath=..").boundingBox())!;
  expect(askBox.width).toBeGreaterThan(column.width * 0.9);
});

test("título da busca é menor que a manchete de card lead", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/busca?q=viaduto");
  const h1 = await page
    .getByRole("heading", { level: 1 })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(h1).toBeLessThanOrEqual(28);
});

test("busca a 360 px sem rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/busca?q=viaduto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

// UX item 76: no celular, os primeiros resultados vêm antes da linha do Pergunte (compacta).
test("celular: resultados antes da linha do Pergunte, que vem compacta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/busca?q=onibus");
  const ask = page.getByRole("link", { name: /Perguntar ao CityNews/ });
  // Só uma linha visível por largura (a do topo some no celular).
  await expect(ask).toHaveCount(1);
  await expect(ask).toHaveAttribute("href", "/pergunte?q=onibus");
  await expect(ask).toHaveAttribute("data-ask-row", "compact");
  const askBox = (await ask.boundingBox())!;
  const results = page.locator("#resultados-titulo ~ ol").first().locator(":scope > li");
  const n = await results.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  const last = (await results.nth(n - 1).boundingBox())!;
  expect(askBox.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
  // Compacta: uma linha, alvo de toque de 44 px.
  expect(askBox.height).toBeGreaterThanOrEqual(44);
  expect(askBox.height).toBeLessThan(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
