import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs, service, tag } from "./studio";

/*
 * Monitoramento do Control Center (P5-T3): fonte com 3 falhas seguidas aparece "Pausada (auto)",
 * o tempo real atualiza por polling de 5 s (e para com a aba oculta), estados vazio e de erro,
 * IPs mascarados para quem não é admin e o "Executar agora". Cada teste cria a própria fonte e o
 * próprio ciclo (desktop e mobile rodam em paralelo) e apaga tudo no fim.
 */
const db = service();
const runIds: string[] = [];
const sourceSlugs: string[] = [];
const manualRunners: string[] = [];
const startedAt = new Date().toISOString();

async function newRun(): Promise<string> {
  const { data, error } = await db
    .from("ingest_runs")
    .insert({ window_start: new Date(Date.now() - Math.floor(Math.random() * 1e9)).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  runIds.push(data.id);
  return data.id;
}

async function newSource(status: "paused" | "degraded" = "paused") {
  const slug = `teste-p5t3-${tag()}`;
  const { error } = await db.from("sources").insert({
    slug,
    name: `Fonte de Teste ${slug.slice(-6)}`,
    base_url: `https://${slug}.example.test`,
    kind: "rss",
    locality: "cuiaba",
    status,
  });
  if (error) throw error;
  sourceSlugs.push(slug);
  return slug;
}

async function failures(slug: string, runId: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    run_id: runId,
    step: "fetch",
    item_ref: `source:${slug}`,
    level: "error" as const,
    message: `Falha de coleta ${i + 1}`,
  }));
  const { error } = await db.from("pipeline_events").insert(rows);
  if (error) throw error;
}

test.afterAll(async () => {
  if (runIds.length) await db.rpc("purge_pipeline_events", { p_run_ids: runIds });
  if (sourceSlugs.length) await db.from("sources").delete().in("slug", sourceSlugs);
  // Ciclos criados pelo botão "Executar agora": fila e ciclo saem juntos.
  for (const who of manualRunners) {
    const { data: runs } = await db
      .from("ingest_runs")
      .select("id, stats")
      .gte("started_at", startedAt)
      .contains("stats", { manual: true, requested_by: who });
    for (const r of runs ?? []) {
      await db.from("jobs").delete().eq("message->>runId", r.id);
      await db.rpc("purge_pipeline_events", { p_run_ids: [r.id] });
      await db.from("ingest_runs").delete().eq("id", r.id);
    }
  }
  if (runIds.length) await db.from("ingest_runs").delete().in("id", runIds);
});

test("fonte com 3 falhas seguidas aparece como Pausada (auto)", async ({ page }) => {
  const runId = await newRun();
  const bad = await newSource("paused");
  const soft = await newSource("degraded");
  await failures(bad, runId, 3);
  await failures(soft, runId, 1);

  await loginAs(page, "marina", "/estudio/control/falhas");
  const row = page.locator(`[data-source="${bad}"]`);
  await expect(row).toContainText("Pausada (auto)");
  await expect(row).toContainText("Pausada após 3 falhas seguidas");
  await expect(page.locator(`[data-source="${soft}"]`)).toContainText("Degradada");

  await page.goto("/estudio/control");
  await expect(page.locator(`[data-source="${bad}"]`)).toContainText("Pausada (auto)");
});

test("a tabela de fontes ordena por coluna com aria-sort", async ({ page }) => {
  const runId = await newRun();
  const bad = await newSource("paused");
  await failures(bad, runId, 3);
  await loginAs(page, "marina", "/estudio/control/tempo-real");
  const header = page.getByRole("columnheader", { name: /Falhas seguidas/ });
  await expect(header).toHaveAttribute("aria-sort", "none");
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
});

test("tempo real atualiza por polling e para com a aba oculta", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/control/tempo-real");
  const stamp = page.getByTestId("live-updated");
  const first = await stamp.getAttribute("data-at");

  const runId = await newRun();
  const message = `Evento do polling ${tag()}`;
  await db
    .from("pipeline_events")
    .insert({ run_id: runId, step: "classify", item_ref: "item:polling", level: "info", message });
  await expect(page.getByTestId("live-feed").getByText(message)).toBeVisible({ timeout: 15_000 });
  expect(await stamp.getAttribute("data-at")).not.toBe(first);

  // Aba oculta: nenhuma chamada nova em mais de um intervalo.
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/control/live")) calls++;
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(7000);
  expect(calls).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls, { timeout: 8000 }).toBeGreaterThan(0);

  // Pausa manual.
  await page.getByRole("button", { name: "Pausar atualização" }).click();
  await expect(page.getByText("Atualização pausada").first()).toBeVisible();
});

test("falha de rede mantém o retrato e avisa; sessão expirada pede novo login", async ({
  page,
}) => {
  await loginAs(page, "marina", "/estudio/control/tempo-real");
  await page.route("**/api/control/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await expect(
    page.getByRole("alert").filter({ hasText: "Sem conexão com o servidor" }),
  ).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("heading", { name: "Filas por etapa" })).toBeVisible();
  await page.unroute("**/api/control/live");
  await page.route("**/api/control/live", (r) => r.fulfill({ status: 401, body: "{}" }));
  await expect(page.getByRole("alert").filter({ hasText: "Sua sessão expirou" })).toBeVisible({
    timeout: 12_000,
  });
});

