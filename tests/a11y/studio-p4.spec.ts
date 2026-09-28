import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, type Staff } from "../e2e/studio";

/*
 * Telas do Estúdio do P4 (E01 a E14): 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e
 * AA), nos temas claro e escuro, com o login de seed do papel que usa a tela.
 */
const ROUTES: { path: string; as: Staff }[] = [
  { path: "/estudio", as: "marina" },
  { path: "/estudio/fila", as: "marina" },
  { path: "/estudio/fila?aba=exceptions", as: "marina" },
  { path: "/estudio/fila?aba=mine", as: "rafael" },
  { path: "/estudio/fila/c2000000-0000-4000-8000-000000000020", as: "marina" },
  { path: "/estudio/materias/c2000000-0000-4000-8000-000000000023", as: "juliana" },
  { path: "/estudio/materias/c2000000-0000-4000-8000-000000000004/versoes", as: "marina" },
  { path: "/estudio/materias/c2000000-0000-4000-8000-000000000004", as: "marina" },
  { path: "/estudio/calendario", as: "marina" },
  { path: "/estudio/correcoes", as: "beatriz" },
  { path: "/estudio/midia", as: "beatriz" },
  { path: "/estudio/midia/c6000000-0000-4000-8000-000000000003", as: "marina" },
  { path: "/estudio/midia/licencas", as: "marina" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of ROUTES) {
      test(`${route.path} sem violações graves @a11y`, async ({ page }) => {
        await loginAs(page, route.as);
        await page.goto(route.path);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForLoadState("load");
        await page.evaluate(() => document.fonts.ready);
        const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual(
          [],
        );
      });
    }
  });
}
