import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, type Staff } from "../e2e/studio";

/*
 * Telas do Control Center do P5: 0 violações serious/critical do axe (WCAG 2.0/2.1/2.2 A e AA),
 * nos temas claro e escuro. Aprovações com um pedido pendente, vista por quem decide e por
 * quem pediu. Regras (P5-T2) vistas por quem propõe e por quem aprova, e de novo com a
 * simulação aberta (tabelas de destino e de campos alterados). Monitoramento (P5-T3): visão
 * geral, tempo real, falhas, execuções, detalhe do ciclo e logs, com um ciclo de teste que tem
 * falhas, uma fonte com 3 falhas seguidas e um item em quarentena. A lista de fontes (P5-T4/FS-T7) entra com três estados
 * e com os diálogos de lote e de configurações abertos. Agentes, modelos, prompts e playground (P5-T5) entram com histórico pendente e arquivado, comparação e resultado do teste. A Task 10 acrescenta as demais rotas.
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
  // Lista de fontes (P5-T4/FS-T7): lista cheia, ordenada e filtrada, e vazio.
  { path: "/estudio/control/fontes", as: "diego" },
  { path: "/estudio/control/fontes?status=paused&ordem=score&dir=desc", as: "marina" },
  { path: "/estudio/control/fontes?q=zzz-sem-resultado", as: "diego" },
  // Agentes, modelos, prompts e playground (P5-T5): quem opera, quem só aprova e quem só lê.
  { path: "/estudio/control/agentes", as: "diego" },
  { path: "/estudio/control/agentes", as: "marina" },
  { path: "/estudio/control/modelos", as: "diego" },
  { path: "/estudio/control/testes", as: "diego" },
  { path: "/estudio/control/prompts/write", as: "diego" },
  { path: "/estudio/control/prompts/write", as: "marina" },
  { path: "/estudio/control/prompts/agente-inexistente", as: "diego" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let approvalId: string | null = null;
let runId: string | null = null;
let sourceSlug: string | null = null;
let quarantineId: number | null = null;
const promptIds: string[] = [];

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

  // Prompts (P5-T5): uma versão pendente e uma arquivada para o histórico (linhas com ações).
  const top = await db
    .from("ai_prompts")
    .select("version")
    .eq("agent_id", "write")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (top.error) throw top.error;
  const base = top.data.version;
  const made = await db
    .from("ai_prompts")
    .insert([
      {
        agent_id: "write",
        version: base + 1,
        body: "Texto arquivado do teste de acessibilidade.",
        rationale: "Versão arquivada do teste a11y P5-T5",
        author_id: STAFF.diego.id,
        status: "archived",
      },
      {
        agent_id: "write",
        version: base + 2,
        body: "Texto pendente do teste de acessibilidade.",
        rationale: "Versão pendente do teste a11y P5-T5",
        author_id: STAFF.diego.id,
        status: "pending",
      },
    ])
    .select("id");
  if (made.error) throw made.error;
  promptIds.push(...made.data.map((r) => r.id));
  const pend = await db.from("approvals").insert({
    kind: "prompt.publish",
    target_ref: made.data[1]!.id,
    requested_by: STAFF.diego.id,
    justification: "Pedido do teste de acessibilidade",
  });
  if (pend.error) throw pend.error;
});
test.afterAll(async () => {
  const db = service();
  if (approvalId) await db.from("approvals").delete().eq("id", approvalId);
  if (promptIds.length > 0) {
    await db.from("approvals").delete().eq("kind", "prompt.publish").in("target_ref", promptIds);
    await db.from("ai_prompts").delete().in("id", promptIds);
  }
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

    test(`/estudio/control/prompts/write com comparação sem violações graves @a11y`, async ({
      page,
    }) => {
      await loginAs(page, "diego");
      await page.goto("/estudio/control/prompts/write");
      const compare = page.getByRole("link", { name: /Comparar a versão/ }).first();
      await compare.click();
      await expect(page.getByRole("heading", { name: /em relação à versão/ })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });

    test(`/estudio/control/testes com resultado sem violações graves @a11y`, async ({ page }) => {
      await loginAs(page, "diego");
      await page.goto("/estudio/control/testes");
      await page
        .getByLabel("Item de teste")
        .fill("Prefeitura anuncia mutirão de vacinação em Cuiabá.");
      await page.getByRole("button", { name: "Rodar teste" }).click();
      await expect(page.getByText("Saída válida no schema do agente.")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });

    test(`/estudio/control/execucoes/[id] sem violações graves @a11y`, async ({ page }) => {
      await loginAs(page, "diego");
      await page.goto(`/estudio/control/execucoes/${runId}`);
      await expect(page.getByRole("heading", { name: "Duração por fase" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });

    test(`/estudio/control/fontes com lote e configurações abertos sem violações graves @a11y`, async ({
      page,
    }) => {
      await loginAs(page, "diego");
      await page.goto("/estudio/control/fontes");
      await page
        .getByRole("checkbox", { name: /^Selecionar / })
        .first()
        .check();
      await page.getByRole("button", { name: "Frequência", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      let r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      let bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
      await page.getByRole("button", { name: "Configurações da coleta" }).click();
      await expect(page.getByRole("dialog").getByLabel("Frequência padrão")).toBeVisible();
      r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
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
