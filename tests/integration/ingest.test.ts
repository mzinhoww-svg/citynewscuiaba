// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFixture } from "../fixtures/read";
import { createServiceClient } from "@/lib/db/client";
import { createEventSink, createIngestRepo, createRunStore } from "@/lib/db/pipeline-store";
import { tryCanonicalUrl } from "@/lib/pipeline/canonical-url";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep } from "@/lib/pipeline/run-step";
import { createIngestHandlers, extractFromFeed } from "@/lib/pipeline/steps";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const rss = (name: string) => ({
  body: readFixture(name),
  headers: { "content-type": "application/rss+xml" },
});

describe("coleta com banco real (fixtures, sem rede)", () => {
  it("Folha do Cerrado e Diário da Baixada: itens, quarentena da injeção e data de Cuiabá", async () => {
    const db = createServiceClient();
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    const queue = createQueue(db, { namespace });
    // Janela própria (ano 2001) para não colidir com outras suítes nem com reexecuções.
    const window = new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000);
    const { runId } = await createRunStore(db).startRun(window);

    const { http, calls } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": { body: "User-agent: *\nDisallow: /busca" },
      "https://folhadocerrado.example/feed": rss("folha-do-cerrado.xml"),
      "https://diariodabaixada.example/robots.txt": { status: 404 },
      "https://diariodabaixada.example/rss": rss("diario-da-baixada.xml"),
    });
    const handlers = createIngestHandlers({
      repo: createIngestRepo(db),
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => new Date("2026-09-27T18:45:00Z"),
    });
    for (const slug of ["folha-do-cerrado", "diario-da-baixada"])
      await queue.enqueue("pipeline", {
        runId,
        step: "fetch",
        itemRef: `source:${slug}`,
        attempt: 1,
      });

    const r = await drain({
      queue,
      runStep: createRunStep({ ...handlers, dedupe: async () => ({ ok: true, value: [] }) }),
      events: createEventSink(db),
      now: () => Date.now(),
      queues: ["pipeline"],
    });
    expect(r).toMatchObject({ quarantined: 1, retried: 0, remaining: 0 });
    expect(calls.every((c) => c.headers.get("user-agent") === UA)).toBe(true);

    const expected = [
      ...new Set(
        extractFromFeed(readFixture("folha-do-cerrado.xml"))
          .filter((e) => !e.injection)
          .map((e) => tryCanonicalUrl(e.url)),
      ),
    ].filter((u): u is string => u !== null);
    expect(expected).toHaveLength(23);
    const items = await db
      .from("collected_items")
      .select("canonical_url", { count: "exact", head: true })
      .in("canonical_url", expected);
    expect(items.count).toBe(23);
    const injected = await db
      .from("collected_items")
      .select("id")
      .eq("canonical_url", "https://folhadocerrado.example/cultura/nota-agenda-cultural");
    expect(injected.data).toHaveLength(0);

    const quarantine = await db
      .from("pipeline_quarantine")
      .select("error")
      .eq("queue", `${namespace}:pipeline`);
    expect(quarantine.data).toHaveLength(1);
    expect(quarantine.data![0]!.error).toMatch(/^injection:/);
    const alerts = await db
      .from("pipeline_events")
      .select("step")
      .eq("run_id", runId)
      .eq("level", "security");
    expect(alerts.data).toEqual([{ step: "normalize" }]);

    const semFuso = await db
      .from("collected_items")
      .select("published_at")
      .eq("canonical_url", "https://diariodabaixada.example/cidade/porto-faixa-pedestres-beira-rio")
      .single();
    expect(new Date(semFuso.data!.published_at!).toISOString()).toBe("2026-09-27T18:00:00.000Z");

    const raws = await db.from("raw_items").select("state").eq("run_id", runId);
    expect(raws.data!.map((x) => x.state)).toEqual(["extracted", "extracted"]);
  });
});
