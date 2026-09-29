import { expect, test, type Page } from "@playwright/test";
import { controlFixture, type ControlFixture } from "../e2e/control";
import { loginAs, service, STAFF } from "../e2e/studio";

/*
 * Roteiro exploratório do P5 · Control Center, com Playwright no lugar do agent-browser (A-026).
 * Cada passo confere o esperado e captura a tela em 390 × 844 e 1280 × 800 em
 * docs/reports/P5/<tela>-<largura>x<altura>.png. Só com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/p5.spec.ts
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");

async function shot(page: Page, name: string, fullPage = true) {
  const v = page.viewportSize()!;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/reports/P5/${name}-${v.width}x${v.height}.png`,
    fullPage,
    animations: "disabled",
  });
}

let fx: ControlFixture;
test.beforeAll(async () => {
  fx = await controlFixture();
});
test.afterAll(async () => {
  await fx.cleanup();
});

test("O01/O02 · visão geral e tempo real", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control");
  await expect(page.getByText("Pausada automaticamente").first()).toBeVisible();
  await shot(page, "o01-visao-geral");
  await page.goto("/estudio/control/tempo-real");
  await expect(page.getByText(/Atualizado às/)).toBeVisible();
  await shot(page, "o02-tempo-real");
});

test("O06 · falhas", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/falhas");
  await expect(page.getByText(`tempo esgotado ${fx.mark}`)).toBeVisible();
  await shot(page, "o06-falhas");
});

test("O07 · execuções e detalhe do ciclo", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/execucoes");
  await expect(page.getByRole("table", { name: "Ciclos do pipeline" })).toBeVisible();
  await shot(page, "o07-execucoes");
  await page.goto(`/estudio/control/execucoes/${fx.runId}`);
  await expect(page.getByRole("img", { name: /Duração de cada fase/ })).toBeVisible();
  await shot(page, "o07-ciclo");
});

test("O08 · logs com filtro e estado vazio", async ({ page }) => {
  await loginAs(page, "diego", `/estudio/control/logs?q=${fx.mark}`);
  await expect(page.getByRole("table", { name: "Eventos do pipeline" })).toBeVisible();
  await shot(page, "o08-logs");
  await page.goto("/estudio/control/logs?q=nada-encontrado-xyz");
  await expect(page.getByText("Nenhum evento com estes filtros.")).toBeVisible();
  await shot(page, "o08-logs-vazio", false);
});

test("O09/O13/O14/O16 · custos, bases, avaliações e governança", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/custos");
  await expect(page.getByText(/^Maior gasto: R\$/)).toBeVisible();
  await shot(page, "o09-custos");
  await page.goto("/estudio/control/conhecimento");
  await expect(page.getByRole("table", { name: "Bases de conhecimento da IA" })).toBeVisible();
  await shot(page, "o13-conhecimento");
  await page.goto("/estudio/control/avaliacoes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Avaliações e regressão" }),
  ).toBeVisible();
  await shot(page, "o14-avaliacoes");
  await page.goto("/estudio/control/governanca");
  await expect(page.getByText(/A IA nunca responde sem fonte/)).toBeVisible();
  await shot(page, "o16-governanca");
});

test("Aprovações · caixa com pedido pendente (P5-T1)", async ({ page }) => {
  const db = service();
  const version = 4_000_000 + Math.floor(Math.random() * 1e6);
  const { data: rule, error } = await db
    .from("rules")
    .insert({
      version,
      body: { version, forceReview: true, sensitiveTopics: [], categories: {} },
      force_review: true,
      proposed_by: STAFF.diego.id,
    })
    .select("version")
    .single();
  if (error || !rule) throw new Error(error?.message ?? "sem regra");
  const { data: ap } = await db
    .from("approvals")
    .insert({
      kind: "rules.activate",
      target_ref: `rules:${version}`,
      requested_by: STAFF.diego.id,
      justification: "Roteiro: pedido de exemplo para a captura de tela",
    })
    .select("id")
    .single();
  try {
    await loginAs(page, "marina", "/estudio/control/aprovacoes");
    await expect(page.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
    // Desktop e mobile rodam em paralelo: pode haver mais de um pedido de roteiro aberto.
    await expect(page.getByText(/pedidos? aguardam? decisão/)).toBeVisible();
    await shot(page, "aprovacoes");
    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shot(page, "aprovacoes-dialogo", false);
  } finally {
    if (ap) await db.from("approvals").delete().eq("id", ap.id);
    await db.from("rules").delete().eq("version", version);
  }
});

test("O05 · regras de autonomia com simulação", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/regras");
  await expect(page.getByRole("heading", { level: 1, name: "Regras de autonomia" })).toBeVisible();
  await shot(page, "o05-regras");
  await page.getByRole("spinbutton", { name: "Mín. fontes de Cidade" }).fill("3");
  await page.getByRole("button", { name: "Simular com os últimos 7 dias" }).click();
  await expect(page.getByRole("region", { name: "Resultado da simulação" })).toBeVisible();
  await shot(page, "o05-regras-simulacao");
});

test("A15 · contingência e diálogo de confirmação", async ({ page }) => {
  await loginAs(page, "helena", "/estudio/admin/contingencia");
  await expect(page.getByRole("heading", { level: 1, name: "Contingência" })).toBeVisible();
  await shot(page, "a15-contingencia");
  await page.getByRole("button", { name: "Ativar modo leitura" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel(/Digite MODO LEITURA/)
    .fill("modo");
  await shot(page, "a15-contingencia-dialogo", false);
});

test("A01–A06 · administração: painel, usuários, papéis, equipes, taxonomia e home", async ({
  page,
}) => {
  await loginAs(page, "helena", "/estudio/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Administração" })).toBeVisible();
  await shot(page, "a01-admin");
  await page.goto("/estudio/admin/usuarios");
  await expect(page.getByRole("table", { name: "Pessoas da equipe" })).toBeVisible();
  await shot(page, "a02-usuarios");
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "a02-usuarios-convite", false);
  await page.goto("/estudio/admin/papeis");
  await expect(page.getByRole("table", { name: "Matriz de permissões por papel" })).toBeVisible();
  await shot(page, "a03-papeis");
  await page.goto("/estudio/admin/equipes");
  await expect(page.getByRole("heading", { level: 1, name: "Equipes" })).toBeVisible();
  await shot(page, "a04-equipes");
  await page.goto("/estudio/admin/taxonomia");
  await expect(page.getByRole("table", { name: "Tags em uso" })).toBeVisible();
  await shot(page, "a05-taxonomia");
  await page.goto("/estudio/admin/home");
  await expect(page.getByRole("list", { name: "Módulos da home" })).toBeVisible();
  await shot(page, "a06-home");
});
