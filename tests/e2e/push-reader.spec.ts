import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./helpers/pipeline";

/*
 * Avisos do leitor (spec 2026-09-28 §7.4 C09, §7.5 P18; critérios 9, 10; PW-T10). Chromium com
 * a permissão concedida pelo contexto e `PushManager.prototype.subscribe` trocado por um
 * `addInitScript` que devolve um endpoint do servidor de push falso (PUSH_ENDPOINT_TEST_HOSTS).
 */
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PREPROMPT =
  "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências.";
const fakePushPort = Number(process.env.CN_FAKE_PUSH_PORT);

/** Prefixo de endpoint deste teste: o afterEach de um worker não apaga a inscrição de outro. */
function endpointPrefix() {
  return `http://127.0.0.1:${fakePushPort}/e2e/${test.info().testId}/`;
}

/** Inscrição falsa no navegador: endpoint no servidor de push falso, chaves no formato certo. */
function stubPushManager(page: Page, suffix: string) {
  return page.addInitScript(
    ({ endpoint }) => {
      const b64 = (n: number) => {
        const bytes = new Uint8Array(n);
        crypto.getRandomValues(bytes);
        return btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      };
      // O script roda de novo a cada navegação: inscrição e permissão ficam na sessionStorage.
      const SUB = "__cnStubSub";
      const PERM = "__cnStubPerm";
      const stored = sessionStorage.getItem(SUB);
      const keys = stored
        ? (JSON.parse(stored) as { p256dh: string; auth: string })
        : { p256dh: b64(65), auth: b64(16) };
      const make = () =>
        ({
          endpoint,
          options: { userVisibleOnly: true, applicationServerKey: null },
          expirationTime: null,
          getKey: () => null,
          toJSON: () => ({ endpoint, keys }),
          unsubscribe: async () => {
            current = null;
            sessionStorage.removeItem(SUB);
            return true;
          },
        }) as unknown as PushSubscription;
      let current: PushSubscription | null = stored ? make() : null;
      PushManager.prototype.subscribe = async function () {
        current ??= make();
        sessionStorage.setItem(SUB, JSON.stringify(keys));
        return current;
      };
      PushManager.prototype.getSubscription = async function () {
        return current;
      };
      // O contexto já concedeu a permissão; para o leitor ela só fica "granted" depois do pedido
      // nativo (que o pré-prompt dispara em "Ativar"), como num navegador de verdade.
      (window as unknown as { __cnPermissionCalls: number }).__cnPermissionCalls = 0;
      let permission = (sessionStorage.getItem(PERM) ?? "default") as NotificationPermission;
      Object.defineProperty(Notification, "permission", {
        get: () => permission,
        configurable: true,
      });
      const orig = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (async () => {
        (window as unknown as { __cnPermissionCalls: number }).__cnPermissionCalls++;
        permission = await orig();
        sessionStorage.setItem(PERM, permission);
        return permission;
      }) as typeof Notification.requestPermission;
    },
    { endpoint: `${endpointPrefix()}${suffix}-${Date.now()}` },
  );
}

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

test.skip(
  ({ browserName }) => browserName === "webkit",
  "push no WebKit do Playwright não é estável",
);
// O headless shell do Chromium responde "denied" a Notification.permission mesmo com grantPermissions;
// o Chromium completo em modo headless respeita a permissão do contexto (G16).
test.use({ channel: "chromium" });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p0", url: baseURL! }]);
  // Estado do app: segunda visita já feita (a faixa de instalação não disputa a vaga) e convite
  // de login já mostrado nesta semana para "seguir" (um convite por vez: login vem antes e adiaria
  // o pré-prompt para a próxima navegação; spec §7.1).
  await context.addInitScript(() => {
    if (!localStorage.getItem("cn_invites"))
      localStorage.setItem(
        "cn_invites",
        JSON.stringify([{ trigger: "follow", at: new Date().toISOString() }]),
      );
    if (!localStorage.getItem("cn_app"))
      localStorage.setItem(
        "cn_app",
        JSON.stringify({
          visits: 1,
          reads: 0,
          install: { refusals: 3, silencedUntil: null, installed: false },
          notif: { refusals: 0, silencedUntil: null },
          lastVisitDay: null,
          lastVisitAt: null,
        }),
      );
  });
});

test.afterEach(async () => {
  const db = serviceClient();
  await db.from("push_subscriptions").delete().like("endpoint", `${endpointPrefix()}%`);
  // Limite por IP (10 inscrições/hora): rodadas locais seguidas não devem esbarrar nele.
  await db.from("rate_limits").delete().like("bucket", "push-%");
});

