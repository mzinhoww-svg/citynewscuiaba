import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { skipInvite } from "./invite";
import { openFilters } from "./helpers/filters";

/*
 * Fontes em destaque (P14, spec §7.5, docs/testing.md §2 item 3, P2-T7): 7 listas, seguir sem
 * login, ocultar com motivo e desfazer, personalização desligada mostra o estado sem histórico.
 */
const TABS = [
  "Mais acessadas",
  "Em alta nesta semana",
  "Recomendadas para você",
  "Fontes que você segue",
  "Fontes locais",
  "Fontes verificadas",
  "Novas para descobrir",
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function withConsent(context: BrowserContext, baseURL: string, value: string) {
  await context.addCookies([{ name: "cn_consent", value, url: baseURL }]);
}

/** Abre /fontes e espera o perfil local ser aplicado (hidratação, WebKit móvel incluso). */
async function open(page: Page, path = "/fontes") {
  await page.goto(path);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
}

const panel = (page: Page) => page.locator('[role="tabpanel"]:not([hidden])');
const personalizationSwitch = (page: Page) =>
  page.getByRole("switch", { name: "Recomendações personalizadas" });

test("7 abas e aviso de que popularidade não é qualidade", async ({ page, context, baseURL }) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes em destaque" })).toBeVisible();
  for (const t of TABS) await expect(page.getByRole("tab", { name: t })).toBeVisible();
  await expect(page.getByText("Popularidade não é selo de qualidade")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mais acessadas em Cuiabá" })).toBeVisible();
});

test("cada card tem justificativa e nenhuma fonte passa de 25% da lista", async ({
  page,
  context,
  baseURL,
}) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page);
  for (const t of TABS.filter((x) => x !== "Fontes que você segue")) {
    await page.getByRole("tab", { name: t }).click();
    await expect(page.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "true");
    const items = panel(page).locator("[data-slug]");
    await expect(items.first()).toBeVisible();
    const n = await items.count();
    const slugs: string[] = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      await expect(item.getByText(/^Por que aparece aqui:/)).toHaveCount(1);
      slugs.push((await item.getAttribute("data-slug")) ?? "");
    }
    // Lista de fontes: cada fonte no máximo 1 vez (teto por fonte).
    expect(new Set(slugs).size, t).toBe(slugs.length);
  }
  // Lista de itens (Mais acessadas): no máximo 2 de 8 por fonte (25%).
  await page.getByRole("tab", { name: "Mais acessadas" }).click();
  const itemSources = await panel(page)
    .locator("[data-item-source]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-item-source")));
  expect(itemSources.length).toBeGreaterThan(0);
  expect(itemSources.length).toBeLessThanOrEqual(8);
  for (const s of new Set(itemSources))
    expect(itemSources.filter((x) => x === s).length).toBeLessThanOrEqual(2);
  await expect(panel(page).getByText("Nenhuma fonte ocupa mais de 25% desta lista.")).toBeVisible();
});

test("personalização desligada: Recomendadas mostra populares da região e o estado sem histórico", async ({
  page,
  context,
  baseURL,
}) => {
  await withConsent(context, baseURL!, "v1|m1|p1");
  await open(page);
  await expect(personalizationSwitch(page)).toHaveAttribute("aria-checked", "true");
  await personalizationSwitch(page).click();
  await expect(personalizationSwitch(page)).toHaveAttribute("aria-checked", "false");
  await page.getByRole("tab", { name: "Recomendadas para você" }).click();
  await expect(page).toHaveURL(/aba=recomendadas/);
  await expect(panel(page).getByText("Ainda sem histórico seu")).toBeVisible();
  await expect(panel(page).getByText("Popular entre leitores da sua região").first()).toBeVisible();
  await expect(
    panel(page).getByRole("heading", { name: "Fontes locais para começar" }),
  ).toBeVisible();
  expect(await panel(page).locator("[data-slug]").count()).toBeGreaterThan(3);
});

