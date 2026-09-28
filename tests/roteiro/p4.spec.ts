import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../e2e/studio";

/*
 * Roteiro exploratório do P4 · Estúdio editorial (E01 a E14), com Playwright no lugar do
 * agent-browser (A-026). Cada passo confere o esperado e captura a tela em 390 × 844 (mobile)
 * e 1280 × 800 (desktop) em docs/reports/P4/<tela>-<largura>x<altura>.png. Só com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/p4.spec.ts
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");

async function shot(page: Page, name: string, fullPage = true) {
  const v = page.viewportSize()!;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/reports/P4/${name}-${v.width}x${v.height}.png`,
    fullPage,
    animations: "disabled",
  });
}

test("E01/E02 · newsroom, fila, filtros e estado vazio", async ({ page }) => {
  await loginAs(page, "marina");
  await expect(page.getByRole("region", { name: "Indicadores do dia" })).toBeVisible();
  await shot(page, "e01-newsroom");
  await page.goto("/estudio/fila");
  await expect(page.getByRole("heading", { level: 1, name: "Fila de matérias" })).toBeVisible();
  await shot(page, "e02-fila");
  await page.goto("/estudio/fila?aba=auto24h");
  await expect(page.getByText("Nada na fila")).toBeVisible();
  await shot(page, "e02-fila-vazia", false);
});

test("E03 · revisão de item autônomo", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/fila/c2000000-0000-4000-8000-000000000020");
  await expect(page.getByText(/Aprovar indisponível/)).toBeVisible();
  await shot(page, "e03-revisao");
  await page.getByRole("button", { name: "Pedir ajuste" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "e03-pedir-ajuste", false);
});

test("E04/E06/E12 · editor, sugestão de IA, publicação e geração", async ({ page }) => {
  await loginAs(page, "juliana", "/estudio/materias/c2000000-0000-4000-8000-000000000023");
  await expect(page.getByRole("button", { name: "Aplicar título sugerido" })).toBeVisible();
  await shot(page, "e04-editor");
  await page.getByRole("button", { name: "Gerar ilustração" }).click();
  await page.getByRole("button", { name: "Sugerir descrição a partir da matéria" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).not.toBeEmpty();
  await shot(page, "e12-geracao", false);
});

test("E06 · publicação e agendamento", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/materias/c2000000-0000-4000-8000-000000000025");
  await shot(page, "e04-editor-agendada");
  await page.goto("/estudio/materias/c2000000-0000-4000-8000-000000000004");
  await expect(page.getByText("Atualização").first()).toBeVisible();
  await shot(page, "e04-editor-publicada");
});

test("E05 · comparação de versões", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/materias/c2000000-0000-4000-8000-000000000004/versoes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "e05-versoes");
});

test("E07/E08 · calendário e correções", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/calendario");
  await expect(page.getByRole("heading", { name: "Calendário editorial" })).toBeVisible();
  await shot(page, "e07-calendario");
  await page.goto("/estudio/correcoes");
  await shot(page, "e08-correcoes");
  await page.getByRole("link", { name: /Qualidade do ar/ }).click();
  await expect(page.getByRole("button", { name: "Publicar correção" })).toBeVisible();
  await shot(page, "e08-correcao");
});

test("E09/E10/E11 · mídia, aprovação e licenças", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/midia");
  await shot(page, "e09-midia");
  await page.goto("/estudio/midia/c6000000-0000-4000-8000-000000000003");
  await expect(page.getByRole("button", { name: "Aprovar imagem" })).toBeVisible();
  await shot(page, "e10-aprovacao");
  await page.goto("/estudio/midia/licencas");
  await expect(page.getByRole("heading", { name: "Direitos e licenças" })).toBeVisible();
  await shot(page, "e11-licencas");
});

test("E13/E14 · sugestões de evento e denúncias", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/agenda/sugestoes");
  await expect(page.getByRole("heading", { name: "Sugestões de evento" })).toBeVisible();
  await shot(page, "e13-sugestoes");
  await page.goto("/estudio/denuncias");
  await expect(page.getByRole("heading", { name: "Denúncias de leitores" })).toBeVisible();
  await shot(page, "e14-denuncias");
});

test("sem permissão · jornalista na fila e revisor fora do editor", async ({ page }) => {
  await loginAs(page, "rafael", "/estudio/fila?aba=mine");
  await shot(page, "permissao-jornalista-fila", false);
  await page.goto("/estudio/materias/c2000000-0000-4000-8000-000000000023");
  await expect(page.getByText("Seu papel não permite editar esta matéria.")).toBeVisible();
  await shot(page, "permissao-jornalista-editor", false);
});
