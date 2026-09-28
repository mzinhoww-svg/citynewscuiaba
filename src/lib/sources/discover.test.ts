import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CrawlDeps } from "@/lib/pipeline/http";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { discoverConsumption } from "./discover";

const UA = "CityNewsBot/1.0";

function read(fixture: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures", fixture), "utf-8");
}

function text(body: string): FakeRoute {
  return { body, headers: { "content-type": "text/plain" } };
}
function html(body: string): FakeRoute {
  return { body, headers: { "content-type": "text/html" } };
}
function xml(body: string): FakeRoute {
  return { body, headers: { "content-type": "application/rss+xml" } };
}
function status(code: number): FakeRoute {
  return { status: code };
}
function redirect(location: string): FakeRoute {
  return { status: 302, headers: { location } };
}

function robotsOk(host: string): Record<string, FakeRoute> {
  return { [`https://${host}/robots.txt`]: text("User-agent: *\nAllow: /") };
}

function deps(http: ReturnType<typeof createFakeHttp>["http"]): CrawlDeps {
  const hits = new Map<string, number>();
  return {
    repo: {
      async hitRateLimit(bucket, limit) {
        const n = (hits.get(bucket) ?? 0) + 1;
        hits.set(bucket, n);
        return n <= limit;
      },
    },
    http,
    resolve: fakeResolve(),
    userAgent: UA,
  };
}

describe("discoverConsumption", () => {
  it("autodiscovery acha o RSS na home da Folha do Cerrado", async () => {
    const { http, calls } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": text(read("sites/folha-robots.txt")),
      "https://folhadocerrado.example/": html(read("sites/folha-home.html")),
      "https://folhadocerrado.example/feed": xml(read("feeds/folha-do-cerrado.xml")),
    });
    const r = await discoverConsumption(deps(http), new URL("https://folhadocerrado.example/"));
    expect(r).toMatchObject({
      ok: true,
      value: { strategy: "rss", feedUrl: "https://folhadocerrado.example/feed" },
    });
    expect(r.ok && r.value.entries).toHaveLength(25);
    expect(calls.map((c) => c.url)).toEqual([
      "https://folhadocerrado.example/robots.txt",
      "https://folhadocerrado.example/",
      "https://folhadocerrado.example/feed",
    ]);
  });

  it("link que já é feed não busca a home", async () => {
    const { http, calls } = createFakeHttp({
      ...robotsOk("folhadocerrado.example"),
      "https://folhadocerrado.example/feed": xml(read("feeds/folha-do-cerrado.xml")),
    });
    const r = await discoverConsumption(deps(http), new URL("https://folhadocerrado.example/feed"));
    expect(r).toMatchObject({ ok: true, value: { strategy: "rss" } });
    expect(calls.map((c) => c.url)).not.toContain("https://folhadocerrado.example/");
  });

  it("usa a linha Sitemap: do robots quando não há feed", async () => {
    const { http } = createFakeHttp({
      "https://portalvarzea.example/robots.txt": text(read("sites/portal-varzea-robots.txt")),
      "https://portalvarzea.example/": html(read("sites/portal-varzea-home.html")),
      "https://portalvarzea.example/sitemap-noticias.xml": xml(read("feeds/mt-agora.xml")),
    });
    const r = await discoverConsumption(deps(http), new URL("https://portalvarzea.example/"));
    expect(r).toMatchObject({
      ok: true,
      value: {
        strategy: "sitemap_news",
        kind: "sitemap",
        feedUrl: "https://portalvarzea.example/sitemap-noticias.xml",
      },
    });
  });

  it("sem feed nem sitemap vira página e lista o que tentou", async () => {
    const { http, calls } = createFakeHttp({
      "https://portalvarzea.example/robots.txt": text("User-agent: *\nAllow: /"),
      "https://portalvarzea.example/": html(read("sites/portal-varzea-home.html")),
    });
    const r = await discoverConsumption(deps(http), new URL("https://portalvarzea.example/"));
    expect(r).toMatchObject({ ok: true, value: { strategy: "page_article", kind: "page" } });
    expect(r.ok && r.value.tried).toHaveLength(7);
    expect(calls.length).toBe(8);
  });

  it("robots que proíbe o caminho encerra sem baixar a página", async () => {
    const { http, calls } = createFakeHttp({
      "https://proibido.example/robots.txt": text(read("sites/proibido-robots.txt")),
    });
    const r = await discoverConsumption(deps(http), new URL("https://proibido.example/noticias"));
    expect(r).toEqual({ ok: false, error: "robots_disallowed" });
    expect(calls).toHaveLength(1);
  });

  it("no máximo 8 requisições por análise", async () => {
    const { http, calls } = createFakeHttp({
      "https://naoexiste.example/robots.txt": status(404),
    });
    await discoverConsumption(deps(http), new URL("https://naoexiste.example/"));
    expect(calls.length).toBeLessThanOrEqual(8);
  });

  it("redirecionamento para IP interno é recusado sem chegar ao destino (Review Focus 1)", async () => {
    const { http, calls } = createFakeHttp({
      ...robotsOk("noticias.example"),
      "https://noticias.example/": redirect("http://169.254.169.254/latest/meta-data/"),
    });
    const r = await discoverConsumption(deps(http), new URL("https://noticias.example/"));
    expect(r).toEqual({ ok: false, error: "forbidden_host" });
    expect(calls.some((c) => c.url.includes("169.254.169.254"))).toBe(false);
  });
});
