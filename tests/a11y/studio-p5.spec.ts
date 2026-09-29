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
  // Recomendação (P5-T7): painel para quem propõe e para quem só lê; teste A/B e teste inexistente.
  { path: "/estudio/control/recomendacao", as: "diego" },
  { path: "/estudio/control/recomendacao", as: "otavio" },
  { path: "/estudio/control/recomendacao/testes/a11y-rec-t7", as: "diego" },
  { path: "/estudio/control/recomendacao/testes/nao-existe", as: "diego" },
  // Conhecimento, avaliações, custos e governança da IA (P5-T6).
  { path: "/estudio/control/conhecimento", as: "diego" },
  { path: "/estudio/control/avaliacoes", as: "diego" },
  { path: "/estudio/control/avaliacoes", as: "marina" },
  { path: "/estudio/control/custos", as: "diego" },
  { path: "/estudio/control/governanca", as: "marina" },
  // Administração (P5-T9): publicidade, SEO, notificações, auditoria, segurança, governança, integrações e configurações.
  { path: "/estudio/admin/publicidade", as: "marina" },
  { path: "/estudio/admin/publicidade", as: "helena" },
  { path: "/estudio/admin/seo", as: "marina" },
  { path: "/estudio/admin/notificacoes", as: "otavio" },
  { path: "/estudio/admin/auditoria", as: "marina" },
  { path: "/estudio/admin/auditoria", as: "helena" },
  { path: "/estudio/admin/auditoria?acao=zzz-sem-resultado", as: "marina" },
  { path: "/estudio/admin/seguranca", as: "helena" },
  { path: "/estudio/admin/seguranca", as: "marina" },
  { path: "/estudio/admin/governanca", as: "diego" },
  { path: "/estudio/admin/integracoes", as: "diego" },
  { path: "/estudio/admin/configuracoes", as: "helena" },
  // Administração (P5-T8): painel, usuários (com convite pendente), papéis, equipes, taxonomia e home.
  { path: "/estudio/admin", as: "helena" },
  { path: "/estudio/admin/usuarios", as: "helena" },
  { path: "/estudio/admin/papeis", as: "helena" },
  { path: "/estudio/admin/equipes", as: "helena" },
  { path: "/estudio/admin/taxonomia", as: "helena" },
  { path: "/estudio/admin/home", as: "helena" },
  { path: "/estudio/admin/usuarios?erro=forbidden", as: "helena" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const suiteStart = new Date().toISOString();
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
  await db
    .from("ai_eval_runs")
    .delete()
    .eq("created_by", STAFF.marina.id)
    .gte("created_at", suiteStart);
  if (quarantineId) await db.from("pipeline_quarantine").delete().eq("id", quarantineId);
  if (runId) await db.rpc("purge_pipeline_events", { p_run_ids: [runId] });
  if (sourceSlug) await db.from("sources").delete().eq("slug", sourceSlug);
  if (runId) await db.from("ingest_runs").delete().eq("id", runId);
});

// Recomendação (P5-T7): um teste A/B em andamento, com eventos, para a tela de detalhe.
const REC_TEST = "a11y-rec-t7";
const recAnons: string[] = [];
test.beforeAll(async () => {
  const db = service();
  await db.from("rec_experiments").delete().eq("id", REC_TEST);
  const extra = "rec-v1.700";
  await db.from("rec_weights").delete().eq("version", extra);
  const w = {
    popularity: 0.3,
    individual: 0.2,
    recency: 0.15,
    engagement: 0.1,
    operational: 0.1,
    diversity: 0.15,
  };
  const v = await db.from("rec_weights").insert({
    version: extra,
    weights: w,
    cap: 0.25,
    discovery_every: 5,
    proposed_by: STAFF.diego.id,
  });
  if (v.error && v.error.code !== "23505") throw v.error;
  const e = await db.from("rec_experiments").insert({
    id: REC_TEST,
    name: "Teste de acessibilidade",
    variants: [
      { label: "Controle", weightsVersion: "rec-v1" },
      { label: "B", weightsVersion: extra },
    ],
    split: [0.5, 0.5],
    status: "running",
    starts_at: new Date(Date.now() - 3_600_000).toISOString(),
    created_by: STAFF.diego.id,
  });
  if (e.error && e.error.code !== "23505") throw e.error;
  const rows = Array.from({ length: 12 }, (_, i) => {
    const anon = crypto.randomUUID();
    recAnons.push(anon);
    return {
      anon_id: anon,
      name: i % 3 === 0 ? "recommendation_clicked" : "source_viewed",
      at: new Date().toISOString(),
      source_slug: "folha-do-cerrado",
      session: { id: "s", page: "/fontes", referrer: null, device: "desktop" },
      consent: { version: "1", metrics: true, personalization: true },
      algo_version: "rec-v1",
      props:
        i % 3 === 0
          ? { list: "recommended", reason: "trending", position: 1 }
          : { surface: "fontes" },
    };
  });
  const ev = await db.from("events").insert(rows);
  if (ev.error) throw ev.error;
});
test.afterAll(async () => {
  const db = service();
  await db.from("rec_experiments").delete().eq("id", REC_TEST);
  await db.from("rec_weights").delete().eq("version", "rec-v1.700");
  if (recAnons.length) await db.from("events").delete().in("anon_id", recAnons);
});

