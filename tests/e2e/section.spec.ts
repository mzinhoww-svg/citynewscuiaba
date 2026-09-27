import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("estado vazio com filtro oferece ampliar período", async ({ page }) => {
  await page.goto("/cidade?sub=mobilidade&bairro=coxipo&periodo=7d");
  await expect(page.getByText(/Nenhuma matéria de Mobilidade no Coxipó/)).toBeVisible();
  await page.getByRole("link", { name: "Ver últimos 30 dias" }).click();
  await expect(page).toHaveURL(/periodo=30d/);
  await expect(page).toHaveURL(/bairro=coxipo/);
  await expect(page).toHaveURL(/sub=mobilidade/);
});

test("filtro inválido na URL é ignorado sem erro 500", async ({ page }) => {
  const res = await page.goto(
    "/cidade?periodo=abc&ordem=xyz&origem=%3Cscript%3E&page=-1&bairro=lua",
  );
  expect(res!.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Cidade" })).toBeVisible();
  await expect(page.getByLabel("Período")).toHaveValue("7d");
  await expect(page.getByLabel("Bairro")).toHaveValue("");
});

test("editoria desconhecida responde 404", async ({ page }) => {
  const res = await page.goto("/editoria-que-nao-existe");
  expect(res!.status()).toBe(404);
});

test("lista com rótulos, subeditorias e mais lidas", async ({ page }) => {
  await page.goto("/cidade?periodo=tudo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cidade");
  await expect(page.getByText(/matérias? hoje|nenhuma matéria hoje/)).toBeVisible();
  const list = page.getByRole("region", { name: "Matérias de Cidade" });
  const cards = list.locator("article");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  for (const card of await cards.all()) {
    const n = await card.getByTestId("origin-label").count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
  }
  await expect(page.getByRole("heading", { name: "Mais lidas em Cidade" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Subeditorias" })
    .getByRole("link", { name: "Mobilidade" })
    .click();
  await expect(page).toHaveURL(/sub=mobilidade/);
  await expect(page.getByRole("heading", { name: "Matérias de Mobilidade" })).toBeVisible();
});

test("filtros vão para a URL e o Voltar restaura", async ({ page }) => {
  await page.goto("/cidade");
  await page.locator("summary", { hasText: "Filtros" }).click();
  await page.getByLabel("Período").selectOption("tudo");
  await page.getByLabel("Bairro").selectOption("cpa");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/bairro=cpa/);
  const list = page.getByRole("region", { name: "Matérias de Cidade" });
  await expect(list.locator("article")).toHaveCount(2);
  await page.goBack();
  await expect(page).not.toHaveURL(/bairro=cpa/);
  await expect(page.getByLabel("Bairro")).toHaveValue("");
});

test("pílula de novas matérias aparece pelo polling de 60 s", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/editoria/cidade/novas**", (route) =>
    route.fulfill({ json: { count: 2 } }),
  );
  await page.goto("/cidade?periodo=tudo");
  await expect(page.locator("[data-polling='on']")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /novas matérias/ })).toHaveCount(0);
  await page.clock.fastForward("01:05");
  await expect(page.getByRole("button", { name: "2 novas matérias · mostrar" })).toBeVisible();
});

test("rota de novas valida o parâmetro e conta", async ({ request }) => {
  expect((await request.get("/api/editoria/cidade/novas?desde=abc")).status()).toBe(400);
  const ok = await request.get("/api/editoria/cidade/novas?desde=2030-01-01T00:00:00Z");
  expect(await ok.json()).toEqual({ count: 0 });
  expect((await request.get("/api/editoria/nao-existe/novas?desde=2030-01-01")).status()).toBe(404);
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/cidade?periodo=tudo&bairro=cpa");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

for (const url of ["/cidade?periodo=tudo", "/cidade?sub=mobilidade&bairro=coxipo&periodo=7d"]) {
  test(`editoria sem violações do axe ${url} @a11y`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("editoria no modo escuro sem violações graves @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/cidade?periodo=tudo&bairro=cpa");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => blocking(v.impact)).map((v) => v.id)).toEqual([]);
});
