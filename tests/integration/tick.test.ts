// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST as tickPOST } from "@/app/api/ingest/tick/route";
import { POST as drainPOST } from "@/app/api/jobs/drain/route";
import { createServiceClient } from "@/lib/db/client";
import { createEventSink, createRateLimitPeek, createRunStore } from "@/lib/db/pipeline-store";
import { runFastTick } from "@/lib/pipeline/fast-tick";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep, nextMessage, stepError } from "@/lib/pipeline/run-step";
import { handleTick, runTick } from "@/lib/pipeline/tick";

import { pipelineTrash, purgePipeline, rememberSources } from "./cleanup";

const WINDOW = "2026-09-27T14:30:00.000Z";
const trash = pipelineTrash();

afterAll(async () => {
  const db = createServiceClient();
  const { data } = await db.from("ingest_runs").select("id").eq("window_start", WINDOW);
  for (const r of data ?? []) trash.runIds.add(r.id);
  await purgePipeline(db, trash);
});

function tickReq(secret = process.env.CRON_SECRET) {
  return new Request("http://localhost/api/ingest/tick", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function countRuns(windowStart: string) {
  const { count } = await createServiceClient()
    .from("ingest_runs")
    .select("*", { count: "exact", head: true })
    .eq("window_start", windowStart);
  return count;
}

describe("tick idempotente", () => {
  it("dois ticks na mesma janela criam um run", async () => {
    const db = createServiceClient();
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    const deps = {
      queue: createQueue(db, { namespace }),
      runs: createRunStore(db),
      now: () => new Date("2026-09-27T14:44:10Z"),
      secret: process.env.CRON_SECRET,
    };
    const [a, b] = await Promise.all([handleTick(tickReq(), deps), handleTick(tickReq(), deps)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await handleTick(tickReq(), deps);
    expect(await countRuns(WINDOW)).toBe(1);
    const bodies = [await a.json(), await b.json()];
    expect(bodies[0].runId).toBe(bodies[1].runId);
  });

  it("sem segredo = 401", async () => {
    expect((await tickPOST(new Request("http://x", { method: "POST" }))).status).toBe(401);
    expect((await drainPOST(new Request("http://x", { method: "POST" }))).status).toBe(401);
  });

  it("segredo errado = 401", async () => {
    expect((await tickPOST(tickReq("errado"))).status).toBe(401);
    expect((await drainPOST(tickReq("errado"))).status).toBe(401);
  });
});

describe("drain com banco real", () => {
  it("executa, enfileira a próxima, confirma e registra em pipeline_events", async () => {
    const db = createServiceClient();
    const ref = `source:drain-${randomUUID()}`;
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    trash.itemRefLike.add(`${ref}%`);
    const queue = createQueue(db, { namespace });
    await queue.enqueue("pipeline", { runId: "r-int", step: "fetch", itemRef: ref, attempt: 1 });
    const runStep = createRunStep({
      fetch: async (m) => ({ ok: true, value: [nextMessage(m, "validate", `${ref}#raw`)] }),
      validate: async () => ({ ok: false, error: stepError.invalid("documento vazio") }),
    });
    const r = await drain({
      queue,
      runStep,
      events: createEventSink(db),
      now: () => Date.now(),
      queues: ["pipeline"],
    });
    expect(r).toMatchObject({ processed: 2, succeeded: 1, quarantined: 1, remaining: 0 });
    const { data } = await db
      .from("pipeline_events")
      .select("step, level, run_id")
      .like("item_ref", `${ref}%`)
      .order("id");
    expect(data).toEqual([
      { step: "fetch", level: "info", run_id: null },
      { step: "validate", level: "error", run_id: null },
    ]);
  });
});

describe("via rápida e runs manuais no banco real (FS-T5)", () => {
  /** Janela própria de 30 min no ano 2001 (não colide com outras suítes nem com reexecuções). */
  const window2001 = () => new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000);

  it("runs manual e fast não contam para o watchdog do ciclo normal", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const { data: folha } = await db
      .from("sources")
      .select("id")
      .eq("slug", "folha-do-cerrado")
      .single();
    const cron = await runs.startRun(window2001());
    trash.runIds.add(cron.runId);
    const fast = await runs.startFastRun(window2001());
    trash.runIds.add(fast.runId);
    const manual = await runs.startManualRun(folha!.id);
    trash.runIds.add(manual.runId);

    const startedAt = async (id: string) =>
      (await db.from("ingest_runs").select("started_at, trigger").eq("id", id).single()).data!;
    expect((await startedAt(fast.runId)).trigger).toBe("fast");
    expect((await startedAt(manual.runId)).trigger).toBe("manual");
    expect(await runs.lastStartedAt()).toBe((await startedAt(cron.runId)).started_at);
    expect(await runs.lastFastStartedAt()).toBe((await startedAt(fast.runId)).started_at);
    // Manual é sempre um run novo; fast repete o da janela.
    expect((await runs.startManualRun(folha!.id)).runId).not.toBe(manual.runId);
    const again = await runs.startFastRun(
      new Date(
        (await db.from("ingest_runs").select("window_start").eq("id", fast.runId).single()).data!
          .window_start,
      ),
    );
    expect(again).toMatchObject({ runId: fast.runId, created: false });
    const { data: manuals } = await db
      .from("ingest_runs")
      .select("id")
      .eq("trigger", "manual")
      .contains("stats", { source: folha!.id });
    for (const r of manuals ?? []) trash.runIds.add(r.id);
  });

  it("tick normal e rápido na mesma janela no banco real: um run de cada, fonte rápida só no fast", async () => {
    const db = createServiceClient();
    await rememberSources(db, trash, ["mt-agora"]);
    const { data: before } = await db
      .from("sources")
      .select("frequency_minutes")
      .eq("slug", "mt-agora")
      .single();
    try {
      const set = await db
        .from("sources")
        .update({ frequency_minutes: 10, last_fetched_at: null })
        .eq("slug", "mt-agora");
      expect(set.error).toBeNull();

      const namespace = `t-${randomUUID().slice(0, 8)}`;
      trash.namespaces.add(namespace);
      const queue = createQueue(db, { namespace });
      const runs = createRunStore(db);
      const at = new Date(window2001().getTime() + 5_000);
      const [normal, fast] = await Promise.all([
        runTick({ queue, runs, now: () => at }),
        runFastTick({ queue, runs, peekRateLimit: createRateLimitPeek(db), now: () => at }),
      ]);
      if (normal.status === "skipped" || fast.status === "idle")
        throw new Error("esperava os dois ticks rodando");
      trash.runIds.add(normal.runId);
      trash.runIds.add(fast.runId);
      expect(normal.runId).not.toBe(fast.runId);
      expect(fast).toMatchObject({ status: "started", enqueued: 1 });

      const { data: rows } = await db
        .from("ingest_runs")
        .select("trigger, stats")
        .in("id", [normal.runId, fast.runId]);
      expect(rows!.map((r) => r.trigger).sort()).toEqual(["cron", "fast"]);
      expect(rows!.find((r) => r.trigger === "fast")!.stats).toMatchObject({
        fetch_enqueued: 1,
        skipped: [],
      });

      const { data: jobs } = await db
        .from("jobs")
        .select("message")
        .eq("queue", `${namespace}:pipeline`);
      const refsOf = (runId: string) =>
        (jobs ?? [])
          .map((j) => j.message as { runId: string; itemRef: string })
          .filter((m) => m.runId === runId)
          .map((m) => m.itemRef);
      expect(refsOf(fast.runId)).toEqual(["source:mt-agora"]);
      expect(refsOf(normal.runId)).not.toContain("source:mt-agora");

      // Previous_pending no banco: a mesma fonte já na fila não entra de novo em outro run fast.
      expect(
        await queue.pending("pipeline", { itemRef: "source:mt-agora", steps: ["fetch"] }),
      ).toBe(1);
      const next = await runFastTick({
        queue,
        runs,
        peekRateLimit: createRateLimitPeek(db),
        now: () => new Date(at.getTime() + 10 * 60_000),
      });
      if (next.status === "idle") throw new Error("esperava run fast");
      trash.runIds.add(next.runId);
      expect(next).toMatchObject({
        enqueued: 0,
        skipped: [{ slug: "mt-agora", reason: "previous_pending" }],
      });
    } finally {
      await db
        .from("sources")
        .update({ frequency_minutes: before?.frequency_minutes ?? null })
        .eq("slug", "mt-agora");
    }
  });

  it("fast-tick sem segredo = 401", async () => {
    const { POST } = await import("@/app/api/ingest/fast-tick/route");
    expect((await POST(new Request("http://x", { method: "POST" }))).status).toBe(401);
    expect((await POST(tickReq("errado"))).status).toBe(401);
  });
});
