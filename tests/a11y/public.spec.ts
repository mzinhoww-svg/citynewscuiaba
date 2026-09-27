import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SECTIONS } from "../../src/content/pt-BR/nav";

/*
 * Todas as rotas públicas do P1 (P01–P11, P24, P25) com os dados do seed: 0 violações
 * serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA), no tema claro e no escuro.
 * Slugs são os do seed (supabase/seed.sql); o plano citava slugs ilustrativos.
 */
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const ROUTES = [
  "/",
  ...SECTIONS.map((s) => s.href),
  "/cidade?sub=mobilidade&bairro=coxipo&periodo=7d",
  ARTICLE,
  `${ARTICLE}/historico`,
  "/materia/materia-arquivada-seed",
  "/materia/nao-existe",
  "/nao/existe",
  "/assunto/obra-do-viaduto-na-miguel-sutil",
  "/assuntos",
  "/agenda",
  "/agenda?view=cal",
  "/agenda/noite-de-rasqueado-no-sesc-arsenal",
  "/agenda/sugerir",
  "/explorar",
  "/colecoes/seca-e-fumaca",
  "/colecoes/outubro-em-cuiaba",
  "/sobre",
  "/principios-editoriais",
  "/metodologia",
  "/como-usamos-ia",
  "/correcoes",
  "/direito-de-resposta",
  "/privacidade",
  "/termos",
  "/anuncie",
  "/contato",
  "/busca",
  "/busca?q=onibus+cpa",
  "/busca?q=viaduto&origem=outros",
  "/busca?q=viadutu",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const r of ROUTES) {
      test(`@a11y ${r} (${scheme})`, async ({ page }) => {
        await page.goto(r);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const bad = res.violations.filter((v) => blocking(v.impact));
        expect(
          bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
        ).toEqual([]);
      });
    }
  });
}
