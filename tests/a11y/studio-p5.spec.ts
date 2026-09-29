import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { controlFixture, type ControlFixture } from "../e2e/control";
import { loginAs, type Staff } from "../e2e/studio";

/*
 * Telas do Control Center do P5: 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA),
 * nos temas claro e escuro, com dados próprios (fonte pausada, ciclo com falha, quarentena).
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let fx: ControlFixture;
test.beforeAll(async () => {
  fx = await controlFixture();
});
test.afterAll(async () => {
  await fx.cleanup();
});

const ROUTES: { path: () => string; as: Staff; name: string }[] = [
  { name: "visão geral", path: () => "/estudio/control", as: "diego" },
  { name: "tempo real", path: () => "/estudio/control/tempo-real", as: "diego" },
  { name: "falhas", path: () => "/estudio/control/falhas", as: "diego" },
  { name: "execuções", path: () => "/estudio/control/execucoes", as: "thiago" },
  { name: "ciclo", path: () => `/estudio/control/execucoes/${fx.runId}`, as: "diego" },
  { name: "logs", path: () => `/estudio/control/logs?q=${fx.mark}`, as: "diego" },
  { name: "logs vazio", path: () => "/estudio/control/logs?q=nada-encontrado-xyz", as: "diego" },
  { name: "custos", path: () => "/estudio/control/custos", as: "thiago" },
  { name: "bases de conhecimento", path: () => "/estudio/control/conhecimento", as: "thiago" },
  { name: "avaliações", path: () => "/estudio/control/avaliacoes", as: "diego" },
  { name: "governança", path: () => "/estudio/control/governanca", as: "thiago" },
  { name: "aprovações", path: () => "/estudio/control/aprovacoes", as: "marina" },
  { name: "regras", path: () => "/estudio/control/regras", as: "diego" },
  { name: "contingência", path: () => "/estudio/admin/contingencia", as: "helena" },
  // P5-T5
  { name: "agentes", path: () => "/estudio/control/agentes", as: "diego" },
  { name: "agentes só leitura", path: () => "/estudio/control/agentes", as: "thiago" },
  { name: "modelos", path: () => "/estudio/control/modelos", as: "helena" },
  { name: "prompts", path: () => "/estudio/control/prompts/answer", as: "diego" },
  { name: "prompts agente inválido", path: () => "/estudio/control/prompts/nada", as: "diego" },
  { name: "playground", path: () => "/estudio/control/testes", as: "diego" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of ROUTES) {
      test(`Control Center · ${route.name} sem violações graves @a11y`, async ({ page }) => {
        await loginAs(page, route.as);
        await page.goto(route.path());
        await expect(page.locator("main")).toBeVisible();
        // A tela carregou de verdade (a fronteira de erro também passaria no axe).
        await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
          /Não foi possível carregar|Algo deu errado/,
        );
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
