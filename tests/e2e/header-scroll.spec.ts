import { expect, test, type Page } from "@playwright/test";

/*
 * Moldura do portal (UX-W4-T1, itens 62 e 69): a fileira de editorias recolhe ao rolar para
 * baixo e volta ao rolar para cima; com movimento reduzido só alterna, sem transição. O cabeçalho
 * publica a própria altura em `--cn-header-h`. "● AGORA" leva a `/#agora` e só pulsa na home.
 */
const SLUG = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

/** Quanto da fileira aparece abaixo do invólucro que a recorta (0 = recolhida). */
const visiblePart = (page: Page) =>
  page.getByRole("navigation", { name: "Editorias" }).evaluate((el) => {
    const nav = el.getBoundingClientRect();
    const box = (el.parentElement as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.round(nav.bottom - box.top));
  });

const scrollBy = (page: Page, dy: number) => page.evaluate((d) => window.scrollBy(0, d), dy);

async function makeTall(page: Page) {
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main#conteudo");
    if (main) main.style.minHeight = "4000px";
  });
}

test.describe("cabeçalho que recolhe as editorias", () => {
  test("some ao descer e volta ao subir", async ({ page }) => {
    await page.goto(`/materia/${SLUG}`);
    await makeTall(page);
    const sections = page.getByRole("navigation", { name: "Editorias" });
    await expect(sections).toHaveAttribute("data-hidden", "false");

    await scrollBy(page, 800);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect(sections).toHaveAttribute("data-hidden", "true");
    // Recolhida, a fileira sobe e é recortada: nada dela fica à vista.
    await expect.poll(() => visiblePart(page)).toBe(0);

    await scrollBy(page, -200);
    await expect(sections).toHaveAttribute("data-hidden", "false");
    await expect.poll(() => visiblePart(page)).toBeGreaterThan(40);

    // A altura medida alimenta o scroll-padding-top e o topo das colunas fixas.
    const height = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--cn-header-h"),
    );
    expect(height).toMatch(/^\d+px$/);
  });

  test("com movimento reduzido só alterna, sem transição", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/materia/${SLUG}`);
    await makeTall(page);
    const sections = page.getByRole("navigation", { name: "Editorias" });
    const duration = await sections.evaluate((el) => getComputedStyle(el).transitionDuration);
    // O reset de `tokens.css` deixa as durações em 1 ms com movimento reduzido: sem animação visível.
    expect(duration.split(",").every((d) => parseFloat(d) <= 0.01)).toBe(true);
    await scrollBy(page, 800);
    await expect(sections).toHaveAttribute("data-hidden", "true");
    await expect.poll(() => visiblePart(page)).toBe(0);
  });

  test("um link da fileira recolhida focado por teclado a traz de volta", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teclado: desktop");
    await page.goto(`/materia/${SLUG}`);
    await makeTall(page);
    const sections = page.getByRole("navigation", { name: "Editorias" });
    await scrollBy(page, 800);
    await expect(sections).toHaveAttribute("data-hidden", "true");
    await expect.poll(() => visiblePart(page)).toBe(0);
    await sections.getByRole("link").first().focus();
    await expect.poll(() => visiblePart(page)).toBeGreaterThan(40);
  });
});

test.describe("AGORA do cabeçalho", () => {
  test("leva ao bloco Agora da home e só pulsa na home", async ({ page }) => {
    const live = () => page.locator('header[data-sticky="public"] a[href="/#agora"]');
    await page.goto("/agenda");
    await expect(live()).toBeVisible();
    await expect(live().locator(".motion-safe\\:animate-live-pulse")).toHaveCount(0);

    await live().click();
    await expect(page).toHaveURL(/\/#agora$/);
    await expect(page.locator("#agora")).toBeInViewport();
    await expect(live().locator(".motion-safe\\:animate-live-pulse")).toHaveCount(1);
  });
});
