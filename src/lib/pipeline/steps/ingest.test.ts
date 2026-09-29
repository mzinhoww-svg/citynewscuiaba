import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readFixture } from "../../../../tests/fixtures/read";
import { drain } from "../drain";
import type { PipelineEvent, SourceRecord } from "../ports";
import type { PipelineMessage } from "../types";
import { createRunStep, type StepHandlers } from "../run-step";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import { createMemoryIngestRepo } from "../testing/memory-ingest-repo";
import { createMemoryQueue } from "../testing/memory-queue";
import { createIngestHandlers } from ".";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const NOW = new Date("2026-09-27T18:45:00Z");
/** Próximo ciclo (30 min depois): a trava de janela deixa coletar de novo. */
const LATER = new Date("2026-09-27T19:15:00Z");

const folha: SourceRecord = {
  id: "src-folha",
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  baseUrl: "https://folhadocerrado.example",
  kind: "rss",
  feedUrl: "https://folhadocerrado.example/feed",
  status: "active",
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
};

function setup(
  routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>,
  sources: SourceRecord[] = [folha],
) {
  const { http, calls } = createFakeHttp(routes);
  // Relógio do teste: repo (trava da coleta) e etapas andam juntos.
  let clock = NOW;
  const repo = createMemoryIngestRepo(sources, { clock: () => clock });
  const queue = createMemoryQueue();
  const dedupe: string[] = [];
  const handlers: StepHandlers = {
    ...createIngestHandlers({
      repo,
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => clock,
    }),
    dedupe: async (m) => {
      dedupe.push(m.itemRef);
      return { ok: true, value: [] };
    },
  };
  const events: PipelineEvent[] = [];
  const run = async (slug = "folha-do-cerrado", runId = "run-1") => {
    await queue.enqueue("pipeline", {
      runId,
      step: "fetch",
      itemRef: `source:${slug}`,
      attempt: 1,
    });
    return drain({
      queue,
      runStep: createRunStep(handlers),
      events: { record: async (e) => void events.push(...e) },
      now: () => 0,
      queues: ["pipeline"],
    });
  };
  const setNow = (d: Date) => void (clock = d);
  return { repo, queue, calls, dedupe, events, run, setNow };
}

const feedRoute = (body: string, headers: Record<string, string> = {}): FakeRoute => ({
  body,
  headers: { "content-type": "application/rss+xml; charset=utf-8", ...headers },
});

