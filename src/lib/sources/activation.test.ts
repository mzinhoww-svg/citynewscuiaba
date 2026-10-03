import {
  buildPatch,
  decideOutcome,
  diffPatch,
  evaluateExtraction,
  kindFor,
  parseActivationFile,
  type ActivationEntry,
} from "./activation";

const NOW = new Date("2026-10-03T18:00:00.000Z");
const FILE = { decision: "R43", termsDelegatedOn: "2026-10-03" };
const EXPECT = { minItems: 3, requireDate: true, maxAgeDays: 30 };

const item = (n: number, publishedAt: string | null = "2026-10-03T12:00:00.000Z") => ({
  title: `Matéria fictícia ${n}`,
  url: `https://folhadocerrado.example/noticias/${n}`,
  publishedAt,
});

const entry = (over: Partial<ActivationEntry> = {}): ActivationEntry => ({
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  strategy: "page_list",
  feedUrl: "https://folhadocerrado.example/noticias",
  pageSelectors: { item: "li.card", link: "a", title: "h2", date: "time" },
  termsUrl: "https://folhadocerrado.example/termos",
  robotsSummary: "Allow para todos.",
  aiBotsBlockedByRobots: false,
  frequencyMinutes: 30,
  rateLimitPerHour: 20,
  termsMinIntervalMinutes: null,
  expect: EXPECT,
  ...over,
});

describe("kindFor", () => {
  it("mapeia estratégia para kind do banco", () => {
    expect(kindFor("rss")).toBe("rss");
    expect(kindFor("atom")).toBe("rss");
    expect(kindFor("sitemap_news")).toBe("sitemap");
    expect(kindFor("jsonfeed")).toBe("api");
    expect(kindFor("page_list")).toBe("page");
  });
});

