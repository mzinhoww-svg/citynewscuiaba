import type { FrontSignalInput, FrontpageRepo, SourceRecord } from "../ports";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import {
  FRONTPAGE_HTML_BYTES,
  frontpageEnabled,
  parseFrontTop,
  runFrontpage,
  type FrontpageDeps,
} from "./frontpage";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const FOLHA = "https://folhadocerrado.example";
const MT = "https://www.mtagora.example";

/** Portal fictício: menu, hero, lista, tags, rodapé. */
const HOME = `<!doctype html><html><head><meta charset="utf-8"><title>Folha do Cerrado</title></head>
<body>
  <header class="site-header">
    <a href="/">Folha do Cerrado</a>
    <nav>
      <a href="/politica">Política</a>
      <a href="/cidades">Cidades</a>
      <a href="/noticias/menu-destaque-fixo-no-topo-do-site">Especial fixo do menu</a>
    </nav>
  </header>
  <div class="menu"><a href="/esportes/">Esportes</a></div>
  <main>
    <section class="hero">
      <a href="/cidades/ponte-do-coxipo-sera-interditada-para-obras?utm_source=home#topo">
        <img src="/img/ponte.jpg" alt="">
      </a>
      <h1><a href="/cidades/ponte-do-coxipo-sera-interditada-para-obras">Ponte do Coxipó será interditada para obras</a></h1>
    </section>
    <a href="https://outro-portal.example/noticias/materia-de-outro-portal-sobre-cuiaba">Outro portal</a>
    <a href="/editoria/cidades">Mais de Cidades</a>
    <ul class="lista">
      <li><a href="/politica/camara-aprova-orcamento-de-2027-em-primeira-votacao">Câmara aprova orçamento</a></li>
      <li><a href="/noticia/482913">Chuva volta a Cuiabá no fim de semana</a></li>
      <li><a href="/economia/feira-do-porto-amplia-horario-aos-sabados">Feira do Porto amplia horário</a></li>
    </ul>
    <div class="tags"><a href="/tag/chuva-em-cuiaba-hoje-agora">chuva em cuiabá hoje agora</a></div>
  </main>
  <footer><a href="/expediente/quem-somos-e-como-trabalhamos">Expediente</a></footer>
</body></html>`;

describe("parseFrontTop", () => {
  it("devolve os 3 primeiros links de matéria do topo, em ordem, sem menu, rodapé nem repetidos", () => {
    expect(parseFrontTop(HOME, `${FOLHA}/`)).toEqual([
      { url: `${FOLHA}/cidades/ponte-do-coxipo-sera-interditada-para-obras`, rank: 1 },
      { url: `${FOLHA}/politica/camara-aprova-orcamento-de-2027-em-primeira-votacao`, rank: 2 },
      { url: `${FOLHA}/noticia/482913`, rank: 3 },
    ]);
  });

  it("ignora link de outro domínio, editoria curta, raiz de seção e tags", () => {
    const urls = parseFrontTop(HOME, `${FOLHA}/`, 10).map((l) => l.url);
    expect(urls.some((u) => u.includes("outro-portal"))).toBe(false);
    expect(urls.some((u) => u.includes("/editoria/") || u.endsWith("/cidades"))).toBe(false);
    expect(urls.some((u) => u.includes("/tag/"))).toBe(false);
    expect(urls.some((u) => u.includes("menu-destaque") || u.includes("expediente"))).toBe(false);
    expect(urls).toHaveLength(4);
  });

  it("aceita www. e a mesma origem sem www.; sem <main> usa o corpo", () => {
    const html = `<body><nav><a href="/noticias/item-do-menu-nao-conta-aqui">x</a></nav>
      <div><a href="https://mtagora.example/cidades/obra-na-avenida-do-cpa-comeca-segunda">Obra</a></div></body>`;
    expect(parseFrontTop(html, `${MT}/`)).toEqual([
      { url: "https://mtagora.example/cidades/obra-na-avenida-do-cpa-comeca-segunda", rank: 1 },
    ]);
  });

  it("HTML vazio ou sem links devolve lista vazia", () => {
    expect(parseFrontTop("", `${FOLHA}/`)).toEqual([]);
    expect(parseFrontTop("<p>nada</p>", `${FOLHA}/`)).toEqual([]);
  });
});

