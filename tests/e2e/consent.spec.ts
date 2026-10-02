import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

/*
 * Consentimento (spec §5.2, docs/testing.md §2 item 2, P2-T1): banner da primeira visita no
 * rodapé, sem bloquear a leitura; "Só o necessário" e a falta de resposta não enviam nada.
 */
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

function eventCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/events")) calls.push(r.postData() ?? r.url());
  });
  return calls;
}

function cspErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const banner = (page: Page) => page.getByRole("region", { name: "Sua privacidade" });

/** Perfil anônimo no IndexedDB (`citynews`/`anon`/`profile`), sem criar o banco se não existir. */
async function storedProfile(page: Page) {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === "citynews")) return null;
    return new Promise<{ anonId: string | null } | null>((resolve) => {
      const req = indexedDB.open("citynews");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("anon")) return resolve(null);
        const get = db.transaction("anon").objectStore("anon").get("profile");
        get.onsuccess = () => resolve((get.result as { anonId: string | null }) ?? null);
        get.onerror = () => resolve(null);
      };
    });
  });
}

async function consentCookie(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "cn_consent");
}

test("Só o necessário não envia eventos", async ({ page }) => {
  const calls = eventCalls(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Só o necessário" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect((await consentCookie(page))?.value).toBe("v1|m0|p0");
  await page.goto(ARTICLE);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Rola pela página (mouse.wheel não existe no WebKit móvel) e espera a rolagem acontecer.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // Sair da matéria dispara pagehide/visibilitychange e desmonta o medidor de leitura: é o
  // último momento em que um evento poderia sair. Espera a próxima página e a rede parar.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual([]);
  // A escolha vale nas próximas páginas: o banner não volta.
  await expect(banner(page)).toHaveCount(0);
});

test("anonId só com Personalização e sai quando ela é desligada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Só o necessário" }).click();
  // O perfil existe (seguir e salvar funcionam localmente), mas sem anonId.
  await expect
    .poll(async () => {
      const p = await storedProfile(page);
      return p ? p.anonId : "sem perfil";
    })
    .toBe(null);
  await page.goto("/privacidade");
  await page.getByRole("switch", { name: "Personalização" }).click();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect
    .poll(async () => (await storedProfile(page))?.anonId)
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const id = (await storedProfile(page))?.anonId;
  await page.reload();
  await expect.poll(async () => (await storedProfile(page))?.anonId).toBe(id);
  await page.getByRole("switch", { name: "Personalização" }).click();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect.poll(async () => (await storedProfile(page))?.anonId).toBe(null);
});

type Sent = {
  name: string;
  anonId: string | null;
  session: { id: string };
  consent: { metrics: boolean; personalization: boolean };
  props: Record<string, unknown>;
};

function sentEvents(page: Page): { events: Sent[]; statuses: number[] } {
  const out = { events: [] as Sent[], statuses: [] as number[] };
  page.on("request", (r) => {
    if (r.url().endsWith("/api/events") && r.method() === "POST")
      out.events.push(JSON.parse(r.postData() ?? "{}") as Sent);
  });
  page.on("response", (r) => {
    if (r.url().endsWith("/api/events")) out.statuses.push(r.status());
  });
  return out;
}

