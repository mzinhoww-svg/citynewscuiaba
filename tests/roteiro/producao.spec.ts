import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/*
 * Roteiro de fumaça de PRODUÇÃO, SOMENTE LEITURA: só GET e navegação. Não cria conta, não envia
 * formulário, não faz login e não escreve nada. Só com CN_ROTEIRO=1.
 *
 *   CN_ROTEIRO=1 BASE_URL=https://citynewscuiaba.vercel.app \
 *     pnpm exec playwright test -c tests/roteiro/playwright.producao.config.ts
 *
 * Saídas: docs/reports/go-live/<nome>-390.png e -1280.png e docs/reports/go-live-smoke.md.
 * Com CRON_SECRET no ambiente do teste, também confere /api/ingest/status (GET com Bearer).
 */
test.skip(!process.env.CN_ROTEIRO, "produção: rode com CN_ROTEIRO=1");
test.setTimeout(90_000);

const BASE_URL = process.env.BASE_URL ?? "https://citynewscuiaba.vercel.app";
const SHOT_DIR = "docs/reports/go-live";
const REPORT = "docs/reports/go-live-smoke.md";
const WIDTHS = [390, 1280] as const;

const ORIGIN_LABELS =
  /ORIGINAL CITYNEWS|AGREGADO|Feito a partir de|Revisado automaticamente|Revisado por/;

type Row = { name: string; status: string; notes: string };
const rows: Row[] = [];
const serverErrors: string[] = [];
const consoleErrors: string[] = [];

function track(page: Page) {
  page.on("response", (res) => {
    if (res.status() >= 500)
      serverErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location().url;
    if (/favicon/i.test(url) || /favicon/i.test(msg.text())) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}${url ? ` (${url})` : ""}`);
  });
}

test.beforeEach(async ({ page }) => {
  track(page);
});

test.afterEach(async ({}, info: TestInfo) => {
  const notes = info.annotations.map(
    (a) => `${a.type}${a.description ? `: ${a.description}` : ""}`,
  );
  const err = info.error?.message?.split("\n")[0];
  if (err) notes.push(err);
  const status =
    info.status === "skipped" ? "PULADO" : info.status === info.expectedStatus ? "OK" : "FALHOU";
  rows.push({ name: info.title, status, notes: notes.join("; ").replace(/\|/g, "/") });
});

test.afterAll(() => {
  if (!process.env.CN_ROTEIRO) return;
  const lines = [
    "# Fumaça de produção (somente leitura)",
    "",
    `- URL base: ${BASE_URL}`,
    `- Execução: ${new Date().toISOString()}`,
    `- Capturas: ${SHOT_DIR}/<nome>-390.png e -1280.png`,
    "",
    "| Verificação | Resultado | Notas |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.status} | ${r.notes || "-"} |`),
    "",
    `Respostas 5xx: ${serverErrors.length}`,
    ...serverErrors.map((e) => `- ${e}`),
    "",
    `Erros de console: ${consoleErrors.length}`,
    ...consoleErrors.map((e) => `- ${e}`),
    "",
  ];
  mkdirSync("docs/reports", { recursive: true });
  writeFileSync(REPORT, lines.join("\n"));
});

