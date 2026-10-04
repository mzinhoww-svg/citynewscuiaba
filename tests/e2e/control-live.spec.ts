import { expect, test } from "@playwright/test";
import { controlFixture, type ControlFixture } from "./control";
import { loginAs, service } from "./studio";
import { openFilters } from "./helpers/filters";

/*
 * P5-T3 · Control Center: visão geral (fonte com 3 falhas = "Pausada automaticamente"), tempo real por
 * polling, falhas com reprocessamento, execuções com gráfico de fases e logs com exportação.
 */
let fx: ControlFixture;

test.beforeEach(async () => {
  fx = await controlFixture();
});
test.afterEach(async () => {
  await fx.cleanup();
});

test("visão geral: fonte com 3 falhas seguidas aparece como Pausada automaticamente", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  const table = page.getByRole("table", { name: /Saúde das fontes/ });
  const row = table.getByRole("row").filter({ hasText: fx.failing.name });
  await expect(row).toContainText("Pausada automaticamente");
  await expect(row).toContainText(`HTTP 503 em https://${fx.failing.slug}.example/feed`);
  await expect(table.getByRole("row").filter({ hasText: fx.healthy.name })).toContainText("Ativa");
  await expect(page.getByText(/Fonte pausada automaticamente por 3 falhas seguidas/)).toBeVisible();

  // Ordenação acessível: o cabeçalho anuncia a ordem.
  const header = table.getByRole("columnheader", { name: /Fonte/ });
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
});

test("Executar agora de uma fonte é a coleta manual do painel", async ({ page }, info) => {
  // Um ciclo por vez: só no desktop (o projeto mobile rodaria em paralelo contra o mesmo banco).
  test.skip(info.project.name !== "desktop", "ciclo manual só no projeto desktop");
  await loginAs(page, "diego", "/estudio/control");
  await page.getByLabel("Fonte", { exact: true }).selectOption({ label: fx.healthy.name });
  await page.getByRole("button", { name: "Executar agora" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ciclo iniciado" })).toContainText(
    "1 coleta na fila",
  );
  const { data } = await service()
    .from("ingest_runs")
    .select("trigger, stats")
    .contains("stats", { source: fx.healthy.id });
  expect(data).toHaveLength(1);
  expect(data![0]!.trigger).toBe("manual");
  expect(data![0]!.stats).toMatchObject({ fetch_enqueued: 1 });
});

test("tempo real: novo evento aparece sem recarregar a página", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/tempo-real");
  await expect(page.getByRole("heading", { level: 1, name: "Tempo real" })).toBeVisible();
  await expect(page.getByText(/Atualizado às/)).toBeVisible();
  const message = `evento ao vivo ${fx.mark}`;
  await service()
    .from("pipeline_events")
    .insert({ run_id: fx.runId, step: "index", item_ref: fx.itemRef, level: "info", message });
  await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Pausar atualização" }).click();
  await expect(page.getByRole("button", { name: "Retomar atualização" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("falhas: reprocessa a quarentena mantendo decisões humanas", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/falhas");
  const row = page.getByRole("row").filter({ hasText: `tempo esgotado ${fx.mark}` });
  await expect(row).toContainText("Quarentena");
  await row.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox", { name: "Manter decisões humanas" })).toBeChecked();
  await page.getByRole("button", { name: "Reprocessar selecionadas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "voltou à fila" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `tempo esgotado ${fx.mark}` })).toHaveCount(
    0,
  );
  const { data } = await service()
    .from("pipeline_quarantine")
    .select("resolved_at, resolved_by")
    .eq("id", fx.quarantineId)
    .single();
  expect(data?.resolved_at).not.toBeNull();
});

test("execuções: detalhe do ciclo com gráfico de fases e resumo textual", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/execucoes");
  await expect(page.getByRole("heading", { level: 1, name: "Execuções" })).toBeVisible();
  await page.goto(`/estudio/control/execucoes/${fx.runId}`);
  await expect(page.getByRole("img", { name: /Duração de cada fase/ })).toBeVisible();
  await expect(page.getByText(/^Coleta: começou em 0,5 min e durou 1,5 min/)).toBeVisible();
  await expect(page.getByText(/^Entendimento: .* 1 com falha\./)).toBeVisible();
  // Analista não opera: sem reprocessamento.
  await expect(page.getByRole("button", { name: "Reprocessar ciclo" })).toHaveCount(0);
});

test("logs: filtra por texto, mascara IP e exporta CSV", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/logs");
  await openFilters(page);
  await page.getByLabel("Buscar no texto").fill(fx.mark);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(new RegExp(`q=${fx.mark}`));
  const table = page.getByRole("table", { name: "Eventos do pipeline" });
  await expect(table.getByText(`falha de teste ${fx.mark} em 198.51.x.x`).first()).toBeVisible();
  await expect(table.getByText("198.51.100.7")).toHaveCount(0);
  const href = await page.getByRole("link", { name: "Exportar CSV" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const csv = await res.text();
  expect(csv).toContain(fx.mark);
  expect(csv).not.toContain("198.51.100.7");
});

test("sem papel de operação, Falhas redireciona para a tela de entrar", async ({ page }) => {
  await loginAs(page, "thiago");
  await page.goto("/estudio/control/falhas");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});