test("Aceitar recomendações cria o anonId e os eventos vão com personalização", async ({
  page,
}) => {
  // IP próprio por execução: o limite de 120 eventos a cada 10 min vale por conexão, e as outras
  // suítes (e repetições) no mesmo IP não podem transformar o 204 esperado em 429.
  await page.setExtraHTTPHeaders(forwardedFor());
  const sent = sentEvents(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Aceitar recomendações" }).click();
  await expect.poll(() => sent.events.map((e) => e.name)).toContain("privacy_settings_updated");
  const enabled = sent.events.find((e) => e.name === "personalization_enabled")!;
  expect(enabled.props).toEqual({ from: "banner" });
  expect(enabled.consent).toMatchObject({ metrics: true, personalization: true });
  const stored = (await storedProfile(page))?.anonId;
  expect(stored).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(sent.events.every((e) => e.anonId === stored)).toBe(true);
  // A API valida e grava (pilha local com banco).
  await expect.poll(() => sent.statuses).toContain(204);
  expect(sent.statuses.every((s) => s === 204)).toBe(true);
});

test("só métricas: eventos sem identificador", async ({ page }) => {
  const sent = sentEvents(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Escolher" }).click();
  await page.getByRole("switch", { name: "Métricas agregadas" }).click();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect.poll(() => sent.events.map((e) => e.name)).toEqual(["privacy_settings_updated"]);
  expect(sent.events[0]!.anonId).toBeNull();
  expect(sent.events[0]!.session.id).toBe("-");
  expect(sent.events[0]!.consent).toMatchObject({ metrics: true, personalization: false });
});

test("sem resposta vale só o necessário: banner continua e nada é enviado", async ({ page }) => {
  const calls = eventCalls(page);
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.goto(ARTICLE);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual([]);
  expect(await consentCookie(page)).toBeUndefined();
});

test("banner não é modal, não cobre o h1 em 360 px e respeita a CSP", async ({ page }) => {
  const errors = cspErrors(page);
  for (const path of ["/", ARTICLE, "/privacidade"]) {
    // 360 × 800: tela Android comum de 360 px de largura (docs/screens.md P01).
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(banner(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const h = (await h1.boundingBox())!;
    const b = (await banner(page).boundingBox())!;
    expect(b.y, `banner cobre o h1 em ${path}`).toBeGreaterThanOrEqual(h.y + h.height);
    // Alvos de toque ≥ 44 px.
    for (const name of ["Só o necessário", "Escolher", "Aceitar recomendações"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    // A leitura continua: o conteúdo abaixo do banner é alcançável rolando.
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  }
  expect(errors).toEqual([]);
});

test("compacto: até 15% da altura no celular e barra de uma linha no desktop", async ({ page }) => {
  for (const [width, height] of [
    [360, 640],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(banner(page)).toBeVisible();
    const b = (await banner(page).boundingBox())!;
    expect(b.height / height, `banner em ${width}x${height}`).toBeLessThanOrEqual(0.15);
    for (const name of ["Só o necessário", "Escolher", "Aceitar recomendações"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    // A última linha da página não fica escondida: o respiro inferior cobre o banner.
    const pad = await page.evaluate(
      () => parseFloat(getComputedStyle(document.body).paddingBottom) || 0,
    );
    expect(pad).toBeGreaterThanOrEqual(Math.floor(b.height));
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  const bar = (await banner(page).boundingBox())!;
  const btn = (await page.getByRole("button", { name: "Aceitar recomendações" }).boundingBox())!;
  // Uma linha: os botões cabem na altura do botão mais o respiro da barra.
  expect(bar.height).toBeLessThanOrEqual(btn.height + 24);
  expect(bar.width).toBeGreaterThanOrEqual(1270);
});

test("desktop: a barra não esconde o h1 (a rolagem o leva para acima dela)", async ({ page }) => {
  for (const [width, height] of [
    [1280, 800],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const path of ["/", ARTICLE]) {
      await page.goto(path);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      await expect(banner(page)).toBeVisible();
      // Barra de largura total: o h1 baixo na dobra é rolado para acima dela (respiro inferior).
      await h1.evaluate((el) => el.scrollIntoView({ block: "end" }));
      const h = (await h1.boundingBox())!;
      const b = (await banner(page).boundingBox())!;
      const overlap =
        b.x < h.x + h.width && h.x < b.x + b.width && b.y < h.y + h.height && h.y < b.y + b.height;
      expect(overlap, `banner sobre o h1 em ${path} (${width}px)`).toBe(false);
    }
  }
});

test("Escolher: painel com as categorias, Esc volta e salvar grava a escolha", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Escolher" }).click();
  const title = page.getByRole("heading", { name: "Escolha o que o CityNews pode usar" });
  await expect(title).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Escolher" })).toBeFocused();
  await page.getByRole("button", { name: "Escolher" }).click();
  await page.getByRole("switch", { name: "Métricas agregadas" }).click();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect((await consentCookie(page))?.value).toBe("v1|m1|p0");
  await page.goto("/privacidade");
  await expect(page.getByRole("switch", { name: "Métricas agregadas" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("switch", { name: "Personalização" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("privacidade: trocar a escolha sem conta", async ({ page }) => {
  await page.goto("/privacidade");
  await page.getByRole("switch", { name: "Personalização" }).click();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Escolhas salvas." })).toBeVisible();
  // Escolher na página também responde o banner.
  await expect(banner(page)).toHaveCount(0);
  expect((await consentCookie(page))?.value).toBe("v1|m0|p1");
});

test("teclado: banner vem logo depois do Pular para o conteúdo e não prende o foco", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saiba mais sobre privacidade" })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  // Depois das três escolhas o foco segue para o cabeçalho do site.
  const inBanner = await page.evaluate(
    () => !!document.activeElement?.closest('[aria-label="Sua privacidade"]'),
  );
  expect(inBanner).toBe(false);
});

test("banner e painel sem violações do axe @a11y", async ({ page }) => {
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  const closed = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(closed.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.getByRole("button", { name: "Escolher" }).click();
  const open = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(open.violations.filter((v) => blocking(v.impact))).toEqual([]);
});