test("logs: estado vazio, filtros e IP mascarado para quem não é admin", async ({ page }) => {
  const runId = await newRun();
  const t = tag();
  await db.from("pipeline_events").insert({
    run_id: runId,
    step: "fetch",
    item_ref: `source:ip-${t}`,
    level: "error",
    message: `Falha de DNS em 203.0.113.42 (${t})`,
    details: { resolved: "198.51.100.7" },
  });

  await loginAs(page, "marina", `/estudio/control/logs`);
  await page.goto(`/estudio/control/logs?ciclo=${runId}`);
  const row = page.getByRole("row").filter({ hasText: t });
  await expect(row).toContainText("203.0.x.x");
  await expect(row).not.toContainText("203.0.113.42");
  await row.getByText("Detalhes").click();
  await expect(row).toContainText("198.51.x.x");
  await expect(page.getByText("IPs mascarados para o seu papel.")).toBeVisible();

  await page.goto(`/estudio/control/logs?ciclo=${runId}&nivel=security`);
  await expect(
    page.getByRole("heading", { name: "Nenhum evento com estes filtros" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, "helena", `/estudio/control/logs`);
  await page.goto(`/estudio/control/logs?ciclo=${runId}`);
  await expect(page.getByRole("row").filter({ hasText: t })).toContainText("203.0.113.42");
});

test("execuções e detalhe do ciclo mostram fases, etapas e falhas", async ({ page }) => {
  const runId = await newRun();
  const t = tag();
  await db.from("pipeline_events").insert([
    {
      run_id: runId,
      step: "fetch",
      item_ref: `source:x-${t}`,
      level: "info" as const,
      message: "ok",
    },
    {
      run_id: runId,
      step: "normalize",
      item_ref: `raw:${randomUUID()}#0`,
      level: "error" as const,
      message: `Falha do ciclo ${t}`,
    },
  ]);
  await loginAs(page, "marina", "/estudio/control/execucoes");
  await expect(page.getByRole("columnheader", { name: /Duração/ })).toHaveAttribute(
    "aria-sort",
    "none",
  );
  await page.goto(`/estudio/control/execucoes/${runId}`);
  await expect(page.getByRole("heading", { name: "Duração por fase" })).toBeVisible();
  await expect(page.getByText(/Duração por fase: Coleta/)).toBeVisible();
  await expect(page.getByText(`Falha do ciclo ${t}`)).toBeVisible();
  await expect(page.getByRole("row", { name: /Normalizar/ })).toBeVisible();

  await page.goto("/estudio/control/execucoes/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Ciclo não encontrado" })).toBeVisible();
});

test("reprocessar um ciclo sem manter decisões exige digitar a confirmação", async ({ page }) => {
  const runId = await newRun();
  await loginAs(page, "diego", `/estudio/control/execucoes/${runId}`);
  await page.getByLabel("Manter decisões humanas").uncheck();
  await page.getByRole("button", { name: "Reprocessar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Confira a etapa e a confirmação" }),
  ).toBeVisible();
  await page.getByLabel("Digite reprocessar para confirmar").fill("reprocessar");
  await page.getByLabel("Manter decisões humanas").uncheck();
  await page.getByRole("button", { name: "Reprocessar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /item|itens/ })).toBeVisible();
});

test("Executar agora cria um ciclo manual; quem só lê não vê o botão nem entra", async ({
  page,
}) => {
  manualRunners.push("c1000000-0000-4000-8000-000000000007");
  await loginAs(page, "diego", "/estudio/control");
  await page.getByRole("button", { name: "Executar agora" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Ciclo criado/ })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, "carlos", "/estudio");
  await page.goto("/estudio/control");
  await expect(page).toHaveURL(/\/entrar/);
});

test("rota run-now recusa outro site, sem sessão e papel sem permissão (sem usar o segredo do cron)", async ({
  page,
  baseURL,
}) => {
  const origin = { origin: baseURL ?? "http://localhost:3000" };
  // Sem Origin do mesmo site: recusa, mesmo com a sessão da pessoa.
  await loginAs(page, "diego", "/estudio");
  expect((await page.request.post("/api/control/run-now", { data: {} })).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/control/run-now", {
        data: {},
        headers: { origin: "https://outro-site.example" },
      })
    ).status(),
  ).toBe(403);
  // O segredo do cron não abre esta rota.
  const cron = await page.context().request.post("/api/control/run-now", {
    data: {},
    headers: { ...origin, authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(cron.status()).toBe(200); // a sessão do Diego vale; o cabeçalho é ignorado
  const body = (await cron.json()) as { runId: string };
  manualRunners.push("c1000000-0000-4000-8000-000000000007");
  expect(body.runId).toBeTruthy();

  await page.context().clearCookies();
  const anon = await page
    .context()
    .request.post("/api/control/run-now", { data: {}, headers: origin });
  expect(anon.status()).toBe(401);
  expect((await page.context().request.get("/api/control/live")).status()).toBe(401);

  await loginAs(page, "carlos", "/estudio");
  const denied = await page
    .context()
    .request.post("/api/control/run-now", { data: {}, headers: origin });
  expect(denied.status()).toBe(403);
  expect((await page.context().request.get("/api/control/live")).status()).toBe(403);
});
