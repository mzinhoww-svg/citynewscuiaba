import { expect, test } from "@playwright/test";

/*
 * docs/testing.md §2, item 7: todo card agregado tem rótulo AGREGADO e link
 * target="_blank" rel="noopener" para o domínio da fonte (nunca página própria do CityNews).
 */
const PAGES = [
  "/",
  "/assunto/obra-do-viaduto-na-miguel-sutil",
  "/assunto/plano-de-onibus-cpa-centro",
  "/colecoes/seca-e-fumaca",
];

for (const path of PAGES) {
  test(`agregados de ${path} são rotulados e abrem no original`, async ({ page, baseURL }) => {
    await page.goto(path);
    const own = new URL(baseURL!).host;
    const cards = page.locator("article").filter({ has: page.getByText(/^AGREGADO/) });
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await expect(card.getByText(/^AGREGADO/).first()).toBeVisible();
      const links = card.getByRole("link");
      expect(await links.count()).toBeGreaterThan(0);
      for (const link of await links.all()) {
        const href = (await link.getAttribute("href")) ?? "";
        const url = new URL(href, baseURL);
        expect(url.host).not.toBe(own);
        expect(url.protocol).toMatch(/^https?:$/);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
      }
    }
  });
}

test("agregado não tem página de leitura no CityNews", async ({ request }) => {
  for (const path of ["/agregado/c3000000-0000-4000-8000-000000000013", "/panorama/item/1"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const pages = await (await request.get("/sitemap-pages.xml")).text();
  expect(pages).not.toMatch(/agregado|\.example/);
});
