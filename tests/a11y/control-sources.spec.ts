import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/helpers/studio-login";

/*
 * Painel de fontes (FS-T9, spec §8 e critério 22): todas as rotas do painel com os dados do seed,
 * em 360, 768 e 1280 px, com 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA).
 * Roda uma vez, no projeto desktop (o viewport é definido aqui); Helena (admin) tem `source.manage`.
 */
const FOLHA_ID = "c5000000-0000-4000-8000-000000000001";
const BASE = "/estudio/control/fontes";
const ROUTES = [
  BASE,
  `${BASE}?q=nada-com-esse-nome`,
  `${BASE}/nova`,
  `${BASE}/${FOLHA_ID}`,
  `${BASE}/${FOLHA_ID}/configuracao`,
  `${BASE}/${FOLHA_ID}/coleta`,
  `${BASE}/${FOLHA_ID}/recomendacao`,
  `${BASE}/${FOLHA_ID}/historico`,
  `${BASE}/${FOLHA_ID}/itens`,
  `${BASE}/00000000-0000-4000-8000-000000000000`,
];
const WIDTHS = [360, 768, 1280] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

for (const path of ROUTES) {
  for (const width of WIDTHS) {
    test(`@a11y ${path} em ${width}px sem violação séria`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "roda uma vez; o viewport é definido no teste",
      );
      await page.setViewportSize({ width, height: 900 });
      await loginAs(page.context(), "helena");
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = results.violations.filter((v) => blocking(v.impact));
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
      // Sem rolagem horizontal da página em nenhuma largura (spec §8).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
}
