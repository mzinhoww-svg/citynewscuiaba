import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openFilters } from "./helpers/filters";

const TOPIC = "/assunto/obra-do-viaduto-na-miguel-sutil";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("assunto não mostra apuração, confiança nem blocos de convergência; cobertura externa rotulada", async ({
  page,
}) => {
  await page.goto(TOPIC);
  for (const h of ["As fontes concordam", "As fontes divergem", "Ainda não confirmado"])
    await expect(page.getByRole("heading", { name: h })).toHaveCount(0);
  await expect(page.getByText(/Confiança|Nada registrado|Como medimos/)).toHaveCount(0);
  // R16: o estado do assunto não aparece para o público.
  await expect(page.getByText("Em apuração")).toHaveCount(0);
  await expect(page.locator("[data-state]")).toHaveCount(0);
  const ext = page.getByRole("region", { name: "Cobertura de outros veículos" });
  await expect(ext.getByText("AGREGADO").first()).toBeVisible();
  for (const link of await ext.locator("article a[target]").all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("assunto tem resumo sem selo de revisão, linha do tempo e perguntas", async ({ page }) => {
  await page.goto(TOPIC);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Obra do viaduto na avenida Miguel Sutil",
  );
  const summary = page.getByRole("region", { name: "O que se sabe" });
  await expect(summary.getByText(/RESUMO POR IA/)).toHaveCount(0);
  await expect(summary.getByText(/revisad/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
  await page.getByText("Quando a obra termina?").click();
  await expect(page.getByText(/prazo ainda não foi confirmado/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Entenda a metodologia" })).toHaveCount(0);
});

test("filtro de origem esconde a outra cobertura", async ({ page }) => {
  await page.goto(TOPIC);
  // A-140: o filtro de origem fica no painel recolhível (fechado no celular).
  await openFilters(page);
  await page.getByRole("radio", { name: "Do CityNews" }).click();
  await expect(page.getByRole("region", { name: "Cobertura de outros veículos" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Do CityNews" })).toBeVisible();
  await page.getByRole("radio", { name: "Outros veículos" }).click();
  await expect(page.getByRole("region", { name: "Do CityNews" })).toBeHidden();
});

test("assunto inexistente responde 404", async ({ page }) => {
  expect((await page.goto("/assunto/nao-existe"))!.status()).toBe(404);
});

test("lista de assuntos não oferece filtro de situação, nem Corrigidos (R34)", async ({ page }) => {
  await page.goto("/assuntos");
  await expect(page.getByRole("heading", { level: 1, name: "Assuntos" })).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(3);
  for (const name of ["Em apuração", "Confirmados", "Corrigidos", "Encerrados"])
    await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("lista de assuntos vazia oferece ver todos e ignora filtro inválido", async ({ page }) => {
  await page.goto("/assuntos?situacao=encerrados");
  await expect(page.getByText("Nenhum assunto com esses filtros")).toBeVisible();
  await page.getByRole("link", { name: "Ver todos os assuntos" }).click();
  await expect(page).toHaveURL(/\/assuntos$/);
  const res = await page.goto("/assuntos?situacao=abc&editoria=%3Cx%3E");
  expect(res!.status()).toBe(200);
  await expect(page.locator("main article")).toHaveCount(3);
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of [TOPIC, "/assuntos"]) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
  }
});

for (const url of [TOPIC, "/assuntos", "/assuntos?situacao=encerrados"]) {
  test(`sem violações do axe ${url} @a11y`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("assunto no modo escuro sem violações graves @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(TOPIC);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => blocking(v.impact)).map((v) => v.id)).toEqual([]);
});

// Revisão P1/P3-GATE (ALTA 2): assunto aberto pelo pipeline sem matéria publicada é interno.
test("assunto interno do pipeline: 404, fora da lista e do sitemap", async ({ page, request }) => {
  expect((await request.get("/assunto/apuracao-c3000017")).status()).toBe(404);
  await page.goto("/assuntos");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Assunto em apuração/)).toHaveCount(0);
  await expect(page.locator('a[href*="/assunto/apuracao-"]')).toHaveCount(0);
  const sitemap = await (await request.get("/sitemap-topics.xml")).text();
  expect(sitemap).toContain("/assunto/plano-de-onibus-cpa-centro");
  expect(sitemap).not.toContain("apuracao-");
});
