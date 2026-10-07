import { expect, test, type Page } from "@playwright/test";
import { nextFrames } from "./helpers/wait";

/*
 * Convite de instalação C07/C08 e página /app (spec 2026-09-28 §7.2, §7.3, §7.9; critérios 7,
 * 8; PW-T8). O `beforeinstallprompt` é sintético (Chromium só o dispara com manifesto válido
 * em HTTPS): um `addInitScript` o despacha com `prompt()`/`userChoice` falsos.
 */
const REGION = "Instalar o app";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const fakeBeforeInstallPrompt = `(() => {
  const fire = () => {
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: window.__cnInstallChoice || "dismissed" });
    window.dispatchEvent(ev);
    window.__cnBipFired = (window.__cnBipFired || 0) + 1;
  };
  window.addEventListener("load", () => { setTimeout(fire, 800); setTimeout(fire, 2500); });
})();`;

const standaloneMedia = `(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q === "(display-mode: standalone)" ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : orig(q));
})();`;

type AppState = {
  visits: number;
  reads: number;
  install: { refusals: number; silencedUntil: string | null; installed: boolean };
  notif: { refusals: number; silencedUntil: string | null };
  lastVisitDay: string | null;
  lastVisitAt: string | null;
};

async function seedState(page: Page, patch: Partial<AppState>) {
  const yesterday = new Date(Date.now() - 86_400_000);
  const base: AppState = {
    visits: 1,
    reads: 0,
    install: { refusals: 0, silencedUntil: null, installed: false },
    notif: { refusals: 0, silencedUntil: null },
    lastVisitDay: yesterday.toISOString().slice(0, 10),
    lastVisitAt: yesterday.toISOString(),
    ...patch,
  };
  await page.addInitScript((s) => {
    if (!localStorage.getItem("cn_app")) localStorage.setItem("cn_app", JSON.stringify(s));
  }, base);
}

/**
 * Espera os dois `beforeinstallprompt` sintéticos terem disparado (a faixa decide na hora) e a
 * página assentar: só então "a faixa não apareceu" é uma resposta, não pressa.
 */
async function afterInstallPrompts(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __cnBipFired?: number }).__cnBipFired === 2,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForLoadState("networkidle");
  await nextFrames(page);
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("cn_app") ?? "{}"));
}

async function patchState(page: Page, fn: string) {
  await page.evaluate((body) => {
    const s = JSON.parse(localStorage.getItem("cn_app") ?? "{}");
    new Function("s", body)(s);
    localStorage.setItem("cn_app", JSON.stringify(s));
  }, fn);
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p0", url: baseURL! }]);
});

test("faixa na 2ª visita com beforeinstallprompt sintético; Agora não some 14 dias; 3 recusas nunca mais", async ({
  page,
}) => {
  await page.addInitScript(fakeBeforeInstallPrompt);
  // 1ª visita: nada.
  await page.goto("/");
  await afterInstallPrompts(page);
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
  expect((await readState(page)).visits).toBe(1);
  // 2ª visita (aba nova, outro dia).
  await patchState(page, "s.lastVisitDay = '2026-01-01'; s.lastVisitAt = '2026-01-01T10:00:00Z';");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("region", { name: REGION })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: REGION })).toContainText(
    "Leia o CityNews como app: abre mais rápido e funciona sem internet.",
  );
  await page
    .getByRole("region", { name: REGION })
    .getByRole("button", { name: "Agora não" })
    .click();
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
  const after = await readState(page);
  expect(after.install.refusals).toBe(1);
  expect(Date.parse(after.install.silencedUntil!)).toBeGreaterThan(Date.now() + 13 * 86_400_000);
  // 13 dias depois: ainda silenciado.
  await page.goto("/cidade");
  await afterInstallPrompts(page);
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
  // 15 dias depois: volta.
  await patchState(
    page,
    "s.install.silencedUntil = new Date(Date.now() - 86400000).toISOString();",
  );
  await page.goto("/");
  await expect(page.getByRole("region", { name: REGION })).toBeVisible({ timeout: 10_000 });
  // Mais duas recusas: nunca mais; "Baixar o app" continua no rodapé.
  await page
    .getByRole("region", { name: REGION })
    .getByRole("button", { name: "Agora não" })
    .click();
  await patchState(
    page,
    "s.install.silencedUntil = new Date(Date.now() - 86400000).toISOString();",
  );
  await page.goto("/");
  await expect(page.getByRole("region", { name: REGION })).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole("region", { name: REGION })
    .getByRole("button", { name: "Agora não" })
    .click();
  expect((await readState(page)).install.refusals).toBe(3);
  await patchState(
    page,
    "s.install.silencedUntil = new Date(Date.now() - 86400000).toISOString();",
  );
  await page.goto("/");
  await afterInstallPrompts(page);
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Baixar o app" }),
  ).toHaveAttribute("href", "/app");
});

