import { NEWS_WINDOW_HOURS, newsSitemapXml, sitemapIndexXml, urlsetXml } from "./sitemap";

const base = "https://citynews.example";
const now = new Date("2026-09-27T18:00:00Z");

it("sitemap de notícias só contém últimas 48 h", () => {
  const xml = newsSitemapXml(
    [
      {
        path: "/materia/plano-onibus-cpa-centro",
        title: "Plano",
        publishedAt: "2026-09-26T12:00:00Z",
      },
      {
        path: "/materia/materia-de-agosto-seed",
        title: "Agosto",
        publishedAt: "2026-08-10T12:00:00Z",
      },
      { path: "/materia/limite", title: "Limite", publishedAt: "2026-09-25T17:59:00Z" },
    ],
    now,
    base,
  );
  expect(NEWS_WINDOW_HOURS).toBe(48);
  expect(xml).toContain("plano-onibus-cpa-centro");
  expect(xml).not.toContain("materia-de-agosto-seed");
  expect(xml).not.toContain("/materia/limite");
  expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
  expect(xml).toContain("<news:language>pt</news:language>");
  expect(xml).toContain("<news:publication_date>2026-09-26T12:00:00.000Z</news:publication_date>");
});

it("escapa caracteres especiais no título", () => {
  const xml = newsSitemapXml(
    [{ path: "/materia/x", title: "Ônibus & <trânsito>", publishedAt: "2026-09-27T12:00:00Z" }],
    now,
    base,
  );
  expect(xml).toContain("Ônibus &amp; &lt;trânsito&gt;");
});

it("urlset com lastmod e só URLs do próprio site", () => {
  const xml = urlsetXml(
    [{ path: "/assunto/obra", lastModified: "2026-09-26T10:00:00Z" }, { path: "/sobre" }],
    base,
  );
  expect(xml).toContain("<loc>https://citynews.example/assunto/obra</loc>");
  expect(xml).toContain("<lastmod>2026-09-26T10:00:00.000Z</lastmod>");
  expect(xml).toContain("<loc>https://citynews.example/sobre</loc>");
});

it("índice aponta para os sitemaps filhos", () => {
  const xml = sitemapIndexXml(["/sitemap-news.xml", "/sitemap-topics.xml"], base);
  expect(xml).toContain("<sitemapindex");
  expect(xml).toContain("<loc>https://citynews.example/sitemap-news.xml</loc>");
});
