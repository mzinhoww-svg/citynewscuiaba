import { describe, expect, it } from "vitest";
import { FEATURE_MAX_DAYS, featureDayLabel, featuredUntilOf, featureDateInput } from "./feature";

// 08/10/2026, 11h em Cuiabá (UTC−4).
const NOW = new Date("2026-10-08T15:00:00Z");

describe("featuredUntilOf (Destacar até {data})", () => {
  it("vale até o fim do dia escolhido no fuso de Cuiabá", () => {
    expect(featuredUntilOf("2026-10-10", NOW)).toEqual({
      ok: true,
      value: "2026-10-11T03:59:59.000Z",
    });
  });

  it("hoje é aceito; ontem, data inválida e além do teto não", () => {
    expect(featuredUntilOf("2026-10-08", NOW).ok).toBe(true);
    for (const raw of ["2026-10-07", "", "10/10/2026", "2026-02-30", "2027-10-08"])
      expect(featuredUntilOf(raw, NOW), raw).toEqual({ ok: false, error: "invalid" });
    expect(FEATURE_MAX_DAYS).toBe(90);
  });

  it("campo de data mostra o dia local do destaque guardado", () => {
    expect(featureDateInput("2026-10-11T03:59:59.000Z")).toBe("2026-10-10");
    expect(featureDateInput(null)).toBe("");
  });
});

it("rótulo dd/mm do fim do destaque no fuso de Cuiabá", () => {
  expect(featureDayLabel("2026-10-11T03:59:59.000Z")).toBe("10/10");
});
