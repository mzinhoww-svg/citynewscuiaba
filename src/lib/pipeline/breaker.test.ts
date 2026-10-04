import { describe, expect, it } from "vitest";
import {
  AI_FAILURE_RATE,
  breaker,
  breakerText,
  DEFAULT_BREAKER_LIMITS,
  type BreakerCounts,
} from "./breaker";

const NOW = new Date("2026-10-03T18:00:00Z");
const calm: BreakerCounts = {
  publishedLastHour: 10,
  publishedToday: 100,
  reportsLastHour: 0,
  aiCallsLastHour: 100,
  aiFailuresLastHour: 0,
};

describe("disjuntor (AUT-T4, A8)", () => {
  it("fechado em operação normal", () =>
    expect(breaker.check(NOW, calm)).toEqual({ open: false, reason: null }));

  it("a 301ª publicação na hora abre; 299 não", () => {
    expect(breaker.check(NOW, { ...calm, publishedLastHour: 299 }).open).toBe(false);
    expect(breaker.check(NOW, { ...calm, publishedLastHour: 300 })).toEqual({
      open: true,
      reason: "hourly",
    });
  });

  it("3.000 no dia abre", () => {
    expect(breaker.check(NOW, { ...calm, publishedToday: 2999 }).open).toBe(false);
    expect(breaker.check(NOW, { ...calm, publishedToday: 3000 })).toEqual({
      open: true,
      reason: "daily",
    });
  });

  it("pico de denúncias abre", () =>
    expect(breaker.check(NOW, { ...calm, reportsLastHour: 10 })).toEqual({
      open: true,
      reason: "reports",
    }));

  it("falha de IA abre só com volume e taxa acima da metade", () => {
    const base = { ...calm, aiCallsLastHour: 40 };
    expect(breaker.check(NOW, { ...base, aiFailuresLastHour: 14 }).open).toBe(false);
    // 15 falhas em 100 chamadas é pico isolado, não abre.
    expect(breaker.check(NOW, { ...calm, aiFailuresLastHour: 15 }).open).toBe(false);
    expect(breaker.check(NOW, { ...base, aiFailuresLastHour: 20 })).toEqual({
      open: true,
      reason: "ai_failures",
    });
    expect(AI_FAILURE_RATE).toBe(0.5);
  });

  it("limites editáveis valem no lugar dos padrões", () => {
    const limits = { ...DEFAULT_BREAKER_LIMITS, hourly: 5 };
    expect(breaker.check(NOW, { ...calm, publishedLastHour: 5 }, limits).reason).toBe("hourly");
    expect(breakerText("hourly", limits)).toContain("5 publicações");
  });

  it("a ordem dos motivos é hora, dia, denúncias, IA", () =>
    expect(
      breaker.check(NOW, {
        publishedLastHour: 300,
        publishedToday: 3000,
        reportsLastHour: 10,
        aiCallsLastHour: 10,
        aiFailuresLastHour: 10,
      }).reason,
    ).toBe("hourly"));
});