test("seguir fonte mostra o pré-prompt; Ativar cria a inscrição; Alertas mostra ativo com o que você segue", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await stubPushManager(page, "follow");
  await page.goto("/fontes/mt-agora");
  await ready(page);
  await expect(page.getByRole("region", { name: "Quer receber avisos?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Seguir MT Agora" }).click();
  const invite = page.getByRole("region", { name: "Quer receber avisos?" });
  await expect(invite).toBeVisible();
  await expect(invite).toContainText(PREPROMPT);
  await invite.getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Avisos ativados" })).toBeVisible();
  const { data } = await serviceClient()
    .from("push_subscriptions")
    .select("targets, browser, device_class, installed, metrics_consent")
    .like("endpoint", `${endpointPrefix()}follow%`);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({
    targets: ["source:mt-agora"],
    browser: "chrome",
    installed: false,
    metrics_consent: true,
  });

  await page.goto("/alertas");
  const block = page.getByRole("region", { name: "Avisos no celular e no computador" });
  await expect(block).toBeVisible();
  await expect(block.getByRole("switch", { name: "Do que você segue" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(block.getByRole("list", { name: "O que você segue" })).toContainText(
    "Fonte: mt-agora",
  );
  // Silêncio só aumenta; limite 1–3.
  await expect(block.getByLabel("Início").locator("option")).toHaveText([
    "18h",
    "19h",
    "20h",
    "21h",
    "22h",
  ]);
  await block.getByLabel("Máximo por dia").selectOption("2");
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("push_subscriptions")
            .select("daily_limit")
            .like("endpoint", `${endpointPrefix()}follow%`)
        ).data?.[0]?.daily_limit,
    )
    .toBe(2);
  await block.getByRole("switch", { name: "Destaques da redação" }).click();
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("push_subscriptions")
            .select("want_highlight")
            .like("endpoint", `${endpointPrefix()}follow%`)
        ).data?.[0]?.want_highlight,
    )
    .toBe(false);
});

test("Agora não não chama requestPermission (espião no addInitScript) e silencia", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await stubPushManager(page, "notnow");
  await page.goto("/fontes/mt-agora");
  await ready(page);
  await page.getByRole("button", { name: "Seguir MT Agora" }).click();
  const invite = page.getByRole("region", { name: "Quer receber avisos?" });
  await expect(invite).toBeVisible();
  await invite.getByRole("button", { name: "Agora não" }).click();
  await expect(invite).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __cnPermissionCalls: number }).__cnPermissionCalls,
    ),
  ).toBe(0);
  const app = await page.evaluate(() => JSON.parse(localStorage.getItem("cn_app")!));
  expect(app.notif.refusals).toBe(1);
  // Seguir outra fonte na mesma janela de 14 dias: sem pré-prompt.
  await page.goto("/fontes/placar-mt");
  await ready(page);
  await page.getByRole("button", { name: "Seguir Placar MT" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("region", { name: "Quer receber avisos?" })).toHaveCount(0);
});

test.describe("iPhone fora do app", () => {
  test.use({
    userAgent: IOS_UA,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("nenhum pré-prompt; Alertas explica a Tela de Início", async ({ page }) => {
    await page.goto("/fontes/mt-agora");
    await ready(page);
    await page.getByRole("button", { name: "Seguir MT Agora" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByRole("region", { name: "Quer receber avisos?" })).toHaveCount(0);
    await page.goto("/alertas");
    const block = page.getByRole("region", { name: "Avisos no celular e no computador" });
    await expect(block).toContainText(
      "No iPhone, os avisos funcionam com o CityNews na Tela de Início.",
    );
    await block.getByRole("button", { name: "Como adicionar" }).click();
    await expect(
      page.getByRole("dialog", { name: "Adicionar o CityNews à Tela de Início" }),
    ).toBeVisible();
  });
});

test("Desativar avisos apaga a inscrição no servidor", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await stubPushManager(page, "disable");
  await page.goto("/alertas");
  const block = page.getByRole("region", { name: "Avisos no celular e no computador" });
  await block.getByRole("button", { name: "Ativar avisos" }).click();
  await expect(block.getByRole("button", { name: "Desativar avisos" })).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("push_subscriptions")
            .select("id")
            .like("endpoint", `${endpointPrefix()}disable%`)
        ).data?.length,
    )
    .toBe(1);
  await block.getByRole("button", { name: "Desativar avisos" }).click();
  await expect(block.getByRole("button", { name: "Ativar avisos" })).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("push_subscriptions")
            .select("id")
            .like("endpoint", `${endpointPrefix()}disable%`)
        ).data?.length,
    )
    .toBe(0);
});

test("permissão negada: Alertas mostra as instruções do navegador", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await page.goto("/alertas");
  const block = page.getByRole("region", { name: "Avisos no celular e no computador" });
  await expect(block).toContainText("Os avisos estão bloqueados neste navegador.");
  await expect(block).toContainText(/cadeado ao lado do endereço/);
  await expect(block.getByRole("button", { name: "Já reativei" })).toBeVisible();
});
