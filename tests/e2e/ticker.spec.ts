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

test("a rolagem pausa ao focar um link", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  const link = ticker.getByRole("link").first();
  await link.focus();
  const state = await ticker
    .locator("ul")
    .evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(state).toBe("paused");
});

test("com movimento reduzido não rola e a lista tem rolagem manual", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const ticker = page.getByRole("region", { name: "Últimas notícias" });
  const name = await ticker.locator("ul").evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe("none");
});
