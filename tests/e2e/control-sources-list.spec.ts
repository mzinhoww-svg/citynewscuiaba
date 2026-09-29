import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";
import { SEED_PASSWORD } from "./studio";
import { loginAs, service, tag } from "./helpers/studio-login";

/*
 * Lista de fontes (P5-T4/FS-T7, tela O03). Cada teste cria fontes próprias (`Fonte Lista <tag>`)
 * e filtra por elas com `q`, porque os projetos desktop e mobile rodam em paralelo e o seed é
 * compartilhado. Nada aqui coleta na rede.
 */
const t = tag();
const NAME = (s: string) => `Fonte Lista ${s} ${t}`;
const created: string[] = [];

async function makeSource(
  key: string,
  over: Record<string, unknown> = {},
): Promise<{ id: string; slug: string; name: string }> {
  const slug = `teste-lista-${key}-${t}`;
  const name = NAME(key);
  const { data, error } = await service()
    .from("sources")
    .insert({
      slug,
      name,
      base_url: `https://${slug}.example`,
      kind: "rss",
      feed_url: `https://${slug}.example/feed`,
      locality: "cuiaba",
      status: "active",
      layer: 2,
      editorial_score: 4,
      ...over,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.push(data.id);
  return { id: data.id, slug, name };
}

test.afterAll(async () => {
  if (created.length > 0) await service().from("sources").delete().in("id", created);
});

/** A tabela (1024 px ou mais) ou a lista (abaixo), conforme a tela. */
const isTable = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("Diego filtra, ordena e pausa em lote; os filtros continuam na URL", async ({ page }) => {
  const a = await makeSource("a");
  const b = await makeSource("b");
  await loginAs(page, "diego");
  await page.goto(`/estudio/control/fontes?q=${t}&status=active&ordem=score`);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();

  if (isTable(page)) {
    await expect(page.getByRole("columnheader", { name: "Saúde" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await page.getByRole("link", { name: "Saúde" }).click();
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page.getByRole("columnheader", { name: "Saúde" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    await expect(page).toHaveURL(new RegExp(`q=${t}`));
  }

  await page.getByRole("checkbox", { name: `Selecionar ${a.name}` }).check();
  await page.getByRole("checkbox", { name: `Selecionar ${b.name}` }).check();
  await expect(page.getByText("2 fontes selecionadas")).toBeVisible();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Pausar 2 fontes?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pausar 2 fontes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 fontes alteradas" })).toBeVisible();
  await expect(page).toHaveURL(/status=active/);
  await expect(page).toHaveURL(new RegExp(`q=${t}`));

  const rows = await service()
    .from("sources")
    .select("status, status_reason")
    .in("id", [a.id, b.id]);
  expect(rows.data?.map((r) => `${r.status}/${r.status_reason}`)).toEqual([
    "paused/manual",
    "paused/manual",
  ]);
  // Com o filtro "ativa", as duas saíram da lista.
  await expect(page.getByText("Nenhuma fonte com esses filtros")).toBeVisible();
  await page.getByRole("link", { name: "Limpar filtros" }).first().click();
  await expect(page).not.toHaveURL(/status=/);
});

test("analista não vê o menu nem entra na lista", async ({ page }) => {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/entrar?next=%2Festudio");
  await page.getByLabel("E-mail", { exact: true }).fill("thiago.moraes@citynews.local");
  await page.getByLabel("Senha", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/estudio/);
  await expect(page.getByRole("link", { name: "Fontes", exact: true })).toHaveCount(0);
  await page.goto("/estudio/control/fontes");
  await expect(page).toHaveURL(/\/entrar\?next=%2Festudio%2Fcontrol%2Ffontes&motivo=sem-permissao/);
});

test("filtro sem resultado mostra o vazio com Limpar filtros e mantém os filtros na URL", async ({
  page,
}) => {
  await loginAs(page, "marina");
  await page.goto(`/estudio/control/fontes?q=nenhuma-fonte-${t}&via=rapida`);
  await expect(
    page.getByRole("heading", { name: "Nenhuma fonte com esses filtros" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/via=rapida/);
  await expect(page.getByRole("link", { name: "Limpar filtros" }).first()).toHaveAttribute(
    "href",
    "/estudio/control/fontes",
  );
  // Valor de filtro inválido é ignorado, sem quebrar a tela.
  await page.goto("/estudio/control/fontes?status=xyz&ordem=nada&pagina=-3");
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
});

test("frequência efetiva, quem elevou e próxima coleta aparecem em texto", async ({ page }) => {
  const padrao = await makeSource("padrao");
  const hora = await makeSource("hora", { frequency_minutes: 120 });
  const robots = await makeSource("robots", {
    frequency_minutes: 30,
    consumption: {
      strategy: "rss",
      robots: { checkedAt: new Date().toISOString(), allowed: true, crawlDelaySec: 1800 },
    },
  });
  await service()
    .from("sources")
    .update({ last_fetched_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .in("id", [padrao.id, hora.id, robots.id]);
  await loginAs(page, "diego");
  await page.goto(`/estudio/control/fontes?q=${t}`);
  const row = (name: string) =>
    isTable(page) ? page.locator("tr", { hasText: name }) : page.locator("li", { hasText: name });
  const def = await service()
    .from("app_settings")
    .select("value")
    .eq("key", "sources.default_frequency_minutes")
    .single();
  expect(def.error).toBeNull();
  await expect(row(padrao.name)).toContainText(/padrão/);
  await expect(row(padrao.name)).toContainText(/Próxima coleta \d{2}:\d{2}/);
  await expect(row(hora.name)).toContainText("2 h");
  await expect(row(robots.name)).toContainText("1 h (robots)");
  await expect(row(robots.name)).toContainText("Crawl-delay");
});

test("configurações da coleta: padrão sem opções da via rápida; vagas com o uso e auditoria", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda um ajuste global: roda só no desktop");
  const db = service();
  const before = await db
    .from("app_settings")
    .select("value")
    .eq("key", "sources.fast_lane_max")
    .single();
  const original = Number(before.data?.value ?? 10);
  const used =
    (
      await db
        .from("sources")
        .select("id", { count: "exact", head: true })
        .lt("frequency_minutes", 30)
        .is("archived_at", null)
    ).count ?? 0;
  try {
    await loginAs(page, "marina");
    await page.goto("/estudio/control/fontes");
    await expect(page.getByText(`Via rápida: ${used} de ${original}`).first()).toBeVisible();
    await page.getByRole("button", { name: "Configurações da coleta" }).click();
    const dialog = page.getByRole("dialog");
    const select = dialog.getByLabel("Frequência padrão");
    await expect(select.locator("option")).toHaveCount(48);
    for (const bad of ["10 min", "15 min", "20 min"])
      await expect(select.locator("option", { hasText: new RegExp(`^${bad}$`) })).toHaveCount(0);
    await expect(select.locator("option").first()).toHaveText("30 min");

    const next = original === 5 ? 6 : 5;
    await dialog.getByLabel("Vagas da via rápida").fill(String(next));
    await dialog.getByRole("button", { name: "Salvar vagas" }).click();
    await expect(dialog.getByRole("status")).toContainText(`comporta ${next} fontes`);
    const saved = await db
      .from("app_settings")
      .select("value")
      .eq("key", "sources.fast_lane_max")
      .single();
    expect(Number(saved.data?.value)).toBe(next);
    const audit = await db
      .from("audit_log")
      .select("action")
      .eq("action", "settings.update")
      .order("id", { ascending: false })
      .limit(1);
    expect(audit.data?.[0]?.action).toBe("settings.update");

    await dialog.getByLabel("Vagas da via rápida").fill("21");
    await dialog.getByRole("button", { name: "Salvar vagas" }).click();
    await expect(dialog.getByRole("status")).toContainText("Informe de 0 a 20 vagas");
  } finally {
    await db.from("app_settings").update({ value: original }).eq("key", "sources.fast_lane_max");
  }
});

test("aviso de aprovação pendente leva à fonte e às aprovações", async ({ page }) => {
  const s = await makeSource("aprov");
  const db = service();
  const diego = "c1000000-0000-4000-8000-000000000007";
  const req = await db
    .from("approvals")
    .insert({
      kind: "source.critical",
      target_ref: `source:${s.id}:image_policy=reproduction`,
      requested_by: diego,
      justification: "Teste da lista de fontes",
    })
    .select("id")
    .single();
  if (req.error) throw req.error;
  try {
    await loginAs(page, "marina");
    await page.goto(`/estudio/control/fontes?q=${t}`);
    await expect(page.getByText(/mudanç(a|as) crític(a|as) aguarda/)).toBeVisible();
    await expect(page.getByText(/Política de imagem: Reprodução com crédito/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver aprovações" })).toHaveAttribute(
      "href",
      "/estudio/control/aprovacoes",
    );
    await expect(page.getByText("Mudança aguardando aprovação").locator("visible=true").first()).toBeVisible();
  } finally {
    await db.from("approvals").delete().eq("id", req.data.id);
  }
});

test("360 px vira lista sem rolagem horizontal, com o link e a seleção de cada fonte", async ({
  page,
}) => {
  const s = await makeSource("cel");
  await page.setViewportSize({ width: 360, height: 740 });
  await loginAs(page, "diego");
  await page.goto(`/estudio/control/fontes?q=${t}`);
  await expect(page.getByRole("table")).toBeHidden();
  const item = page.getByRole("listitem").filter({ hasText: s.name });
  await expect(item.getByRole("link", { name: s.name })).toHaveAttribute(
    "href",
    `/estudio/control/fontes/${s.id}`,
  );
  await expect(item.getByRole("checkbox", { name: `Selecionar ${s.name}` })).toBeVisible();
  await expect(item.getByRole("button", { name: `Coletar agora: ${s.name}` })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
