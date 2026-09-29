import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  callFastTick,
  chapadaRoutes,
  drainRuns,
  failFetchOnce,
  feedRoutes,
  refreshHome,
  resetFastWindow,
} from "./helpers/pipeline";
import { loginAs, service, tag } from "./helpers/studio-login";

/*
 * Jornadas completas do painel de fontes (FS-T9). Rodam no servidor de desenvolvimento do
 * Playwright (projetos `fixtures-*`, CRAWLER_FIXTURES=1 e AI_PROVIDER=fake): o painel enxerga só
 * fixtures fictícias (`*.example`) e a coleta roda dentro do teste com HTTP falso e a service role
 * (`helpers/pipeline.ts`). Nenhum teste acessa a rede. Cada teste cria as próprias fontes.
 */
test.setTimeout(240_000);
const SLOW = { timeout: 45_000 };
const db = service();

type NewSource = {
  name: string;
  status?: "active" | "paused";
  score?: number;
  feed?: string;
  imagePolicy?: "none" | "reproduction";
};

/** Fonte de teste com um item agregado recente (aparece no Panorama e no "Veja também"). */
async function makeSourceWithItem(opts: NewSource) {
  const t = tag();
  const status = opts.status ?? "active";
  const src = await db
    .from("sources")
    .insert({
      slug: `teste-fs9-${t}`,
      name: `${opts.name} ${t}`,
      base_url: `https://fs9-${t}.example/`,
      feed_url: opts.feed ?? `https://fs9-${t}.example/feed`,
      kind: "rss" as const,
      locality: "cuiaba",
      status,
      status_reason: status === "paused" ? ("manual" as const) : null,
      terms_reviewed_at: new Date().toISOString(),
      editorial_score: opts.score ?? 3,
      image_policy: opts.imagePolicy ?? "none",
      republish_policy: "summary_2_sentences" as const,
      last_fetched_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    })
    .select("id, name, slug")
    .single();
  if (src.error) throw src.error;
  const title = `Prefeitura anuncia obra fictícia ${t}`;
  const item = await db.from("collected_items").insert({
    source_id: src.data.id,
    canonical_url: `https://fs9-${t}.example/noticia/${t}`,
    original_title: title,
    summary: "Resumo escrito pelo CityNews para o teste, sem trecho da fonte.",
    published_at: new Date().toISOString(),
    image_url: `https://fs9-${t}.example/foto.jpg`,
    section_slug: "cidade",
    locality: "cuiaba",
  });
  if (item.error) throw item.error;
  return { ...src.data, title, t };
}

/** Apaga a fonte de teste e o que nasceu dela (ordem das chaves estrangeiras). */
async function dropSource(id: string) {
  const s = await db.from("sources").select("slug").eq("id", id).maybeSingle();
  await db.from("collected_items").delete().eq("source_id", id);
  await db.from("raw_items").delete().eq("source_id", id);
  await db.from("source_discoveries").delete().eq("source_id", id);
  await db.from("approvals").delete().like("target_ref", `source:${id}:%`);
  if (s.data) await db.from("notifications").delete().eq("object_ref", `source:${s.data.slug}`);
  const del = await db.from("sources").delete().eq("id", id);
  if (del.error) console.error(`limpeza da fonte ${id}: ${del.error.message}`);
}

const created: string[] = [];
test.afterAll(async () => {
  for (const id of created) await dropSource(id);
});
// Cotas por hora: cada execução começa sem consumo (análise, teste de conexão e coleta por host).
test.beforeEach(async () => {
  await db
    .from("rate_limits")
    .delete()
    .in("bucket", ["source_analyze", "source_test", "collect_now"]);
  // Por host e por fonte: a chave fica em `key_hash` (`discover`, `test`, `activate`, `crawler`).
  await db.from("rate_limits").delete().like("key_hash", "%chapada%");
});

const detail = (id: string, sub = "") => `/estudio/control/fontes/${id}${sub}`;

/** Página pública numa sessão anônima, sem cookies do Estúdio. */
async function publicPage(browser: import("@playwright/test").Browser, baseURL: string) {
  const ctx = await browser.newContext({ baseURL });
  return { ctx, page: await ctx.newPage() };
}

async function seesTitle(page: Page, path: string, title: string) {
  await page.goto(path);
  return (await page.getByText(title).count()) > 0;
}

