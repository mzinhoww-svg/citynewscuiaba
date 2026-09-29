// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST as tickPOST } from "@/app/api/ingest/tick/route";
import { POST as drainPOST } from "@/app/api/jobs/drain/route";
import { createServiceClient } from "@/lib/db/client";
import { createEventSink, createPeekRateLimit, createRunStore } from "@/lib/db/pipeline-store";
import { runFastTick } from "@/lib/pipeline/fast-tick";
import type { RunStore } from "@/lib/pipeline/ports";
import { dueSource } from "@/lib/pipeline/testing/due-source";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep, nextMessage, stepError } from "@/lib/pipeline/run-step";
import { handleTick, runTick } from "@/lib/pipeline/tick";

import { pipelineTrash, purgePipeline } from "./cleanup";

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

describe("via rápida e runs manuais no banco real", () => {
  const randomWindow = () => new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000);

  it("runs manual e fast não contam para o watchdog do ciclo normal", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const folha = await db.from("sources").select("id").eq("slug", "folha-do-cerrado").single();
    const fast = await runs.startFastRun(randomWindow());
    trash.runIds.add(fast.runId);
    const manualId = await runs.startManualRun(folha.data!.id);
    trash.runIds.add(manualId);
    const rows = await db
      .from("ingest_runs")
      .select("id, started_at, trigger")
      .in("id", [fast.runId, manualId]);
    const startedAt = (id: string) => rows.data!.find((r) => r.id === id)!.started_at;
    expect(rows.data!.map((r) => r.trigger).sort()).toEqual(["fast", "manual"]);
    const cron = await runs.lastStartedAt();
    expect(cron).not.toBe(startedAt(fast.runId));
    expect(cron).not.toBe(startedAt(manualId));
    expect(await runs.lastFastStartedAt()).not.toBeNull();
    expect(await runs.lastManualRunAt(folha.data!.id)).toBe(startedAt(manualId));
  });

  it("tick normal e rápido na mesma janela no banco real: um run de cada, fonte rápida só no fast", async () => {
    const db = createServiceClient();
    const namespace = `t-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    const queue = createQueue(db, { namespace });
    const base = createRunStore(db);
    const runs: RunStore = {
      ...base,
      previousOpenRun: async () => null,
      activeSources: async () => [
        dueSource("rapida-int", { frequencyMinutes: 10 }),
        dueSource("normal-int"),
      ],
    };
    const window = randomWindow();
    const now = () => window;
    const normal = await runTick({ queue, runs, now });
    const fast = await runFastTick({ queue, runs, peekRateLimit: createPeekRateLimit(db), now });
    expect(normal).toMatchObject({ status: "started", enqueued: 1 });
    expect(fast).toMatchObject({ status: "started", enqueued: 1 });
    expect(
      fast.status !== "idle" && normal.status !== "skipped" && fast.runId !== normal.runId,
    ).toBe(true);
    if (normal.status !== "skipped") trash.runIds.add(normal.runId);
    if (fast.status !== "idle") trash.runIds.add(fast.runId);
    const { data } = await db
      .from("jobs")
      .select("message")
      .eq("queue", `${namespace}:pipeline`)
      .order("id");
    expect(data!.map((j) => (j.message as { itemRef: string }).itemRef).sort()).toEqual([
      "source:normal-int",
      "source:rapida-int",
    ]);
    // A mensagem da fonte rápida já está na fila: o próximo tick rápido a pula.
    expect(
      await queue.pending("pipeline", { itemRef: "source:rapida-int", steps: ["fetch"] }),
    ).toBe(1);
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
