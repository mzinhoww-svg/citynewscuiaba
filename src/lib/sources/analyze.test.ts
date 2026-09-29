import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { DEFAULT_USER_AGENT } from "@/lib/pipeline/http";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { createMemoryIngestRepo } from "@/lib/pipeline/testing/memory-ingest-repo";
import { analyzeLink, type AnalyzeDeps, type DiscoveryRecord, type DuplicateInfo } from "./analyze";
import { crawlDeps, fixturesEnabled } from "./http-deps";

const NOW = new Date("2026-09-27T18:00:00Z");
const fixture = (n: string) => readFileSync(join(process.cwd(), "tests/fixtures/sites", n), "utf8");
const text = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/plain" } });
const html = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/html" } });

const rss = (host: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Voz do Coxipó</title><link>https://${host}/</link>
${[1, 2, 3, 4, 5]
  .map(
    (i) =>
      `<item><title>Moradores do Coxipó pedem asfalto na rua ${i}</title><link>https://${host}/n/${i}</link><pubDate>Sun, 27 Sep 2026 1${i}:00:00 GMT</pubDate><description>CORPO-SECRETO-${i}</description></item>`,
  )
  .join("\n")}
</channel></rss>`;

const VOZ_HOME = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Voz do Coxipó</title>
<meta property="og:site_name" content="Voz do Coxipó"><meta name="description" content="Jornal de bairro do Coxipó, em Cuiabá.">
<link rel="alternate" type="application/rss+xml" href="/feed"></head><body><footer><a href="/termos">Termos de uso</a></footer></body></html>`;

/** Página sem feed, com cartões que os seletores do FakeProvider (article.card) alcançam. */
const LIST_HOME = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Jornal da Chapada</title></head><body>
<h1>Jornal da Chapada dos Guimarães</h1>
${[1, 2, 3, 4]
  .map(
    (i) =>
      `<article class="card"><a href="/n/${i}"><h2>Chapada recebe evento ${i}</h2></a><time datetime="2026-09-27T1${i}:00:00Z">27/09</time></article>`,
  )
  .join("\n")}
</body></html>`;

interface Rig {
  deps: AnalyzeDeps;
  saved: DiscoveryRecord[];
  calls: ReturnType<typeof createFakeHttp>["calls"];
  provider: ReturnType<typeof createFakeProvider>;
}
function rig(
  routes: Record<string, FakeRoute>,
  opts: {
    ai?: boolean;
    linkAnalysis?: boolean;
    duplicate?: DuplicateInfo | null;
  } = {},
): Rig {
  const { http, calls } = createFakeHttp(routes);
  const provider = createFakeProvider();
  const saved: DiscoveryRecord[] = [];
  const deps: AnalyzeDeps = {
    crawl: {
      repo: createMemoryIngestRepo([]),
      http,
      resolve: fakeResolve(),
      userAgent: DEFAULT_USER_AGENT,
    },
    callAgent: createCallAgent({ store: createMemoryAiStore(), provider, now: () => NOW }),
    linkAnalysisEnabled: async () => opts.linkAnalysis ?? true,
    aiEnabled: async () => opts.ai ?? true,
    sections: async () => ["cidade", "saude", "esportes"],
    findDuplicate: async () => opts.duplicate ?? null,
    saveDiscovery: async (r) => {
      saved.push(r);
      return `disc-${saved.length}`;
    },
    promptVersion: async () => 1,
    now: () => NOW,
  };
  return { deps, saved, calls, provider };
}

const vozRoutes = (): Record<string, FakeRoute> => ({
  "https://vozdocoxipo.example/robots.txt": text("User-agent: *\nDisallow: /admin"),
  "https://vozdocoxipo.example/": html(VOZ_HOME),
  "https://vozdocoxipo.example/feed": {
    body: rss("vozdocoxipo.example"),
    headers: { "content-type": "application/rss+xml" },
  },
});

describe("analyzeLink", () => {
  it("analisa a Voz do Coxipó com regra + IA e grava descoberta sem corpo", async () => {
    const { deps, saved } = rig(vozRoutes());
    const r = await analyzeLink("vozdocoxipo.example", deps);
    expect(r).toMatchObject({
      ok: true,
      value: {
        duplicate: null,
        rules: { name: { value: "Voz do Coxipó" } },
        aiStatus: "ok",
        discovery: { strategy: "rss", feedUrl: "https://vozdocoxipo.example/feed" },
      },
    });
    expect(r.ok && r.value.discoveryId).toBe("disc-1");
    expect(r.ok && r.value.preview?.items).toHaveLength(5);
    expect(JSON.stringify(saved[0])).not.toMatch(/body|excerpt|CORPO-SECRETO/);
    expect(JSON.stringify(r)).not.toMatch(/CORPO-SECRETO|"entries"|"html"/);
    expect(saved[0]?.promptVersion).toBe(1);
  });

  it("IA desligada segue sem sugestões", async () => {
    const { deps, provider } = rig(vozRoutes(), { ai: false });
    const r = await analyzeLink("https://vozdocoxipo.example/", deps);
    expect(r).toMatchObject({ ok: true, value: { aiStatus: "disabled", ai: null } });
    expect(provider.calls).toHaveLength(0);
  });

  it("sem itens suficientes a IA não é chamada (insufficient_data)", async () => {
    const two = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title>A</title><link>https://vozdocoxipo.example/n/1</link></item>
      <item><title>B</title><link>https://vozdocoxipo.example/n/2</link></item></channel></rss>`;
    const routes = vozRoutes();
    routes["https://vozdocoxipo.example/feed"] = {
      body: two,
      headers: { "content-type": "application/rss+xml" },
    };
    const { deps, provider } = rig(routes);
    const r = await analyzeLink("vozdocoxipo.example", deps);
    expect(r).toMatchObject({ ok: true, value: { aiStatus: "insufficient_data", ai: null } });
    expect(provider.calls).toHaveLength(0);
  });

  it("Folha do Cerrado já cadastrada é apontada como duplicada; arquivada oferece restaurar", async () => {
    const dup: DuplicateInfo = {
      id: "s1",
      name: "Folha do Cerrado",
      slug: "folha",
      archived: true,
    };
    const { deps, calls } = rig({}, { duplicate: dup });
    const r = await analyzeLink("https://folhadocerrado.example/", deps);
    expect(r).toMatchObject({
      ok: true,
      value: { duplicate: { id: "s1", archived: true }, discovery: null, aiStatus: "skipped" },
    });
    expect(calls).toHaveLength(0);
  });

  it("seletores que extraem menos de 3 itens são descartados", async () => {
    // Só 2 cartões: os seletores do FakeProvider (article.card) achariam 2 itens.
    const extra = `<nav><a href="/maisvistas/1">Mais lidas da Chapada dos Guimarães</a><a href="/maisvistas/2">Outra matéria em destaque na semana</a></nav>`;
    const two = (LIST_HOME + extra).replace(
      /<article class="card"><a href="\/n\/[34]">[\s\S]*?<\/article>\n?/g,
      "",
    );
    const { deps } = rig({
      "https://jornaldachapada.example/robots.txt": text("User-agent: *\nAllow: /"),
      "https://jornaldachapada.example/": html(two),
    });
    const r = await analyzeLink("jornaldachapada.example", deps);
    expect(r.ok && r.value.selectorsValidated).toBe(false);
    expect(r.ok && r.value.ai?.pageSelectors.value).toBeNull();
  });

  it("seletores que extraem 3 ou mais itens ficam e a fonte vira lista de página", async () => {
    const { deps } = rig({
      "https://jornaldachapada.example/robots.txt": text("User-agent: *\nAllow: /"),
      "https://jornaldachapada.example/": html(LIST_HOME),
    });
    const r = await analyzeLink("jornaldachapada.example", deps);
    expect(r.ok && r.value.selectorsValidated).toBe(true);
    expect(r.ok && r.value.ai?.pageSelectors.value).toMatchObject({ item: "article.card" });
    expect(r.ok && r.value.discovery?.strategy).toBe("page_list");
  });

  it("endereço interno por redirecionamento é recusado sem tocar o IP (Review Focus 1)", async () => {
    const { deps, calls } = rig({
      "https://noticias.example/robots.txt": text("User-agent: *\nAllow: /"),
      "https://noticias.example/": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      },
    });
    const r = await analyzeLink("https://noticias.example/", deps);
    expect(r).toEqual({ ok: false, error: "forbidden_host" });
    expect(JSON.stringify(calls)).not.toContain("169.254.169.254/latest");
  });

  it("robots que proíbe recusa a análise", async () => {
    const { deps } = rig({
      "https://proibido.example/robots.txt": text(fixture("proibido-robots.txt")),
    });
    const r = await analyzeLink("proibido.example", deps);
    expect(r).toEqual({ ok: false, error: "robots_disallowed" });
  });

  it("flag source_link_analysis desligada recusa; link inválido volta erro de URL", async () => {
    expect(await analyzeLink("x.example", rig({}, { linkAnalysis: false }).deps)).toEqual({
      ok: false,
      error: "disabled",
    });
    expect(await analyzeLink("http://127.0.0.1/", rig({}).deps)).toEqual({
      ok: false,
      error: "forbidden_host",
    });
    expect(await analyzeLink("   ", rig({}).deps)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("http-deps", () => {
  it("CRAWLER_FIXTURES é ignorado em produção", async () => {
    expect(fixturesEnabled({ NODE_ENV: "production", CRAWLER_FIXTURES: "1" })).toBe(false);
    expect(fixturesEnabled({ NODE_ENV: "development", CRAWLER_FIXTURES: "1" })).toBe(true);
    expect(fixturesEnabled({ NODE_ENV: "test", CRAWLER_FIXTURES: "" })).toBe(false);
    let seen = "";
    const real: typeof fetch = async (input) => {
      seen = String(input);
      return new Response("ok");
    };
    const d = crawlDeps({ NODE_ENV: "production", CRAWLER_FIXTURES: "1" }, { fetch: real });
    await d.http("https://folhadocerrado.example/x", {
      headers: {},
      redirect: "manual",
    });
    expect(seen).toBe("https://folhadocerrado.example/x");
  });

  it("com fixtures, hosts *.example são servidos de tests/fixtures e o resto dá 404", async () => {
    const d = crawlDeps({ NODE_ENV: "development", CRAWLER_FIXTURES: "1" });
    const init = { headers: {}, redirect: "manual" as const };
    const robots = await d.http("https://folhadocerrado.example/robots.txt", init);
    expect(await robots.text()).toContain("User-agent");
    const home = await d.http("https://folhadocerrado.example/", init);
    expect(await home.text()).toContain("Folha do Cerrado");
    expect((await d.http("https://desconhecido.example/", init)).status).toBe(404);
    expect((await d.http("https://exemplo.com.br/", init)).status).toBe(404);
  });
});
