import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, type Staff } from "../e2e/studio";

/*
 * Telas do Control Center do P5: 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA),
 * nos temas claro e escuro. Aprovações com um pedido pendente, vista por quem decide e por
 * quem pediu. Regras (P5-T2) vistas por quem propõe e por quem aprova, e de novo com a
 * simulação aberta (tabelas de destino e de campos alterados). A Task 10 acrescenta as demais
 * rotas.
 */
const ROUTES: { path: string; as: Staff }[] = [
  { path: "/estudio/control/aprovacoes", as: "marina" },
  { path: "/estudio/control/aprovacoes", as: "helena" },
  { path: "/estudio/control/regras", as: "diego" },
  { path: "/estudio/control/regras?comparar=1", as: "marina" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let approvalId: string | null = null;

test.beforeAll(async () => {
  const { data, error } = await service()
    .from("approvals")
    .insert({
      kind: "role.admin",
      target_ref: "c1000000-0000-4000-8000-000000000008",
      requested_by: STAFF.helena.id,
      justification: "Pedido do teste de acessibilidade",
    })
    .select("id")
    .single();
  if (error) throw error;
  approvalId = data.id;
});
test.afterAll(async () => {
  if (approvalId) await service().from("approvals").delete().eq("id", approvalId);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of ROUTES) {
      test(`${route.path} (${route.as}) sem violações graves @a11y`, async ({ page }) => {
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

    test(`/estudio/control/regras com simulação aberta sem violações graves @a11y`, async ({
      page,
    }) => {
      await loginAs(page, "diego");
      await page.goto("/estudio/control/regras");
      await page.getByRole("checkbox", { name: "Revisão obrigatória (forceReview)" }).uncheck();
      await page.getByRole("button", { name: "Simular com os últimos 7 dias" }).click();
      await expect(
        page.getByRole("heading", { name: "O que muda em relação à versão em vigor" }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });
  });
}
