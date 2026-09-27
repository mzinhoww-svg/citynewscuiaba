import { createRunStep, nextMessage, stepError } from "./run-step";
import type { PipelineMessage } from "./types";

const msg: PipelineMessage = { runId: "r1", step: "fetch", itemRef: "source:x", attempt: 1 };

describe("runStep", () => {
  it("despacha para o handler da etapa e devolve as próximas mensagens", async () => {
    const runStep = createRunStep({
      fetch: async (m) => ({ ok: true, value: [nextMessage(m, "validate", "raw:1")] }),
    });
    expect(await runStep(msg)).toEqual({
      ok: true,
      value: [{ runId: "r1", step: "validate", itemRef: "raw:1", attempt: 1 }],
    });
  });

  it("etapa sem handler é erro não recuperável", async () => {
    const r = await createRunStep({})(msg);
    expect(r).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "no_handler", retryable: false }),
    });
  });

  it("exceção do handler vira erro transitório (nova tentativa)", async () => {
    const r = await createRunStep({
      fetch: async () => {
        throw new Error("ECONNRESET");
      },
    })(msg);
    expect(r).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "transient", retryable: true, message: "ECONNRESET" }),
    });
  });

  it("fábricas de erro", () => {
    expect(stepError.injection("x")).toMatchObject({ kind: "injection", retryable: false });
    expect(stepError.invalid("x")).toMatchObject({ kind: "invalid", retryable: false });
    expect(stepError.transient("x")).toMatchObject({ kind: "transient", retryable: true });
  });
});
