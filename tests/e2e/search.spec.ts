import { expect, test } from "@playwright/test";

/* P3-T10 · busca tradicional (docs/screens.md P12). Dados do seed (supabase/seed.sql). */

test("resultado destaca termo e mantém filtros na URL", async ({ page }) => {
  await page.goto("/busca?q=viaduto&origem=citynews");
  await expect(page.locator("mark", { hasText: /viaduto/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Só CityNews" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  await page.getByRole("button", { name: "Outros veículos" }).click();
  await expect(page).toHaveURL(/origem=outros/);
  await expect(page).toHaveURL(/q=viaduto/);
  await expect(page.getByRole("button", { name: "Outros veículos" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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

test("atalho Perguntar à IA leva o mesmo texto", async ({ page }) => {
  await page.goto("/busca?q=viaduto");
  await expect(page.getByRole("link", { name: /Perguntar à IA/ })).toHaveAttribute(
    "href",
    "/pergunte?q=viaduto",
  );
});
