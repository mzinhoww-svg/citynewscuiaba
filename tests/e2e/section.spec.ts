import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openFilters } from "./helpers/filters";

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
    const plaques = await card.getByTestId("origin-label").count();
    expect(plaques).toBeLessThanOrEqual(1);
    // Origem sempre visível em texto: plaqueta ORIGINAL ou "Feito a partir de n fontes".
    expect(await card.innerText()).toMatch(/ORIGINAL CITYNEWS|Feito a partir de/);
  }
  await expect(page.getByRole("heading", { name: "Mais lidas em Cidade" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Subeditorias" })
    .getByRole("link", { name: "Mobilidade" })
    .click();
  await expect(page).toHaveURL(/sub=mobilidade/);
  await expect(page.getByRole("heading", { name: "Matérias de Mobilidade" })).toBeVisible();
});

test("filtros aplicam na hora, sem botão Aplicar, vão para a URL e o Voltar restaura", async ({
  page,
}) => {
  await page.goto("/cidade");
  // A-140: painel recolhível (fechado no celular); aberto, rótulos visíveis e sem "Aplicar filtros".
  await openFilters(page);
  await expect(page.getByLabel("Período")).toBeVisible();
  await expect(page.getByLabel("Bairro")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toHaveCount(0);
  await expect(page.locator("form[data-filter-bar][data-ready=true]")).toBeVisible();
  await page.getByLabel("Período").selectOption("tudo");
  await expect(page).toHaveURL(/periodo=tudo/);
  await openFilters(page);
  await page.getByLabel("Bairro").selectOption("cpa");
  await expect(page).toHaveURL(/bairro=cpa/);
  const list = page.getByRole("region", { name: "Matérias de Cidade" });
  await expect(list.locator("article")).toHaveCount(2);
  await page.goBack();
  await expect(page).not.toHaveURL(/bairro=cpa/);
  await expect(page.getByLabel("Bairro")).toHaveValue("");
  await expect(page.getByLabel("Período")).toHaveValue("tudo");
});

test("título da página é menor que a manchete da lista (desktop e celular)", async ({ page }) => {
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/cidade?periodo=tudo");
    // Espera a lista real (o esqueleto de carregamento também tem um h1 e some ao terminar).
    await expect(page.getByRole("region", { name: "Matérias de Cidade" })).toBeVisible();
    const fontSize = (loc: ReturnType<typeof page.locator>) =>
      loc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const h1 = await fontSize(page.getByRole("heading", { level: 1 }));
    const lead = await fontSize(
      page.getByRole("region", { name: "Matérias de Cidade" }).locator("article h3").first(),
    );
    expect(h1, `h1 ${h1}px vs manchete ${lead}px a ${size.width}`).toBeLessThan(lead);
  }
});

test("a 1280 px a lista usa lead e depois standard em duas colunas, com ranking lateral", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/cidade?periodo=tudo");
  const cards = page.getByRole("region", { name: "Matérias de Cidade" }).locator("article");
  await expect(cards.nth(2)).toBeVisible();
  await page.waitForLoadState("networkidle");
  const lead = (await cards.nth(0).boundingBox())!;
  const a = (await cards.nth(1).boundingBox())!;
  const b = (await cards.nth(2).boundingBox())!;
  const size = (i: number) =>
    cards
      .nth(i)
      .locator("h3")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size(0)).toBeGreaterThan(await size(1));
  // lead ocupa a largura toda; as duas seguintes dividem a linha.
  expect(lead.width).toBeGreaterThan(a.width * 1.8);
  expect(Math.abs(a.y - b.y)).toBeLessThan(4);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  // Ranking lateral à direita da lista.
  const rail = (await page
    .getByRole("complementary", { name: /Mais lidas em Cidade/ })
    .boundingBox())!;
  expect(rail.x).toBeGreaterThan(lead.x + lead.width - 1);
});

for (const url of [
  "/cidade?periodo=tudo",
  "/cidade?periodo=tudo&bairro=cpa",
  "/cidade?sub=mobilidade&bairro=coxipo&periodo=7d",
]) {
  test(`lista sem salto de layout (CLS ≤ 0,1) em ${url}`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThanOrEqual(0.1);
  });
}

test.describe("polling com relógio falso", () => {
  // O SW da página (WebKit) responde ao `fetch` do polling e `page.route` não alcança requisições
  // do SW (só o Chromium tem PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS, playwright.config.ts):
  // conforme a hora em que o SW assume a página, a rota falsa é ignorada. Este teste é do
  // polling, não do SW.
  test.use({ serviceWorkers: "block" });

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
