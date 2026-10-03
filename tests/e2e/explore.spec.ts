import { expect, test } from "@playwright/test";

test("explorar leva a editorias, assuntos, coleções, fontes e agenda", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { level: 1, name: "Explorar" })).toBeVisible();
  for (const n of ["Cidade", "Assuntos em destaque", "Coleções", "Fontes", "Agenda"])
    await expect(page.getByRole("link", { name: new RegExp(n) }).first()).toBeVisible();
  const sections = page.getByRole("region", { name: "Editorias" });
  await expect(sections.getByRole("link").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Guia Cuiabá" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mais lidas da semana" })).toBeVisible();
});

test("coleção mostra capa, itens em ordem e agregado que abre no original", async ({ page }) => {
  await page.goto("/colecoes/seca-e-fumaca");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seca e fumaça");
  await expect(page.getByText(/Curadoria de Marina Arruda/)).toBeVisible();
  const list = page.getByRole("list", { name: "Itens da coleção" });
  await expect(list.locator(":scope > li")).toHaveCount(4);
  const external = list.getByRole("link", { name: /Abrir em MT Agora/ });
  await expect(external).toHaveAttribute("href", /^https:\/\/mtagora\.example\//);
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  await expect(list.getByText("AGREGADO").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar" })).toBeVisible();
});

test("coleção inexistente responde 404", async ({ page }) => {
  const r = await page.goto("/colecoes/nao-existe");
  expect(r!.status()).toBe(404);
});

test("editoria sem matéria hoje não vira atalho com 'Nenhuma matéria hoje'", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByText("Nenhuma matéria hoje")).toHaveCount(0);
  const sections = page.getByRole("region", { name: "Editorias" });
  // Todas as editorias seguem alcançáveis (atalho com contagem ou link simples).
  expect(await sections.getByRole("link").count()).toBeGreaterThanOrEqual(8);
  // Atalho com contagem sempre diz quantas há.
  for (const tile of await sections.locator("article").all()) {
    await expect(tile).toContainText(/\d matérias? hoje/);
  }
});

test("título do Explorar é menor que a manchete lead", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/explorar");
  const h1 = await page
    .getByRole("heading", { level: 1 })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(h1).toBeLessThanOrEqual(28);
});
