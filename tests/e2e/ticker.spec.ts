import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createArticle, removeArticles, tag } from "./studio";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

const ids: string[] = [];
const run = tag();

test.beforeAll(async () => {
  const now = Date.now();
  const mk = (title: string, hoursAgo: number, neighborhoods: string[] = []) =>
    createArticle({
      title: `${title} ${run}`,
      status: "published",
      published_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
      // Fora de home e editoria: a matéria só aparece no ticker, sem mexer nas outras telas.
      publish_destinations: [],
      neighborhoods,
    });
  ids.push(await mk("Obra de drenagem no Coxipó altera trânsito", 0.2, ["Coxipó"]));
  ids.push(await mk("Safra de soja em Mato Grosso bate recorde", 1));
  ids.push(await mk("Congresso aprova texto base de reforma", 2));
});

test.afterAll(async () => {
  await removeArticles(ids);
});

test("ticker aparece na home logo abaixo do menu, com links reais e regionais primeiro", async ({
  page,
}) => {
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  await expect(ticker).toBeVisible();
  await expect(ticker.getByText("Última hora")).toBeVisible();
  const first = ticker.getByRole("link").first();
  await expect(first).toHaveAttribute("href", /^\/materia\//);
  await expect(first).toContainText("Obra de drenagem no Coxipó");
  const header = await page.locator("header[data-sticky='public']").boundingBox();
  const box = await ticker.boundingBox();
  expect(Math.abs(box!.y - (header!.y + header!.height))).toBeLessThanOrEqual(2);
});

test("ticker na página de matéria e sem violações de acessibilidade", async ({ page }) => {
  await page.goto("/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  await expect(page.getByRole("region", { name: "Últimas notícias" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include("[data-ticker]").analyze();
  expect(violations.filter((v) => blocking(v.impact))).toEqual([]);
});

// UX-W1-T6: nada se move sozinho, nem sem preferência de movimento reduzido.
test("não rola sozinho: sem animação e com rolagem manual", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  const ul = ticker.locator("ul");
  expect(await ul.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const overflow = await ul.evaluate((el) => getComputedStyle(el.parentElement!).overflowX);
  expect(overflow).toBe("auto");
  const first = ticker.getByRole("link").first();
  expect(await first.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

// Sem barra visível e sem animação, quem usa mouse precisa de outro caminho até as manchetes
// escondidas: roda do mouse e botões anterior/próximo no desktop (escopo extra da UX-W4-T5).
test("desktop: roda do mouse e botões anterior/próximo rolam a faixa", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "mouse e botões: só no desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  const scroller = ticker.locator("ul").locator("xpath=..");
  const overflows = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  const next = ticker.getByRole("button", { name: "Próximas manchetes" });
  const prev = ticker.getByRole("button", { name: "Manchetes anteriores" });
  if (!overflows) {
    await expect(next).toHaveCount(0);
    return;
  }
  await expect(next).toBeVisible();
  await expect(prev).toHaveAttribute("aria-disabled", "true");
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Botão: anda e o anterior volta a valer; o foco continua no botão.
  await next.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(prev).toHaveAttribute("aria-disabled", "false");
  await expect(next).toBeFocused();
  await prev.click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);

  // Roda do mouse sobre a faixa: rola na horizontal, a página fica parada.
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const pageY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);

  // Sem movimento automático: parada, a faixa não anda sozinha.
  const left = await scroller.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(1500);
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(left);
});

test("celular: sem botões de rolagem (desliza com o dedo)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "visão de celular");
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  await expect(ticker).toBeVisible();
  await expect(ticker.getByRole("button", { name: "Próximas manchetes" })).toBeHidden();
});
