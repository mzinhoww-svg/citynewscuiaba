import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
  // A escolha vale nas próximas páginas: o banner não volta.
  await expect(banner(page)).toHaveCount(0);
});

test("sem resposta vale só o necessário: banner continua e nada é enviado", async ({ page }) => {
  const calls = eventCalls(page);
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.goto(ARTICLE);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner(page)).toBeVisible();
  await page.waitForTimeout(500);
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