/** Screenshot nas duas larguras, com a página já carregada. */
async function shots(page: Page, name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT_DIR}/${name}-${w}.png`, animations: "disabled" });
  }
}

async function dismissConsent(page: Page) {
  const later = page.getByRole("button", { name: /Agora não|Só o necessário/i }).first();
  if (await later.isVisible().catch(() => false)) await later.click().catch(() => {});
}

/** Abre a página (GET) e devolve a resposta e um atalho para as capturas. */
async function open(page: Page, path: string, name: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await dismissConsent(page);
  expect(res, `${path} sem resposta`).not.toBeNull();
  return { res: res!, shoot: () => shots(page, name) };
}

test("home carrega com card e rótulo de origem", async ({ page }) => {
  const { res, shoot } = await open(page, "/", "home");
  expect(res.status()).toBe(200);
  await expect(
    page.getByText(ORIGIN_LABELS).first(),
    "nenhum rótulo de origem visível na home",
  ).toBeVisible();
  await expect(page.locator("main a[href]").first()).toBeVisible();
  await shoot();
});

test("/entrar responde 200 com campos e botão do Google", async ({ page }) => {
  const { res, shoot } = await open(page, "/entrar", "entrar");
  expect(res.status()).toBe(200);
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  const google = page.getByRole("button", { name: /Entrar com (o )?Google/i });
  await expect(google, "botão do Google ausente").toBeVisible();
  if (await google.isDisabled()) {
    test.info().annotations.push({
      type: "google",
      description: "botão presente, porém desativado (provedor desligado)",
    });
  }
  await shoot();
});

for (const [path, name] of [
  ["/fontes", "fontes"],
  ["/panorama", "panorama"],
] as const) {
  test(`${path} responde 200 e tem conteúdo`, async ({ page }) => {
    const { res, shoot } = await open(page, path, name);
    expect(res.status()).toBe(200);
    const items =
      (await page.locator('main a[href^="http"]').count()) +
      (await page.getByText(ORIGIN_LABELS).count());
    if (items === 0) {
      test.info().annotations.push({
        type: "vazio",
        description: `${path} sem itens (ainda sem conteúdo?)`,
      });
    }
    await shoot();
  });
}

test("/busca?q=prefeitura responde", async ({ page }) => {
  const { res, shoot } = await open(page, "/busca?q=prefeitura", "busca");
  expect(res.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  await shoot();
});

test("/pergunte abre", async ({ page }) => {
  const { res, shoot } = await open(page, "/pergunte", "pergunte");
  expect(res.status()).toBe(200);
  await expect(page.getByRole("textbox").first()).toBeVisible();
  await shoot(); // não envia nenhuma pergunta
});

test("/agenda abre", async ({ page }) => {
  const { res, shoot } = await open(page, "/agenda", "agenda");
  expect(res.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  await shoot();
});

test("/estudio redireciona para o login sem erro", async ({ page, request }) => {
  const raw = await request.get("/estudio", { maxRedirects: 0 });
  const status = raw.status();
  if (status >= 500) serverErrors.push(`${status} GET ${raw.url()}`);
  expect(status, "/estudio não pode dar 5xx").toBeLessThan(500);
  test.info().annotations.push({
    type: "resposta",
    description: `${status} ${raw.headers()["location"] ?? ""}`.trim(),
  });
  const { res, shoot } = await open(page, "/estudio", "estudio");
  expect(res.status()).toBeLessThan(400);
  expect(page.url(), "deveria terminar na página de login").toMatch(/entrar|login/i);
  await shoot();
});

test("/api/ingest/status com Bearer (só se CRON_SECRET existir)", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET ausente no ambiente do teste");
  const res = await request.get("/api/ingest/status", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  if (res.status() >= 500) serverErrors.push(`${res.status()} GET ${res.url()}`);
  expect(res.status()).toBe(200);
  const body: unknown = await res.json().catch(() => null);
  expect(body).not.toBeNull();
});

for (const [path, name, hint] of [
  ["/robots.txt", "robots", /user-agent/i],
  ["/sitemap.xml", "sitemap", /<(urlset|sitemapindex)/i],
] as const) {
  test(`${path} responde 200`, async ({ page, request }) => {
    const res = await request.get(path);
    if (res.status() >= 500) serverErrors.push(`${res.status()} GET ${res.url()}`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(hint);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await shots(page, name);
  });
}

for (const path of ["/sobre", "/termos", "/privacidade"]) {
  test(`${path} responde 200 sem texto provisório`, async ({ page }) => {
    const { res, shoot } = await open(page, path, path.slice(1));
    expect(res.status()).toBe(200);
    const text = await page.locator("body").innerText();
    // TODO só em caixa alta e como palavra: "todo" é português comum.
    expect(text).not.toMatch(/lorem/i);
    expect(text).not.toMatch(/\bTODO\b/);
    expect(text).not.toMatch(/a definir/i);
    await shoot();
  });
}

test("Content-Security-Policy presente", async ({ request }) => {
  for (const path of ["/", "/entrar"]) {
    const res = await request.get(path);
    expect(res.headers()["content-security-policy"], `CSP ausente em ${path}`).toBeTruthy();
  }
});

test("sem erros de console nas páginas públicas", async ({ page }) => {
  const paths = [
    "/",
    "/entrar",
    "/fontes",
    "/panorama",
    "/busca?q=prefeitura",
    "/pergunte",
    "/agenda",
    "/sobre",
    "/termos",
    "/privacidade",
  ];
  const before = consoleErrors.length;
  for (const p of paths) {
    await page.goto(p, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  const novos = consoleErrors.slice(before);
  expect(novos, `erros de console:\n${novos.join("\n")}`).toEqual([]);
});

test("nenhuma resposta 5xx em toda a execução", async () => {
  expect(serverErrors, serverErrors.join("\n")).toEqual([]);
});
