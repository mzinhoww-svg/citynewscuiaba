import { readFixture } from "../../../../tests/fixtures/read";
import { drain } from "../drain";
import type { SourceRecord } from "../ports";
import { createRunStep, type StepHandlers } from "../run-step";
import { SITEMAP_PREFIX_BYTES } from "../sitemap";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import { createMemoryIngestRepo } from "../testing/memory-ingest-repo";
import { createMemoryQueue } from "../testing/memory-queue";
import { createIngestHandlers } from ".";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const NOW = new Date("2026-10-02T17:00:00Z");
const HOST = "https://portal-do-pantanal.example";

const source = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "src-pantanal",
  slug: "portal-do-pantanal",
  name: "Portal do Pantanal",
  baseUrl: HOST,
  kind: "sitemap",
  feedUrl: `${HOST}/sitemap/geral/2025.xml`,
  status: "active",
  statusReason: null,
  consecutiveFailures: 0,
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
  consumption: { strategy: "sitemap_news", enrich: false },
  ...over,
});

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

/** Sitemap anual grande: `n` URLs do mais novo ao mais antigo, com inversões locais no começo. */
function bigSitemap(n: number): string {
  const base = Date.parse("2026-10-02T16:00:00Z");
  const blocks: string[] = [];
  for (let i = 0; i < n; i++) {
    // pares trocados nas 50 primeiras: desordem local
    const order = i < 50 ? (i % 2 === 0 ? Math.min(i + 1, 49) : i - 1) : i;
    const lastmod = new Date(base - order * 60_000).toISOString();
    blocks.push(
      `  <url>\n    <loc>${HOST}/noticias/materia-numero-${i}-sobre-assunto-local</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`,
    );
  }
  return `${HEAD}${blocks.join("")}</urlset>`;
}

function setup(
  routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>,
  src = source(),
  now = NOW,
) {
  const { http, calls } = createFakeHttp(routes);
  const repo = createMemoryIngestRepo([src]);
  const queue = createMemoryQueue();
  const dedupe: string[] = [];
  const handlers: StepHandlers = {
    ...createIngestHandlers({ repo, http, resolve: fakeResolve(), userAgent: UA, now: () => now }),
    dedupe: async (m) => {
      dedupe.push(m.itemRef);
      return { ok: true, value: [] };
    },
  };
  const run = async () => {
    await queue.enqueue("pipeline", {
      runId: "run-1",
      step: "fetch",
      itemRef: `source:${src.slug}`,
      attempt: 1,
    });
    return drain({
      queue,
      runStep: createRunStep(handlers),
      events: { record: async () => {} },
      now: () => 0,
      queues: ["pipeline"],
    });
  };
  return { repo, calls, dedupe, run };
}

const xml = (body: string): FakeRoute => ({
  body,
  headers: { "content-type": "application/xml" },
});