// Administração (P5-T9): uma campanha e um pedido de push urgente pendente para as tabelas com linhas.
const adsCampaigns: string[] = [];
let pushApprovalId: string | null = null;
test.beforeAll(async () => {
  const db = service();
  const c = await db
    .from("sponsored_campaigns")
    .insert({
      advertiser: "A11y Anunciante Fictício",
      starts_on: "2026-09-01",
      ends_on: "2026-12-31",
      allowed_sections: ["cidade", "economia"],
      creative: {
        headline: "Peça de teste de acessibilidade",
        url: "https://anunciante.example/a11y",
      },
    })
    .select("id")
    .single();
  if (c.error) throw c.error;
  adsCampaigns.push(c.data.id);
  const art = await db.from("articles").select("id").eq("status", "published").limit(1).single();
  if (art.error) throw art.error;
  const p = await db
    .from("approvals")
    .insert({
      kind: "push.urgent",
      target_ref: art.data.id,
      requested_by: STAFF.otavio.id,
      justification: "Pedido do teste de acessibilidade (push)",
    })
    .select("id")
    .single();
  if (p.error) throw p.error;
  pushApprovalId = p.data.id;
});
test.afterAll(async () => {
  const db = service();
  if (adsCampaigns.length) await db.from("sponsored_campaigns").delete().in("id", adsCampaigns);
  if (pushApprovalId) await db.from("approvals").delete().eq("id", pushApprovalId);
});

// Administração (P5-T8): dados para as telas cheias (convite pendente, equipe, tags duplicadas).
const adminInviteEmail = `a11y-t8-${Date.now() % 1_000_000}@exemplo.test`;
let adminTeamId: string | null = null;
const adminTagIds: string[] = [];
test.beforeAll(async () => {
  const db = service();
  const inv = await db.from("staff_invites").insert({
    email: adminInviteEmail,
    role: "jornalista",
    invited_by: STAFF.helena.id,
    token_hash: "0".repeat(64),
    email_subject: "Convite de teste",
    email_body: "Convite de teste de acessibilidade.",
  });
  if (inv.error) throw inv.error;
  const team = await db
    .from("teams")
    .insert({ name: `Equipe a11y ${adminInviteEmail.slice(8, 14)}`, lead_id: STAFF.marina.id })
    .select("id")
    .single();
  if (team.error) throw team.error;
  adminTeamId = team.data.id;
  await db.from("team_members").insert({ team_id: team.data.id, user_id: STAFF.otavio.id });
  await db.from("tags").delete().in("slug", ["obras-a11y-t8", "obra-a11y-t8"]);
  const tags = await db
    .from("tags")
    .insert([
      { name: "Obras a11y", slug: "obras-a11y-t8" },
      { name: "Obra a11y", slug: "obra-a11y-t8" },
    ])
    .select("id");
  if (tags.error) throw tags.error;
  adminTagIds.push(...tags.data.map((t) => t.id));
});
test.afterAll(async () => {
  const db = service();
  await db.from("staff_invites").delete().eq("email", adminInviteEmail);
  if (adminTeamId) await db.from("teams").delete().eq("id", adminTeamId);
  if (adminTagIds.length) await db.from("tags").delete().in("id", adminTagIds);
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

    test(`/estudio/control/avaliacoes com execução no histórico sem violações graves @a11y`, async ({
      page,
    }) => {
      await loginAs(page, "marina", "/estudio/control/avaliacoes");
      await page.getByRole("button", { name: "Executar com o provedor falso" }).click();
      await expect(page.getByRole("heading", { name: "Última execução" })).toBeVisible();
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

    test(`/estudio/control/recomendacao com "Por que esta recomendação" aberto sem violações graves @a11y`, async ({
      page,
    }) => {
      await loginAs(page, "helena");
      await page.goto("/estudio/control/recomendacao");
      await page.getByText("Por que esta recomendação", { exact: true }).click();
      await page.getByLabel("Id anônimo do leitor").fill(recAnons[0]!);
      await page.getByRole("button", { name: "Explicar recomendações" }).click();
      await expect(page.getByRole("heading", { name: /Recomendações para leitor-/ })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
    });
  });
}
