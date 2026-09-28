import { readFixture } from "../../../../tests/fixtures/read";
import { drain } from "../drain";
import type { PipelineEvent, SourceRecord } from "../ports";
import type { PipelineMessage } from "../types";
import { createRunStep, type StepHandlers } from "../run-step";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import { createMemoryIngestRepo } from "../testing/memory-ingest-repo";
import { createMemoryQueue } from "../testing/memory-queue";
import { createIngestHandlers } from ".";
import { runFetch } from "./fetch";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunTrigger } from "../ports";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const NOW = new Date("2026-09-27T18:45:00Z");
/** Próximo ciclo: outra janela de 10 min, a trava de coleta dupla (D-F29) deixa o run novo coletar. */
const LATER = new Date("2026-09-27T19:15:00Z");

const folha: SourceRecord = {
  id: "src-folha",
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  baseUrl: "https://folhadocerrado.example",
  kind: "rss",
  feedUrl: "https://folhadocerrado.example/feed",
  status: "active",
  statusReason: null,
  consecutiveFailures: 0,
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
  consumption: {},
};

function setup(
  routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>,
  sources: SourceRecord[] = [folha],
) {
  const { http, calls } = createFakeHttp(routes);
  const repo = createMemoryIngestRepo(sources);
  const queue = createMemoryQueue();
  const dedupe: string[] = [];
  const handlers: StepHandlers = {
    ...createIngestHandlers({ repo, http, resolve: fakeResolve(), userAgent: UA, now: () => NOW }),
    dedupe: async (m) => {
      dedupe.push(m.itemRef);
      return { ok: true, value: [] };
    },
  };
  const events: PipelineEvent[] = [];
  const run = async (slug = "folha-do-cerrado") => {
    await queue.enqueue("pipeline", {
      runId: "run-1",
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
  return { repo, queue, calls, dedupe, events, run };
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
    await t.queue.enqueue("pipeline", {
      runId: "run-2",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    await drain({
      queue: t.queue,
      runStep: createRunStep({
        ...createIngestHandlers({
          repo: t.repo,
          http: createFakeHttp({
            "https://folhadocerrado.example/robots.txt": { status: 404 },
            "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
          }).http,
          resolve: fakeResolve(),
          userAgent: UA,
          now: () => LATER,
        }),
        dedupe: async (m) => {
          t.dedupe.push(m.itemRef);
          return { ok: true, value: [] };
        },
      }),
      events: { record: async () => {} },
      now: () => 0,
      queues: ["pipeline"],
    });
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
    await t.queue.enqueue("pipeline", {
      runId: "run-2",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    await drain({
      queue: t.queue,
      runStep: createRunStep({
        ...createIngestHandlers({
          repo: t.repo,
          http: createFakeHttp({
            "https://folhadocerrado.example/robots.txt": { status: 404 },
            "https://folhadocerrado.example/feed": feedRoute(readFixture("folha-do-cerrado.xml")),
          }).http,
          resolve: fakeResolve(),
          userAgent: UA,
          now: () => LATER,
        }),
        dedupe: async () => ({ ok: true, value: [] }),
      }),
      events: { record: async () => {} },
      now: () => 0,
      queues: ["pipeline"],
    });
    expect(t.repo.collected()).toHaveLength(23);
    expect(t.repo.raw()).toHaveLength(2);
  });
});

describe("fetch respeita o painel (FS-T5)", () => {
  const FEED = "https://folhadocerrado.example/feed";
  const ok200 = feedRoute(readFixture("folha-do-cerrado.xml"));
  const robots404: FakeRoute = { status: 404 };

  function rig(
    source: SourceRecord,
    routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>,
    triggers: Record<string, RunTrigger> = {},
  ) {
    const { http, calls } = createFakeHttp(routes);
    const repo = createMemoryIngestRepo([source], { triggers });
    let ms = 0;
    const deps = (now: string) => ({
      repo,
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => new Date(now),
      // Relógio monotônico falso: cada leitura avança 7 ms (latência > 0 sem depender da máquina).
      monotonic: () => (ms += 7),
    });
    const msg = (runId: string, attempt = 1): PipelineMessage => ({
      runId,
      step: "fetch",
      itemRef: `source:${source.slug}`,
      attempt,
    });
    const state = () => repo.source(source.slug)!;
    const feedCalls = () => calls.filter((c) => c.url === FEED);
    return { repo, calls, deps, msg, state, feedCalls };
  }

  it("mesma fonte enfileirada pelo tick normal e pelo rápido na mesma meia hora: uma requisição (Review Focus 6)", async () => {
    const t = rig(
      folha,
      { "https://folhadocerrado.example/robots.txt": robots404, [FEED]: ok200 },
      { "cron-1430": "cron", "fast-1430": "fast" },
    );
    const first = await runFetch(t.msg("cron-1430"), t.deps("2026-09-27T14:30:05Z"));
    const second = await runFetch(t.msg("fast-1430"), t.deps("2026-09-27T14:30:41Z"));
    expect(first.outcome).toBe("ok");
    expect(second).toMatchObject({ outcome: "already_fetched", result: { ok: true, value: [] } });
    expect(t.feedCalls()).toHaveLength(1);
    expect(t.calls).toHaveLength(2);
    expect(t.repo.raw().map((r) => r.runId)).toEqual(["cron-1430"]);
    expect(t.state().consecutiveFailures).toBe(0);
    expect(t.repo.health().map((h) => h.outcome)).toEqual(["ok"]);
  });

  it("retry do mesmo run passa pela trava; run manual não usa a trava", async () => {
    let fail = true;
    const t = rig(
      folha,
      {
        "https://folhadocerrado.example/robots.txt": robots404,
        [FEED]: () => (fail ? { status: 503 } : ok200),
      },
      { "cron-1": "cron", "manual-1": "manual" },
    );
    const a = await runFetch(t.msg("cron-1", 1), t.deps("2026-09-27T14:30:05Z"));
    expect(a.outcome).toBe("retry");
    fail = false;
    const b = await runFetch(t.msg("cron-1", 2), t.deps("2026-09-27T14:31:05Z"));
    expect(b.outcome).toBe("ok");
    const c = await runFetch(t.msg("manual-1"), t.deps("2026-09-27T14:32:00Z"));
    expect(c.outcome).toBe("ok");
    expect(t.feedCalls()).toHaveLength(3);
    expect(t.repo.raw().map((r) => r.runId)).toEqual(["cron-1", "manual-1"]);
  });

  it("via rápida manda If-None-Match e If-Modified-Since quando há ETag/Last-Modified; 304 não conta falha", async () => {
    const t = rig(
      {
        ...folha,
        status: "degraded",
        consecutiveFailures: 1,
        etag: '"v7"',
        lastModified: "Sun, 27 Sep 2026 14:00:00 GMT",
      },
      {
        "https://folhadocerrado.example/robots.txt": robots404,
        [FEED]: (h) => (h.get("if-none-match") === '"v7"' ? { status: 304 } : ok200),
      },
      { "fast-1": "fast" },
    );
    const r = await runFetch(t.msg("fast-1"), t.deps("2026-09-27T14:10:02Z"));
    expect(r.outcome).toBe("not_modified");
    const call = t.feedCalls()[0]!;
    expect(call.headers.get("if-none-match")).toBe('"v7"');
    expect(call.headers.get("if-modified-since")).toBe("Sun, 27 Sep 2026 14:00:00 GMT");
    expect(t.state()).toMatchObject({ status: "degraded", consecutiveFailures: 1 });
    expect(t.repo.health()).toEqual([
      expect.objectContaining({ outcome: "not_modified", error: null }),
    ]);
  });

  it("3 runs com falha pausam; retries do mesmo run contam uma vez (Review Focus 3)", async () => {
    const t = rig(folha, {
      "https://folhadocerrado.example/robots.txt": robots404,
      [FEED]: { status: 500 },
    });
    const windows = ["2026-09-27T14:00:05Z", "2026-09-27T14:30:05Z", "2026-09-27T15:00:05Z"];
    for (const [i, run] of ["r1", "r2", "r3"].entries()) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const r = await runFetch(t.msg(run, attempt), t.deps(windows[i]!));
        expect(r.outcome).toBe(attempt < 4 ? "retry" : "failed");
      }
      expect(t.state().status).toBe(run === "r3" ? "paused" : "degraded");
    }
    expect(t.state()).toMatchObject({ statusReason: "auto_failures", consecutiveFailures: 3 });
    expect(t.repo.notifications()).toHaveLength(1);
    expect(t.repo.notifications()[0]).toMatchObject({
      channel: "control_center",
      objectRef: "source:src-folha",
      title: `Fonte Folha do Cerrado pausada após 3 falhas seguidas: HTTP 500 em ${FEED}`,
    });
    expect(t.repo.health().map((h) => h.outcome)).toEqual(["failed", "failed", "failed"]);
    // Pausada: o próximo fetch nem requisita.
    const after = await runFetch(t.msg("r4"), t.deps("2026-09-27T15:30:05Z"));
    expect(after.outcome).toBe("skipped");
    expect(t.feedCalls()).toHaveLength(12);
  });

  it("falha não transitória conta na primeira tentativa", async () => {
    const t = rig(folha, {
      "https://folhadocerrado.example/robots.txt": robots404,
      [FEED]: { status: 404 },
    });
    const r = await runFetch(t.msg("r1"), t.deps("2026-09-27T14:00:05Z"));
    expect(r).toMatchObject({ outcome: "failed", result: { ok: false } });
    expect(t.state()).toMatchObject({ status: "degraded", consecutiveFailures: 1 });
  });

  it("sucesso volta a active, zera e registra saúde com latência", async () => {
    const t = rig(
      { ...folha, status: "degraded", consecutiveFailures: 2 },
      {
        "https://folhadocerrado.example/robots.txt": robots404,
        [FEED]: ok200,
      },
    );
    const r = await runFetch(t.msg("r1"), t.deps("2026-09-27T14:00:05Z"));
    expect(r.outcome).toBe("ok");
    expect(t.state()).toMatchObject({
      status: "active",
      statusReason: null,
      consecutiveFailures: 0,
    });
    const [h] = t.repo.health();
    expect(h).toMatchObject({ outcome: "ok", itemsNew: 0, error: null });
    expect(h!.latencyMs).toBeGreaterThan(0);
  });

  it("304 e limite próprio não contam como falha", async () => {
    const t = rig(
      { ...folha, status: "degraded", consecutiveFailures: 2, rateLimitPerHour: 1 },
      { "https://folhadocerrado.example/robots.txt": robots404, [FEED]: ok200 },
    );
    const r = await runFetch(t.msg("r1"), t.deps("2026-09-27T14:00:05Z"));
    expect(r.outcome).toBe("rate_limited");
    expect(t.feedCalls()).toHaveLength(0);
    expect(t.state()).toMatchObject({ status: "degraded", consecutiveFailures: 2 });
    expect(t.repo.health()).toEqual([]);
  });

  it("robots.txt fora do ar só conta na última tentativa", async () => {
    const t = rig(folha, { "https://folhadocerrado.example/robots.txt": { status: 503 } });
    for (let attempt = 1; attempt <= 4; attempt++)
      await runFetch(t.msg("r1", attempt), t.deps("2026-09-27T14:00:05Z"));
    expect(t.state()).toMatchObject({ status: "degraded", consecutiveFailures: 1 });
  });

  it("pausa humana no meio da coleta não é desfeita pelo sucesso", async () => {
    const t = rig(
      { ...folha, status: "degraded", consecutiveFailures: 1 },
      {
        "https://folhadocerrado.example/robots.txt": robots404,
        [FEED]: ok200,
      },
    );
    const deps = t.deps("2026-09-27T14:00:05Z");
    const pausing = {
      ...deps,
      repo: {
        ...t.repo,
        insertRawItem: async (raw: Parameters<typeof t.repo.insertRawItem>[0]) => {
          await t.repo.updateSource(folha.id, { status: "paused" });
          return t.repo.insertRawItem(raw);
        },
      },
    };
    expect((await runFetch(t.msg("r1"), pausing)).outcome).toBe("ok");
    expect(t.state()).toMatchObject({ status: "paused", consecutiveFailures: 1 });
  });

  it("page_list extrai com os seletores da fonte", async () => {
    const mtAgora: SourceRecord = {
      ...folha,
      id: "src-mt-agora",
      slug: "mt-agora",
      kind: "page",
      baseUrl: "https://mtagora.example",
      feedUrl: "https://mtagora.example/cidades",
      consumption: {
        strategy: "page_list",
        pageSelectors: { item: "article.card", link: "a", title: "h2", date: "time" },
      },
    };
    const t = setup(
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
      [mtAgora],
    );
    await t.run("mt-agora");
    expect(t.repo.raw()[0]!.entries).toHaveLength(3);
    expect(t.repo.collected()).toHaveLength(3);
    expect(
      t.repo.collected().every((c) => c.canonicalUrl.startsWith("https://mtagora.example/")),
    ).toBe(true);
    expect(t.repo.health().filter((h) => h.outcome === "items")).toHaveLength(3);
  });
});
