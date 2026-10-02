import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { analyzeLink, matchDuplicate, type AnalyzeDeps, type ExistingSource } from "./analyze";
import { crawlDeps, realHttp } from "./http-deps";

const NOW = new Date("2026-09-27T18:00:00Z");
const UA = "CityNewsBot/1.0";

const text = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/plain" } });
const html = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/html" } });
const xml = (body: string): FakeRoute => ({
  body,
  headers: { "content-type": "application/rss+xml" },
});
const fixture = (p: string) => readFileSync(join(process.cwd(), "tests/fixtures", p), "utf-8");

const VOZ_HOME = `<!doctype html><html lang="pt-BR"><head>
<title>Início | Voz do Coxipó</title>
<meta property="og:site_name" content="Voz do Coxipó" />
<meta name="description" content="Notícias do Coxipó e de Cuiabá (fixture de teste)." />
<link rel="alternate" type="application/rss+xml" title="Voz do Coxipó" href="/feed" />
</head><body><h1>Voz do Coxipó</h1><a href="/termos-de-uso">Termos de uso</a></body></html>`;

/** 5 itens, um a cada 2 h: cadência sugere 60 min. O corpo nunca pode sair daqui. */
function vozFeed(): string {
  const items = Array.from({ length: 5 }, (_, i) => {
    const at = new Date(NOW.getTime() - (i + 1) * 2 * 3_600_000).toUTCString();
    return `<item><title>Coxipó recebe obra número ${i + 1}</title>
<link>https://vozdocoxipo.example/noticias/obra-${i + 1}</link>
<pubDate>${at}</pubDate>
<description>CORPO-SECRETO da matéria ${i + 1}</description></item>`;
  }).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Voz do Coxipó</title>${items}</channel></rss>`;
}

const VOZ: Record<string, FakeRoute> = {
  "https://vozdocoxipo.example/robots.txt": text("User-agent: *\nAllow: /"),
  "https://vozdocoxipo.example/": html(VOZ_HOME),
  "https://vozdocoxipo.example/feed": xml(vozFeed()),
};

const FOLHA: Record<string, FakeRoute> = {
  "https://folhadocerrado.example/robots.txt": text(fixture("sites/folha-robots.txt")),
  "https://folhadocerrado.example/": html(fixture("sites/folha-home.html")),
  "https://folhadocerrado.example/feed": xml(fixture("feeds/folha-do-cerrado.xml")),
};

let saved: unknown = null;
const savedDiscovery = () => saved;

function depsWithFakes(
  opts: {
    routes?: Record<string, FakeRoute>;
    aiEnabled?: boolean;
    analysisEnabled?: boolean;
    existing?: ExistingSource[];
  } = {},
) {
  saved = null;
  const { http, calls } = createFakeHttp({ ...VOZ, ...opts.routes });
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const deps: AnalyzeDeps = {
    crawl: {
      repo: { hitRateLimit: async () => true },
      http,
      resolve: fakeResolve(),
      userAgent: UA,
    },
    callAgent: createCallAgent({ store, provider: fake, now: () => NOW }),
    isEnabled: async (flag) =>
      flag === "ai_enabled" ? (opts.aiEnabled ?? true) : (opts.analysisEnabled ?? true),
    existingSources: async () => opts.existing ?? [],
    sections: async () => ["cidade", "politica", "economia"],
    saveDiscovery: async (record) => {
      saved = record;
      return "disc-1";
    },
    promptVersion: async () => 1,
    now: () => NOW,
  };
  return { deps, calls, fake };
}

describe("analyzeLink", () => {
  it("analisa a Voz do Coxipó com regra + IA e grava descoberta sem corpo", async () => {
    const { deps, fake } = depsWithFakes();
    const r = await analyzeLink("vozdocoxipo.example", deps);
    expect(r).toMatchObject({
      ok: true,
      value: {
        status: "analyzed",
        url: "https://vozdocoxipo.example/",
        duplicate: null,
        rules: { name: { value: "Voz do Coxipó" }, frequency: { value: 60 } },
        aiStatus: "ok",
        ai: { categories: { value: ["cidade"], origin: "ia" } },
        selectorsValidated: false,
        discoveryId: "disc-1",
        discovery: { strategy: "rss", feedUrl: "https://vozdocoxipo.example/feed" },
      },
    });
    if (!r.ok || r.value.status !== "analyzed") throw new Error("falhou");
    expect(r.value.preview.items).toHaveLength(5);
    expect(r.value.termsLinks).toEqual(["https://vozdocoxipo.example/termos-de-uso"]);
    expect(r.value.consumption).toMatchObject({
      strategy: "rss",
      feedUrl: "https://vozdocoxipo.example/feed",
      robots: { crawlDelaySec: null },
      discovery: { by: "auto", inputUrl: "vozdocoxipo.example" },
    });
    // Nada de corpo nem HTML: no retorno (vai ao navegador), no modelo e no banco.
    expect(JSON.stringify(r.value)).not.toMatch(/CORPO-SECRETO|<html/);
    expect(fake.lastPrompt).not.toContain("CORPO-SECRETO");
    expect(JSON.stringify(savedDiscovery())).not.toMatch(/body|excerpt|CORPO-SECRETO/);
    expect(savedDiscovery()).toMatchObject({
      inputUrl: "vozdocoxipo.example",
      finalUrl: "https://vozdocoxipo.example/feed",
      promptVersion: 1,
    });
  });

  it("IA desligada segue sem sugestões", async () => {
    const { deps, fake } = depsWithFakes({ aiEnabled: false });
    const r = await analyzeLink("https://vozdocoxipo.example/", deps);
    expect(r).toMatchObject({ ok: true, value: { aiStatus: "disabled", ai: null } });
    expect(fake.calls).toHaveLength(0);
  });

  it("Folha do Cerrado já cadastrada é apontada como duplicada sem nenhuma requisição; arquivada oferece restaurar", async () => {
    const folha: ExistingSource = {
      id: "s-folha",
      name: "Folha do Cerrado",
      baseUrl: "https://folhadocerrado.example",
      feedUrl: "https://folhadocerrado.example/feed",
      archived: false,
    };
    const active = depsWithFakes({ routes: FOLHA, existing: [folha] });
    expect(await analyzeLink("https://folhadocerrado.example/", active.deps)).toEqual({
      ok: true,
      value: {
        status: "duplicate",
        url: "https://folhadocerrado.example/",
        duplicate: { id: "s-folha", name: "Folha do Cerrado", archived: false },
      },
    });
    expect(active.calls).toHaveLength(0);
    expect(saved).toBeNull();
    const archived = depsWithFakes({ routes: FOLHA, existing: [{ ...folha, archived: true }] });
    expect(
      await analyzeLink("https://www.folhadocerrado.example/feed", archived.deps),
    ).toMatchObject({
      ok: true,
      value: { status: "duplicate", duplicate: { id: "s-folha", archived: true } },
    });
    expect(archived.calls).toHaveLength(0);
  });

  it("seletores que extraem menos de 3 itens são descartados", async () => {
    const page = `<!doctype html><html><head><title>Jornal da Chapada</title></head><body>
<article class="card"><a href="/n/um"><h2>Primeira notícia da Chapada hoje</h2></a></article>
<article class="card"><a href="/n/dois"><h2>Segunda notícia da Chapada hoje</h2></a></article>
<div class="teaser"><h3><a href="/n/tres">Terceira notícia da Chapada hoje</a></h3></div>
<div class="teaser"><h3><a href="/n/quatro">Quarta notícia da Chapada hoje</a></h3></div>
</body></html>`;
    const { deps, fake } = depsWithFakes({
      routes: {
        "https://jornaldachapada.example/robots.txt": text("User-agent: *\nAllow: /"),
        "https://jornaldachapada.example/secao": html(page),
      },
    });
    const r = await analyzeLink("https://jornaldachapada.example/secao", deps);
    expect(fake.calls).toHaveLength(1);
    expect(fake.lastPrompt).toContain("estrutura");
    expect(r).toMatchObject({
      ok: true,
      value: {
        aiStatus: "ok",
        selectorsValidated: false,
        ai: { pageSelectors: { value: null } },
        discovery: { strategy: "page_article" },
      },
    });
  });

  it("seletores da IA que extraem 3 itens do mesmo site viram page_list", async () => {
    const { deps } = depsWithFakes({
      routes: {
        "https://mtagora.example/robots.txt": text("User-agent: *\nAllow: /"),
        "https://mtagora.example/cidades": html(fixture("sites/secao-mt-agora.html")),
      },
    });
    const r = await analyzeLink("https://mtagora.example/cidades", deps);
    expect(r).toMatchObject({
      ok: true,
      value: {
        selectorsValidated: true,
        discovery: { strategy: "page_list", kind: "page" },
        consumption: {
          strategy: "page_list",
          pageSelectors: { item: "article.card", link: "a", title: "h2", date: "time" },
        },
      },
    });
    if (!r.ok || r.value.status !== "analyzed") throw new Error("falhou");
    expect(r.value.preview.items).toHaveLength(3);
    expect(r.value.preview.items.every((i) => i.url.startsWith("https://mtagora.example/"))).toBe(
      true,
    );
  });

  it("flag source_link_analysis desligada recusa a análise sem requisição", async () => {
    const { deps, calls } = depsWithFakes({ analysisEnabled: false });
    expect(await analyzeLink("https://vozdocoxipo.example/", deps)).toEqual({
      ok: false,
      error: "disabled",
    });
    expect(calls).toHaveLength(0);
  });

  it("endereço inválido e robots.txt que proíbe voltam como erro tipado", async () => {
    const { deps } = depsWithFakes({
      routes: { "https://vozdocoxipo.example/robots.txt": text("User-agent: *\nDisallow: /") },
    });
    expect(await analyzeLink("ftp://vozdocoxipo.example/", deps)).toEqual({
      ok: false,
      error: "scheme",
    });
    expect(await analyzeLink("https://vozdocoxipo.example/", deps)).toEqual({
      ok: false,
      error: "robots_disallowed",
    });
    expect(saved).toBeNull();
  });

  it("Crawl-delay do robots.txt limita o limite por hora e fica no consumo", async () => {
    const { deps } = depsWithFakes({
      routes: {
        "https://vozdocoxipo.example/robots.txt": text("User-agent: *\nCrawl-delay: 600\nAllow: /"),
      },
    });
    const r = await analyzeLink("https://vozdocoxipo.example/", deps);
    expect(r).toMatchObject({
      ok: true,
      value: {
        rules: { rateLimitPerHour: { value: 6 } },
        consumption: { robots: { crawlDelaySec: 600 } },
      },
    });
  });
});

describe("matchDuplicate", () => {
  const list: ExistingSource[] = [
    {
      id: "a",
      name: "A",
      baseUrl: "https://www.site.example",
      feedUrl: "https://www.site.example/rss",
      archived: false,
    },
    {
      id: "b",
      name: "B",
      baseUrl: "https://outro.example/cidades",
      feedUrl: null,
      archived: false,
    },
  ];
  it("mesmo host (com ou sem www) e mesmo caminho", () => {
    expect(matchDuplicate(new URL("https://site.example/"), list)?.id).toBe("a");
    expect(matchDuplicate(new URL("https://site.example/rss"), list)?.id).toBe("a");
    expect(matchDuplicate(new URL("https://outro.example/cidades"), list)?.id).toBe("b");
    expect(matchDuplicate(new URL("https://outro.example/esportes"), list)).toBeNull();
    expect(matchDuplicate(new URL("https://novo.example/"), list)).toBeNull();
  });
});

describe("crawlDeps", () => {
  const repo = { hitRateLimit: async () => true };

  it("CRAWLER_FIXTURES é ignorado em produção", () => {
    const deps = crawlDeps({ repo, env: { CRAWLER_FIXTURES: "1", NODE_ENV: "production" } });
    expect(deps.http).toBe(realHttp);
  });

  it("sem CRAWLER_FIXTURES usa fetch real", () => {
    expect(crawlDeps({ repo, env: { NODE_ENV: "development" } }).http).toBe(realHttp);
  });

  it("com CRAWLER_FIXTURES fora de produção serve as fixtures de *.example e nada mais", async () => {
    const deps = crawlDeps({ repo, env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" } });
    expect(deps.http).not.toBe(realHttp);
    const robots = await deps.http("https://folhadocerrado.example/robots.txt", { headers: {} });
    expect(await robots.text()).toBe(fixture("sites/folha-robots.txt"));
    const feed = await deps.http("https://folhadocerrado.example/feed", { headers: {} });
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toMatch(/xml/);
    const home = await deps.http("https://www.folhadocerrado.example/", { headers: {} });
    expect(await home.text()).toContain("Folha do Cerrado");
    expect((await deps.http("https://folhadocerrado.example/nada", { headers: {} })).status).toBe(
      404,
    );
    await expect(deps.http("https://www.exemplo.com.br/", { headers: {} })).rejects.toThrow();
    expect(await deps.resolve("folhadocerrado.example")).toHaveLength(1);
  });
});
