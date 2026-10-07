// @vitest-environment node
import { TIME_ZONE } from "@/lib/format/date";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFixture } from "../fixtures/read";
import { createServiceClient } from "@/lib/db/client";
import {
  createEventSink,
  createIngestRepo,
  createRateLimitHit,
  createRateLimitPeekKey,
  createRunStore,
} from "@/lib/db/pipeline-store";
import { collectNow } from "@/lib/pipeline/collect-now";
import { createExhaustedFetchHandler, runFetch } from "@/lib/pipeline/steps/fetch";
import { tryCanonicalUrl } from "@/lib/pipeline/canonical-url";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep } from "@/lib/pipeline/run-step";
import { createIngestHandlers, extractFromFeed } from "@/lib/pipeline/steps";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { pipelineTrash, purgePipeline, rememberSources } from "./cleanup";

const trash = pipelineTrash();
trash.rateLimits.push(
  { bucket: "crawler", keyHash: "folha-do-cerrado" },
  { bucket: "crawler", keyHash: "diario-da-baixada" },
);
beforeAll(() =>
  rememberSources(createServiceClient(), trash, ["folha-do-cerrado", "diario-da-baixada"]),
);
afterAll(() => purgePipeline(createServiceClient(), trash));

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
    trash.namespaces.add(namespace);
    // Janela própria (ano 2001) para não colidir com outras suítes nem com reexecuções.
    const window = new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000);
    const { runId } = await createRunStore(db).startRun(window);
    trash.runIds.add(runId);

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
      // Coleta até o dedupe; o enriquecimento (feed só com a abertura) tem testes próprios.
      runStep: createRunStep({
        ...handlers,
        enrich: async () => ({ ok: true, value: [] }),
        dedupe: async () => ({ ok: true, value: [] }),
      }),
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

