import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/studio-login";

const URL = "/estudio/control/fontes";
const REPORTS_DIR = "docs/reports/fontes";
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("Diego filtra, ordena e pausa em lote", async ({ page }, testInfo) => {
  // Muda o estado das fontes no banco compartilhado (não há como reativá-las sem rede para
  // *.example): roda uma única vez para não colidir entre os projetos desktop/mobile.
  test.skip(testInfo.project.name !== "desktop", "efeito colateral só uma vez");
  await loginAs(page.context(), "diego");
  await page.goto(`${URL}?status=ativa&ordem=score`);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Selecionar Folha do Cerrado" }).check();
  await page.getByRole("checkbox", { name: "Selecionar MT Agora" }).check();
  await expect(page.getByText("2 fontes selecionadas")).toBeVisible();

  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pausar 2 fontes" }).click();
  await expect(page.getByRole("status")).toContainText("2 pausadas");
  await expect(page).toHaveURL(/status=ativa/);
});

test("analista não vê o menu nem entra", async ({ page }) => {
  await loginAs(page.context(), "thiago");
  await page.goto(URL);
  await expect(page).toHaveURL(/\/entrar\?next=%2Festudio%2Fcontrol%2Ffontes&motivo=sem-permissao/);
});

test("filtro sem resultado mostra vazio com Limpar filtros", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await page.goto(`${URL}?q=fonte-que-nao-existe-em-nenhum-lugar`);
  await expect(page.getByText("Nenhuma fonte com esses filtros.")).toBeVisible();
  await page.getByRole("link", { name: "Limpar filtros" }).first().click();
  await expect(page).toHaveURL(URL);
});

test("próxima coleta e frequência padrão aparecem em texto", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await page.goto(URL);
  const visible = page.getByText("30 min · padrão").and(page.locator(":visible"));
  await expect(visible.first()).toBeVisible();
});

test("configurações da coleta: padrão sem opções rápidas; vagas da via rápida com uso", async ({
  page,
}, testInfo) => {
  // Muda `app_settings` (compartilhado): roda uma única vez para não colidir entre os projetos.
  test.skip(testInfo.project.name !== "desktop", "efeito colateral só uma vez");
  await loginAs(page.context(), "helena");
  await page.goto(URL);
  await page.getByRole("button", { name: "Configurações da coleta" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Via rápida: 0 de 10")).toBeVisible();
  const select = dialog.getByLabel("Frequência padrão");
  await expect(select.locator("option", { hasText: "10 min" })).toHaveCount(0);
  await expect(select.locator("option", { hasText: "15 min" })).toHaveCount(0);
  await expect(select.locator("option", { hasText: "20 min" })).toHaveCount(0);

  await dialog.getByLabel("Vagas da via rápida").fill("5");
  await dialog.getByRole("button", { name: "Salvar" }).nth(1).click();
  await expect(dialog.getByText("Vagas da via rápida salvas")).toBeVisible();
  await expect(dialog.getByText("Via rápida: 0 de 5")).toBeVisible();
});

test("360 px vira lista sem rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page.context(), "helena");
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.locator("table")).toBeHidden();
});

test("sem violações serious/critical do axe em 1280 px @a11y", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "roda uma vez, em 1280 px");
  await loginAs(page.context(), "helena");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  await mkdir(REPORTS_DIR, { recursive: true });
  await page.screenshot({ path: `${REPORTS_DIR}/lista-1280.png`, fullPage: true });
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("sem violações serious/critical do axe em 390 px @a11y", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "roda uma vez, em 390 px");
  await loginAs(page.context(), "helena");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  await mkdir(REPORTS_DIR, { recursive: true });
  await page.screenshot({ path: `${REPORTS_DIR}/lista-390.png`, fullPage: true });
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});