test("cadastrar, ativar, coletar agora, 3 falhas, pausa automática e retomar", async ({
  page,
}, info) => {
  test.skip(!info.project.name.endsWith("desktop"), "endereço fictício único no cadastro");
  // Restos de execuções anteriores (a análise recusa endereço já cadastrado).
  const old = await db
    .from("sources")
    .select("id")
    .like("base_url", "https://jornaldachapada.example%");
  for (const o of old.data ?? []) await dropSource(o.id);

  await loginAs(page, "helena", "/estudio/control/fontes/nova");
  await page.getByLabel("Endereço da fonte").fill("https://jornaldachapada.example/");
  await page.getByRole("button", { name: "Analisar" }).click();
  // Seção sem feed: a prévia vem da própria página, pelos seletores sugeridos pela IA.
  await expect(
    page.getByRole("list", { name: "Prévia dos últimos itens" }).getByRole("listitem"),
  ).toHaveCount(5, SLOW);
  await expect(page.getByText("Seletores de página sugeridos pela IA")).toBeVisible();
  // Revisão da análise (prévia, seletores e sugestões): sem violação séria do axe.
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => v.id),
  ).toEqual([]);
  await page.getByLabel(/Usar os seletores sugeridos/).check();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Li os termos de uso e a coleta é permitida").check();
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByRole("button", { name: "Salvar e ativar" }).click();
  await expect(page).toHaveURL(/\/estudio\/control\/fontes\/[0-9a-f-]{36}$/, SLOW);
  const id = page.url().split("/").pop() as string;
  created.push(id);

  const row = await db
    .from("sources")
    .select("slug, status, kind, consumption")
    .eq("id", id)
    .single();
  expect(row.data).toMatchObject({ status: "active", kind: "page" });
  expect(JSON.stringify(row.data?.consumption)).toContain("article.card");
  const slug = row.data!.slug;
  await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();

  // Coletar agora: o painel enfileira; o worker (aqui, dentro do teste) roda fetch → normalize.
  await page.getByRole("button", { name: "Coletar agora" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Coleta iniciada" })).toBeVisible(SLOW);
  const runs = await db.from("ingest_runs").select("id, trigger").eq("stats->>source", id);
  expect(runs.data).toHaveLength(1);
  expect(runs.data?.[0]?.trigger).toBe("manual");
  const drained = await drainRuns([runs.data![0]!.id], chapadaRoutes("ok"));
  expect(drained.processed).toBeGreaterThanOrEqual(4);
  const got = await db
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .eq("source_id", id);
  expect(got.count).toBe(5);
  await page.goto(detail(id, "/coleta"));
  await expect(
    page
      .getByRole("region", { name: /coletas/i })
      .getByText("fetch concluída")
      .first(),
  ).toBeVisible();

  // Três coletas seguidas falham (site com HTTP 500): 1ª e 2ª deixam a fonte instável, 3ª pausa.
  for (const expected of ["degraded", "degraded", "paused"] as const) {
    await failFetchOnce(slug, chapadaRoutes("http500"));
    await expect
      .poll(
        async () => (await db.from("sources").select("status").eq("id", id).single()).data?.status,
      )
      .toBe(expected);
  }
  const paused = await db
    .from("sources")
    .select("status, status_reason, consecutive_failures")
    .eq("id", id)
    .single();
  expect(paused.data).toMatchObject({ status: "paused", status_reason: "auto_failures" });
  const notes = await db
    .from("notifications")
    .select("kind, channel, status")
    .eq("dedupe_key", `source-auto-paused:${slug}`);
  expect(notes.data).toEqual([
    { kind: "source_auto_paused", channel: "control_center", status: "open" },
  ]);

  await page.goto(detail(id));
  await expect(
    page.getByText(/Pausada automaticamente em .* após 3 falhas seguidas/),
  ).toBeVisible();
  await page.goto(`/estudio/control/fontes?q=${encodeURIComponent(row.data!.slug)}`);
  await expect(page.getByText("Pausa automática por falhas").first()).toBeVisible();

  // Retomar: testa a conexão (site de volta) e ativa; a contagem de falhas recomeça.
  await page.goto(detail(id));
  await page.getByRole("button", { name: "Retomar" }).click();
  await expect
    .poll(
      async () => (await db.from("sources").select("status").eq("id", id).single()).data?.status,
      SLOW,
    )
    .toBe("active");
  const back = await db.from("sources").select("consecutive_failures").eq("id", id).single();
  expect(back.data?.consecutive_failures).toBe(0);
});

