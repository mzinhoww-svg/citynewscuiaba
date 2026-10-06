import { describe, expect, it } from "vitest";
import {
  classifyDeadLetter,
  failureSignature,
  groupIncidents,
  runAutonomySweep,
  type AutonomySweepPort,
  type DeadLetter,
  type DueArticle,
} from "./autonomy-sweep";
import type { PipelineMessage } from "./types";

const NOW = new Date("2026-10-04T15:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function port(
  over: { due?: DueArticle[]; dead?: DeadLetter[]; recover?: Record<string, unknown> } = {},
) {
  const enqueued: PipelineMessage[] = [];
  const classified: { id: number; reasonClass: string; nextRetryAt: string | null }[] = [];
  const retried: number[][] = [];
  const bumps: { id: number; next: string | null }[] = [];
  const incidents: string[] = [];
  const p: AutonomySweepPort = {
    breakerAutoRecover: async () => over.recover ?? { recovered: false, reason: "closed" },
    dueArticles: async () => over.due ?? [],
    claimArticle: async () => {},
    enqueue: async (m) => {
      enqueued.push(m);
      return true;
    },
    openDeadLetters: async () => over.dead ?? [],
    classifyDeadLetter: async (id, c) => void classified.push({ id, ...c }),
    retryDeadLetters: async (ids) => {
      retried.push(ids);
      return ids.length;
    },
    bumpDeadLetter: async (id, next) => void bumps.push({ id, next }),
    upsertIncident: async (i) => void incidents.push(i.signature),
    resolveIncidents: async () => 0,
  };
  return { p, enqueued, classified, retried, bumps, incidents };
}

const dl = (over: Partial<DeadLetter> = {}): DeadLetter => ({
  id: 1,
  step: "write",
  error: "timeout do provedor",
  quarantinedAt: ago(10),
  reasonClass: null,
  autoRetries: 0,
  nextRetryAt: null,
  ...over,
});

describe("varredura de autonomia", () => {
  it("falha de IA: agenda nova redação do assunto; demais voltam às regras", async () => {
    const t = port({
      due: [
        { id: "a1", topicId: "t1", nextAction: "rewrite", aiFallback: true, reprocessCount: 1 },
        { id: "a2", topicId: "t2", nextAction: "reevaluate", aiFallback: false, reprocessCount: 2 },
      ],
    });
    const r = await runAutonomySweep(t.p, NOW);
    expect(r).toMatchObject({ rewrites: 1, reevaluations: 1 });
    expect(t.enqueued.map((m) => [m.step, m.itemRef])).toEqual([
      ["summarize", "topic:t1#retry1"],
      ["rules", "article:a2"],
    ]);
  });

  it("disjuntor: a varredura pede a recuperação automática e devolve o diagnóstico", async () => {
    const t = port({ recover: { recovered: true, released: 12 } });
    expect((await runAutonomySweep(t.p, NOW)).breaker).toEqual({ recovered: true, released: 12 });
  });

  it("item morto ganha classe e recomendação; transitório volta à fila no prazo, no máximo 3 vezes", async () => {
    const t = port({
      dead: [
        dl({ id: 1 }),
        dl({ id: 2, reasonClass: "transient", nextRetryAt: ago(1), autoRetries: 0 }),
        dl({ id: 3, reasonClass: "transient", nextRetryAt: ago(1), autoRetries: 3 }),
        dl({ id: 4, error: "referência inválida: x", reasonClass: null }),
      ],
    });
    const r = await runAutonomySweep(t.p, NOW);
    expect(t.classified.map((c) => [c.id, c.reasonClass, c.nextRetryAt !== null])).toEqual([
      [1, "transient", true],
      [4, "invalid", false],
    ]);
    expect(t.retried).toEqual([[2]]);
    expect(r.deadLettersRetried).toBe(1);
    expect(t.bumps.find((b) => b.id === 3)?.next).toBeNull();
  });

  it("20 falhas iguais viram 1 incidente, não 20 pedidos", async () => {
    const dead = Array.from({ length: 20 }, (_, i) =>
      dl({ id: i, error: `timeout do provedor no item ${i}`, quarantinedAt: ago(i) }),
    );
    const groups = groupIncidents(dead, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 20, step: "write", errorClass: "transient" });
    const t = port({ dead });
    expect((await runAutonomySweep(t.p, NOW)).incidents).toBe(1);
  });

  it("classifica e assina erros", () => {
    expect(classifyDeadLetter("injeção detectada").retryable).toBe(false);
    expect(classifyDeadLetter("matéria x não encontrada").reasonClass).toBe("not_found");
    expect(classifyDeadLetter("ECONNRESET").reasonClass).toBe("transient");
    expect(failureSignature("write", "timeout 123 em 'abc'")).toBe(
      failureSignature("write", "timeout 456 em 'xyz'"),
    );
  });
});
