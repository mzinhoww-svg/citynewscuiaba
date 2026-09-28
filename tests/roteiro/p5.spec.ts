import { expect, test, type Page } from "@playwright/test";
import { controlFixture, type ControlFixture } from "../e2e/control";
import { loginAs } from "../e2e/studio";

/*
 * Roteiro exploratório do P5 · Control Center, com Playwright no lugar do agent-browser (A-026).
 * Cada passo confere o esperado e captura a tela em 390 × 844 e 1280 × 800 em
 * docs/reports/P5/<tela>-<largura>x<altura>.png. Só com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/p5.spec.ts
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");

async function shot(page: Page, name: string, fullPage = true) {
  const v = page.viewportSize()!;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/reports/P5/${name}-${v.width}x${v.height}.png`,
    fullPage,
    animations: "disabled",
  });
}

let fx: ControlFixture;
test.beforeAll(async () => {
  fx = await controlFixture();
});
test.afterAll(async () => {
  await fx.cleanup();
});

test("O01/O02 · visão geral e tempo real", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control");
  await expect(page.getByText("Pausada (auto)").first()).toBeVisible();
  await shot(page, "o01-visao-geral");
  await page.goto("/estudio/control/tempo-real");
  await expect(page.getByText(/Atualizado às/)).toBeVisible();
  await shot(page, "o02-tempo-real");
});

test("O06 · falhas", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/falhas");
  await expect(page.getByText(`tempo esgotado ${fx.mark}`)).toBeVisible();
  await shot(page, "o06-falhas");
});

test("O07 · execuções e detalhe do ciclo", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/execucoes");
  await expect(page.getByRole("table", { name: "Ciclos do pipeline" })).toBeVisible();
  await shot(page, "o07-execucoes");
  await page.goto(`/estudio/control/execucoes/${fx.runId}`);
  await expect(page.getByRole("img", { name: /Duração de cada fase/ })).toBeVisible();
  await shot(page, "o07-ciclo");
});

test("O08 · logs com filtro e estado vazio", async ({ page }) => {
  await loginAs(page, "diego", `/estudio/control/logs?q=${fx.mark}`);
  await expect(page.getByRole("table", { name: "Eventos do pipeline" })).toBeVisible();
  await shot(page, "o08-logs");
  await page.goto("/estudio/control/logs?q=nada-encontrado-xyz");
  await expect(page.getByText("Nenhum evento com estes filtros.")).toBeVisible();
  await shot(page, "o08-logs-vazio", false);
});
