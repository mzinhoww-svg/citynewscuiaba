import AxeBuilder from "@axe-core/playwright";
import { loadEnvConfig } from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { skipInvite } from "./invite";
import { forwardedFor } from "./own-ip";

/*
 * Favoritos (P17) e Alertas (P18), P2-T9: tudo sem conta, guardado neste navegador. O convite
 * de login (P2-T10) aparece uma vez por gatilho: aqui ele é recusado com "Agora não".
 */
loadEnvConfig(process.cwd());
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
  const email = `alerta-${Date.now()}@exemplo.com`;
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/alertas");
  await ready(page);
  await page.getByLabel("Tipo").selectOption("urgentes");
  await page.getByLabel("E-mail", { exact: true }).check();
  await page.getByRole("textbox", { name: "E-mail" }).fill("nao-e-email");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Confira o e-mail digitado/)).toBeVisible();
  // UI-T14: o erro fica no campo, com ícone e exemplo, ligado por aria-describedby.
  const field = page.getByRole("textbox", { name: "E-mail" });
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(/Exemplo: ana@exemplo.com/);
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.getByText(/Enviamos um link de confirmação/)).toBeVisible();
  await skipInvite(page);
  await expect(page.getByText(/E-mail não confirmado: enviamos um link para/)).toBeVisible();
  await page.goto("/alertas/confirmar?token=lixo");
  await expect(page.getByRole("heading", { name: "Este link não é válido" })).toBeVisible();

  // O link da fila (B-005) só confirma com o toque no botão (gate P2, I6).
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: mail } = await db
    .from("reader_emails")
    .select("body")
    .eq("to_email", email)
    .eq("kind", "alert_confirm")
    .single();
  expect(mail?.body).toContain('"Urgentes: Todas as notícias urgentes"');
  const link = /https?:\/\/\S+/.exec(mail?.body ?? "")?.[0] ?? "";
  const path = new URL(link).pathname + new URL(link).search;
  const active = async () =>
    (await db.from("alerts").select("active").eq("owner_ref", `email:${email}`).single()).data
      ?.active;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Confirme seu alerta" })).toBeVisible();
  expect(await active()).toBe(false);
  await page.getByRole("button", { name: "Confirmar alerta" }).click();
  await expect(page.getByRole("heading", { name: "Alerta por e-mail confirmado" })).toBeVisible();
  expect(await active()).toBe(true);
  await db.from("alerts").delete().eq("owner_ref", `email:${email}`);
  await db.from("reader_emails").delete().eq("to_email", email);
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

/*
 * UI-T14: Perfil, Favoritos e Alertas no grid do portal (8 + 4 colunas) e com o convite de conta
 * que explica os benefícios e sempre oferece "Agora não" (login nunca é obrigatório).
 */
for (const path of ["/perfil", "/favoritos", "/alertas"]) {
  test(`${path}: convite de conta com benefícios e Agora não`, async ({ page }) => {
    await page.goto(path);
    const invite = page.getByRole("region", { name: "Por que criar uma conta" });
    await expect(invite).toBeVisible();
    await expect(
      invite.getByRole("list", { name: "O que a conta guarda para você" }).getByRole("listitem"),
    ).toHaveCount(3);
    const h1 = page.locator("main h1");
    expect(
      await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeLessThanOrEqual(28);
    const notNow = invite.getByRole("button", { name: "Agora não" });
    expect((await notNow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // O convite vem no HTML do servidor; o toque só vale depois da hidratação (no WebKit, mais
    // lenta), então toca de novo até o convite recolher.
    await expect(async () => {
      if (await notNow.isVisible()) await notNow.click();
      await expect(invite).toBeHidden({ timeout: 1000 });
    }).toPass();
    await expect(page.getByText("Tudo bem: você continua sem conta.")).toBeFocused();
    await page.reload();
    await expect(page.getByRole("region", { name: "Por que criar uma conta" })).toHaveCount(0);
  });
}

test("coleção sem nome mostra erro com exemplo no campo", async ({ page }) => {
  await page.goto("/favoritos");
  await ready(page);
  await page.getByRole("tab", { name: "Coleções pessoais" }).click();
  await page.getByRole("button", { name: "Criar coleção" }).click();
  const field = page.getByLabel("Nome da nova coleção");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(/Exemplo: Para ler no fim de semana/);
});
