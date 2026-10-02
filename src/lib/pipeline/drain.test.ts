import { DRAIN_BUDGET_RATIO, DRAIN_MAX_DURATION_SEC, drain } from "./drain";
import { maxDuration, runtime } from "@/app/api/jobs/drain/route";
import { createRunStep, nextMessage, stepError } from "./run-step";
import { createMemoryQueue } from "./testing/memory-queue";
import type { PipelineEvent } from "./ports";
import { queueFor, type PipelineMessage } from "./types";

const m = (itemRef: string, step: PipelineMessage["step"] = "fetch"): PipelineMessage => ({
  runId: "r1",
  step,
  itemRef,
  attempt: 1,
});

function sink() {
  const events: PipelineEvent[] = [];
  return { events, record: async (e: PipelineEvent[]) => void events.push(...e) };
}

describe("drain", () => {
  it("rota em Node com maxDuration do Hobby (60 s) e orçamento de 80%", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(DRAIN_MAX_DURATION_SEC);
    expect(DRAIN_MAX_DURATION_SEC).toBeLessThanOrEqual(60);
    expect(DRAIN_BUDGET_RATIO).toBe(0.8);
  });

  it("beforeDrain roda antes da leitura e erro nele não derruba o drain", async () => {
    const queue = createMemoryQueue();
    const order: string[] = [];
    await queue.enqueue("notify", m("due:s1", "push_due"));
    const runStep = createRunStep({
      push_due: async () => {
        order.push("step");
        return { ok: true, value: [] };
      },
    });
    const events = sink();
    const r = await drain({
      queue,
      runStep,
      events,
      now: () => 0,
      beforeDrain: async () => {
        order.push("before");
        throw new Error("dispatch fora do ar");
      },
    });
    expect(order).toEqual(["before", "step"]);
    expect(r).toMatchObject({ processed: 1, succeeded: 1 });
    expect(events.events[0]).toMatchObject({
      level: "warn",
      message: expect.stringContaining("dispatch fora do ar"),
    });
  });

  it("executa, enfileira a próxima etapa e confirma", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    const runStep = createRunStep({
      fetch: async (msg) => ({ ok: true, value: [nextMessage(msg, "validate", "raw:1")] }),
      validate: async () => ({ ok: true, value: [] }),
    });
    const events = sink();
    const r = await drain({ queue, runStep, events, now: () => 0 });
    expect(r).toMatchObject({ processed: 2, succeeded: 2, remaining: 0 });
    expect(events.events.map((e) => e.step)).toEqual(["fetch", "validate"]);
  });

  it("falha transitória reagenda com espera de 1 min", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    const runStep = createRunStep({
      fetch: async () => ({ ok: false, error: stepError.transient("503") }),
    });
    const r = await drain({ queue, runStep, events: sink(), now: () => 0 });
    expect(r).toMatchObject({ retried: 1, quarantined: 0, remaining: 1 });
    expect(queue.delays()).toEqual([60]);
  });

  it("injeção vai direto para a quarentena e gera alerta de segurança", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("raw:1#3", "normalize"));
    const runStep = createRunStep({
      normalize: async () => ({ ok: false, error: stepError.injection("ignore as instruções") }),
    });
    const events = sink();
    const r = await drain({ queue, runStep, events, now: () => 0 });
    expect(r).toMatchObject({ quarantined: 1, remaining: 0 });
    expect(queue.quarantined()).toHaveLength(1);
    expect(events.events).toContainEqual(expect.objectContaining({ level: "security" }));
  });

  it("quarta falha vai para a quarentena", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    queue.setReadCount("pipeline", "fetch:source:a", 3);
    const runStep = createRunStep({
      fetch: async () => ({ ok: false, error: stepError.transient("x") }),
    });
    const r = await drain({ queue, runStep, events: sink(), now: () => 0 });
    expect(r).toMatchObject({ quarantined: 1, retried: 0 });
  });

  it("para em 80% do tempo e devolve o restante à fila", async () => {
    const queue = createMemoryQueue();
    for (let i = 0; i < 5; i++) await queue.enqueue("pipeline", m(`source:${i}`));
    let clock = 0;
    const runStep = createRunStep({
      fetch: async () => {
        clock += 20_000; // cada etapa leva 20 s
        return { ok: true, value: [] };
      },
    });
    const r = await drain({ queue, runStep, events: sink(), now: () => clock, batchSize: 5 });
    // 0 → 20 → 40 → 60 s: a 3ª começa em 40 s (< 48 s); a 4ª já passaria do orçamento.
    expect(r).toMatchObject({ succeeded: 3, released: 2, remaining: 2 });
    expect(queue.readCounts()).toEqual([0, 0]);
  });

  it("alterna entre as filas: pipeline cheia não deixa a mídia esperando", async () => {
    const queue = createMemoryQueue();
    for (let i = 0; i < 6; i++) await queue.enqueue("pipeline", m(`source:${i}`, "classify"));
    await queue.enqueue("media", m("article:a1", "image"));
    const order: string[] = [];
    let clock = 0;
    const runStep = createRunStep({
      classify: async () => {
        order.push("classify");
        clock += 10_000;
        return { ok: true, value: [] };
      },
      image: async () => {
        order.push("image");
        clock += 10_000;
        return { ok: true, value: [] };
      },
    });
    // Orçamento de 48 s com etapas de 10 s: cabem 5 etapas. Lotes de 2.
    await drain({ queue, runStep, events: sink(), now: () => clock, batchSize: 2 });
    expect(order).toContain("image");
    expect(order.indexOf("image")).toBeLessThan(order.length - 1);
  });

  it("etapa de imagem vai para a fila media, notificação para notify, e o drain esvazia todas", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("topic:t1", "summarize"));
    const seen: string[] = [];
    const runStep = createRunStep({
      summarize: async (msg) => {
        seen.push(`summarize`);
        return { ok: true, value: [nextMessage(msg, "image", "article:a1")] };
      },
      image: async (msg) => {
        seen.push("image");
        return { ok: true, value: [nextMessage(msg, "rules", "article:a1")] };
      },
      rules: async (msg) => {
        seen.push("rules");
        return { ok: true, value: [nextMessage(msg, "notify", "article:a1#review")] };
      },
      notify: async () => {
        seen.push("notify");
        return { ok: true, value: [] };
      },
    });
    const enqueued: string[] = [];
    const spy = {
      ...queue,
      enqueue: (q: Parameters<typeof queue.enqueue>[0], msg: PipelineMessage) => {
        enqueued.push(`${q}:${msg.step}`);
        return queue.enqueue(q, msg);
      },
    };
    const r = await drain({ queue: spy, runStep, events: sink(), now: () => 0 });
    expect(seen).toEqual(["summarize", "image", "rules", "notify"]);
    expect(enqueued).toEqual(["media:image", "pipeline:rules", "notify:notify"]);
    expect(r).toMatchObject({ succeeded: 4, remaining: 0 });
  });

  it("exceção ao enfileirar a próxima etapa vira falha transitória, sem abortar o lote", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    await queue.enqueue("pipeline", m("source:b"));
    const runStep = createRunStep({
      fetch: async (msg) => ({
        ok: true,
        value: [nextMessage(msg, "validate", `raw:${msg.itemRef}`)],
      }),
      validate: async () => ({ ok: true, value: [] }),
    });
    const flaky = {
      ...queue,
      enqueue: async (q: Parameters<typeof queue.enqueue>[0], msg: PipelineMessage) => {
        if (msg.itemRef === "raw:source:a") throw new Error("banco fora");
        return queue.enqueue(q, msg);
      },
    };
    const events = sink();
    const r = await drain({ queue: flaky, runStep, events, now: () => 0, queues: ["pipeline"] });
    expect(r).toMatchObject({ processed: 3, succeeded: 2, retried: 1, remaining: 1 });
    expect(queue.delays()).toEqual([60]);
    expect(events.events).toContainEqual(
      expect.objectContaining({ level: "warn", message: expect.stringMatching(/banco fora/) }),
    );
  });

  it("passa o prazo restante às etapas como AbortSignal", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    let seen: AbortSignal | undefined;
    const runStep = async (_msg: PipelineMessage, ctx?: { signal?: AbortSignal }) => {
      seen = ctx?.signal;
      await new Promise((r) => setTimeout(r, 80));
      return { ok: true as const, value: [] };
    };
    await drain({
      queue,
      runStep,
      events: sink(),
      now: () => 0,
      hardLimitMs: 30,
      minStepMs: () => 0,
    });
    expect(seen).toBeDefined();
    expect(seen!.aborted).toBe(true);
  });

  it("etapa cara sem tempo restante volta à fila sem contar tentativa", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("topic:t1", "summarize"));
    await queue.enqueue("pipeline", m("article:a1", "notify"));
    const ran: string[] = [];
    const runStep = createRunStep({
      summarize: async () => {
        ran.push("summarize");
        return { ok: true, value: [] };
      },
      notify: async () => {
        ran.push("notify");
        return { ok: true, value: [] };
      },
    });
    // Faltam 10 s até o limite duro: menos do que a redação (IA) precisa; o aviso cabe.
    const r = await drain({
      queue,
      runStep,
      events: sink(),
      now: () => 0,
      hardLimitMs: 10_000,
      queues: ["pipeline"],
    });
    expect(ran).toEqual(["notify"]);
    expect(r.released).toBeGreaterThanOrEqual(1);
    expect(queue.readCounts().every((n) => n === 0)).toBe(true);
  });

  it("falha causada pelo prazo do drain devolve a mensagem sem contar tentativa", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", m("source:a"));
    const runStep = async (_msg: PipelineMessage, ctx?: { signal?: AbortSignal }) => {
      await new Promise((r) => setTimeout(r, 60));
      return ctx?.signal?.aborted
        ? { ok: false as const, error: stepError.transient("timeout") }
        : { ok: true as const, value: [] };
    };
    const r = await drain({
      queue,
      runStep,
      events: sink(),
      now: () => 0,
      hardLimitMs: 20,
      minStepMs: () => 0,
    });
    expect(r).toMatchObject({ retried: 0, released: 1 });
    expect(queue.readCounts()).toEqual([0]);
  });

  it("grava pipeline_events em lotes durante o drain, não só no fim", async () => {
    const queue = createMemoryQueue();
    for (let i = 0; i < 6; i++) await queue.enqueue("pipeline", m(`source:${i}`));
    const batches: number[] = [];
    const runStep = createRunStep({ fetch: async () => ({ ok: true, value: [] }) });
    await drain({
      queue,
      runStep,
      events: { record: async (e) => void batches.push(e.length) },
      now: () => 0,
      batchSize: 2,
    });
    expect(batches.length).toBeGreaterThanOrEqual(3);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("queueFor: imagem em media, notificação em notify, o resto em pipeline", () => {
    expect(queueFor("image")).toBe("media");
    expect(queueFor("image_rights")).toBe("media");
    expect(queueFor("notify")).toBe("notify");
    expect(queueFor("publish")).toBe("pipeline");
  });
});
