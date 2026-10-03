import { describe, expect, it, vi } from "vitest";
import { createForcedPublishStep } from "./forced-publish";

const JOB = "11111111-1111-4111-8111-111111111111";
const msg = (itemRef: string) => ({
  runId: "forced",
  step: "forced_publish" as const,
  itemRef,
  attempt: 1,
});

describe("passo forced_publish", () => {
  it("roda o lote e invalida o cache das publicadas", async () => {
    const runBatch = vi.fn().mockResolvedValue({
      status: "ok",
      published: [{ id: "a1", slug: "a-1", topicId: null, sectionSlug: "cidade" }],
    });
    const revalidate = vi.fn().mockResolvedValue(undefined);
    const r = await createForcedPublishStep({ runBatch, revalidate })(msg(`forced:${JOB}:3`));
    expect(r).toEqual({ ok: true, value: [] });
    expect(runBatch).toHaveBeenCalledWith(JOB, 3);
    expect(revalidate.mock.calls[0]![0]).toEqual(expect.arrayContaining(["article:a1", "home"]));
  });

  it("referência inválida e lote inexistente vão para a quarentena", async () => {
    const step = createForcedPublishStep({
      runBatch: vi.fn().mockResolvedValue({ status: "not_found", published: [] }),
      revalidate: vi.fn(),
    });
    const bad = await step(msg("forced:xx"));
    expect(bad.ok === false && bad.error.kind).toBe("invalid");
    const gone = await step(msg(`forced:${JOB}:0`));
    expect(gone.ok === false && gone.error.kind).toBe("not_found");
  });
});