describe("coleta: fetch → validate → extract → normalize", () => {
  it("Folha do Cerrado: 23 itens novos, duplicado descartado e injeção em quarentena", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { body: "User-agent: *\nDisallow: /busca" },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
    });
    const r = await t.run();
    expect(t.repo.collected()).toHaveLength(23);
    expect(t.dedupe).toHaveLength(23);
    expect(new Set(t.repo.collected().map((c) => c.canonicalUrl)).size).toBe(23);
    expect(t.repo.collected().some((c) => c.canonicalUrl.includes("nota-agenda-cultural"))).toBe(
      false,
    );
    expect(r.quarantined).toBe(1);
    expect(t.queue.quarantined()[0]!.error).toMatch(/^injection:/);
    expect(t.events.filter((e) => e.level === "security")).toHaveLength(1);
    expect(t.repo.collected()[0]).toMatchObject({
      sourceId: "src-folha",
      locality: "cuiaba",
      publishedAt: "2026-09-27T18:00:00.000Z",
      originalTitle: "Cesta básica recua 2,1% em setembro na capital",
    });
    expect(t.repo.raw()[0]!.state).toBe("extracted");
  });

  it("identifica o robô, usa timeout e guarda ETag e Last-Modified", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml"), {
        etag: '"v1"',
        "last-modified": "Sun, 27 Sep 2026 18:00:00 GMT",
      }),
    });
    await t.run();
    for (const c of t.calls) {
      expect(c.headers.get("user-agent")).toBe(UA);
      expect(c.signal).not.toBeNull();
    }
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      etag: '"v1"',
      lastModified: "Sun, 27 Sep 2026 18:00:00 GMT",
      lastFetchedAt: NOW.toISOString(),
      lastError: null,
    });
  });

  it("B1-R2: grava o Crawl-delay novo quando o robots.txt muda", async () => {
    const t = setup(
      {
        "https://folhadocerrado.example/robots.txt": { body: "User-agent: *\nCrawl-delay: 20" },
        "https://folhadocerrado.example/feed": feedRoute("<rss/>"),
      },
      [
        {
          ...folha,
          consumption: {
            strategy: "rss",
            robots: { checkedAt: "2026-01-01T00:00:00Z", allowed: true, crawlDelaySec: 5 },
          },
        },
      ],
    );
    await t.run();
    expect(t.repo.source("folha-do-cerrado")!.consumption?.robots).toMatchObject({
      crawlDelaySec: 20,
      checkedAt: NOW.toISOString(),
    });
  });

  it("coleta condicional: manda If-None-Match e If-Modified-Since; 304 não gera item", async () => {
    const t = setup(
      {
        "https://folhadocerrado.example/robots.txt": { status: 404 },
        "https://folhadocerrado.example/feed": (h) =>
          h.get("if-none-match") === '"v1"' ? { status: 304 } : feedRoute("<rss/>"),
      },
      [{ ...folha, etag: '"v1"', lastModified: "Sun, 27 Sep 2026 18:00:00 GMT" }],
    );
    const r = await t.run();
    const feedCall = t.calls.find((c) => c.url.endsWith("/feed"))!;
    expect(feedCall.headers.get("if-modified-since")).toBe("Sun, 27 Sep 2026 18:00:00 GMT");
    expect(r).toMatchObject({ succeeded: 1, quarantined: 0 });
    expect(t.repo.raw()).toHaveLength(0);
    expect(t.repo.source("folha-do-cerrado")!.lastFetchedAt).toBe(NOW.toISOString());
  });

  it("robots.txt que bloqueia o feed: não baixa e registra o motivo", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": {
        body: "User-agent: CityNewsBot\nDisallow: /feed",
      },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
    });
    await t.run();
    expect(t.calls.map((c) => c.url)).toEqual(["https://folhadocerrado.example/robots.txt"]);
    expect(t.repo.source("folha-do-cerrado")!.lastError).toMatch(/robots\.txt/);
    expect(t.repo.collected()).toHaveLength(0);
  });

  it("robots.txt fora do ar (5xx): tenta de novo mais tarde, sem baixar o feed", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 503 },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
    });
    const r = await t.run();
    expect(r.retried).toBe(1);
    expect(t.calls).toHaveLength(1);
  });

  it("respeita o limite de requisições por hora da fonte", async () => {
    const t = setup(
      {
        "https://folhadocerrado.example/robots.txt": { status: 404 },
        "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
      },
      [{ ...folha, rateLimitPerHour: 1 }],
    );
    await t.run();
    expect(t.calls.map((c) => c.url)).toEqual(["https://folhadocerrado.example/robots.txt"]);
    expect(t.repo.source("folha-do-cerrado")!.lastError).toMatch(/limite/);
  });

  it("fonte pausada não é coletada", async () => {
    const t = setup({}, [{ ...folha, status: "paused" }]);
    const r = await t.run();
    expect(r.succeeded).toBe(1);
    expect(t.calls).toHaveLength(0);
  });

  it("servidor da fonte com erro 503: nova tentativa", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": { status: 503 },
    });
    expect((await t.run()).retried).toBe(1);
  });

  it("HTML no lugar do feed é recusado na validação e o bruto fica em quarentena", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": {
        body: "<!doctype html><html><body>Página de erro</body></html>",
        headers: { "content-type": "text/html" },
      },
    });
    const r = await t.run();
    expect(r.quarantined).toBe(1);
    expect(t.repo.raw()[0]!.state).toBe("quarantine");
  });

  it("feed sem fuso (Diário da Baixada) vira published_at em Cuiabá", async () => {
    const diario: SourceRecord = {
      ...folha,
      id: "src-diario",
      slug: "diario-da-baixada",
      baseUrl: "https://diariodabaixada.example",
      feedUrl: "https://diariodabaixada.example/rss",
    };
    const t = setup(
      {
        "https://diariodabaixada.example/robots.txt": { status: 404 },
        "https://diariodabaixada.example/rss": feedRoute(readFixture("diario-da-baixada.xml")),
      },
      [diario],
    );
    await t.run("diario-da-baixada");
    expect(t.repo.collected()[0]).toMatchObject({
      canonicalUrl: "https://diariodabaixada.example/cidade/porto-faixa-pedestres-beira-rio",
      publishedAt: "2026-09-27T18:00:00.000Z",
    });
  });

  it("fonte do tipo página usa Readability", async () => {
    const radio: SourceRecord = {
      ...folha,
      id: "src-radio",
      slug: "radio-pantanal",
      kind: "page",
      baseUrl: "https://radiopantanal.example",
      feedUrl: null,
    };
    const t = setup(
      {
        "https://radiopantanal.example/robots.txt": { status: 404 },
        "https://radiopantanal.example": {
          body: readFixture("radio-pantanal.html"),
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      },
      [radio],
    );
    await t.run("radio-pantanal");
    expect(t.repo.collected().map((c) => c.canonicalUrl)).toEqual([
      "https://radiopantanal.example/esportes/classico-arena-transito",
    ]);
  });

  it("retomada: ETag só é gravado depois do validate; a nova tentativa do fetch baixa de novo", async () => {
    let clock = 0;
    const { http } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": (h) =>
        h.get("if-none-match") === '"v1"'
          ? { status: 304 }
          : feedRoute(readFixture("folha-do-cerrado.xml"), { etag: '"v1"' }),
    });
    const repo = createMemoryIngestRepo([folha]);
    const queue = createMemoryQueue(() => clock);
    const collected: string[] = [];
    const runStep = createRunStep({
      ...createIngestHandlers({
        repo,
        http,
        resolve: fakeResolve(),
        userAgent: UA,
        now: () => NOW,
      }),
      dedupe: async (m) => {
        collected.push(m.itemRef);
        return { ok: true, value: [] };
      },
    });
    let failValidate = true;
    const flaky = {
      ...queue,
      enqueue: async (q: Parameters<typeof queue.enqueue>[0], m: PipelineMessage) => {
        if (m.step === "validate" && failValidate) {
          failValidate = false;
          throw new Error("queda antes de enfileirar validate");
        }
        return queue.enqueue(q, m);
      },
    };
    await queue.enqueue("pipeline", {
      runId: "run-1",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    const drainOnce = () =>
      drain({
        queue: flaky,
        runStep,
        events: { record: async () => {} },
        now: () => 0,
        queues: ["pipeline"],
      });
    const first = await drainOnce();
    expect(first.retried).toBe(1);
    expect(repo.source("folha-do-cerrado")!.etag).toBeNull();
    clock += 61_000;
    await drainOnce();
    expect(collected).toHaveLength(23);
    expect(repo.source("folha-do-cerrado")!.etag).toBe('"v1"');
  });

  it("retomada: normalize reenvia dedupe para item que já existe e ainda não avançou", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
    });
    await t.run();
    expect(t.dedupe).toHaveLength(23);
    // Os primeiros 20 itens avançaram (classificados); 3 ficaram parados no meio do caminho.
    for (const c of t.repo.collected().slice(0, 20)) t.repo.markAdvanced(c.id);
    t.setNow(LATER);
    await t.run("folha-do-cerrado", "run-2");
    expect(t.repo.collected()).toHaveLength(23);
    const again = t.dedupe.slice(23);
    expect(again.sort()).toEqual(
      t.repo
        .collected()
        .slice(20)
        .map((c) => `item:${c.id}`)
        .sort(),
    );
  });

  it("segunda coleta do mesmo conteúdo não duplica itens", async () => {
    const t = setup({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
    });
    await t.run();
    t.setNow(LATER);
    await t.run("folha-do-cerrado", "run-2");
    expect(t.repo.collected()).toHaveLength(23);
    expect(t.repo.raw()).toHaveLength(2);
  });
});