describe("fetch respeita o painel no banco real (FS-T5)", () => {
  const FEED = "https://folhadocerrado.example/feed";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

  async function healthOf(db: ReturnType<typeof createServiceClient>, sourceId: string) {
    const { data } = await db
      .from("source_health_daily")
      .select("fetch_ok, fetch_failed, fetch_not_modified, latency_samples")
      .eq("source_id", sourceId)
      .eq("day", today())
      .maybeSingle();
    return data ?? { fetch_ok: 0, fetch_failed: 0, fetch_not_modified: 0, latency_samples: 0 };
  }

  it("tick normal e rápido na mesma janela de 10 min: uma requisição, o segundo termina already_fetched (Review Focus 6)", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const cron = await runs.startRun(
      new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000),
    );
    const fast = await runs.startFastRun(
      new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 10 * 60_000),
    );
    trash.runIds.add(cron.runId);
    trash.runIds.add(fast.runId);
    const { data: folha } = await db
      .from("sources")
      .select("id")
      .eq("slug", "folha-do-cerrado")
      .single();
    // Sem coleta anterior na janela (outra suíte pode ter coletado agora há pouco).
    await db
      .from("sources")
      .update({ last_fetch_started_at: null, last_fetch_run_id: null })
      .eq("id", folha!.id);
    const before = await healthOf(db, folha!.id);

    const { http, calls } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      [FEED]: rss("folha-do-cerrado.xml"),
    });
    // O mesmo "agora" nas duas chamadas: a janela de 10 min é a mesma (o banco grava now()).
    const startedAt = new Date();
    const deps = {
      repo: createIngestRepo(db),
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => startedAt,
    };
    const msg = (runId: string) => ({
      runId,
      step: "fetch" as const,
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    const first = await runFetch(msg(cron.runId), deps);
    const second = await runFetch(msg(fast.runId), deps);
    expect(first.outcome).toBe("ok");
    expect(second.outcome).toBe("already_fetched");
    expect(calls.filter((c) => c.url === FEED)).toHaveLength(1);

    const { data: raws } = await db
      .from("raw_items")
      .select("run_id")
      .eq("source_id", folha!.id)
      .in("run_id", [cron.runId, fast.runId]);
    expect(raws!.map((r) => r.run_id)).toEqual([cron.runId]);

    // Nova tentativa do mesmo run passa pela trava, mas a saúde conta uma vez por (fonte, run).
    expect((await runFetch({ ...msg(cron.runId), attempt: 2 }, deps)).outcome).toBe("ok");
    const after = await healthOf(db, folha!.id);
    expect(after.fetch_ok - before.fetch_ok).toBe(1);
    expect(after.fetch_failed - before.fetch_failed).toBe(0);
    expect(after.latency_samples - before.latency_samples).toBe(1);
    const { data: src } = await db
      .from("sources")
      .select("consecutive_failures, status")
      .eq("id", folha!.id)
      .single();
    expect(src).toEqual({ consecutive_failures: 0, status: "active" });
  });

  it("3 runs com falha pausam a fonte (auto_failures), notificam uma vez e o sucesso não reativa pausa humana", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const { data: diario } = await db
      .from("sources")
      .select("id, name")
      .eq("slug", "diario-da-baixada")
      .single();
    const dedupe = `source_auto_paused:${diario!.id}`;
    await db.from("notifications").delete().eq("dedupe_key", dedupe);
    const { http } = createFakeHttp({
      "https://diariodabaixada.example/robots.txt": { status: 404 },
      "https://diariodabaixada.example/rss": { status: 500 },
    });
    const deps = {
      repo: createIngestRepo(db),
      http,
      resolve: fakeResolve(),
      userAgent: UA,
      now: () => new Date(),
    };
    const statuses: string[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        // Runs manuais: não passam pela trava da janela (três coletas seguidas no mesmo minuto).
        const { runId } = await runs.startManualRun(diario!.id);
        trash.runIds.add(runId);
        const r = await runFetch(
          { runId, step: "fetch", itemRef: "source:diario-da-baixada", attempt: 4 },
          deps,
        );
        expect(r.outcome).toBe("failed");
        const { data } = await db.from("sources").select("status").eq("id", diario!.id).single();
        statuses.push(data!.status);
      }
      expect(statuses).toEqual(["degraded", "degraded", "paused"]);
      const { data: src } = await db
        .from("sources")
        .select("status, status_reason, consecutive_failures, status_changed_by")
        .eq("id", diario!.id)
        .single();
      expect(src).toEqual({
        status: "paused",
        status_reason: "auto_failures",
        consecutive_failures: 3,
        status_changed_by: null,
      });
      const { data: notes } = await db
        .from("notifications")
        .select("kind, channel, object_ref, title")
        .eq("dedupe_key", dedupe);
      expect(notes).toEqual([
        {
          kind: "source_auto_paused",
          channel: "control_center",
          object_ref: `source:${diario!.id}`,
          title: `Fonte ${diario!.name} pausada após 3 falhas seguidas: HTTP 500 em https://diariodabaixada.example/rss`,
        },
      ]);
      // Pausada: `applySourceState` nunca a reativa (só grava em fonte active/degraded).
      await deps.repo.applySourceState(diario!.id, { status: "active", consecutiveFailures: 0 });
      const { data: still } = await db
        .from("sources")
        .select("status")
        .eq("id", diario!.id)
        .single();
      expect(still!.status).toBe("paused");
    } finally {
      await db.from("notifications").delete().eq("dedupe_key", dedupe);
    }
  });

  it("Coletar agora: run manual com chave de fila própria, ao lado do fetch do ciclo normal", async () => {
    const db = createServiceClient();
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    const queue = createQueue(db, { namespace });
    const actor = `teste-${randomUUID()}`;
    const { data: folha } = await db
      .from("sources")
      .select("id")
      .eq("slug", "folha-do-cerrado")
      .single();
    trash.rateLimits.push(
      { bucket: "collect_now_source", keyHash: folha!.id },
      { bucket: "collect_now_actor", keyHash: actor },
    );
    await db
      .from("rate_limits")
      .delete()
      .eq("bucket", "collect_now_source")
      .eq("key_hash", folha!.id);
    await queue.enqueue("pipeline", {
      runId: "cron-qualquer",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    const deps = {
      runs: createRunStore(db),
      queue,
      repo: createIngestRepo(db),
      hitRateLimit: createRateLimitHit(db),
      peekRateLimit: createRateLimitPeekKey(db),
      actor,
    };
    const r = await collectNow(folha!.id, deps);
    if (!r.ok) throw new Error(r.error);
    trash.runIds.add(r.value.runId);
    expect(await collectNow(folha!.id, deps)).toEqual({ ok: false, error: "rate_limited" });

    const { data: run } = await db
      .from("ingest_runs")
      .select("trigger, stats")
      .eq("id", r.value.runId)
      .single();
    expect(run).toMatchObject({
      trigger: "manual",
      stats: { source: folha!.id, fetch_enqueued: 1 },
    });
    const { data: jobs } = await db
      .from("jobs")
      .select("dedupe_key")
      .eq("queue", `${namespace}:pipeline`)
      .order("id");
    expect(jobs!.map((j) => j.dedupe_key)).toEqual([
      "fetch:source:folha-do-cerrado",
      `fetch:source:folha-do-cerrado:manual:${r.value.runId}`,
    ]);
  });

  it("fix round 1: mark_fetch_enqueued é atômico e fetch esgotado conta a falha uma vez", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const { data: folha } = await db
      .from("sources")
      .select("id")
      .eq("slug", "folha-do-cerrado")
      .single();
    const { runId } = await runs.startManualRun(folha!.id);
    trash.runIds.add(runId);
    const marks = await Promise.all([
      runs.markFetchEnqueued(runId, 1, { a: 1 }),
      runs.markFetchEnqueued(runId, 0, { a: 2 }),
    ]);
    expect(marks.filter(Boolean)).toHaveLength(1);
    const { data: run } = await db.from("ingest_runs").select("stats").eq("id", runId).single();
    expect(run!.stats).toMatchObject({ source: folha!.id, fetch_enqueued: marks[0] ? 1 : 0 });

    // Mensagem de fetch esgotada: a varredura devolve a mensagem e o drain conta a falha final.
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    const queue = createQueue(db, { namespace });
    const m = { runId, step: "fetch" as const, itemRef: "source:folha-do-cerrado", attempt: 1 };
    await queue.enqueue("pipeline", m);
    for (let i = 0; i < 4; i++) await queue.readBatch("pipeline", 1, 0);
    const { data: before } = await db
      .from("sources")
      .select("consecutive_failures")
      .eq("id", folha!.id)
      .single();
    const r = await drain({
      queue,
      runStep: createRunStep({}),
      events: createEventSink(db),
      now: () => Date.now(),
      queues: ["pipeline"],
      onExhausted: createExhaustedFetchHandler({ repo: createIngestRepo(db) }),
    });
    expect(r.exhausted).toBe(1);
    // De novo (queda entre a contagem e a quarentena): não conta outra vez.
    await createExhaustedFetchHandler({ repo: createIngestRepo(db) })(m, "de novo");
    const { data: after } = await db
      .from("sources")
      .select("consecutive_failures, status")
      .eq("id", folha!.id)
      .single();
    expect(after!.consecutive_failures).toBe(before!.consecutive_failures + 1);
    expect(after!.status).toBe("degraded");
    const { data: outcomes } = await db
      .from("source_fetch_outcomes")
      .select("outcome")
      .eq("source_id", folha!.id)
      .eq("run_id", runId);
    expect(outcomes).toEqual([{ outcome: "failed" }]);
  });
});
