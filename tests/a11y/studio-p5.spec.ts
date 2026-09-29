import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, type Staff } from "../e2e/studio";

/*
 * Telas do Control Center do P5: 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA),
 * nos temas claro e escuro. Aprovações com um pedido pendente, vista por quem decide e por
 * quem pediu. Regras (P5-T2) vistas por quem propõe e por quem aprova, e de novo com a
 * simulação aberta (tabelas de destino e de campos alterados). Monitoramento (P5-T3): visão
 * geral, tempo real, falhas, execuções, detalhe do ciclo e logs, com um ciclo de teste que tem
 * falhas, uma fonte com 3 falhas seguidas e um item em quarentena. A Task 10 acrescenta as demais
 * rotas.
 */
const ROUTES: { path: string; as: Staff }[] = [
  { path: "/estudio/control/aprovacoes", as: "marina" },
  { path: "/estudio/control/aprovacoes", as: "helena" },
  { path: "/estudio/control/regras", as: "diego" },
  { path: "/estudio/control/regras?comparar=1", as: "marina" },
  { path: "/estudio/control", as: "diego" },
  { path: "/estudio/control/tempo-real", as: "marina" },
  { path: "/estudio/control/falhas", as: "diego" },
  { path: "/estudio/control/execucoes", as: "marina" },
  { path: "/estudio/control/logs", as: "marina" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let approvalId: string | null = null;
let runId: string | null = null;
let sourceSlug: string | null = null;
let quarantineId: number | null = null;

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

  // Dados do monitoramento: ciclo com falha, fonte pausada (auto) e item em quarentena.
  const db = service();
  const run = await db
    .from("ingest_runs")
    .insert({ window_start: new Date(Date.now() - Math.floor(Math.random() * 1e9)).toISOString() })
    .select("id")
    .single();
  if (run.error) throw run.error;
  runId = run.data.id;
  sourceSlug = `teste-a11y-p5t3-${runId.slice(0, 6)}`;
  await db.from("sources").insert({
    slug: sourceSlug,
    name: "Fonte de Teste A11y",
    base_url: "https://a11y.example.test",
    kind: "rss",
    locality: "cuiaba",
    status: "paused",
  });
  await db.from("pipeline_events").insert([
    ...[1, 2, 3].map((n) => ({
      run_id: runId,
      step: "fetch",
      item_ref: `source:${sourceSlug}`,
      level: "error" as const,
      message: `Falha ${n} em 203.0.113.9`,
    })),
    {
      run_id: runId,
      step: "rules",
      item_ref: "article:teste",
      level: "info" as const,
      message: "ok",
    },
  ]);
  const q = await db
    .from("pipeline_quarantine")
    .insert({
      queue: "pipeline",
      msg_id: 1,
      dedupe_key: `classify:item:${runId}`,
      message: { runId, step: "classify", itemRef: `item:${runId}`, attempt: 3 },
      read_ct: 3,
      error: "Esgotou as tentativas",
    })
    .select("id")
    .single();
  if (q.error) throw q.error;
  quarantineId = q.data.id;
});
test.afterAll(async () => {
  const db = service();
  if (approvalId) await db.from("approvals").delete().eq("id", approvalId);
  if (quarantineId) await db.from("pipeline_quarantine").delete().eq("id", quarantineId);
  if (runId) await db.rpc("purge_pipeline_events", { p_run_ids: [runId] });
  if (sourceSlug) await db.from("sources").delete().eq("slug", sourceSlug);
  if (runId) await db.from("ingest_runs").delete().eq("id", runId);
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

    test(`/estudio/control/execucoes/[id] sem violações graves @a11y`, async ({ page }) => {
      await loginAs(page, "diego");
      await page.goto(`/estudio/control/execucoes/${runId}`);
      await expect(page.getByRole("heading", { name: "Duração por fase" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });

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
