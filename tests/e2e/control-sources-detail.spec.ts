import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, service, tag } from "./helpers/studio-login";
import { SEED_PASSWORD } from "./studio";
import { forwardedFor } from "./own-ip";

/*
 * Nova fonte e detalhe da fonte (O04, FS-T8). Rodar com CRAWLER_FIXTURES=1 e AI_PROVIDER=fake
 * (só fixtures fictícias, sem rede). Cada teste cria a própria fonte pela service role.
 */
const created: string[] = [];
const SLOW = { timeout: 30_000 };
test.setTimeout(120_000);
// Limite de 10 análises por hora por pessoa: cada execução começa sem consumo.
test.beforeEach(async () => {
  await service().from("rate_limits").delete().like("bucket", "%source_analyze%");
});
test.afterAll(async () => {
  if (created.length) await service().from("sources").delete().in("id", created);
});

async function makeSource(status: "active" | "paused", name: string) {
  const t = tag();
  const { data, error } = await service()
    .from("sources")
    .insert({
      slug: `teste-fs8-${t}`,
      name: `${name} ${t}`,
      base_url: `https://teste-${t}.example/`,
      feed_url: `https://teste-${t}.example/feed`,
      kind: "rss" as const,
      locality: "cuiaba",
      status,
      status_reason: status === "paused" ? "manual" : null,
      terms_reviewed_at: new Date().toISOString(),
      last_fetched_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    })
    .select("id, name, slug")
    .single();
  if (error) throw error;
  created.push(data.id);
  return data;
}

const detail = (id: string, sub = "") => `/estudio/control/fontes/${id}${sub}`;

test("Helena cadastra a Voz do Coxipó a partir do link", async ({ page }, info) => {
  // O endereço fictício é único no cadastro: só um projeto (desktop) o cria por execução.
  test.skip(info.project.name !== "desktop", "endereço fictício único no cadastro");
  // Restos de execuções anteriores (a análise recusa endereço já cadastrado).
  await service().from("sources").delete().like("base_url", "https://vozdocoxipo.example%");
  await loginAs(page, "helena", "/estudio/control/fontes/nova");
  await page.getByLabel("Endereço da fonte").fill("https://vozdocoxipo.example/");
  await page.getByRole("button", { name: "Analisar" }).click();
  await expect(page.getByRole("status")).toContainText("encontrado RSS em /feed", SLOW);
  await expect(
    page.getByRole("list", { name: "Prévia dos últimos itens" }).getByRole("listitem"),
  ).toHaveCount(10);
  await expect(page.getByLabel("Política de imagem")).toHaveValue("none");
  await expect(page.getByLabel("Nome da fonte")).toHaveValue("Voz do Coxipó");
  await page.getByRole("button", { name: "Usar sugestão da IA para Editorias" }).click();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Li os termos de uso e a coleta é permitida").check();
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByRole("button", { name: "Salvar pausada" }).click();
  await expect(page).toHaveURL(/\/estudio\/control\/fontes\/[0-9a-f-]{36}$/, SLOW);
  await expect(page.getByText(/Pausada\s*·\s*Aguardando ativação/)).toBeVisible();
  const id = page.url().split("/").pop() as string;
  created.push(id);
});

