import { readFixture } from "../../../tests/fixtures/read";
import { activateSource } from "./activate-source";
import type { SourceRecord } from "./ports";
import { createFakeHttp, fakeResolve } from "./testing/fake-http";
import { createMemoryIngestRepo } from "./testing/memory-ingest-repo";

const UA = "CityNewsBot/1.0";
const NOW = new Date("2026-09-27T18:45:00Z");
const paused: SourceRecord = {
  id: "src-varzea",
  slug: "portal-varzea",
  name: "Portal Várzea",
  baseUrl: "https://portalvarzea.example",
  kind: "rss",
  feedUrl: null,
  status: "paused",
  rateLimitPerHour: 60,
  locality: "varzea-grande",
  etag: null,
  lastModified: null,
};
const atom = {
  body: readFixture("portal-varzea.xml"),
  headers: { "content-type": "application/atom+xml" },
};
const home = (head: string) => ({ body: `<html><head>${head}</head><body></body></html>` });

function run(routes: Parameters<typeof createFakeHttp>[0], source = paused) {
  const { http, calls } = createFakeHttp(routes);
  const repo = createMemoryIngestRepo([source]);
  return {
    repo,
    calls,
    result: activateSource(source.slug, {
      repo,
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => NOW,
    }),
  };
}

describe("activateSource", () => {
  it("descobre por autodiscovery, checa robots, testa a conexão e ativa", async () => {
    const t = run({
      "https://portalvarzea.example/robots.txt": { body: "User-agent: *\nDisallow: /admin" },
      "https://portalvarzea.example": home(
        '<link rel="alternate" type="application/atom+xml" href="/atom.xml">',
      ),
      "https://portalvarzea.example/atom.xml": atom,
    });
    expect(await t.result).toEqual({
      ok: true,
      value: { kind: "rss", feedUrl: "https://portalvarzea.example/atom.xml", entries: 3 },
    });
    expect(t.repo.source("portal-varzea")).toMatchObject({
      status: "active",
      feedUrl: "https://portalvarzea.example/atom.xml",
      lastError: null,
    });
  });

  it("sem autodiscovery, tenta /feed, /rss e /sitemap-news.xml", async () => {
    const t = run({
      "https://portalvarzea.example/robots.txt": { status: 404 },
      "https://portalvarzea.example": home(""),
      "https://portalvarzea.example/sitemap-news.xml": {
        body: readFixture("mt-agora.xml"),
        headers: { "content-type": "application/xml" },
      },
    });
    expect(await t.result).toMatchObject({
      ok: true,
      value: { kind: "sitemap", feedUrl: "https://portalvarzea.example/sitemap-news.xml" },
    });
    expect(t.calls.map((c) => c.url)).toEqual([
      "https://portalvarzea.example/robots.txt",
      "https://portalvarzea.example",
      "https://portalvarzea.example/feed",
      "https://portalvarzea.example/rss",
      "https://portalvarzea.example/sitemap-news.xml",
    ]);
  });

  it("robots.txt que bloqueia o feed: continua pausada com o motivo", async () => {
    const t = run({
      "https://portalvarzea.example/robots.txt": { body: "User-agent: *\nDisallow: /atom.xml" },
      "https://portalvarzea.example": home(
        '<link rel="alternate" type="application/atom+xml" href="/atom.xml">',
      ),
      "https://portalvarzea.example/atom.xml": atom,
    });
    const r = await t.result;
    expect(r.ok).toBe(false);
    expect(t.repo.source("portal-varzea")).toMatchObject({ status: "paused" });
    expect(t.repo.source("portal-varzea")!.lastError).toMatch(/robots\.txt/);
    expect(t.calls.map((c) => c.url)).not.toContain("https://portalvarzea.example/atom.xml");
  });

  it("feed configurado que não responde: continua pausada com o motivo", async () => {
    const t = run(
      { "https://portalvarzea.example/robots.txt": { status: 404 } },
      { ...paused, feedUrl: "https://portalvarzea.example/feed" },
    );
    expect((await t.result).ok).toBe(false);
    expect(t.repo.source("portal-varzea")!.lastError).toMatch(/HTTP 404/);
  });

  it("nenhum feed encontrado", async () => {
    const t = run({
      "https://portalvarzea.example/robots.txt": { status: 404 },
      "https://portalvarzea.example": home(""),
    });
    expect(await t.result).toEqual({ ok: false, error: expect.stringMatching(/nenhum feed/i) });
    expect(t.repo.source("portal-varzea")!.status).toBe("paused");
  });

  it("fonte bloqueada nunca é ativada", async () => {
    const t = run({}, { ...paused, status: "blocked" });
    expect((await t.result).ok).toBe(false);
    expect(t.calls).toHaveLength(0);
  });
});
