// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ingest/status/route";
import { createServiceClient } from "@/lib/db/client";
import { createRunStore } from "@/lib/db/pipeline-store";
import { createQueue } from "@/lib/pipeline/queue";
import { handleStatus } from "@/lib/pipeline/status";

import { pipelineTrash, purgePipeline } from "./cleanup";

const trash = pipelineTrash();
afterAll(() => purgePipeline(createServiceClient(), trash));

const req = (secret = process.env.CRON_SECRET) =>
  new Request("http://localhost/api/ingest/status", {
    headers: { authorization: `Bearer ${secret}` },
  });

describe("/api/ingest/status", () => {
  it("devolve o último início e late=true só depois de 45 min", async () => {
    const db = createServiceClient();
    const runs = createRunStore(db);
    const { runId } = await runs.startRun(
      new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000),
    );
    trash.runIds.add(runId);
    const namespace = `s-${randomUUID().slice(0, 8)}`;
    trash.namespaces.add(namespace);
    const queue = createQueue(db, { namespace });
    await queue.enqueue("pipeline", { runId: "r", step: "fetch", itemRef: "source:x", attempt: 1 });
    const deps = { runs, queue, secret: process.env.CRON_SECRET };

    const fresh = await (await handleStatus(req(), { ...deps, now: () => new Date() })).json();
    expect(Date.now() - Date.parse(fresh.lastStartedAt)).toBeLessThan(60_000);
    expect(fresh).toMatchObject({ late: false, pending: { pipeline: 1, total: 1 } });

    const later = await (
      await handleStatus(req(), { ...deps, now: () => new Date(Date.now() + 46 * 60_000) })
    ).json();
    expect(later.late).toBe(true);
    await db.from("jobs").delete().like("queue", `${namespace}:%`);
  });

  it("sem segredo ou com segredo errado = 401", async () => {
    expect((await GET(new Request("http://x"))).status).toBe(401);
    expect((await GET(req("errado"))).status).toBe(401);
  });

  it("rota com segredo responde 200 com o formato do watchdog", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lastStartedAt: expect.any(String),
      ageMinutes: expect.any(Number),
      late: expect.any(Boolean),
      pending: expect.objectContaining({ total: expect.any(Number) }),
      fast: {
        lastStartedAt: null,
        ageMinutes: null,
        late: false,
        sources: 0,
      },
    });
  });
});