describe("fetch respeita o painel de fontes", () => {
  const ROBOTS = "https://folhadocerrado.example/robots.txt";
  const FEED = "https://folhadocerrado.example/feed";
  const okRoutes = {
    [ROBOTS]: { status: 404 },
    [FEED]: feedRoute(readFixture("folha-do-cerrado.xml"), { etag: '"v1"' }),
  };
  const down: Record<string, FakeRoute> = { [ROBOTS]: { status: 404 }, [FEED]: { status: 500 } };
  const msg = (runId: string, attempt = 1, ref = "source:folha-do-cerrado"): PipelineMessage => ({
    runId,
    step: "fetch",
    itemRef: ref,
    attempt,
  });

  function build(
    routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>,
    source: Partial<SourceRecord> = {},
    runs: Record<string, "cron" | "manual" | "fast"> = {},
  ) {
    let clock = new Date("2026-09-27T14:30:05Z");
    let ms = 0;
    const { http, calls } = createFakeHttp(routes);
    const repo = createMemoryIngestRepo([{ ...folha, ...source }], { runs, clock: () => clock });
    const handlers = createIngestHandlers({
      repo,
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => clock,
      nowMs: () => (ms += 40),
    });
    const fetchStep = handlers.fetch!;
    const feedCalls = () => calls.filter((c) => c.url === FEED);
    return {
      repo,
      calls,
      fetchStep,
      feedCalls,
      setNow: (iso: string) => void (clock = new Date(iso)),
    };
  }

  it("mesma fonte enfileirada pelo tick normal e pelo rápido na mesma meia hora: uma requisição (Review Focus 6)", async () => {
    const t = build(okRoutes, { frequencyMinutes: 10 } as Partial<SourceRecord>, {
      "cron-1430": "cron",
      "fast-1430": "fast",
    });
    expect((await t.fetchStep(msg("cron-1430"))).ok).toBe(true);
    t.setNow("2026-09-27T14:30:41Z");
    const second = await t.fetchStep(msg("fast-1430"));
    expect(second).toEqual({ ok: true, value: [] });
    expect(t.feedCalls()).toHaveLength(1);
    expect(t.repo.raw().map((r) => r.runId)).toEqual(["cron-1430"]);
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      consecutiveFailures: 0,
      status: "active",
    });
    expect(t.repo.health()).toHaveLength(1);
  });

  it("retry do mesmo run passa pela trava; run manual não usa a trava", async () => {
    const t = build(okRoutes, {}, { "cron-1": "cron", "man-1": "manual" });
    await t.fetchStep(msg("cron-1", 1));
    await t.fetchStep(msg("cron-1", 2));
    expect(t.feedCalls()).toHaveLength(2);
    t.setNow("2026-09-27T14:31:00Z");
    await t.fetchStep(msg("man-1", 1, "source:folha-do-cerrado:manual:man-1"));
    expect(t.feedCalls()).toHaveLength(3);
    expect(t.repo.raw().map((r) => r.runId)).toEqual(["cron-1", "man-1"]);
  });

  it("via rápida manda If-None-Match e If-Modified-Since quando há ETag/Last-Modified; 304 não conta falha", async () => {
    const t = build(
      { [ROBOTS]: { status: 404 }, [FEED]: { status: 304 } },
      { etag: '"v1"', lastModified: "Sun, 27 Sep 2026 14:00:00 GMT" },
      { "fast-1": "fast" },
    );
    expect((await t.fetchStep(msg("fast-1"))).ok).toBe(true);
    const h = t.feedCalls()[0]!.headers;
    expect(h.get("if-none-match")).toBe('"v1"');
    expect(h.get("if-modified-since")).toBe("Sun, 27 Sep 2026 14:00:00 GMT");
    expect(t.repo.raw()).toHaveLength(0);
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      consecutiveFailures: 0,
      status: "active",
    });
    expect(t.repo.health()[0]).toMatchObject({ outcome: "not_modified", error: null });
  });

  it("3 runs com falha pausam; retries do mesmo run contam uma vez (Review Focus 3)", async () => {
    const t = build(down, {}, { r1: "cron", r2: "cron", r3: "cron" });
    const starts = {
      r1: "2026-09-27T14:30:00Z",
      r2: "2026-09-27T15:00:00Z",
      r3: "2026-09-27T15:30:00Z",
    };
    for (const run of ["r1", "r2", "r3"] as const) {
      t.setNow(starts[run]);
      for (let attempt = 1; attempt <= 4; attempt++) {
        const r = await t.fetchStep(msg(run, attempt));
        expect(r.ok).toBe(false);
        // Só a última tentativa do run conta.
        if (attempt < 4)
          expect(t.repo.source("folha-do-cerrado")!.consecutiveFailures).toBe(
            run === "r1" ? 0 : run === "r2" ? 1 : 2,
          );
      }
      expect(t.repo.source("folha-do-cerrado")!.status).toBe(run === "r3" ? "paused" : "degraded");
    }
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      statusReason: "auto_failures",
      consecutiveFailures: 3,
    });
    expect(t.repo.notifications()).toHaveLength(1);
    expect(t.repo.notifications()[0]).toMatchObject({
      channel: "control_center",
      body: expect.stringContaining("Fonte Folha do Cerrado pausada após 3 falhas seguidas:"),
    });
    expect(t.repo.health().filter((h) => h.outcome === "failed")).toHaveLength(3);
  });

  it("fonte degraded continua sendo coletada; sucesso volta a active, zera e registra saúde com latência", async () => {
    const t = build(okRoutes, { status: "degraded", consecutiveFailures: 2 }, { r1: "cron" });
    expect((await t.fetchStep(msg("r1"))).ok).toBe(true);
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      status: "active",
      statusReason: null,
      consecutiveFailures: 0,
    });
    const [h] = t.repo.health();
    expect(h).toMatchObject({ outcome: "ok", sourceId: "src-folha", error: null });
    expect(h!.latencyMs).toBeGreaterThan(0);
  });

  it("limite próprio não conta como falha nem entra na saúde", async () => {
    const t = build(
      okRoutes,
      { rateLimitPerHour: 0, consecutiveFailures: 1, status: "degraded" },
      { r1: "cron" },
    );
    expect((await t.fetchStep(msg("r1"))).ok).toBe(true);
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      consecutiveFailures: 1,
      status: "degraded",
    });
    expect(t.repo.health()).toHaveLength(0);
  });

  it("4xx não recuperável conta na hora; fonte pausada não é coletada nem trava", async () => {
    const t = build({ [ROBOTS]: { status: 404 }, [FEED]: { status: 404 } }, {}, { r1: "cron" });
    expect((await t.fetchStep(msg("r1"))).ok).toBe(false);
    expect(t.repo.source("folha-do-cerrado")).toMatchObject({
      consecutiveFailures: 1,
      status: "degraded",
    });
    const paused = build(okRoutes, { status: "paused" }, { r1: "cron" });
    expect(await paused.fetchStep(msg("r1"))).toEqual({ ok: true, value: [] });
    expect(paused.calls).toHaveLength(0);
  });

  it("page_list extrai com os seletores da fonte", async () => {
    const t = build(
      {
        "https://mtagora.example/robots.txt": { status: 404 },
        "https://mtagora.example/cidades": {
          body: readFileSync(
            join(process.cwd(), "tests/fixtures/sites/secao-mt-agora.html"),
            "utf8",
          ),
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      },
      {
        slug: "folha-do-cerrado",
        kind: "page",
        baseUrl: "https://mtagora.example",
        feedUrl: "https://mtagora.example/cidades",
        consumption: {
          strategy: "page_list",
          page: { item: "article.card", link: "a", title: "h2", date: "time" },
        },
      },
      { r1: "cron" },
    );
    const fetched = await t.fetchStep(msg("r1"));
    expect(fetched.ok).toBe(true);
    const handlers = createIngestHandlers({
      repo: t.repo,
      http: createFakeHttp({}).http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => NOW,
    });
    const validate = await handlers.validate!({
      runId: "r1",
      step: "validate",
      itemRef: "raw:raw-1",
      attempt: 1,
    });
    expect(validate.ok).toBe(true);
    const extract = await handlers.extract!({
      runId: "r1",
      step: "extract",
      itemRef: "raw:raw-1",
      attempt: 1,
    });
    expect(extract.ok && extract.value).toHaveLength(3);
    expect(t.repo.raw()[0]!.entries?.map((e) => e.title)[0]).toBe(
      "Obra na avenida fictícia muda o trânsito no centro",
    );
  });
});
