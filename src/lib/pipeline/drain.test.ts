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

  it("queueFor: imagem em media, notificação em notify, o resto em pipeline", () => {
    expect(queueFor("image")).toBe("media");
    expect(queueFor("image_rights")).toBe("media");
    expect(queueFor("notify")).toBe("notify");
    expect(queueFor("publish")).toBe("pipeline");
  });
});
