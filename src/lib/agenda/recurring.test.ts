import { describe, expect, it } from "vitest";
import { RECURRING_DATES, upcomingRecurring } from "./recurring";

describe("recurring", () => {
  it("todo item tem link de conferência https", () => {
    for (const r of RECURRING_DATES) expect(r.source).toMatch(/^https:\/\//);
  });
  it("traz o aniversário de Cuiabá em 8 de abril e não inventa o Festival de Pesca", () => {
    const a = RECURRING_DATES.find((r) => r.id === "aniversario-cuiaba");
    expect([a?.month, a?.day]).toEqual([4, 8]);
    expect(RECURRING_DATES.some((r) => /pesca/i.test(r.title))).toBe(false);
  });
  it("ordena pela próxima ocorrência e vira o ano", () => {
    const list = upcomingRecurring(new Date("2026-10-03T15:00:00Z"), 4);
    expect(list.map((r) => r.id)).toEqual(["aparecida", "finados", "republica", "natal"]);
    const late = upcomingRecurring(new Date("2026-12-26T15:00:00Z"), 2);
    expect(late.map((r) => r.id)).toEqual(["ano-novo", "aniversario-cuiaba"]);
    expect(late[0]?.next.getUTCFullYear()).toBe(2027);
  });
  it("data aproximada do mês vale durante o mês todo", () => {
    const list = upcomingRecurring(new Date("2026-07-20T15:00:00Z"), 1);
    expect(list[0]?.id).toBe("sao-benedito");
  });
});