test("oculta com display-mode standalone emulado", async ({ page }) => {
  await page.addInitScript(fakeBeforeInstallPrompt);
  await page.addInitScript(standaloneMedia);
  await seedState(page, { visits: 5 });
  await page.goto("/");
  await afterInstallPrompts(page);
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
});

test("nunca junto do banner de consentimento", async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(fakeBeforeInstallPrompt);
  await seedState(page, { visits: 5 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Sua privacidade" })).toBeVisible();
  await afterInstallPrompts(page);
  await expect(page.getByRole("region", { name: REGION })).toHaveCount(0);
  // Depois da escolha, em outra navegação, a faixa pode aparecer.
  await page.getByRole("button", { name: "Só o necessário" }).click();
  await page.goto("/cidade");
  await expect(page.getByRole("region", { name: REGION })).toBeVisible({ timeout: 10_000 });
});

test.describe("iPhone", () => {
  test.use({
    userAgent: IOS_UA,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("Instalar abre os 3 passos e Agora não conta recusa", async ({ page }) => {
    await seedState(page, { visits: 5 });
    await page.goto("/");
    const region = page.getByRole("region", { name: REGION });
    await expect(region).toBeVisible({ timeout: 10_000 });
    await region.getByRole("button", { name: "Instalar" }).click();
    const dialog = page.getByRole("dialog", { name: "Adicionar o CityNews à Tela de Início" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await expect(dialog).toContainText("Toque em Compartilhar");
    await expect(dialog).toContainText("Escolha Adicionar à Tela de Início");
    await expect(dialog).toContainText("Toque em Adicionar");
    await dialog.getByRole("button", { name: "Agora não" }).click();
    await expect(dialog).toBeHidden();
    await expect(region).toHaveCount(0);
    expect((await readState(page)).install.refusals).toBe(1);
  });
});

test("/app mostra instruções e 'Já instalado' em standalone", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "Baixar o app" })).toBeVisible();
  for (const h of [
    "Android (Chrome)",
    "iPhone e iPad (Safari)",
    "Mac (Safari)",
    "Windows (Chrome ou Edge)",
    "Outros navegadores",
  ])
    await expect(page.getByRole("heading", { level: 3, name: h })).toBeVisible();
  await expect(
    page.getByText("Seu navegador não permite instalar; use o site normalmente."),
  ).toBeVisible();
  await page.addInitScript(standaloneMedia);
  await page.goto("/app");
  await expect(page.getByRole("status")).toHaveText("Já instalado");
});

test("?origem=app em standalone registra app_installed e limpa a URL", async ({
  page,
  browserName,
}) => {
  const events: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/events")) events.push(r.postData() ?? "");
  });
  await page.addInitScript(standaloneMedia);
  await seedState(page, { visits: 1 });
  await page.goto("/?origem=app");
  await expect.poll(() => new URL(page.url()).search, { timeout: 10_000 }).toBe("");
  await expect
    .poll(() => events.some((e) => e.includes('"app_installed"')), { timeout: 10_000 })
    .toBe(true);
  const ev = JSON.parse(events.find((e) => e.includes('"app_installed"'))!);
  // `via` (src/lib/app/install.ts): iOS sem instruções vistas → "browser"; o projeto mobile-webkit
  // usa o UA do iPhone 13, os de Chromium não são iOS → "unknown".
  expect(ev.props).toEqual({ via: browserName === "webkit" ? "browser" : "unknown" });
  expect(ev.anonId).toBeNull();
  expect((await readState(page)).install.installed).toBe(true);
  // Segunda abertura não registra de novo.
  await page.goto("/?origem=app");
  // O parâmetro sai da URL antes da decisão de registrar: depois disso, a página assenta.
  await expect.poll(() => new URL(page.url()).search, { timeout: 10_000 }).toBe("");
  await page.waitForLoadState("networkidle");
  expect(events.filter((e) => e.includes('"app_installed"'))).toHaveLength(1);
});
