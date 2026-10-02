import {
  dedupeKey,
  JOB_STEPS,
  parsePipelineMessage,
  PUSH_STEPS,
  queueFor,
  STEP_NAMES,
} from "./types";
import { MAX_ATTEMPTS, retryPolicy } from "./retry";

describe("mensagens do pipeline", () => {
  it("20 etapas da spec §6.2, na ordem", () => {
    expect(STEP_NAMES).toHaveLength(20);
    expect(STEP_NAMES[0]).toBe("tick");
    expect(STEP_NAMES[1]).toBe("fetch");
    expect(STEP_NAMES[19]).toBe("notify");
  });

  it("STEP_NAMES segue com 20 etapas; push_* vão para notify (G3)", () => {
    expect(STEP_NAMES).toHaveLength(20);
    expect(PUSH_STEPS).toEqual(["push_match", "push_deliver", "push_due"]);
    expect(JOB_STEPS).toHaveLength(23);
    expect(queueFor("push_deliver")).toBe("notify");
    expect(queueFor("push_match")).toBe("notify");
    expect(queueFor("notify")).toBe("notify");
    expect(queueFor("fetch")).toBe("pipeline");
    const r = parsePipelineMessage({
      runId: "push",
      step: "push_match",
      itemRef: "article:a1",
      attempt: 1,
    });
    expect(r.ok && dedupeKey(r.value)).toBe("push_match:article:a1");
  });

  it("chave de idempotência é (etapa, item)", () => {
    const msg = {
      runId: "r1",
      step: "fetch" as const,
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    };
    expect(dedupeKey(msg)).toBe("fetch:source:folha-do-cerrado");
    expect(dedupeKey({ ...msg, runId: "r2", attempt: 3 })).toBe(dedupeKey(msg));
  });

  it("mensagem malformada é recusada", () => {
    expect(parsePipelineMessage({ runId: "r1", step: "voar", itemRef: "x", attempt: 1 }).ok).toBe(
      false,
    );
    expect(parsePipelineMessage({ runId: "r1", step: "fetch", itemRef: "", attempt: 1 }).ok).toBe(
      false,
    );
    expect(
      parsePipelineMessage({ runId: "r1", step: "fetch", itemRef: "source:x", attempt: 1 }),
    ).toEqual({ ok: true, value: { runId: "r1", step: "fetch", itemRef: "source:x", attempt: 1 } });
  });
});

describe("política de nova tentativa (1, 4 e 10 min; depois quarentena)", () => {
  it("espera cresce a cada falha", () => {
    expect(retryPolicy(1)).toEqual({ action: "retry", delaySec: 60 });
    expect(retryPolicy(2)).toEqual({ action: "retry", delaySec: 240 });
    expect(retryPolicy(3)).toEqual({ action: "retry", delaySec: 600 });
  });
  it("esgotou as tentativas: quarentena", () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(retryPolicy(4)).toEqual({ action: "quarantine" });
    expect(retryPolicy(9)).toEqual({ action: "quarantine" });
  });
  it("erro não recuperável vai direto para a quarentena", () => {
    expect(retryPolicy(1, { retryable: false })).toEqual({ action: "quarantine" });
  });
});
