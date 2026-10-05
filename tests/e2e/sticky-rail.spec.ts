import { expect, test } from "@playwright/test";

/*
 * Colunas fixas abaixo do cabeçalho (UX-W1-T7, item 14): a coluna lateral `sticky` das páginas
 * públicas para em `--h-sticky-public` (altura do cabeçalho + folga), nunca atrás do cabeçalho
 * fixo. Só no desktop: abaixo de `lg` a coluna não é fixa.
 */
const SLUG = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

test.describe("coluna lateral fixa", () => {
  test.skip(({ isMobile }) => isMobile, "a coluna só é fixa a partir de lg");

  test("na matéria, a coluna fica abaixo do cabeçalho depois de rolar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/materia/${SLUG}`);
    const header = page.locator('header[data-sticky="public"]');
    const rail = page.locator("article + aside");
    await expect(rail).toBeVisible();
    // O conteúdo precisa ser mais alto que a coluna para ela ter onde ficar presa.
    await page.evaluate(() => {
      const main = document.querySelector("article");
      if (main) main.style.minHeight = "4000px";
    });
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(1000);
    await expect(header).toHaveAttribute("data-scrolled", "true");

    const headerBottom = (await header.boundingBox())!.y + (await header.boundingBox())!.height;
    const railTop = (await rail.boundingBox())!.y;
    expect(railTop).toBeGreaterThanOrEqual(headerBottom);
    // E não sobra um vão grande: a coluna fica logo abaixo (folga do token, até 32 px).
    expect(railTop - headerBottom).toBeLessThanOrEqual(32);
  });
});
