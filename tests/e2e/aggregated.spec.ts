import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      await expect(links.first()).toBeVisible();
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

/*
 * Revisão P3-GATE (ALTA 1): o texto da fonte (`collected_items.excerpt`) nunca chega ao HTML; o
 * card mostra só o resumo próprio do CityNews. As frases de todos os excerpts do seed são
 * procuradas no HTML da home, dos assuntos e da coleção (Panorama).
 */
function seedExcerptSentences(): string[] {
  const sql = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");
  const start = sql.indexOf("insert into collected_items");
  const block = sql.slice(start, sql.indexOf(";\n", start));
  const rows = block.matchAll(
    /\('c3[0-9a-f-]+','[^']*','[^']*','(?:[^']|'')*',(null|'(?:[^']|'')*')/g,
  );
  const excerpts = [...rows]
    .map((m) => m[1]!)
    .filter((e) => e !== "null")
    .map((e) => e.slice(1, -1).replace(/''/g, "'"));
  return excerpts
    .flatMap((e) => e.match(/[^.!?]+[.!?]/g) ?? [e])
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);
}

test("texto da fonte nunca aparece no HTML da home e do Panorama", async ({ request }) => {
  const sentences = seedExcerptSentences();
  expect(sentences.length).toBeGreaterThan(20);
  let summaries = 0;
  for (const path of [...PAGES, "/assunto/seca-e-fumaca-na-baixada-cuiabana"]) {
    const html = await (await request.get(path)).text();
    for (const s of sentences) expect(html, `${path}: ${s}`).not.toContain(s);
    if (html.includes("RESUMO POR IA")) summaries++;
  }
  // O resumo próprio aparece (item da MT Agora sobre a linha expressa).
  const topic = await (await request.get("/assunto/plano-de-onibus-cpa-centro")).text();
  expect(topic).toContain(
    "Ônibus expresso entre CPA e Centro deve passar a cada 12 minutos no pico.",
  );
  expect(summaries).toBeGreaterThan(0);
});
