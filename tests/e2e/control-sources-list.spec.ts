import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/studio-login";

const URL = "/estudio/control/fontes";
const REPORTS_DIR = "docs/reports/fontes";
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

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

test("menu de ações por fonte: abre, mostra os itens e Esc devolve o foco ao gatilho", async ({
  page,
}) => {
  await loginAs(page.context(), "helena");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${URL}?status=ativa`);
  const trigger = page.getByRole("button", { name: "Ações de Placar MT" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Ações de Placar MT" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Coletar agora" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Pausar" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Abrir" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("1280 px: colunas-chave cabem sem rolagem horizontal; secundárias ficam ocultas", async ({
  page,
}) => {
  await loginAs(page.context(), "helena");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  for (const name of ["Fonte", "Status", "Score", "Frequência", "Saúde", "Próxima coleta"]) {
    await expect(page.getByRole("columnheader", { name })).toBeVisible();
  }
  // Camada, Localidade, Prioridade, Última coleta e Erros 24 h só a partir de 1440 px.
  await expect(page.getByRole("columnheader", { name: "Prioridade" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Última coleta" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Erros 24 h" })).toHaveCount(0);

  // Re-review fix round 2: Score, Frequência e Saúde não podem quebrar em 2-3 linhas na primeira
  // linha da tabela (colunas 4, 6 e 7: checkbox, Fonte, Status, Score, Prioridade[oculta],
  // Frequência, Saúde, ...).
  const row = page.locator("tbody tr").first();
  for (const col of [4, 6, 7]) {
    const text = row.locator(`td:nth-child(${col}) span.whitespace-nowrap`).first();
    const { height, lineHeight } = await text.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThanOrEqual(lineHeight * 1.5);
  }
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
