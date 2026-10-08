import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";

/*
 * Páginas legais no mesmo grid do portal (UI-T14, spec de UI pública §4.9): título de tela,
 * coluna de leitura de 68ch, índice "Nesta página" ao lado no desktop e em trilho no celular.
 * `/metodologia` e `/como-usamos-ia` ficam ocultas (R34) e não entram aqui.
 */
const DOCS = ["/termos", "/privacidade", "/principios-editoriais"] as const;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

for (const path of DOCS) {
  test(`${path}: mesmo grid, título de tela e coluna de 68ch`, async ({ page }) => {
    await page.goto(path);
    const main = page.locator("main");
    const h1 = main.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    // Título de tela (24 px), menor que a manchete da home.
    const size = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThanOrEqual(28);

    const body = main.getByTestId("doc-body");
    const { width, ch } = await body.evaluate((el) => {
      const probe = document.createElement("span");
      probe.textContent = "0";
      probe.style.font = getComputedStyle(el).font; // `ch` vale na fonte da própria coluna
      document.body.append(probe);
      const one = probe.getBoundingClientRect().width;
      probe.remove();
      return { width: el.getBoundingClientRect().width, ch: one };
    });
    expect(width).toBeLessThanOrEqual(ch * 68 + 1);

    // Alinhado à mesma margem do cabeçalho da página.
    const h1Box = (await h1.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    expect(Math.abs(bodyBox.x - h1Box.x)).toBeLessThanOrEqual(1);

    const toc = main.getByRole("navigation", { name: "Nesta página" });
    if ((await toc.count()) > 0) {
      const tocBox = (await toc.boundingBox())!;
      if ((page.viewportSize()?.width ?? 0) >= 1024) {
        expect(tocBox.x).toBeGreaterThanOrEqual(bodyBox.x + bodyBox.width);
      } else {
        expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(bodyBox.y);
      }
      for (const box of await toc
        .getByRole("link")
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
        expect(box).toBeGreaterThanOrEqual(44);
    }

    // Sem rolagem horizontal da página.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`${path}: sem violação séria do axe @a11y`, async ({ page }) => {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  });
}

test("páginas legais não levam a páginas ocultas (R34)", async ({ page }) => {
  for (const path of DOCS) {
    await page.goto(path);
    await expect(
      page.locator('main a[href*="como-usamos-ia"], main a[href*="metodologia"]'),
    ).toHaveCount(0);
  }
});
