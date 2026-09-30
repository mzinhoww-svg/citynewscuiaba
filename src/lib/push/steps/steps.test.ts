import { describe, expect, it } from "vitest";
import { createRunStep } from "@/lib/pipeline/run-step";
import type { PipelineMessage } from "@/lib/pipeline/types";
import { createFakeSender } from "../fake-sender";
import { createPushSteps, deliverMessages } from "./index";
import { article, memoryPushStore, sub, type MemoryPushStore } from "./memory-store";

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: "push",
  step,
  itemRef,
  attempt: 1,
});
const NOW = new Date("2026-09-28T15:00:00Z"); // 11:00 de Cuiabá

/** Roda a mensagem e, recursivamente, as que ela devolve (como o drain faria). */
async function runAll(
  m: PipelineMessage,
  steps: ReturnType<typeof createPushSteps>,
): Promise<void> {
  const run = createRunStep(steps);
  const queue = [m];
  while (queue.length) {
    const r = await run(queue.shift()!);
    if (!r.ok) throw new Error(r.error.message);
    queue.push(...r.value);
  }
}

function setup(store: MemoryPushStore, now = NOW) {
  const fake = createFakeSender();
  const steps = createPushSteps({ store, sender: fake, now: () => now });
  return { fake, steps };
}

describe("push_match + push_deliver", () => {
  it("follow: matéria de cidade com bairro CPA vai para quem segue section:cidade ou bairro:cpa com want_follow (critério 12)", async () => {
    const store = memoryPushStore({
      articles: [article("A1")],
      subs: [
        sub("a", ["section:cidade"]),
        sub("b", ["bairro:cpa"]),
        sub("c", ["section:esportes"]),
        sub("d", ["bairro:cpa"], { wantFollow: false }),
      ],
    });
    const { fake, steps } = setup(store);
    await runAll(msg("push_match", "article:A1"), steps);
    expect(fake.sent.map((s) => s.endpoint).sort()).toEqual([
      "https://fcm.googleapis.com/fcm/send/a",
      "https://fcm.googleapis.com/fcm/send/b",
    ]);
    expect(fake.sent[0]!.payload.b).toMatch(/^ORIGINAL CITYNEWS · /);
    expect(fake.sent[0]!.payload.u).toBe("/materia/materia-A1");
    expect(fake.sent[0]!.headers).toMatchObject({ TTL: 21600, Urgency: "normal" });
    expect(Object.keys(fake.sent[0]!.payload).sort()).toEqual(["b", "g", "s", "t", "u", "v"]);
    const send = store.send("send-1");
    expect(send.status).toBe("sent");
    expect(send.counters).toMatchObject({ targets_n: 2, queued_n: 2, accepted_n: 2 });
  });

  it("despublicada antes do envio: cancelado e nada sai; urgente e patrocinada não geram follow", async () => {
    const store = memoryPushStore({
      articles: [
        article("A1", { status: "unpublished" }),
        article("A2", { urgent: true }),
        article("A3", { sponsored: true }),
      ],
      subs: [sub("a", ["section:cidade"])],
    });
    const { fake, steps } = setup(store);
    await runAll(msg("push_match", "article:A1"), steps);
    await runAll(msg("push_match", "article:A2"), steps);
    await runAll(msg("push_match", "article:A3"), steps);
    expect(fake.sent).toHaveLength(0);
    expect(store.sends.size).toBe(0);
    // Pedido urgente cuja matéria foi despublicada entre a aprovação e o despacho.
    store.addSend({ id: "u1", kind: "urgent", articleId: "A1", status: "dispatching" });
    await runAll(msg("push_match", "push:u1"), steps);
    expect(store.send("u1")).toMatchObject({ status: "cancelled", reason: "Matéria despublicada" });
    expect(fake.sent).toHaveLength(0);
  });

  it("pausado: match e deliver não enviam; lote fica paused e volta ao retomar sem reenviar", async () => {
    const store = memoryPushStore({
      articles: [article("A1")],
      subs: [sub("a", ["section:cidade"]), sub("b", ["section:cidade"])],
      paused: true,
    });
    const { fake, steps } = setup(store);
    await runAll(msg("push_match", "article:A1"), steps);
    expect(fake.sent).toHaveLength(0);
    expect(store.send("send-1").status).toBe("paused");
    // Retomada com pausa no meio do lote: o primeiro lote é entregue, depois pausa antes do 2º.
    store.isPaused = false;
    store.send("send-1").status = "dispatching";
    const run = createRunStep(steps);
    const r = await run(msg("push_match", "push:send-1"));
    expect(r.ok && r.value).toEqual(deliverMessages("send-1", 1));
    store.isPaused = true;
    await run(deliverMessages("send-1", 1)[0]!);
    expect(store.batches.get("send-1:1")!.status).toBe("paused");
    expect(fake.sent).toHaveLength(0);
    store.isPaused = false;
    store.send("send-1").status = "dispatching";
    await run(deliverMessages("send-1", 1)[0]!);
    expect(fake.sent).toHaveLength(2);
    expect(store.send("send-1").status).toBe("sent");
    // Reprocessar o lote concluído não reenvia nem conta duplicata (Review Focus 3).
    await run(deliverMessages("send-1", 1)[0]!);
    expect(fake.sent).toHaveLength(2);
    expect(store.send("send-1").counters.skipped_duplicate_n).toBeUndefined();
  });

  it("403 pausa o envio, alerta o Control Center e para o lote", async () => {
    const store = memoryPushStore({
      articles: [article("A1")],
      subs: [
        sub("a", ["section:cidade"]),
        sub("b", ["section:cidade"]),
        sub("c", ["section:cidade"]),
      ],
    });
    const { fake, steps } = setup(store);
    fake.respondWith("/a", { kind: "failed", status: 403, vapidInvalid: true });
    const run = createRunStep(steps);
    const r = await run(msg("push_match", "article:A1"));
    // Concorrência 1 para a ordem ser determinística no teste.
    const serial = createRunStep(
      createPushSteps({ store, sender: fake, now: () => NOW, concurrency: 1 }),
    );
    await serial((r.ok ? r.value : [])[0]!);
    expect(store.send("send-1")).toMatchObject({ status: "paused", reason: "vapid_invalid" });
    expect(store.notifications).toEqual([
      { title: "Chaves VAPID inválidas", severity: "critical" },
    ]);
    expect(fake.sent).toHaveLength(1);
    expect(store.batches.get("send-1:1")!.status).toBe("paused");
  });

  it("410 apaga a inscrição; 429 com Retry-After 900 reagenda em 15 min; na 4ª falha vira failed", async () => {
    const store = memoryPushStore({
      articles: [article("A1")],
      subs: [sub("gone", ["section:cidade"]), sub("busy", ["section:cidade"])],
    });
    const { fake, steps } = setup(store);
    fake.respondWith("/gone", { kind: "gone", status: 410 });
    fake.respondWith("/busy", { kind: "retry", status: 429, retryAfterSec: 900 });
    await runAll(msg("push_match", "article:A1"), steps);
    expect(store.subs.find((s) => s.id === "gone")!.removed).toBe(true);
    const busy = store.deliveries.find((d) => d.subId === "busy")!;
    expect(busy).toMatchObject({
      status: "queued",
      attempts: 1,
      notBefore: "2026-09-28T15:15:00.000Z",
    });
    expect(store.send("send-1").counters).toMatchObject({ removed_n: 1 });
    expect(store.send("send-1").counters).not.toHaveProperty("accepted_n");
    // push_due antes da hora: nada; na hora: reenvia (2ª tentativa) e assim por diante.
    const run = (at: Date) =>
      createRunStep(createPushSteps({ store, sender: fake, now: () => at }));
    await run(new Date("2026-09-28T15:10:00Z"))(msg("push_due", "due:send-1"));
    expect(fake.sent.filter((s) => s.endpoint.endsWith("/busy"))).toHaveLength(1);
    await run(new Date("2026-09-28T15:15:00Z"))(msg("push_due", "due:send-1"));
    expect(busy).toMatchObject({ attempts: 2, notBefore: "2026-09-28T15:30:00.000Z" });
    await run(new Date("2026-09-28T15:30:00Z"))(msg("push_due", "due:send-1"));
    expect(busy).toMatchObject({ attempts: 3, notBefore: "2026-09-28T15:45:00.000Z" });
    await run(new Date("2026-09-28T15:45:00Z"))(msg("push_due", "due:send-1"));
    expect(busy).toMatchObject({ status: "failed", error: "retries_exhausted" });
    expect(fake.sent.filter((s) => s.endpoint.endsWith("/busy"))).toHaveLength(4);
  });

  it("follow adiado pelo silêncio sai no fim com a tag follow; urgente passa no silêncio", async () => {
    const night = new Date("2026-09-29T09:30:00Z"); // 05:30 de Cuiabá
    const store = memoryPushStore({
      articles: [article("A1"), article("A2", { urgent: true })],
      subs: [sub("a", ["section:cidade"])],
    });
    const { fake, steps } = setup(store, night);
    await runAll(msg("push_match", "article:A1"), steps);
    expect(fake.sent).toHaveLength(0);
    expect(store.deliveries[0]).toMatchObject({
      status: "deferred",
      notBefore: "2026-09-29T11:00:00.000Z",
    });
    store.addSend({
      id: "u1",
      kind: "urgent",
      articleId: "A2",
      status: "dispatching",
      startedAt: night.toISOString(),
    });
    await runAll(msg("push_match", "push:u1"), steps);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.headers).toMatchObject({ Urgency: "high", TTL: 7200 });
    const morning = createRunStep(
      createPushSteps({ store, sender: fake, now: () => new Date("2026-09-29T11:00:00Z") }),
    );
    await morning(msg("push_due", "due:send-1"));
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1]!.payload.g).toBe("follow");
  });

  it("itemRef inválido é erro não recuperável; envio inexistente é ignorado", async () => {
    const store = memoryPushStore();
    const { steps } = setup(store);
    const run = createRunStep(steps);
    expect((await run(msg("push_match", "lixo"))).ok).toBe(false);
    expect((await run(msg("push_deliver", "push:x:zero"))).ok).toBe(false);
    expect(await run(msg("push_match", "push:nao-existe"))).toEqual({ ok: true, value: [] });
    expect(await run(msg("push_due", "due:nao-existe"))).toEqual({ ok: true, value: [] });
  });
});
