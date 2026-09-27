// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createQueue } from "@/lib/pipeline/queue";

// Cada suíte usa um namespace próprio: as filas de produção e as outras suítes não interferem.
function isolatedQueue() {
  const namespace = `t-${randomUUID().slice(0, 8)}`;
  const db = createServiceClient();
  const queue = createQueue(db, { namespace });
  const countQuarantine = async () =>
    (
      await db
        .from("pipeline_quarantine")
        .select("*", { count: "exact", head: true })
        .like("queue", `${namespace}:%`)
    ).count;
  return { queue, countQuarantine };
}

const msg = (itemRef: string) => ({ runId: "r1", step: "fetch" as const, itemRef, attempt: 1 });

describe("fila do pipeline (tabela jobs)", () => {
  it("mensagem lida 3 vezes vai para quarentena", async () => {
    const { queue, countQuarantine } = isolatedQueue();
    await queue.enqueue("pipeline", msg("source:folha-do-cerrado"));
    for (let i = 0; i < 3; i++) await queue.readBatch("pipeline", 1, 0);
    await queue.moveExhausted("pipeline", 3);
    expect(await countQuarantine()).toBe(1);
  });

  it("enfileirar a mesma etapa do mesmo item duas vezes é idempotente", async () => {
    const { queue } = isolatedQueue();
    expect(await queue.enqueue("pipeline", msg("source:mt-agora"))).toBe(true);
    expect(await queue.enqueue("pipeline", { ...msg("source:mt-agora"), runId: "r2" })).toBe(false);
    expect(await queue.pending("pipeline")).toBe(1);
  });

  it("mensagem lida fica invisível até a visibilidade expirar", async () => {
    const { queue } = isolatedQueue();
    await queue.enqueue("pipeline", msg("source:a"));
    const [first] = await queue.readBatch("pipeline", 5, 60);
    expect(first).toMatchObject({ readCt: 1, msg: { itemRef: "source:a", attempt: 1 } });
    expect(await queue.readBatch("pipeline", 5, 60)).toHaveLength(0);
  });

  it("dois leitores concorrentes nunca recebem a mesma mensagem", async () => {
    const { queue } = isolatedQueue();
    for (let i = 0; i < 6; i++) await queue.enqueue("pipeline", msg(`source:c${i}`));
    const [a, b] = await Promise.all([
      queue.readBatch("pipeline", 4, 60),
      queue.readBatch("pipeline", 4, 60),
    ]);
    const ids = [...a, ...b].map((m) => m.msgId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);
  });

  it("ack remove, fail reagenda, release devolve sem contar tentativa, quarantine move", async () => {
    const { queue, countQuarantine } = isolatedQueue();
    for (const ref of ["source:ack", "source:fail", "source:release", "source:q"])
      await queue.enqueue("pipeline", msg(ref));
    const read = await queue.readBatch("pipeline", 4, 60);
    const by = (ref: string) => read.find((m) => m.msg.itemRef === ref)!;

    await queue.ack("pipeline", by("source:ack").msgId);
    await queue.fail("pipeline", by("source:fail").msgId, "timeout", 600);
    await queue.release("pipeline", by("source:release").msgId);
    await queue.quarantine("pipeline", by("source:q"), "html inválido");

    expect(await queue.pending("pipeline")).toBe(2);
    expect(await countQuarantine()).toBe(1);
    const again = await queue.readBatch("pipeline", 4, 60);
    expect(again.map((m) => [m.msg.itemRef, m.readCt])).toEqual([["source:release", 1]]);
  });

  it("pendentes por run e etapa", async () => {
    const { queue } = isolatedQueue();
    await queue.enqueue("pipeline", {
      runId: "run-a",
      step: "fetch",
      itemRef: "source:x",
      attempt: 1,
    });
    await queue.enqueue("pipeline", {
      runId: "run-a",
      step: "classify",
      itemRef: "item:1",
      attempt: 1,
    });
    await queue.enqueue("pipeline", {
      runId: "run-b",
      step: "fetch",
      itemRef: "source:y",
      attempt: 1,
    });
    expect(await queue.pending("pipeline", { runId: "run-a" })).toBe(2);
    expect(await queue.pending("pipeline", { runId: "run-a", steps: ["fetch", "validate"] })).toBe(
      1,
    );
  });

  it("anon e authenticated não acessam a fila", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await anon.rpc("queue_read", { p_queue: "pipeline", p_n: 1, p_vt_sec: 0 });
    expect(error).not.toBeNull();
    const jobs = await anon.from("jobs").select("id");
    expect(jobs.data ?? []).toHaveLength(0);
  });
});
