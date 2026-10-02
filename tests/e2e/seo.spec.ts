import { expect, test, type Page } from "@playwright/test";

const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

async function lds(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  return raw.map((t) => JSON.parse(t) as Record<string, unknown>);
}

test("robots.txt aponta o sitemap e fecha Estúdio e API", async ({ request }) => {
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  const body = await r.text();
  expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  expect(body).toContain("Disallow: /estudio");
  expect(body).toContain("Disallow: /api/");
});

test("índice de sitemaps e filhos respondem XML só com URLs do CityNews", async ({ request }) => {
  const index = await (await request.get("/sitemap.xml")).text();
  expect(index).toContain("<sitemapindex");
  for (const child of ["news", "articles", "topics", "pages"]) {
    expect(index).toContain(`/sitemap-${child}.xml</loc>`);
    const r = await request.get(`/sitemap-${child}.xml`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("xml");
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? "");
    // Agregados não têm página indexável: nenhum domínio de fonte aparece.
    expect(locs.every((l) => !l.includes(".example"))).toBe(true);
    expect(xml).not.toContain("materia-arquivada-seed");
  }
  const news = await (await request.get("/sitemap-news.xml")).text();
  expect(news).toContain("xmlns:news=");
});

test("home publica Organization e WebSite com busca", async ({ page }) => {
  await page.goto("/");
  const types = (await lds(page)).map((l) => l["@type"]);
  expect(types).toContain("NewsMediaOrganization");
  const site = (await lds(page)).find((l) => l["@type"] === "WebSite");
  expect(JSON.stringify(site)).toContain("/busca?q={search_term_string}");
});

test("matéria: NewsArticle, BreadcrumbList e Open Graph", async ({ page }) => {
  await page.goto(ARTICLE);
  const ld = await lds(page);
  expect(ld[0]?.["@type"]).toBe("NewsArticle");
  expect(ld.map((l) => l["@type"])).toContain("BreadcrumbList");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /plano de ônibus/,
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "CityNews Cuiabá",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`${ARTICLE}$`),
  );
});

test("evento publica Event e BreadcrumbList", async ({ page }) => {
  await page.goto("/agenda/noite-de-rasqueado-no-sesc-arsenal");
  const types = (await lds(page)).map((l) => l["@type"]);
  expect(types).toEqual(expect.arrayContaining(["Event", "BreadcrumbList"]));
});

test("cabeçalhos de segurança e CSP com nonce igual ao do script de tema", async ({ page }) => {
  const r = await page.goto("/");
  const h = r!.headers();
  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-content-type-options"]).toBe("nosniff");
  // O script inline de tema leva o nonce da requisição (o navegador esconde o atributo do DOM).
  const themeNonce = await page.evaluate(
    () =>
      [...document.head.querySelectorAll<HTMLScriptElement>("script:not([src])")].map(
        (s) => s.nonce,
      )[0],
  );
  expect(themeNonce).toBe(nonce);
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
});

test("CSP não bloqueia nada e a página hidrata", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.goto(ARTICLE);
  await page.getByRole("button", { name: "Informar problema" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(violations).toEqual([]);
});

test("nonce muda a cada requisição", async ({ request }) => {
  const a = (await request.get("/sobre")).headers()["content-security-policy"];
  const b = (await request.get("/sobre")).headers()["content-security-policy"];
  expect(a).not.toBe(b);
});
