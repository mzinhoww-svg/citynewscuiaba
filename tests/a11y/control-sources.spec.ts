import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "../e2e/studio";

/*
 * Painel de fontes (P5-T4/FS-T9): 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA)
 * em 360, 768 e 1280 px, nos temas claro e escuro. Lista, nova fonte e as seis abas do detalhe
 * (Folha do Cerrado, do seed), mais o detalhe de uma fonte com pedido de segunda aprovação
 * pendente e o de uma fonte arquivada. A análise de link com fixtures (etapas do assistente) é
 * verificada em `tests/e2e/control-sources-flow.spec.ts`.
 */
const FOLHA_ID = "c5000000-0000-4000-8000-000000000001";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SUBS = ["", "/configuracao", "/coleta", "/recomendacao", "/historico", "/itens"];

let pendingId: string | null = null;
let archivedId: string | null = null;

test.beforeAll(async () => {
  const db = service();
  const t = tag();
  const make = async (name: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db
      .from("sources")
      .insert({
        slug: `teste-a11y-fs9-${name}-${t}`,
        name: `Fonte A11y ${name} ${t}`,
        base_url: `https://a11y-${name}-${t}.example/`,
        feed_url: `https://a11y-${name}-${t}.example/feed`,
        kind: "rss" as const,
        locality: "cuiaba",
        status: "paused" as const,
        status_reason: "manual" as const,
        terms_reviewed_at: new Date().toISOString(),
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  };
  pendingId = await make("pendente");
  archivedId = await make("arquivada", {
    archived_at: new Date().toISOString(),
    archive_reason: "Teste de acessibilidade",
  });
  // Pedido de segunda aprovação (política de imagem) aberto por Diego, para a faixa e o diálogo.
  const req = await db.from("approvals").insert({
    kind: "source.critical",
    target_ref: `source:${pendingId}:image_policy=reproduction`,
    requested_by: STAFF.diego.id,
    justification: "Acordo com o veículo (teste de acessibilidade)",
  });
  if (req.error) throw req.error;
});

test.afterAll(async () => {
  const db = service();
  for (const id of [pendingId, archivedId]) {
    if (!id) continue;
    await db.from("approvals").delete().like("target_ref", `source:${id}:%`);
    await db.from("sources").delete().eq("id", id);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const width of [360, 768, 1280]) {
      test(`@a11y painel de fontes em ${width}px sem violação séria`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "a largura é definida pelo teste");
        test.setTimeout(180_000);
        await page.setViewportSize({ width, height: 900 });
        await loginAs(page, "helena", "/estudio/control/fontes");
        const paths = [
          "/estudio/control/fontes",
          "/estudio/control/fontes?q=zzz-sem-resultado",
          "/estudio/control/fontes/nova",
          ...SUBS.map((s) => `/estudio/control/fontes/${FOLHA_ID}${s}`),
          `/estudio/control/fontes/${pendingId}`,
          `/estudio/control/fontes/${pendingId}/configuracao`,
          `/estudio/control/fontes/${archivedId}`,
        ];
        for (const path of paths) {
          await page.goto(path);
          await expect(page.locator("main")).toBeVisible();
          await page.waitForLoadState("load");
          await page.evaluate(() => document.fonts.ready);
          const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(
            bad,
            `${path}: ${JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`,
          ).toEqual([]);
        }
      });
    }
  });
}
