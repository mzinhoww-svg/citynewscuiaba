import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAs } from "./helpers/studio-login";
import { skipInvite } from "./invite";

/*
 * Leitura offline (spec 2026-09-28 §7.7, §7.8, §8; critérios 4, 5, 6; PW-T7). Chromium: o
 * `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS` (playwright.config.ts) deixa `context.route`
 * alcançar o `fetch` do service worker; "offline" aqui = `setOffline` + abortar toda requisição.
 */
const LIDA = "o-que-muda-nas-linhas-de-onibus-entre-cpa-e-centro";
const LIDA_TITULO = "O que muda nas linhas de ônibus entre o CPA e o Centro";
const SALVA = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const NUNCA_ABERTA = "final-da-copa-cuiabana-de-futebol-amador-sera-na-arena-pantanal";

test.skip(
  ({ browserName }) => browserName === "webkit",
  "service worker do Playwright no WebKit não é estável",
);

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

/** Espera o SW controlar a página (registro depois do load e em ocioso). */
export async function swReady(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 20_000,
    })
    .toBe(true);
}

/** `load` e um ocioso do navegador (o mesmo gatilho do registro do SW, src/lib/offline/sw.ts). */
async function afterLoadIdle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const w = window as Window & {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void;
        };
        if (typeof w.requestIdleCallback === "function")
          w.requestIdleCallback(done, { timeout: 2000 });
        else done();
      }),
  );
}

async function cachedIn(page: Page, cache: string, path: string) {
  return page.evaluate(async ([c, p]) => Boolean(await (await caches.open(c!)).match(p!)), [
    cache,
    path,
  ] as const);
}

async function waitCached(page: Page, cache: string, path: string) {
  await expect.poll(() => cachedIn(page, cache, path), { timeout: 15_000 }).toBe(true);
}

async function goOffline(context: BrowserContext) {
  await context.route("**/*", (r) => r.abort("internetdisconnected"));
  await context.setOffline(true);
}

test("home, editoria, matéria lida e salva abrem offline com 'Salva às…'; matéria nunca aberta cai em Sem conexão com a lista", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await swReady(page);
  await page.goto("/");
  await waitCached(page, "cn-paginas-v1", "/");
  await page.goto("/cidade");
  await waitCached(page, "cn-paginas-v1", "/cidade");
  // A cópia guarda a própria CSP: o nonce do cabeçalho é o mesmo dos scripts do HTML (G2).
  const copy = await page.evaluate(async () => {
    const res = await (await caches.open("cn-paginas-v1")).match("/cidade");
    return {
      csp: res?.headers.get("content-security-policy") ?? "",
      html: (await res?.text()) ?? "",
    };
  });
  const nonce = /'nonce-([^']+)'/.exec(copy.csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(copy.html).toContain(`nonce="${nonce}"`);
  await page.goto(`/materia/${LIDA}`);
  await waitCached(page, "cn-lidas-v1", `/materia/${LIDA}`);
  await page.goto(`/materia/${SALVA}`);
  await ready(page);
  const save = page.getByRole("button", { name: "Salvar", exact: true });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await skipInvite(page);
  await waitCached(page, "cn-salvos-v1", `/materia/${SALVA}`);

  await goOffline(context);
  for (const path of ["/", "/cidade", `/materia/${LIDA}`, `/materia/${SALVA}`]) {
    await page.goto(path);
    await expect(page.getByRole("status").filter({ hasText: /Salva (às|em) / })).toContainText(
      /Salva (às|em) .*pode estar desatualizada\./,
    );
  }
  await page.goto(`/materia/${NUNCA_ABERTA}`);
  await expect(page.getByRole("heading", { level: 1, name: "Sem conexão" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Lidas recentemente" })).toContainText(LIDA_TITULO);
  await expect(page.getByRole("list", { name: "Páginas" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Salvas" })).toBeVisible();
});

test("página de /perfil e resposta de leitor logado não entram no cache", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await swReady(page);
  await page.goto("/perfil");
  await page.goto("/busca");
  await page.goto("/");
  await waitCached(page, "cn-paginas-v1", "/");
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });
  expect(keys).not.toContain("/perfil");
  expect(keys).not.toContain("/busca");
  expect(keys.some((k) => k.startsWith("/api"))).toBe(false);

  // Com sessão, o proxy não marca a resposta: a home de quem entrou não vai para o cache.
  await loginAs(context, "paulo");
  await page.evaluate(async () => {
    await (await caches.open("cn-paginas-v1")).delete("/");
  });
  await page.goto("/");
  await page.goto("/cidade");
  // A causa: sem a marca `x-cn-offline` o SW não guarda a resposta. Confere a marca primeiro e,
  // com a navegação seguinte já servida (o SW tratou a da home antes), o cache.
  const marker = await page.request.get("/", {
    headers: { cookie: await page.evaluate(() => document.cookie) },
  });
  expect(marker.headers()["x-cn-offline"]).toBeUndefined();
  await page.waitForLoadState("networkidle");
  expect(await cachedIn(page, "cn-paginas-v1", "/")).toBe(false);
});

test("Limpar leitura offline apaga cn-lidas e cn-paginas e mantém cn-salvos", async ({ page }) => {
  await page.goto("/");
  await swReady(page);
  await page.goto("/");
  await waitCached(page, "cn-paginas-v1", "/");
  await page.goto(`/materia/${LIDA}`);
  await waitCached(page, "cn-lidas-v1", `/materia/${LIDA}`);
  await page.goto(`/materia/${SALVA}`);
  await ready(page);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await skipInvite(page);
  await waitCached(page, "cn-salvos-v1", `/materia/${SALVA}`);
  await page.goto("/privacidade");
  await page.getByRole("button", { name: "Limpar leitura offline" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Leitura offline apagada deste aparelho." }),
  ).toBeVisible();
  await expect.poll(() => cachedIn(page, "cn-lidas-v1", `/materia/${LIDA}`)).toBe(false);
  await expect.poll(() => cachedIn(page, "cn-paginas-v1", "/")).toBe(false);
  expect(await cachedIn(page, "cn-salvos-v1", `/materia/${SALVA}`)).toBe(true);
});

test("SW não é registrado no Estúdio e nenhuma resposta de /estudio entra em cache", async ({
  page,
  context,
}) => {
  await loginAs(context, "helena");
  await page.goto("/estudio");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // O registro, nas páginas públicas, sai depois do `load` e em ocioso: espera a mesma janela.
  await afterLoadIdle(page);
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  // Mesmo com o SW registrado por uma página pública, /estudio fica de fora.
  await page.goto("/");
  await swReady(page);
  await page.goto("/estudio/fila");
  await afterLoadIdle(page);
  const cached = await page.evaluate(async () => {
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys())
        if (new URL(req.url).pathname.startsWith("/estudio")) return true;
    return false;
  });
  expect(cached).toBe(false);
});