describe("sitemap incremental: fetch → validate → extract → normalize", () => {
  it("arquivo anual grande: lê só o prefixo, repara o corte e coleta os 200 mais novos", async () => {
    const big = bigSitemap(5000);
    expect(big.length).toBeGreaterThan(SITEMAP_PREFIX_BYTES * 1.5);
    const t = setup({
      [`${HOST}/robots.txt`]: { body: "User-agent: *\nAllow: /" },
      [`${HOST}/sitemap/geral/2026.xml`]: xml(big),
    });
    const r = await t.run();
    expect(r.quarantined).toBe(0);
    const raw = t.repo.raw()[0]!;
    expect(raw.state).toBe("extracted");
    expect(raw.payload.truncated).toBe(true);
    expect(raw.payload.body.length).toBeLessThanOrEqual(SITEMAP_PREFIX_BYTES);
    expect(raw.entries).toHaveLength(200);
    expect(t.repo.collected()).toHaveLength(200);
    expect(t.dedupe).toHaveLength(200);
    // O mais novo vem primeiro, apesar da inversão local do arquivo (índices 0 e 1 trocados).
    const dates = raw.entries!.map((e) => e.publishedAt!);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(raw.entries![0]!.title).toMatch(/^Materia numero \d+ sobre assunto local$/);
    expect(raw.entries![0]).toMatchObject({ titleSource: "title_slug" });
  });

  it("pede o arquivo do ano corrente (America/Cuiaba), mesmo com o feed_url do ano anterior", async () => {
    const t = setup({
      [`${HOST}/robots.txt`]: { status: 404 },
      [`${HOST}/sitemap/geral/2026.xml`]: xml(readFixture("sitemap-anual.xml")),
    });
    await t.run();
    expect(t.calls.map((c) => c.url)).toEqual([
      `${HOST}/robots.txt`,
      `${HOST}/sitemap/geral/2026.xml`,
    ]);
    expect(t.repo.raw()[0]!.payload.truncated).toBeUndefined();
    expect(t.repo.collected()).toHaveLength(7);
    expect(t.repo.raw()[0]!.payload.url).toBe(`${HOST}/sitemap/geral/2026.xml`);
  });

  it("fixture com slug acentuado: título decodificado e item novo só por loc inédita", async () => {
    const t = setup({
      [`${HOST}/robots.txt`]: { status: 404 },
      [`${HOST}/sitemap/geral/2026.xml`]: xml(readFixture("sitemap-anual.xml")),
    });
    await t.run();
    expect(t.repo.collected().map((c) => c.originalTitle)).toContain(
      "Educação básica recebe novos recursos",
    );
    expect(t.repo.collected()[0]).toMatchObject({
      publishedAt: "2026-10-02T16:33:40.782Z",
      excerpt: null,
      imageUrl: null,
    });
  });

  it("o corte do prefixo cai no meio de uma <url> e mesmo assim valida; documento curto malformado (sem truncated) segue em quarentena", async () => {
    const big = bigSitemap(5000);
    const cutsAtUrlEnd = big.slice(0, SITEMAP_PREFIX_BYTES).endsWith("</url>\n");
    expect(cutsAtUrlEnd).toBe(false);
    const full = readFixture("sitemap-anual.xml");
    const t = setup({
      [`${HOST}/robots.txt`]: { status: 404 },
      // Chega inteiro (menor que o prefixo) e malformado: não é truncamento nosso.
      [`${HOST}/sitemap/geral/2026.xml`]: xml(full.slice(0, full.indexOf("obras-na-avenida") + 10)),
    });
    const r = await t.run();
    expect(r.quarantined).toBe(1);
    expect(t.repo.collected()).toHaveLength(0);
  });

  it("virada do ano: em 1º de janeiro lê o ano novo e o fim do ano anterior, e junta", async () => {
    const jan1 = new Date("2027-01-01T08:00:00Z");
    const novo = `${HEAD}  <url><loc>${HOST}/noticias/primeira-materia-de-2027</loc><lastmod>2027-01-01T07:30:00.000Z</lastmod></url>\n</urlset>`;
    const velho = `${HEAD}  <url><loc>${HOST}/noticias/ultima-materia-de-2026</loc><lastmod>2026-12-31T23:50:00.000Z</lastmod></url>\n</urlset>`;
    const t = setup(
      {
        [`${HOST}/robots.txt`]: { status: 404 },
        [`${HOST}/sitemap/geral/2027.xml`]: xml(novo),
        [`${HOST}/sitemap/geral/2026.xml`]: xml(velho),
      },
      source(),
      jan1,
    );
    await t.run();
    expect(t.repo.collected().map((c) => c.originalTitle)).toEqual([
      "Primeira materia de 2027",
      "Ultima materia de 2026",
    ]);
  });

  it("1º de janeiro com o arquivo novo ainda inexistente (404): usa o do ano anterior", async () => {
    const jan1 = new Date("2027-01-01T04:30:00Z");
    const velho = `${HEAD}  <url><loc>${HOST}/noticias/ultima-materia-de-2026</loc><lastmod>2026-12-31T23:50:00.000Z</lastmod></url>\n</urlset>`;
    const t = setup(
      {
        [`${HOST}/robots.txt`]: { status: 404 },
        [`${HOST}/sitemap/geral/2026.xml`]: xml(velho),
      },
      source(),
      jan1,
    );
    await t.run();
    expect(t.repo.collected()).toHaveLength(1);
  });

  it("segunda coleta com as mesmas loc não cria item novo (novidade = loc inédita)", async () => {
    const t = setup({
      [`${HOST}/robots.txt`]: { status: 404 },
      [`${HOST}/sitemap/geral/2026.xml`]: xml(readFixture("sitemap-anual.xml")),
    });
    await t.run();
    const first = t.repo.collected().length;
    for (const c of t.repo.collected()) t.repo.markAdvanced(c.id);
    // lastmod maior para uma loc já conhecida: não vira item novo nem reprocessa
    const again = readFixture("sitemap-anual.xml").replace(
      "2026-10-02T12:10:00.000Z",
      "2026-10-02T16:50:00.000Z",
    );
    const t2 = { ...t };
    t2.repo.raw().length = 0;
    const { http } = createFakeHttp({
      [`${HOST}/robots.txt`]: { status: 404 },
      [`${HOST}/sitemap/geral/2026.xml`]: xml(again),
    });
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", {
      runId: "run-2",
      step: "fetch",
      itemRef: "source:portal-do-pantanal",
      attempt: 1,
    });
    const dedupe: string[] = [];
    await drain({
      queue,
      runStep: createRunStep({
        ...createIngestHandlers({
          repo: t.repo,
          http,
          resolve: fakeResolve(),
          userAgent: UA,
          now: () => new Date("2026-10-02T17:20:00Z"),
        }),
        dedupe: async (m) => {
          dedupe.push(m.itemRef);
          return { ok: true, value: [] };
        },
      }),
      events: { record: async () => {} },
      now: () => 0,
      queues: ["pipeline"],
    });
    expect(t.repo.collected()).toHaveLength(first);
    expect(dedupe).toEqual([]);
  });
});
