import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../e2e/helpers/pipeline";
import { stubPushManager, fakePushBase } from "../e2e/helpers/push";
import { loginAs } from "../e2e/helpers/studio-login";

/*
 * PWA e notificações (spec 2026-09-28 §16, critério 26; PW-T15): 0 violações serious/critical
 * (WCAG 2.0/2.1/2.2 A e AA) em /app, /offline.html, Alertas em todos os estados, convites C07,
 * C08 e C09 abertos e as seis rotas de A09 em 390, 768 e 1280 px.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// Um envio `follow` por matéria (índice único): cada worker do Playwright usa a sua.
const ART_AXE = [
  "c2000000-0000-4000-8000-000000000006",
  "c2000000-0000-4000-8000-000000000007",
  "c2000000-0000-4000-8000-000000000009",
  "c2000000-0000-4000-8000-000000000010",
  "c2000000-0000-4000-8000-000000000011",
  "c2000000-0000-4000-8000-000000000012",
];
const axeArticle = () => ART_AXE[test.info().parallelIndex % ART_AXE.length]!;
const A09 = "/estudio/admin/notificacoes";

test.skip(({ browserName }) => browserName === "webkit", "convites e push só no Chromium");
test.use({ channel: "chromium" });

async function expectNoSerious(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

const appState = (over: Record<string, unknown> = {}) => ({
  visits: 1,
  reads: 0,
  install: { refusals: 3, silencedUntil: null, installed: false },
  notif: { refusals: 0, silencedUntil: null },
  lastVisitDay: null,
  lastVisitAt: null,
  ...over,
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

let SEND = "";
// Inscrições falsas deste worker (a limpeza não pode apagar as de outro worker em andamento).
const endpoints: string[] = [];
const axeEndpoint = (name: string) => {
  const e = `${fakePushBase()}/axe/${name}-${Date.now()}`;
  endpoints.push(e);
  return e;
};
test.beforeAll(async () => {
  const db = serviceClient();
  // Um `follow` por matéria: limpa o que uma rodada interrompida tenha deixado.
  await db.from("push_sends").delete().eq("article_id", axeArticle()).eq("kind", "follow");
  const { data, error } = await db
    .from("push_sends")
    .insert({
      kind: "follow",
      article_id: axeArticle(),
      title: "Chuva forte (axe)",
      body: "Defesa Civil alerta",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/x",
      tag: `axe${Date.now()}`,
      audience: { type: "targets" },
      status: "sent",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  SEND = data.id;
});
test.afterAll(async () => {
  if (SEND) await serviceClient().from("push_sends").delete().eq("id", SEND);
  if (endpoints.length)
    await serviceClient().from("push_subscriptions").delete().in("endpoint", endpoints);
});

for (const width of [390, 1280]) {
  test.describe(`público em ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const path of ["/app", "/offline.html", "/alertas"]) {
      test(`@a11y ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoSerious(page);
      });
    }

    test("@a11y convites C07, C08 e C09 abertos", async ({ page, context, baseURL }) => {
      // C07: faixa de instalação (2ª visita, beforeinstallprompt sintético).
      await page.addInitScript(
        (s) => localStorage.setItem("cn_app", JSON.stringify(s)),
        appState({ visits: 1, install: { refusals: 0, silencedUntil: null, installed: false } }),
      );
      await page.addInitScript(() => {
        const fire = () => {
          const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
            prompt?: () => Promise<void>;
            userChoice?: Promise<unknown>;
          };
          ev.prompt = () => Promise.resolve();
          ev.userChoice = Promise.resolve({ outcome: "dismissed" });
          window.dispatchEvent(ev);
        };
        window.addEventListener("load", () => {
          setTimeout(fire, 500);
          setTimeout(fire, 2000);
        });
      });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Instalar o app" })).toBeVisible({
        timeout: 10_000,
      });
      await expectNoSerious(page);
      // C09: pré-prompt depois de seguir (permissão ainda não decidida).
      await context.grantPermissions(["notifications"], { origin: baseURL! });
      await context.addInitScript(() => {
        localStorage.setItem(
          "cn_invites",
          JSON.stringify([{ trigger: "follow", at: new Date().toISOString() }]),
        );
      });
      await stubPushManager(page, axeEndpoint(`${width}`));
      await page.goto("/fontes/mt-agora");
      await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
      await page.getByRole("button", { name: "Seguir MT Agora" }).click();
      await expect(page.getByRole("region", { name: "Quer receber avisos?" })).toBeVisible();
      await expectNoSerious(page);
    });

    test("@a11y C08 passos do iPhone abertos", async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({
        baseURL,
        userAgent: IOS_UA,
        viewport: { width, height: 900 },
      });
      await ctx.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
      const page = await ctx.newPage();
      await page.goto("/alertas");
      await page.getByRole("button", { name: "Como adicionar" }).click();
      await expect(
        page.getByRole("dialog", { name: "Adicionar o CityNews à Tela de Início" }),
      ).toBeVisible();
      await expectNoSerious(page);
      await ctx.close();
    });

    test("@a11y Alertas em todos os estados", async ({ page, context, baseURL, browser }) => {
      const block = () => page.getByRole("region", { name: "Avisos no celular e no computador" });
      // Desligado (permissão pendente).
      await context.grantPermissions(["notifications"], { origin: baseURL! });
      await stubPushManager(page, axeEndpoint(`${width}-alertas`));
      await page.goto("/alertas");
      await expect(block().getByRole("button", { name: "Ativar avisos" })).toBeVisible();
      await expectNoSerious(page);
      // Ativo.
      await block().getByRole("button", { name: "Ativar avisos" }).click();
      await expect(block().getByRole("button", { name: "Desativar avisos" })).toBeVisible();
      await expectNoSerious(page);
      // Negado.
      const denied = await browser.newContext({ baseURL, viewport: { width, height: 900 } });
      await denied.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
      const d = await denied.newPage();
      await d.addInitScript(() => {
        Object.defineProperty(Notification, "permission", { get: () => "denied" });
      });
      await d.goto("/alertas");
      await expect(d.getByText("Os avisos estão bloqueados neste navegador.")).toBeVisible();
      await expectNoSerious(d);
      await denied.close();
      // Sem suporte.
      const unsupported = await browser.newContext({ baseURL, viewport: { width, height: 900 } });
      await unsupported.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
      const u = await unsupported.newPage();
      await u.addInitScript(() => {
        delete (window as unknown as { PushManager?: unknown }).PushManager;
      });
      await u.goto("/alertas");
      await expect(
        u.getByText("Avisos pelo celular ainda não estão disponíveis neste navegador."),
      ).toBeVisible();
      await expectNoSerious(u);
      await unsupported.close();
      // iPhone fora do app.
      const ios = await browser.newContext({
        baseURL,
        userAgent: IOS_UA,
        viewport: { width, height: 900 },
      });
      await ios.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
      const i = await ios.newPage();
      await i.goto("/alertas");
      await expect(
        i.getByText("No iPhone, os avisos funcionam com o CityNews na Tela de Início."),
      ).toBeVisible();
      await expectNoSerious(i);
      await ios.close();
    });
  });
}

for (const width of [390, 768, 1280]) {
  test.describe(`A09 em ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    const routes = () => [
      A09,
      `${A09}/fila`,
      `${A09}/historico`,
      `${A09}/historico/${SEND}`,
      `${A09}/configuracoes`,
      `${A09}/funil`,
    ];
    for (const idx of [0, 1, 2, 3, 4, 5]) {
      test(`@a11y rota ${idx + 1} de A09`, async ({ page, context }) => {
        await loginAs(context, "helena");
        await page.goto(routes()[idx]!);
        await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
        await expectNoSerious(page);
      });
    }
  });
}
