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
  "/pergunte",
  "/pergunte?q=O%20que%20aconteceu%20em%20Cuiab%C3%A1%20hoje%3F",
  "/pergunte?q=Resuma%20sa%C3%BAde%20p%C3%BAblica%20no%20Coxip%C3%B3",
  "/pergunte?q=viaduto%20%5Bteste%3Atempo-esgotado%5D",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

// IP próprio por teste: as visitas a /pergunte contam no limite de 20 perguntas por hora.
test.beforeEach(async ({ context }) => {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
});

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
