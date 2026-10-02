import { expect, test, type Page, type TestInfo } from "@playwright/test";

/*
 * Roteiro exploratório do P1 (docs/testing.md §3), com Playwright no lugar do agent-browser
 * (A-026). Cada passo verifica o esperado e captura a tela em 390 (projeto mobile) e 1280
 * (projeto desktop) em docs/reports/P1/roteiro-*.png. Só roda com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");

async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `docs/reports/P1/roteiro-${name}-${w}.png`, fullPage });
  void info;
}

async function ownIp(page: Page) {
  const ip = `198.18.0.${Math.floor(Math.random() * 250) + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `${ip}, 10.2.${Date.now() % 250}.1` });
}

test("1 · home: manchete com rótulos e confiança; Panorama abaixo da dobra", async ({
  page,
}, info) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  const lead = page.locator("article").filter({ has: h1 });
  await expect(lead.getByText(/ORIGINAL CITYNEWS|Feito a partir de/).first()).toBeVisible();
  await expect(lead.getByText(/^Confiança (alta|média|baixa)$/)).toBeVisible();
  await shot(page, info, "01-home");
  const agg = page.getByRole("region", { name: "Veja também em outros portais" });
  const box = await agg.boundingBox();
  expect(box!.y).toBeGreaterThan(page.viewportSize()!.height);
  await expect(agg.getByText("AGREGADO").first()).toBeVisible();
  // Superfície neutra do Panorama (--surface-aggregated): a seção não é branca como a página.
  const bg = await agg.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
  await agg.scrollIntoViewIfNeeded();
  await shot(page, info, "02-home-panorama");
});

test("2 · manchete: resumo por IA com revisor, fontes e informar problema sem login", async ({
  page,
}, info) => {
  await ownIp(page);
  await page.goto("/");
  await page.getByRole("heading", { level: 1 }).getByRole("link").click();
  await expect(page).toHaveURL(/\/materia\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, info, "03-materia");
  // A manchete muda com o relógio; o resumo, o revisor e as fontes são conferidos
  // numa matéria fixa do seed.
  await page.goto("/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  await expect(page.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeVisible();
  await expect(page.getByText(/Resumo revisado por/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fontes" })).toBeVisible();
  await shot(page, info, "04-materia-resumo-ia");
  await page.getByRole("button", { name: "Informar problema" }).click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("status")).toContainText("Resposta da redação em até 24 h");
  await shot(page, info, "05-informar-problema-enviado");
});

test("3 · agenda: lista, calendário, só gratuitos, evento e .ics", async ({
  page,
  request,
}, info) => {
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, info, "06-agenda-lista");
  await page.getByRole("button", { name: "Calendário" }).click();
  await expect(page).toHaveURL(/view=cal/);
  await expect(page.getByRole("table")).toBeVisible();
  await shot(page, info, "07-agenda-calendario");
  await page.getByRole("button", { name: "Lista" }).click();
  await page.getByText("Filtros da agenda").click();
  await page.getByLabel("Só gratuitos").check();
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/gratuito=1/);
  for (const e of await page.locator("main article").all())
    await expect(e).toContainText("Gratuito");
  await shot(page, info, "08-agenda-gratuitos");
  await page.locator("main article").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/agenda\/[a-z0-9-]+$/);
  await shot(page, info, "09-evento");
  const href = await page.getByRole("link", { name: "Baixar arquivo .ics" }).getAttribute("href");
  const ics = await request.get(href!);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("TZID=America/Cuiaba");
});

test("4 · 404 com mensagem e busca", async ({ page }, info) => {
  const r = await page.goto("/materia/esta-materia-nao-existe");
  expect(r!.status()).toBe(404);
  await expect(page.getByText(/pode ter sido movida/)).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await shot(page, info, "10-404");
  const g = await page.goto("/materia/materia-arquivada-seed");
  expect(g!.status()).toBe(410);
  await shot(page, info, "11-410");
});

test("5 · só teclado da home até a matéria, foco visível", async ({ page }, info) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  await shot(page, info, "12-teclado-pular");
  let href = "";
  for (let i = 0; i < 80 && !href.startsWith("/materia/"); i++) {
    await page.keyboard.press("Tab");
    href = await page.evaluate(() => document.activeElement?.getAttribute("href") ?? "");
  }
  expect(href).toMatch(/^\/materia\//);
  await shot(page, info, "13-teclado-manchete");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/materia\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