test("robots que proíbe mostra host e caminho; o texto digitado é mantido", async ({ page }) => {
  await loginAs(page, "helena", "/estudio/control/fontes/nova");
  await page.getByLabel("Endereço da fonte").fill("https://proibido.example/noticias");
  await page.getByRole("button", { name: "Analisar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "proibido.example" })).toContainText(
    "/noticias",
    SLOW,
  );
  await expect(page.getByLabel("Endereço da fonte")).toHaveValue(
    "https://proibido.example/noticias",
  );
});

test("frequência: 25 e 45 não são oferecidas; 10 põe na via rápida", async ({ page }) => {
  const s = await makeSource("active", "Fonte Rápida");
  await loginAs(page, "helena", detail(s.id, "/configuracao"));
  const sel = page.getByLabel("Frequência de coleta");
  await expect(sel.locator('option[value="25"]')).toHaveCount(0);
  await expect(sel.locator('option[value="45"]')).toHaveCount(0);
  await sel.selectOption("10");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fonte salva." })).toBeVisible();
  await expect(page.getByText("Frequência efetiva: 10 min · via rápida.")).toBeVisible();
  await expect(page.getByText(/Próxima coleta prevista: \d{2}:\d{2}/)).toBeVisible();
});

test("fonte pausada vê as opções rápidas desabilitadas com o motivo", async ({ page }) => {
  const s = await makeSource("paused", "Fonte Pausada");
  await loginAs(page, "helena", detail(s.id, "/configuracao"));
  await expect(
    page.getByLabel("Frequência de coleta").locator('option[value="10"]'),
  ).toBeDisabled();
  await expect(page.getByText("Ative a fonte antes de colocá-la na via rápida.")).toBeVisible();
});

test("excluir exige digitar o nome e mantém a fonte arquivada", async ({ page }) => {
  const s = await makeSource("paused", "Fonte Excluir");
  await loginAs(page, "helena", detail(s.id));
  await page.getByRole("button", { name: "Excluir fonte" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Motivo da exclusão").fill("Duplicada de teste");
  const confirm = dlg.getByRole("button", { name: "Excluir fonte" });
  await expect(confirm).toBeDisabled();
  await dlg.getByLabel(`Digite ${s.name} para confirmar`).fill(s.name);
  await confirm.click();
  await expect(page.getByText("Fonte excluída (arquivada)")).toBeVisible();
  const row = await service().from("sources").select("archived_at").eq("id", s.id).single();
  expect(row.data?.archived_at).not.toBeNull();
});

test("mudança de política vira pedido e Marina aprova", async ({ page, browser }) => {
  const s = await makeSource("paused", "Fonte Política");
  await loginAs(page, "diego", detail(s.id, "/configuracao"));
  await page.getByLabel("Política de imagem").selectOption("reproduction");
  await page.getByLabel("Justificativa da alteração").fill("Acordo verbal com o veículo");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("1 alteração aguarda segunda aprovação")).toBeVisible();
  let row = await service().from("sources").select("image_policy").eq("id", s.id).single();
  expect(row.data?.image_policy).toBe("none");

  await page.goto(detail(s.id));
  await page.getByRole("button", { name: "Ver pedido" }).click();
  await expect(page.getByText("A aprovação precisa ser de outra pessoa")).toBeVisible();

  const ctx = await browser.newContext();
  const marina = await ctx.newPage();
  await loginAs(marina, "marina", detail(s.id));
  await marina.getByRole("button", { name: "Ver pedido" }).click();
  await expect(marina.getByRole("dialog")).toContainText("Acordo verbal com o veículo");
  await marina.getByRole("button", { name: "Aprovar e aplicar" }).click();
  await expect(marina.getByText("Aprovação registrada e mudança aplicada.")).toBeVisible(SLOW);
  row = await service().from("sources").select("image_policy").eq("id", s.id).single();
  expect(row.data?.image_policy).toBe("reproduction");
  await ctx.close();
});

test("conflito de versão mostra Recarregar", async ({ page, browser }) => {
  const s = await makeSource("paused", "Fonte Conflito");
  await loginAs(page, "helena", detail(s.id, "/configuracao"));
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await loginAs(other, "marina", detail(s.id, "/configuracao"));
  await other.getByLabel("Limite de requisições por hora").fill("30");
  await other.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(other.getByRole("status").filter({ hasText: "Fonte salva." })).toBeVisible();
  await ctx.close();
  await page.getByLabel("Limite de requisições por hora").fill("45");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "foi alterada por" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recarregar" })).toBeVisible();
  await expect(page.getByLabel("Limite de requisições por hora")).toHaveValue("45");
});

test("recomendação altera nome exibido e marcas com auditoria", async ({ page }) => {
  const s = await makeSource("paused", "Fonte Rec");
  await loginAs(page, "helena", detail(s.id, "/recomendacao"));
  await page.getByLabel("Nome exibido").fill("Rec Exibida");
  await page.getByLabel("Destacar como fonte local").check();
  await page.getByRole("button", { name: "Salvar recomendação" }).click();
  await expect(page.getByText("Recomendação salva.")).toBeVisible();
  const row = await service()
    .from("sources")
    .select("display_name, rec_local_highlight")
    .eq("id", s.id)
    .single();
  expect(row.data).toMatchObject({ display_name: "Rec Exibida", rec_local_highlight: true });
  await page.goto(detail(s.id, "/historico"));
  await expect(page.getByRole("table").getByText("Nome exibido").first()).toBeVisible();
});

test("Thiago (analista) não entra no detalhe da fonte", async ({ page }) => {
  const s = await makeSource("paused", "Fonte Analista");
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/entrar?next=%2Festudio");
  await page.getByLabel("E-mail", { exact: true }).fill("thiago.moraes@citynews.local");
  await page.getByLabel("Senha", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/estudio/);
  await page.goto(detail(s.id));
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
});

async function noHScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(over).toBe(false);
}
test("360 px: detalhe e nova fonte sem rolagem horizontal da página", async ({ page }) => {
  const s = await makeSource("paused", "Fonte 360");
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(page, "helena", detail(s.id));
  await noHScroll(page);
  for (const sub of ["/configuracao", "/coleta", "/recomendacao", "/historico", "/itens"]) {
    await page.goto(detail(s.id, sub));
    await noHScroll(page);
  }
  await page.goto("/estudio/control/fontes/nova");
  await noHScroll(page);
});

for (const width of [360, 768, 1280]) {
  test(`@a11y nova fonte e detalhe em ${width}px sem violação séria`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "larguras são definidas pelo teste");
    const s = await makeSource("paused", "Fonte Axe");
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, "helena", "/estudio/control/fontes/nova");
    const paths = ["/estudio/control/fontes/nova"].concat(
      ["", "/configuracao", "/coleta", "/recomendacao", "/historico", "/itens"].map((p) =>
        detail(s.id, p),
      ),
    );
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        r.violations
          .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
          .map((v) => `${path}: ${v.id}`),
      ).toEqual([]);
    }
  });
}
