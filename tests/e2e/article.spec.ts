import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

const SLUG = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const CORRECTED = "com-fumaca-escolas-ajustam-horario-de-educacao-fisica";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

/** IP próprio por teste: o limite de 5 envios por hora vale por conexão. */
async function ownIp(page: Page) {
  await page.setExtraHTTPHeaders(forwardedFor());
}

async function report(page: Page) {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("matéria mostra resumo em poucos segundos, fontes e JSON-LD", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Prefeitura detalha novo plano de ônibus entre CPA e Centro",
  );
  await expect(page.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeVisible();
  await expect(page.getByText(/Resumo revisado por/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fontes" })).toBeVisible();
  const sources = page.getByRole("region", { name: "Fontes" }).getByRole("link");
  await expect(sources.first()).toBeVisible();
  expect(await sources.count()).toBeGreaterThanOrEqual(3);
  for (const link of await sources.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  const ld = JSON.parse(
    await page.locator('script[type="application/ld+json"]').first().innerText(),
  );
  expect(ld["@type"]).toBe("NewsArticle");
  expect(ld.dateModified).toBeTruthy();
  expect(ld.citation.length).toBeGreaterThan(0);
  await expect(page.getByRole("region", { name: "Como esta matéria foi feita" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toHaveAttribute(
    "href",
    `/materia/${SLUG}/historico`,
  );
  await expect(page.getByRole("complementary", { name: "Atualização" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Semelhantes" })).toBeVisible();
});

test("informar problema funciona sem login", async ({ page }) => {
  await ownIp(page);
  await report(page);
  await expect(page.getByRole("status")).toContainText("Resposta da redação em até 24 h");
});

test("informar problema exige o tipo e explica com exemplo", async ({ page }) => {
  await ownIp(page);
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/Escolha o tipo de problema\. Exemplo:/)).toBeVisible();
});

test("6ª denúncia na mesma hora é recusada com mensagem clara", async ({ page }) => {
  test.setTimeout(90_000);
  await ownIp(page);
  for (let i = 0; i < 5; i++) {
    await report(page);
    await expect(page.getByRole("status")).toContainText("Recebemos seu aviso");
  }
  await report(page);
  await expect(page.getByText(/limite de 5 envios por hora/)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test.describe("polling com relógio falso", () => {
  // O SW da página (WebKit) responde ao `fetch` do polling e `page.route` não alcança requisições
  // do SW (só o Chromium tem PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS, playwright.config.ts):
  // conforme a hora em que o SW assume a página, a rota falsa é ignorada. Este teste é do
  // polling, não do SW.
  test.use({ serviceWorkers: "block" });

  test("aviso de atualização durante a leitura", async ({ page }) => {
    await page.clock.install();
    await page.route(`**/api/materia/${SLUG}/atualizacao`, (route) =>
      route.fulfill({ json: { updatedAt: "2030-01-01T18:32:00Z" } }),
    );
    await page.goto(`/materia/${SLUG}`);
    await expect(page.locator("[data-polling='on']")).toHaveCount(1);
    await page.clock.fastForward("01:55");
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.clock.fastForward("00:10");
    await expect(page.getByRole("status")).toContainText("Esta matéria foi atualizada às 14h32");
    await expect(
      page.getByRole("status").getByRole("link", { name: "ver o que mudou" }),
    ).toBeVisible();
  });
});

test("rota de atualização responde o updated_at público", async ({ request }) => {
  const ok = await request.get(`/api/materia/${SLUG}/atualizacao`);
  expect((await ok.json()).updatedAt).toMatch(/^2026-09-26/);
  expect((await request.get("/api/materia/materia-arquivada-seed/atualizacao")).status()).toBe(404);
});

test("correção aparece na matéria e no histórico público com diff", async ({ page }) => {
  await page.goto(`/materia/${CORRECTED}`);
  await expect(page.getByRole("complementary", { name: "Correção" })).toContainText(
    "20 minutos, não 18",
  );
  await page.getByRole("link", { name: "Ver o que mudou" }).click();
  await expect(page).toHaveURL(new RegExp(`/materia/${CORRECTED}/historico#v2`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Histórico de versões");
  await expect(page.getByRole("heading", { name: /Versão 2 · Correção/ })).toBeVisible();
  await expect(page.locator("ins")).toContainText("20");
  await expect(page.locator("del")).toContainText("18");
  await expect(page.getByText("Primeira versão publicada.")).toBeVisible();
});

test("ajustar leitura muda o tamanho do texto e guarda a escolha", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Ajustar leitura" }).click();
  await page.getByRole("radio", { name: "Maior" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "xl");
  await page.getByRole("button", { name: "Pronto" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "xl");
});

test("matéria inexistente responde 404 e arquivada mostra o motivo", async ({ page }) => {
  expect((await page.goto("/materia/nao-existe"))!.status()).toBe(404);
  await page.goto("/materia/materia-arquivada-seed");
  await expect(page.getByText(/foi retirada do ar/).first()).toBeVisible();
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/materia/${SLUG}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

for (const url of [`/materia/${SLUG}`, `/materia/${CORRECTED}/historico`]) {
  test(`sem violações do axe ${url} @a11y`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("informar problema aberto sem violações do axe @a11y", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("matéria no modo escuro sem violações graves @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/materia/${SLUG}`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => blocking(v.impact)).map((v) => v.id)).toEqual([]);
});
