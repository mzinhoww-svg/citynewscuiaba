import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/*
 * Telas do P2 (P14 a P23, C02 a C06): 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e
 * AA), nos temas claro e escuro. Sem conta; as telas com conta são conferidas em
 * tests/e2e/privacy.spec.ts e login-migrate.spec.ts.
 */
const ROUTES = [
  "/fontes",
  "/fontes/folha-do-cerrado",
  "/panorama",
  "/favoritos",
  "/alertas",
  "/newsletter",
  "/perfil",
  "/privacidade/recomendacoes",
  "/entrar",
  "/criar-conta",
  "/recuperar-senha",
  "/redefinir-senha",
  "/confirmar?estado=expirado",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL }) => {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const path of ROUTES) {
      test(`${path} sem violações graves @a11y`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForLoadState("networkidle");
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
