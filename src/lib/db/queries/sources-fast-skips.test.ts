vi.mock("server-only", () => ({}));
import { fastLaneFullSlugs } from "./sources-fast-skips";

describe("fontes puladas por falta de vaga", () => {
  it("só conta fast_lane_full, sem repetir", () => {
    expect(
      fastLaneFullSlugs({
        skipped: [
          { slug: "folha-do-cerrado", reason: "fast_lane_full" },
          { slug: "mt-agora", reason: "previous_pending" },
          { slug: "folha-do-cerrado", reason: "fast_lane_full" },
          { slug: "portal-varzea", reason: "rate_limited" },
        ],
      }),
    ).toEqual(["folha-do-cerrado"]);
  });
  it("estatística vazia ou malformada não lança", () => {
    for (const v of [null, undefined, [], "x", {}, { skipped: "x" }, { skipped: [null, 3] }])
      expect(fastLaneFullSlugs(v)).toEqual([]);
  });
});