describe("frontpageEnabled", () => {
  it("só liga com consumption.frontpage === true", () => {
    expect(frontpageEnabled({ strategy: "rss", frontpage: true })).toBe(true);
    expect(frontpageEnabled({ strategy: "rss" })).toBe(false);
    expect(frontpageEnabled({ frontpage: "true" })).toBe(false);
    expect(frontpageEnabled(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Passo `frontpage`
// ---------------------------------------------------------------------------
const source = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "src-folha",
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  baseUrl: FOLHA,
  kind: "rss",
  feedUrl: `${FOLHA}/feed`,
  status: "active",
  statusReason: null,
  consecutiveFailures: 0,
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
  consumption: { strategy: "rss", frontpage: true },
  ...over,
});

const html200 = (body: string): FakeRoute => ({
  body,
  headers: { "content-type": "text/html; charset=utf-8" },
});

function setup(opts: {
  sources: SourceRecord[];
  routes: Record<string, FakeRoute>;
  items?: { id: string; canonicalUrl: string; topicId: string | null }[];
  limit?: number;
}) {
  const recorded: FrontSignalInput[] = [];
  const hits = new Map<string, number>();
  const repo: FrontpageRepo = {
    async frontpageSources() {
      // O banco já filtra; o passo confere de novo (defesa).
      return opts.sources;
    },
    async itemsByUrls(urls) {
      return (opts.items ?? []).filter((i) => urls.includes(i.canonicalUrl));
    },
    async record(signals) {
      recorded.push(...signals);
    },
    async hitRateLimit(bucket, limit) {
      const n = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, n);
      return n <= (opts.limit ?? limit);
    },
  };
  const t = createFakeHttp(opts.routes);
  const deps: FrontpageDeps = {
    repo,
    http: t.http,
    resolve: fakeResolve(),
    userAgent: UA,
  };
  return { deps, recorded, calls: t.calls };
}

describe("runFrontpage", () => {
  it("lê robots e a home (512 KB, UA do projeto) e grava sinais casados e não casados", async () => {
    const PONTE = `${FOLHA}/cidades/ponte-do-coxipo-sera-interditada-para-obras`;
    const s = setup({
      sources: [source()],
      routes: {
        [`${FOLHA}/robots.txt`]: { body: "User-agent: *\nAllow: /" },
        [`${FOLHA}/`]: html200(HOME),
      },
      items: [{ id: "item-ponte", canonicalUrl: PONTE, topicId: "topic-ponte" }],
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls.map((c) => c.url)).toEqual([`${FOLHA}/robots.txt`, `${FOLHA}/`]);
    expect(s.calls[1]!.headers.get("user-agent")).toBe(UA);
    expect(FRONTPAGE_HTML_BYTES).toBe(512 * 1024);
    expect(s.recorded).toEqual([
      { sourceId: "src-folha", itemId: "item-ponte", topicId: "topic-ponte", url: PONTE, rank: 1 },
      {
        sourceId: "src-folha",
        itemId: null,
        topicId: null,
        url: `${FOLHA}/politica/camara-aprova-orcamento-de-2027-em-primeira-votacao`,
        rank: 2,
      },
      {
        sourceId: "src-folha",
        itemId: null,
        topicId: null,
        url: `${FOLHA}/noticia/482913`,
        rank: 3,
      },
    ]);
    // Só URL, posição e fonte: nenhum texto da página.
    for (const sig of s.recorded)
      expect(Object.keys(sig).sort()).toEqual(["itemId", "rank", "sourceId", "topicId", "url"]);
    expect(r).toMatchObject({ sources: 1, read: 1, signals: 3, matched: 1 });
  });

  it("fonte sem frontpage (ou inativa) não faz nada", async () => {
    const s = setup({
      sources: [
        source({ consumption: { strategy: "rss" } }),
        source({ id: "src-2", slug: "mt-agora", status: "paused" }),
      ],
      routes: {},
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls).toHaveLength(0);
    expect(s.recorded).toHaveLength(0);
    expect(r.read).toBe(0);
  });

  it("robots.txt que proíbe / pula a fonte sem baixar a home", async () => {
    const s = setup({
      sources: [source()],
      routes: {
        [`${FOLHA}/robots.txt`]: { body: "User-agent: *\nDisallow: /" },
        [`${FOLHA}/`]: html200(HOME),
      },
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls.map((c) => c.url)).toEqual([`${FOLHA}/robots.txt`]);
    expect(s.recorded).toHaveLength(0);
    expect(r.skipped).toMatchObject({ robots: 1 });
  });

  it("429 na home pula sem erro", async () => {
    const s = setup({
      sources: [source()],
      routes: { [`${FOLHA}/robots.txt`]: { status: 404 }, [`${FOLHA}/`]: { status: 429 } },
    });
    const r = await runFrontpage(s.deps);
    expect(s.recorded).toHaveLength(0);
    expect(r.skipped).toMatchObject({ http: 1 });
  });

  it("limite por hora da fonte esgotado pula sem erro e sem requisição", async () => {
    const s = setup({
      sources: [source()],
      routes: { [`${FOLHA}/robots.txt`]: { status: 404 }, [`${FOLHA}/`]: html200(HOME) },
      limit: 0,
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls).toHaveLength(0);
    expect(s.recorded).toHaveLength(0);
    expect(r.skipped).toMatchObject({ rate_limited: 1 });
  });

  it("limite atingido entre o robots e a home também pula", async () => {
    const s = setup({
      sources: [source()],
      routes: { [`${FOLHA}/robots.txt`]: { status: 404 }, [`${FOLHA}/`]: html200(HOME) },
      limit: 1,
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls.map((c) => c.url)).toEqual([`${FOLHA}/robots.txt`]);
    expect(r.skipped).toMatchObject({ rate_limited: 1 });
  });

  it("a mesma fonte não grava o mesmo URL duas vezes no ciclo (variações canônicas iguais)", async () => {
    const DUP = `<main>
      <a href="/cidades/ponte-do-coxipo-sera-interditada-para-obras/">A</a>
      <a href="https://folhadocerrado.example/cidades/ponte-do-coxipo-sera-interditada-para-obras?utm_medium=x">B</a>
      <a href="http://www.folhadocerrado.example/cidades/ponte-do-coxipo-sera-interditada-para-obras#c">C</a>
      <a href="/cidades/feira-do-porto-amplia-horario-aos-sabados">D</a>
    </main>`;
    const s = setup({
      sources: [source(), source()],
      routes: { [`${FOLHA}/robots.txt`]: { status: 404 }, [`${FOLHA}/`]: html200(DUP) },
    });
    await runFrontpage(s.deps);
    expect(s.recorded.map((r) => [r.url, r.rank])).toEqual([
      [`${FOLHA}/cidades/ponte-do-coxipo-sera-interditada-para-obras`, 1],
      [`${FOLHA}/cidades/feira-do-porto-amplia-horario-aos-sabados`, 2],
    ]);
  });

  it("redirecionamento para outro site não é seguido", async () => {
    const s = setup({
      sources: [source()],
      routes: {
        [`${FOLHA}/robots.txt`]: { status: 404 },
        [`${FOLHA}/`]: { status: 302, headers: { location: "https://outro-portal.example/" } },
      },
    });
    const r = await runFrontpage(s.deps);
    expect(s.calls.map((c) => c.url)).not.toContain("https://outro-portal.example/");
    expect(s.recorded).toHaveLength(0);
    expect(r.skipped).toMatchObject({ network: 1 });
  });

  it("erro de uma fonte não derruba as outras", async () => {
    const s = setup({
      sources: [source({ id: "a", slug: "a", baseUrl: "https://quebrado.example" }), source()],
      routes: {
        "https://quebrado.example/robots.txt": { status: 503 },
        [`${FOLHA}/robots.txt`]: { status: 404 },
        [`${FOLHA}/`]: html200(HOME),
      },
    });
    const r = await runFrontpage(s.deps);
    expect(s.recorded.every((x) => x.sourceId === "src-folha")).toBe(true);
    expect(s.recorded).toHaveLength(3);
    expect(r.skipped).toMatchObject({ robots_unavailable: 1 });
  });
});
