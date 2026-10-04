import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyHotPins, revalidateTags } = vi.hoisted(() => ({
  applyHotPins: vi.fn(),
  revalidateTags: vi.fn(async (tags: string[]) => void tags),
}));
vi.mock("@/lib/db/client", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/db/hot-pin-store", () => ({ createHotPinRepo: () => ({}) }));
vi.mock("@/lib/featured/hot-pin", () => ({ applyHotPins }));
vi.mock("./revalidate", () => ({ revalidateTags }));

import { runHotPins } from "./hot-pins";

beforeEach(() => {
  applyHotPins.mockReset();
  revalidateTags.mockClear();
});

describe("runHotPins (HOT-T3)", () => {
  it("pino novo invalida a home e devolve o relatório", async () => {
    applyHotPins.mockResolvedValue({ pinned: 2, renewed: 0, skipped: 0 });
    expect(await runHotPins("tick")).toEqual({ pinned: 2, renewed: 0, skipped: 0 });
    expect(revalidateTags).toHaveBeenCalledWith(["home"]);
  });

  it("só renovação: não invalida cache", async () => {
    applyHotPins.mockResolvedValue({ pinned: 0, renewed: 2, skipped: 0 });
    await runHotPins("tick");
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("falha nunca lança (o tick, a rota e a publicação seguem)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    applyHotPins.mockRejectedValue(new Error("banco fora"));
    await expect(runHotPins("publish")).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