test("opt-out: bloquear por pedido do veículo tira agregados e imagens do portal", async ({
  page,
  browser,
  baseURL,
}) => {
  const s = await makeSourceWithItem({ name: "Portal Saída", imagePolicy: "reproduction" });
  created.push(s.id);
  const visitor = await publicPage(browser, baseURL!);
  try {
    await refreshHome(baseURL!);
    expect(await seesTitle(visitor.page, "/panorama", s.title)).toBe(true);
    expect(await seesTitle(visitor.page, "/", s.title)).toBe(true);
    const before = await db.from("public_aggregated").select("image_url").eq("source_id", s.id);
    expect(before.data?.[0]?.image_url).toContain("foto.jpg");

    await loginAs(page, "helena", detail(s.id));
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Pedido do veículo").check();
    await dlg.getByRole("button", { name: "Bloquear fonte" }).click();
    await expect(page.getByText("Bloqueada", { exact: true }).first()).toBeVisible(SLOW);

    const src = await db
      .from("sources")
      .select("status, status_reason, image_policy")
      .eq("id", s.id)
      .single();
    expect(src.data).toEqual({ status: "blocked", status_reason: "opt_out", image_policy: "none" });
    const after = await db.from("public_aggregated").select("id").eq("source_id", s.id);
    expect(after.data).toEqual([]);
    // Nem o Panorama nem o "Veja também" da home (cache de 60 s, invalidado pela ação).
    expect(await seesTitle(visitor.page, "/panorama", s.title)).toBe(false);
    expect(await seesTitle(visitor.page, "/", s.title)).toBe(false);
    const audit = await db
      .from("audit_log")
      .select("action")
      .eq("object_ref", `source:${s.id}`)
      .eq("action", "source.status");
    expect(audit.data?.length).toBeGreaterThan(0);
  } finally {
    await visitor.ctx.close();
  }
});

test("score 1 tira a fonte do Veja também da home, mas não do Panorama", async ({
  page,
  browser,
  baseURL,
}) => {
  const s = await makeSourceWithItem({ name: "Portal Score", score: 3 });
  created.push(s.id);
  const visitor = await publicPage(browser, baseURL!);
  try {
    await refreshHome(baseURL!);
    expect(await seesTitle(visitor.page, "/", s.title)).toBe(true);
    await loginAs(page, "helena", detail(s.id, "/configuracao"));
    await page.getByLabel("Score editorial").selectOption("1");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Fonte salva." })).toBeVisible(SLOW);
    expect(await seesTitle(visitor.page, "/", s.title)).toBe(false);
    expect(await seesTitle(visitor.page, "/panorama", s.title)).toBe(true);
  } finally {
    await visitor.ctx.close();
  }
});

test("via rápida: 10 min, o tick chama o run rápido e os itens seguem o pipeline", async ({
  page,
  baseURL,
}, info) => {
  test.skip(!info.project.name.endsWith("desktop"), "usa a janela de 10 min: roda uma vez");
  const s = await makeSourceWithItem({
    name: "Portal Rápido",
    feed: "https://fs9-rapido.example/feed",
  });
  created.push(s.id);
  await db.from("collected_items").delete().eq("source_id", s.id);
  await db
    .from("sources")
    .update({ feed_url: `https://fs9-${s.t}.example/feed` })
    .eq("id", s.id);

  await loginAs(page, "helena", detail(s.id, "/configuracao"));
  await page.getByLabel("Frequência de coleta").selectOption("10");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fonte salva." })).toBeVisible(SLOW);
  await expect(page.getByText("Frequência efetiva: 10 min · via rápida.")).toBeVisible();

  // Tick da via rápida (rota real, CRON_SECRET): abre o run `fast` da janela e enfileira o fetch.
  await resetFastWindow();
  const tick = await callFastTick(baseURL!);
  expect(tick.status).toBe(200);
  const fast = await db
    .from("ingest_runs")
    .select("id, trigger, stats")
    .eq("trigger", "fast")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  expect(fast.data?.trigger).toBe("fast");
  const routes = feedRoutes(`fs9-${s.t}.example`);
  const drained = await drainRuns([fast.data!.id], routes, { slug: s.slug });
  expect(drained.processed).toBeGreaterThanOrEqual(4);
  expect(drained.requests).toBe(2); // robots.txt e o feed: uma única coleta na janela
  const raw = await db
    .from("raw_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", fast.data!.id)
    .eq("source_id", s.id);
  expect(raw.count).toBe(1);
  const items = await db
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .eq("source_id", s.id);
  expect(items.count).toBeGreaterThan(0);

  await page.goto(detail(s.id, "/coleta"));
  await expect(page.getByText("Via rápida", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /coletas/i })
      .getByText("fetch concluída")
      .first(),
  ).toBeVisible();
});
