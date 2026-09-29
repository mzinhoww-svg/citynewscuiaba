import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readFixture } from "../../../tests/fixtures/read";
import { DEFAULT_USER_AGENT, type CrawlDeps } from "@/lib/pipeline/http";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { createMemoryIngestRepo } from "@/lib/pipeline/testing/memory-ingest-repo";
import { discoverConsumption } from "./discover";

const site = (n: string) => readFileSync(join(process.cwd(), "tests/fixtures/sites", n), "utf8");
const html = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/html" } });
const xml = (body: string): FakeRoute => ({
  body,
  headers: { "content-type": "application/rss+xml" },
});
const text = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/plain" } });
const robotsOk = (host: string) => ({
  [`https://${host}/robots.txt`]: text("User-agent: *\nDisallow: /admin"),
});
const deps = (routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>) => {
  const { http, calls } = createFakeHttp(routes);
  const d: CrawlDeps = {
    repo: createMemoryIngestRepo([]),
    http,
    resolve: fakeResolve(),
    userAgent: DEFAULT_USER_AGENT,
  };
  return { d, calls };
};
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url><loc>https://portalvarzea.example/n/1</loc><news:news><news:publication><news:name>Portal Várzea</news:name><news:language>pt</news:language></news:publication><news:publication_date>2026-09-27T10:00:00Z</news:publication_date><news:title>Prefeitura anuncia mutirão</news:title></news:news></url>
</urlset>`;

describe("discoverConsumption", () => {
  it("autodiscovery acha o RSS na home da Folha do Cerrado", async () => {
    const { d } = deps({
      "https://folhadocerrado.example/robots.txt": text(site("folha-robots.txt")),
      "https://folhadocerrado.example/": html(site("folha-home.html")),
      "https://folhadocerrado.example/feed": xml(readFixture("folha-do-cerrado.xml")),
    });
    const r = await discoverConsumption(d, new URL("https://folhadocerrado.example/"));
    expect(r).toMatchObject({
      ok: true,
      value: {
        strategy: "rss",
        kind: "rss",
        feedUrl: "https://folhadocerrado.example/feed",
        robots: { allowed: true, crawlDelaySec: 5 },
      },
    });
    expect(r.ok && r.value.entries).toHaveLength(25);
    expect(r.ok && r.value.html).toContain("Folha do Cerrado");
  });

  it("link que já é feed não busca a home", async () => {
    const { d, calls } = deps({
      ...robotsOk("folhadocerrado.example"),
      "https://folhadocerrado.example/feed": xml(readFixture("folha-do-cerrado.xml")),
    });
    const r = await discoverConsumption(d, new URL("https://folhadocerrado.example/feed"));
    expect(r.ok && r.value.strategy).toBe("rss");
    expect(calls.map((c) => c.url)).not.toContain("https://folhadocerrado.example/");
  });

  it("Atom vira strategy atom", async () => {
    const { d } = deps({
      ...robotsOk("portalvarzea.example"),
      "https://portalvarzea.example/atom.xml": { body: readFixture("portal-varzea.xml") },
    });
    const r = await discoverConsumption(d, new URL("https://portalvarzea.example/atom.xml"));
    expect(r.ok && r.value.strategy).toBe("atom");
  });

  it("JSON Feed vira kind api", async () => {
    const { d } = deps({
      ...robotsOk("agenciamt.example"),
      "https://agenciamt.example/feed.json": { body: readFixture("agencia-mt.json") },
    });
    const r = await discoverConsumption(d, new URL("https://agenciamt.example/feed.json"));
    expect(r).toMatchObject({ ok: true, value: { strategy: "jsonfeed", kind: "api" } });
  });

  it("usa a linha Sitemap: do robots quando não há feed", async () => {
    const { d, calls } = deps({
      "https://portalvarzea.example/robots.txt": text(site("portal-varzea-robots.txt")),
      "https://portalvarzea.example/": html(site("portal-varzea-home.html")),
      "https://portalvarzea.example/sitemap-noticias.xml": xml(SITEMAP),
    });
    const r = await discoverConsumption(d, new URL("https://portalvarzea.example/"));
    expect(r).toMatchObject({
      ok: true,
      value: {
        strategy: "sitemap_news",
        kind: "sitemap",
        feedUrl: "https://portalvarzea.example/sitemap-noticias.xml",
      },
    });
    // O sitemap do robots vem antes dos caminhos conhecidos.
    expect(calls.map((c) => c.url)).not.toContain("https://portalvarzea.example/feed");
  });

  it("sem feed nem sitemap vira página e lista o que tentou", async () => {
    const { d, calls } = deps({
      ...robotsOk("portalvarzea.example"),
      "https://portalvarzea.example/": html(site("portal-varzea-home.html")),
    });
    const r = await discoverConsumption(d, new URL("https://portalvarzea.example/"));
    expect(r).toMatchObject({
      ok: true,
      value: { strategy: "page_article", kind: "page", feedUrl: null },
    });
    expect(r.ok && r.value.tried).toHaveLength(7);
    expect(r.ok && r.value.tried.every((t) => t.outcome.length > 0)).toBe(true);
    expect(calls).toHaveLength(8);
  });

  it("com seletores, a página vira lista", async () => {
    const { d } = deps({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/cidades": html(
        readFileSync(join(process.cwd(), "tests/fixtures/sites/secao-mt-agora.html"), "utf8"),
      ),
    });
    const r = await discoverConsumption(d, new URL("https://mtagora.example/cidades"), {
      selectors: { item: "article.card", link: "a", title: "h2", date: "time" },
    });
    expect(r).toMatchObject({ ok: true, value: { strategy: "page_list", kind: "page" } });
    expect(r.ok && r.value.entries.length).toBeGreaterThan(1);
  });

  it("robots que proíbe o caminho encerra sem baixar a página", async () => {
    const { d, calls } = deps({
      "https://proibido.example/robots.txt": text(site("proibido-robots.txt")),
    });
    expect(await discoverConsumption(d, new URL("https://proibido.example/noticias"))).toEqual({
      ok: false,
      error: "robots_disallowed",
    });
    expect(calls).toHaveLength(1);
  });

  it("robots fora do ar (5xx) não coleta", async () => {
    const { d } = deps({ "https://x.example/robots.txt": { status: 503 } });
    expect(await discoverConsumption(d, new URL("https://x.example/"))).toEqual({
      ok: false,
      error: "robots_unavailable",
    });
  });

  it("no máximo 8 requisições por análise", async () => {
    const { d, calls } = deps({});
    const r = await discoverConsumption(d, new URL("https://vazio.example/"));
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(r.ok).toBe(false);
    const { d: d2, calls: c2 } = deps({ ...robotsOk("vazio.example") });
    await discoverConsumption(d2, new URL("https://vazio.example/"), { maxRequests: 3 });
    expect(c2.length).toBeLessThanOrEqual(3);
  });

  it("nada encontrado quando a home responde mas não há título nem feed", async () => {
    const { d } = deps({
      ...robotsOk("vazio.example"),
      "https://vazio.example/": html("<html><body><p>oi</p></body></html>"),
    });
    expect(await discoverConsumption(d, new URL("https://vazio.example/"))).toEqual({
      ok: false,
      error: "nothing_found",
    });
  });

  it("redirecionamento para IP interno é recusado sem chegar ao destino (Review Focus 1)", async () => {
    const { d, calls } = deps({
      ...robotsOk("noticias.example"),
      "https://noticias.example/": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      },
    });
    expect(await discoverConsumption(d, new URL("https://noticias.example/"))).toEqual({
      ok: false,
      error: "forbidden_host",
    });
    expect(calls.some((c) => c.url.includes("169.254.169.254"))).toBe(false);
  });

  it("host que resolve para IP privado é recusado", async () => {
    const { http, calls } = createFakeHttp({});
    const d: CrawlDeps = {
      repo: createMemoryIngestRepo([]),
      http,
      resolve: fakeResolve({ "interno.example": ["10.0.0.5"] }),
      userAgent: DEFAULT_USER_AGENT,
    };
    expect(await discoverConsumption(d, new URL("https://interno.example/"))).toEqual({
      ok: false,
      error: "forbidden_host",
    });
    expect(calls).toHaveLength(0);
  });

  it("limite por hora do host", async () => {
    const { d } = deps({
      ...robotsOk("lim.example"),
      "https://lim.example/feed": xml(readFixture("folha-do-cerrado.xml")),
    });
    let last: Awaited<ReturnType<typeof discoverConsumption>> | null = null;
    for (let i = 0; i < 12; i++)
      last = await discoverConsumption(d, new URL("https://lim.example/feed"));
    expect(last).toEqual({ ok: false, error: "rate_limited" });
  });

  it("feed com DOCTYPE de entidades é recusado", async () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x "y">]><rss version="2.0"><channel><item><title>&x;</title><link>https://e.example/1</link></item></channel></rss>`;
    const { d } = deps({ ...robotsOk("e.example"), "https://e.example/feed": xml(evil) });
    const r = await discoverConsumption(d, new URL("https://e.example/feed"));
    expect(r.ok).toBe(false);
  });
});
