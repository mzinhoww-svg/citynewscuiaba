import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFilters } from "../e2e/helpers/filters";
import { AXE_TAGS, blocking, settle } from "./axe";

/*
 * UX-W1-T1 · Modo escuro em estado interativo (itens 1, 2 e 3 da spec de melhorias, Review
 * Focus 1): com o mouse sobre um card, um chip e uma aba, o texto continua legível. O axe mede a
 * cor pintada no momento, então o hover fica ativo durante a análise e as transições de cor
 * terminam antes (`settle`). Só a regra `color-contrast`, dentro do elemento sob o mouse.
 */

test.use({ colorScheme: "dark" });

test.beforeEach(async ({ context, baseURL }) => {
  // Consentimento já decidido: o banner não cobre os elementos nem entra na medição.
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
});

async function expectReadableOnHover(page: Page, target: Locator, name: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  await settle(page);
  await target.evaluate((el, m) => el.setAttribute("data-axe-target", m), name);
  const r = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .withRules(["color-contrast"])
    .include(`[data-axe-target="${name}"]`)
    .analyze();
  expect(
    r.violations
      .filter((v) => blocking(v.impact))
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test("@a11y hover no primeiro card de notícia (escuro)", async ({ page }) => {
  await page.goto("/");
  await expectReadableOnHover(page, page.locator("main article").first(), "card");
});

test("@a11y hover num chip de filtro (escuro)", async ({ page }) => {
  await page.goto("/fontes");
  await openFilters(page);
  const chip = page.locator("[data-filters-body] a:not([aria-current])").first();
  await expectReadableOnHover(page, chip, "chip");
});

test("@a11y hover numa aba de /explorar (escuro)", async ({ page }) => {
  await page.goto("/explorar");
  const tab = page.getByRole("navigation", { name: "Nesta página" }).getByRole("link").first();
  await expectReadableOnHover(page, tab, "aba-explorar");
});

test("@a11y hover numa aba não selecionada (escuro)", async ({ page }) => {
  await page.goto("/fontes");
  const tab = page.getByRole("tab", { selected: false }).first();
  await expectReadableOnHover(page, tab, "aba");
});