describe("evaluateExtraction", () => {
  it("passa com 3 itens com título, link e data recente", () => {
    const v = evaluateExtraction([item(1), item(2), item(3)], EXPECT, NOW);
    expect(v).toMatchObject({ ok: true, valid: 3, reason: null });
  });
  it("falha com menos de 3 itens", () => {
    const v = evaluateExtraction([item(1), item(2)], EXPECT, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("mínimo 3");
  });
  it("descarta título vazio e link que não é http(s)", () => {
    const bad = [{ ...item(1), title: "  " }, { ...item(2), url: "javascript:alert(1)" }, item(3)];
    expect(evaluateExtraction(bad, EXPECT, NOW).valid).toBe(1);
  });
  it("sem data nenhuma, falha quando a data é obrigatória", () => {
    const v = evaluateExtraction([item(1, null), item(2, null), item(3, null)], EXPECT, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("nenhum com data");
  });
  it("sem data passa quando requireDate é falso", () => {
    const v = evaluateExtraction(
      [item(1, null), item(2, null), item(3, null)],
      { ...EXPECT, requireDate: false },
      NOW,
    );
    expect(v.ok).toBe(true);
  });
  it("feed com ano errado (2002) não passa", () => {
    const old = "2002-10-26T18:00:00.000Z";
    const v = evaluateExtraction([item(1, old), item(2, old), item(3, old)], EXPECT, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("mais de 30 dias");
  });
  it("data no futuro distante não conta", () => {
    const future = "2026-12-01T00:00:00.000Z";
    const v = evaluateExtraction([item(1, future), item(2, future), item(3, future)], EXPECT, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("no futuro");
  });
  it("tolera até 2 dias de adiantamento (fuso do site)", () => {
    const near = "2026-10-04T18:00:00.000Z";
    expect(evaluateExtraction([item(1, near), item(2, near), item(3, near)], EXPECT, NOW).ok).toBe(
      true,
    );
  });
});

describe("buildPatch", () => {
  it("monta kind, feed, consumption e termos", () => {
    const p = buildPatch(entry(), FILE, null, NOW);
    expect(p).toMatchObject({
      kind: "page",
      feed_url: "https://folhadocerrado.example/noticias",
      terms_url: "https://folhadocerrado.example/termos",
      terms_reviewed_at: NOW.toISOString(),
      frequency_minutes: 30,
      rate_limit_per_hour: 20,
    });
    expect(p.consumption).toEqual({
      strategy: "page_list",
      feedUrl: "https://folhadocerrado.example/noticias",
      enrich: false,
      pageSelectors: { item: "li.card", link: "a", title: "h2", date: "time" },
    });
    expect(p.agreement_note).toContain("03/10/2026 (R43)");
  });
  it("Crawl-delay sobe a frequência e vai para consumption.robots", () => {
    const p = buildPatch(entry({ frequencyMinutes: 30 }), FILE, 1800, NOW);
    expect(p.frequency_minutes).toBe(60);
    expect(p.consumption.robots).toEqual({ crawlDelaySec: 1800 });
    expect(p.agreement_note).toContain("Crawl-delay 1800s");
  });
  it("intervalo mínimo dos termos vale", () => {
    expect(
      buildPatch(entry({ termsMinIntervalMinutes: 120 }), FILE, null, NOW).frequency_minutes,
    ).toBe(120);
  });
  it("feed não carrega pageSelectors", () => {
    const p = buildPatch(
      entry({ strategy: "rss", pageSelectors: undefined, feedUrl: "https://mtagora.example/feed" }),
      FILE,
      null,
      NOW,
    );
    expect(p.kind).toBe("rss");
    expect(p.consumption).not.toHaveProperty("pageSelectors");
  });
  it("registra o aviso de robôs de IA", () => {
    expect(
      buildPatch(entry({ aiBotsBlockedByRobots: true }), FILE, null, NOW).agreement_note,
    ).toContain("bloqueia robôs de IA");
  });
});

describe("diffPatch (idempotência)", () => {
  const patch = buildPatch(entry(), FILE, null, NOW);
  it("linha igual ao patch: nada a gravar", () => {
    const row = {
      kind: patch.kind,
      feed_url: patch.feed_url,
      consumption: JSON.parse(JSON.stringify(patch.consumption)),
      terms_url: patch.terms_url,
      frequency_minutes: patch.frequency_minutes,
      rate_limit_per_hour: patch.rate_limit_per_hour,
      terms_min_interval_minutes: null,
    };
    expect(diffPatch(patch, row)).toEqual({});
  });
  it("ordem das chaves do jsonb não conta", () => {
    const row = {
      kind: "page",
      feed_url: patch.feed_url,
      consumption: {
        pageSelectors: { date: "time", title: "h2", link: "a", item: "li.card" },
        enrich: false,
        feedUrl: patch.feed_url,
        strategy: "page_list",
      },
      terms_url: patch.terms_url,
      frequency_minutes: 30,
      rate_limit_per_hour: 20,
      terms_min_interval_minutes: null,
    };
    expect(diffPatch(patch, row)).toEqual({});
  });
  it("campo diferente: devolve só o que mudou mais termos e nota", () => {
    const d = diffPatch(patch, {
      kind: "rss",
      feed_url: null,
      consumption: {},
      terms_url: null,
      frequency_minutes: null,
      rate_limit_per_hour: 60,
      terms_min_interval_minutes: null,
    });
    expect(Object.keys(d)).toContain("feed_url");
    expect(Object.keys(d)).toContain("terms_reviewed_at");
    expect(Object.keys(d)).toContain("agreement_note");
  });
});

describe("decideOutcome", () => {
  const ok = { ok: true, total: 3, valid: 3, reason: null };
  const base = { robotsAllowed: true, crawlDelaySec: null, verdict: ok, fetchError: null };
  it("passou: ativa com patch", () => {
    expect(decideOutcome(entry(), FILE, base, NOW).action).toBe("activate");
  });
  it("robots proíbe: fica pausada com motivo robots", () => {
    expect(decideOutcome(entry(), FILE, { ...base, robotsAllowed: false }, NOW)).toMatchObject({
      action: "keep_paused",
      statusReason: "robots",
    });
  });
  it("erro de rede: pausada com o erro exato", () => {
    expect(
      decideOutcome(entry(), FILE, { ...base, fetchError: "HTTP 403 em https://x.example/" }, NOW),
    ).toMatchObject({ statusReason: "other", lastError: "HTTP 403 em https://x.example/" });
  });
  it("extração reprovada: qualidade, com a frase do veredito", () => {
    const o = decideOutcome(
      entry(),
      FILE,
      { ...base, verdict: { ok: false, total: 0, valid: 0, reason: "nenhum com data" } },
      NOW,
    );
    expect(o).toMatchObject({ statusReason: "quality" });
    expect(o.action === "keep_paused" && o.lastError).toContain("nenhum com data");
  });
  it("impedimento já conhecido não ativa nem testa", () => {
    const o = decideOutcome(
      entry({ blocked: { reason: "robots", detail: "robots.txt proíbe todos os robôs" } }),
      FILE,
      base,
      NOW,
    );
    expect(o).toMatchObject({ action: "keep_paused", statusReason: "robots" });
  });
});

describe("parseActivationFile", () => {
  const raw = (sources: unknown[]) => ({
    version: 1,
    decision: "R43",
    termsDelegatedOn: "2026-10-03",
    sources,
  });
  const good = {
    slug: "mt-agora",
    name: "MT Agora",
    strategy: "rss",
    feedUrl: "https://mtagora.example/feed",
    termsUrl: "https://mtagora.example/termos",
    robotsSummary: "Allow para todos.",
  };
  it("aceita fonte completa e aplica padrões", () => {
    const f = parseActivationFile(raw([good]));
    expect(f.sources[0]!.expect).toEqual({ minItems: 3, requireDate: true, maxAgeDays: 30 });
    expect(f.sources[0]!.rateLimitPerHour).toBe(30);
  });
  it("recusa slug repetido", () => {
    expect(() => parseActivationFile(raw([good, good]))).toThrow(/repetido/);
  });
  it("recusa fonte sem coleta e sem blocked", () => {
    expect(() =>
      parseActivationFile(raw([{ slug: "x", name: "X", robotsSummary: "-" }])),
    ).toThrow();
  });
  it("recusa page_list sem seletores", () => {
    expect(() => parseActivationFile(raw([{ ...good, strategy: "page_list" }]))).toThrow(
      /pageSelectors/,
    );
  });
  it("recusa requireDate=false sem justificativa", () => {
    expect(() => parseActivationFile(raw([{ ...good, expect: { requireDate: false } }]))).toThrow(
      /note/,
    );
  });
  it("aceita fonte só com blocked", () => {
    const f = parseActivationFile(
      raw([
        {
          slug: "proibido",
          name: "Proibido",
          robotsSummary: "Disallow: /",
          blocked: { reason: "robots", detail: "robots.txt proíbe todos os robôs." },
        },
      ]),
    );
    expect(f.sources[0]!.blocked?.reason).toBe("robots");
  });
});
