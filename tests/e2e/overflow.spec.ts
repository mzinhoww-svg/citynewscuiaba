import { expect, test } from "@playwright/test";

/*
 * Celular de 320 px (UX-W4-T1, Review Focus 2): nenhuma página pública tem rolagem horizontal da
 * página. Mede `scrollWidth` do documento contra a largura da janela, depois de rolar até o fim
 * (barras fixas, anúncio do rodapé e convites aparecem com a rolagem).
 *
 * Roda só no projeto `desktop` com a janela trocada para 320×640: na emulação de celular
 * (`isMobile`) o Chromium afasta o zoom para caber o conteúdo largo e `innerWidth` cresce junto,
 * escondendo o estouro que este teste procura.
 */
const SLUG = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

const ROUTES = [
  "/",
  "/cidade",
  `/materia/${SLUG}`,
  "/busca?q=prefeitura",
  "/pergunte",
  "/fontes",
  "/panorama",
  "/agenda",
  "/explorar",
  "/assuntos",
  "/favoritos",
  "/alertas",
  "/newsletter",
  "/entrar",
  "/criar-conta",
  "/perfil",
  "/sobre",
  "/metodologia",
  "/privacidade",
];

test.describe("sem rolagem horizontal em 320 px", () => {
  test.skip(({ isMobile }) => isMobile, "medido com janela de 320 px no projeto desktop");
  test.use({ viewport: { width: 320, height: 640 } });

  for (const route of ROUTES) {
    test(`${route} cabe em 320 px`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main#conteudo")).toBeVisible();
      const measure = () =>
        page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }));
      const top = await measure();
      expect(top.scroll, `${route} no topo`).toBeLessThanOrEqual(top.inner);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const bottom = await measure();
      expect(bottom.scroll, `${route} no fim`).toBeLessThanOrEqual(bottom.inner);
    });
  }
});
