// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST as tickPOST } from "@/app/api/ingest/tick/route";
import { POST as drainPOST } from "@/app/api/jobs/drain/route";
import { createServiceClient } from "@/lib/db/client";
import { createEventSink, createRunStore } from "@/lib/db/pipeline-store";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep, nextMessage, stepError } from "@/lib/pipeline/run-step";
import { handleTick } from "@/lib/pipeline/tick";

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