test("seguir sem login aparece em Fontes que você segue e continua depois de recarregar", async ({
  page,
  context,
  baseURL,
}) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page);
  await page.getByRole("tab", { name: "Fontes que você segue" }).click();
  await expect(panel(page).getByText("Você ainda não segue nenhuma fonte")).toBeVisible();
  await page.getByRole("tab", { name: "Mais acessadas" }).click();
  const follow = panel(page).getByRole("button", { name: "Seguir MT Agora" });
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await skipInvite(page);
  await page.getByRole("tab", { name: "Fontes que você segue" }).click();
  await expect(panel(page).getByRole("link", { name: "MT Agora" })).toBeVisible();
  await expect(panel(page).getByText("Veículo seguido por você")).toBeVisible();

  await open(page, "/fontes?aba=seguidas");
  await expect(page.getByRole("tab", { name: "Fontes que você segue" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel(page).getByRole("link", { name: "MT Agora" })).toBeVisible();
});

test("ocultar com motivo e desfazer", async ({ page, context, baseURL }) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page, "/fontes?aba=locais");
  const card = panel(page).locator('[data-slug="diario-da-baixada"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Ocultar Diário da Baixada" }).click();
  await page.getByRole("menuitem", { name: "Já conheço esta fonte" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Diário da Baixada não aparece mais nas suas listas.")).toBeVisible();
  await expect(page.getByText("1 fonte ocultada")).toBeVisible();

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(card).toBeVisible();
  await expect(page.getByText("1 fonte ocultada")).toHaveCount(0);

  // Ocultar de novo e reabrir: a escolha fica no navegador; "Mostrar de novo" desfaz depois.
  await card.getByRole("button", { name: "Ocultar Diário da Baixada" }).click();
  await page.getByRole("menuitem", { name: "Não tenho interesse" }).click();
  await expect(card).toHaveCount(0);
  await open(page, "/fontes?aba=locais");
  await expect(panel(page).locator('[data-slug="diario-da-baixada"]')).toHaveCount(0);
  await page.getByText("1 fonte ocultada").click();
  await page.getByRole("button", { name: "Mostrar Diário da Baixada de novo" }).click();
  await expect(panel(page).locator('[data-slug="diario-da-baixada"]')).toBeVisible();
});

test("ocultar com 'Não quero recomendações personalizadas' desliga a personalização", async ({
  page,
  context,
  baseURL,
}) => {
  await withConsent(context, baseURL!, "v1|m1|p1");
  const events: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/events")) events.push(r.postData() ?? "");
  });
  await open(page, "/fontes?aba=recomendadas");
  await expect(personalizationSwitch(page)).toHaveAttribute("aria-checked", "true");
  await panel(page)
    .getByRole("button", { name: /^Ocultar / })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Não quero recomendações personalizadas" }).click();
  await expect(personalizationSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Recomendações personalizadas desligadas.")).toBeVisible();
  await expect(panel(page).getByText("Ainda sem histórico seu")).toBeVisible();
  await expect
    .poll(() => events.some((e) => e.includes("personalization_disabled") && e.includes("dismiss")))
    .toBe(true);
  expect((await context.cookies()).find((c) => c.name === "cn_consent")?.value).toBe("v1|m1|p0");
});

test("filtros por tema e região na URL", async ({ page, context, baseURL }) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page);
  await openFilters(page);
  const filters = page.getByRole("navigation", { name: "Filtrar fontes" });
  await filters.getByRole("link", { name: "Cultura", exact: true }).click();
  await expect(page).toHaveURL(/tema=cultura/);
  await expect
    .poll(() =>
      panel(page)
        .locator("[data-slug]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-slug"))),
    )
    .toEqual(["cena-cuiabana"]);
  await openFilters(page);
  await filters.getByRole("link", { name: "Mato Grosso", exact: true }).click();
  await expect(page).toHaveURL(/regiao=mt/);
  await expect(panel(page).getByText("Nenhuma fonte nesta lista com esses filtros")).toBeVisible();
  // A-133: o Limpar fica no cabeçalho do painel, à vista mesmo recolhido.
  await page.getByRole("link", { name: "Limpar filtros" }).first().click();
  await expect(page).not.toHaveURL(/tema=/);
});

test("Fontes sem violações graves de acessibilidade @a11y", async ({ page, context, baseURL }) => {
  await withConsent(context, baseURL!, "v1|m0|p0");
  await open(page, "/fontes?aba=recomendadas");
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
});
