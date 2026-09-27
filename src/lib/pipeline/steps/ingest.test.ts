import { readFixture } from "../../../../tests/fixtures/read";
import { drain } from "../drain";
import type { PipelineEvent, SourceRecord } from "../ports";
import { createRunStep, type StepHandlers } from "../run-step";
import { createFakeHttp, type FakeRoute } from "../testing/fake-http";
import { createMemoryIngestRepo } from "../testing/memory-ingest-repo";
import { createMemoryQueue } from "../testing/memory-queue";
import { createIngestHandlers } from ".";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const NOW = new Date("2026-09-27T18:45:00Z");

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
  const repo = createMemoryIngestRepo(sources);
  const queue = createMemoryQueue();
  const dedupe: string[] = [];
  const handlers: StepHandlers = {
    ...createIngestHandlers({ repo, http, userAgent: UA, now: () => NOW }),
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
          userAgent: UA,
          now: () => NOW,
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
