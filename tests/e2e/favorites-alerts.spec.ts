import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipInvite } from "./invite";
import { forwardedFor } from "./own-ip";

/*
 * Favoritos (P17) e Alertas (P18), P2-T9: tudo sem conta, guardado neste navegador. O convite
 * de login (P2-T10) aparece uma vez por gatilho: aqui ele é recusado com "Agora não".
 */
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const TITLE = "Prefeitura detalha novo plano de ônibus entre CPA e Centro";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

async function saveArticle(page: Page) {
  await page.goto(ARTICLE);
  await ready(page);
  const save = page.getByRole("button", { name: "Salvar", exact: true });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Salvo neste aparelho.")).toBeVisible();
  await skipInvite(page);
}

test("salvos anônimos mostram aviso de aparelho e funcionam", async ({ page }) => {
  await saveArticle(page);
  await page.goto("/favoritos");
  await ready(page);
  await expect(page.getByText("Salvos só neste aparelho")).toBeVisible();
  const link = page.getByRole("link", { name: TITLE });
  await expect(link).toBeVisible();
  await expect(page.getByText(/Mobilidade · (não lido|lido)/)).toBeVisible();

  await page.getByRole("button", { name: `Remover dos salvos: ${TITLE}` }).click();
  await expect(link).toHaveCount(0);
  await expect(page.getByText("Nenhuma matéria salva")).toBeVisible();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("link", { name: TITLE })).toBeVisible();
});

test("salva fica disponível para leitura offline", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "service worker do Playwright no WebKit não é estável");
  await saveArticle(page);
  await page.goto("/favoritos");
  await ready(page);
  await expect
    .poll(
      () =>
        page.evaluate(async (path) => {
          const c = await caches.open("cn-salvos-v1");
          return Boolean(await c.match(path));
        }, ARTICLE),
      { timeout: 15_000 },
    )
    .toBe(true);
  // A emulação offline do Playwright não alcança o fetch do service worker; confere o que ele
  // guardou: a página da matéria (com o título) e a página "sem conexão".
  const cached = await page.evaluate(async (path) => {
    const c = await caches.open("cn-salvos-v1");
    const html = await (await c.match(path))?.text();
    return { html: html ?? "", offline: Boolean(await c.match("/offline.html")) };
  }, ARTICLE);
  expect(cached.html).toContain(TITLE);
  expect(cached.offline).toBe(true);
});

test("fontes e assuntos seguidos e coleções pessoais em Favoritos", async ({ page }) => {
  await page.goto("/fontes/mt-agora");
  await ready(page);
  await page.getByRole("button", { name: "Seguir MT Agora" }).click();
  await skipInvite(page);
  await page.goto("/fontes/placar-mt");
  await ready(page);
  await page.getByRole("button", { name: "Seguir Placar MT" }).click();
  await expect(page.getByRole("button", { name: "Seguir Placar MT" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/assunto/plano-de-onibus-cpa-centro");
  await ready(page);
  await page.getByRole("button", { name: /^Seguir assunto/ }).click();
  await expect(page.getByRole("button", { name: /^Seguir assunto/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await skipInvite(page);

  await page.goto("/favoritos");
  await ready(page);
  await page.getByRole("tab", { name: "Fontes seguidas" }).click();
  const names = () =>
    page
      .locator('[role="tabpanel"]:not([hidden]) li a')
      .evaluateAll((els) => els.map((e) => e.textContent));
  await expect.poll(names).toEqual(["Placar MT", "MT Agora"]);
  await page.getByRole("button", { name: "Subir MT Agora" }).click();
  await expect.poll(names).toEqual(["MT Agora", "Placar MT"]);
  await page.getByRole("button", { name: "Deixar de seguir Placar MT" }).click();
  await expect.poll(names).toEqual(["MT Agora"]);

  await page.getByRole("tab", { name: "Temas e assuntos" }).click();
  await expect(
    page.getByRole("link", { name: "Novo plano de ônibus entre CPA e Centro" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Coleções pessoais" }).click();
  await expect(page.getByText("Nenhuma coleção pessoal")).toBeVisible();
  await page.getByLabel("Nome da nova coleção").fill("Para o fim de semana");
  await page.getByRole("button", { name: "Criar coleção" }).click();
  await skipInvite(page);
  await page.getByRole("button", { name: "Renomear Para o fim de semana" }).click();
  await page.getByLabel("Novo nome para Para o fim de semana").fill("Sábado");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("Sábado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apagar coleção Sábado" }).click();
  await expect(page.getByText("Nenhuma coleção pessoal")).toBeVisible();
});

test("alerta de navegador sem conta; permissão negada explica", async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto("/alertas");
  await ready(page);
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(
    page.getByText(/Seu navegador bloqueou as notificações|Este navegador não mostra notificações/),
  ).toBeVisible();
  await expect(page.getByText("Nenhum alerta ainda")).toBeVisible();
});

test("alerta de navegador com permissão fica ativo neste aparelho", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  test.skip(browserName === "webkit", "WebKit do Playwright não concede notificações");
  await context.grantPermissions(["notifications"], { origin: baseURL! });
  await page.goto("/alertas");
  await ready(page);
  await page.getByLabel("Alvo").selectOption("cpa");
  await page.getByLabel("Resumo diário").check();
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Alerta criado. Você recebe/)).toBeVisible();
  await expect(page.getByText("Bairro: CPA")).toBeVisible();
  await expect(page.getByText(/Resumo diário · Navegador · Ativo/)).toBeVisible();
  await skipInvite(page);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Bairro: CPA")).toBeVisible();
  await page.getByRole("button", { name: "Remover alerta CPA" }).click();
  await expect(page.getByText("Nenhum alerta ainda")).toBeVisible();
});

test("alerta por e-mail fica pendente até a confirmação", async ({ page }) => {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/alertas");
  await ready(page);
  await page.getByLabel("Tipo").selectOption("urgentes");
  await page.getByLabel("E-mail", { exact: true }).check();
  await page.getByRole("textbox", { name: "E-mail" }).fill("nao-e-email");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Confira o e-mail digitado/)).toBeVisible();
  await page.getByRole("textbox", { name: "E-mail" }).fill(`alerta-${Date.now()}@exemplo.com`);
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Enviamos um link de confirmação/)).toBeVisible();
  await skipInvite(page);
  await expect(page.getByText(/E-mail não confirmado: enviamos um link para/)).toBeVisible();
  await page.goto("/alertas/confirmar?token=lixo");
  await expect(page.getByRole("heading", { name: "Este link não é válido" })).toBeVisible();
});

for (const path of ["/favoritos", "/alertas"]) {
  test(`${path} sem violações graves de acessibilidade @a11y`, async ({ page }) => {
    await page.goto(path);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
  });
}
