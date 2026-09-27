import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const TOPIC = "/assunto/obra-do-viaduto-na-miguel-sutil";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("assunto mostra concordam, divergem, não confirmado e cobertura externa rotulada", async ({
  page,
}) => {
  await page.goto(TOPIC);
  for (const h of ["As fontes concordam", "As fontes divergem", "Ainda não confirmado"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText("Em apuração").first()).toBeVisible();
  await expect(
    page.getByText(/Em apuração: as informações ainda estão sendo confirmadas/),
  ).toBeVisible();
  const ext = page.getByRole("region", { name: "Cobertura de outros veículos" });
  await expect(ext.getByText("AGREGADO").first()).toBeVisible();
  for (const link of await ext.locator("article a[target]").all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("assunto tem resumo por IA com revisor, linha do tempo e perguntas", async ({ page }) => {
  await page.goto(TOPIC);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Obra do viaduto na avenida Miguel Sutil",
  );
  const summary = page.getByRole("region", { name: "O que se sabe" });
  await expect(summary.getByText("RESUMO POR IA")).toBeVisible();
  await expect(summary.getByText(/Resumo revisado por/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
  await page.getByText("Quando a obra termina?").click();
  await expect(page.getByText(/prazo ainda não foi confirmado/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Entenda a metodologia" })).toBeVisible();
});

test("filtro de origem esconde a outra cobertura", async ({ page }) => {
  await page.goto(TOPIC);
  await page.getByRole("radio", { name: "Do CityNews" }).click();
  await expect(page.getByRole("region", { name: "Cobertura de outros veículos" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Do CityNews" })).toBeVisible();
  await page.getByRole("radio", { name: "Outros veículos" }).click();
  await expect(page.getByRole("region", { name: "Do CityNews" })).toBeHidden();
});

test("assunto inexistente responde 404", async ({ page }) => {
  expect((await page.goto("/assunto/nao-existe"))!.status()).toBe(404);
});

test("lista de assuntos filtra por situação na URL", async ({ page }) => {
  await page.goto("/assuntos");
  await expect(page.getByRole("heading", { level: 1, name: "Assuntos" })).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(3);
  await page.getByRole("link", { name: "Em apuração" }).click();
  await expect(page).toHaveURL(/situacao=em-apuracao/);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Obra do viaduto na avenida Miguel Sutil" }),
  ).toBeVisible();
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
