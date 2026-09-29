import { describe, expect, it } from "vitest";
import { cuiabaDay, summarizeCosts, type CostCall } from "./costs";

// 2026-09-29 12:00 em Cuiabá = 16:00 UTC.
const NOW = new Date("2026-09-29T16:00:00Z");
const call = (agent: string, model: string, brl: number, iso: string): CostCall => ({
  agentId: agent,
  modelId: model,
  costBrl: brl,
  at: iso,
});
const agents = [
  { id: "write", dailyBudgetBrl: 10 },
  { id: "classify", dailyBudgetBrl: 3 },
  { id: "verify", dailyBudgetBrl: 4 },
];

describe("cuiabaDay", () => {
  it("usa UTC-4: 02:00 UTC ainda é o dia anterior em Cuiabá", () =>
    expect(cuiabaDay(new Date("2026-09-29T02:00:00Z"))).toBe("2026-09-28"));
});

describe("summarizeCosts", () => {
  const calls = [
    call("write", "m1", 9.5, "2026-09-29T14:00:00Z"),
    call("classify", "m2", 3, "2026-09-29T13:00:00Z"),
    call("verify", "m2", 1, "2026-09-29T13:30:00Z"),
    call("write", "m1", 2, "2026-09-28T15:00:00Z"),
    call("write", "m1", 5, "2026-09-20T15:00:00Z"),
  ];
  const s = summarizeCosts(calls, agents, NOW, { days: 7, globalBudgetBrl: 30 });

  it("soma o dia de hoje e o total por dia sem buracos", () => {
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)).toEqual({ date: "2026-09-29", costBrl: 13.5 });
    expect(s.days.at(-2)).toEqual({ date: "2026-09-28", costBrl: 2 });
    expect(s.days[0]?.date).toBe("2026-09-23");
    expect(s.todayBrl).toBe(13.5);
  });

  it("agrupa por agente (hoje, com % do orçamento) e por modelo (janela)", () => {
    const write = s.byAgent.find((a) => a.agentId === "write");
    expect(write).toMatchObject({ spentTodayBrl: 9.5, budgetBrl: 10, pct: 95 });
    expect(s.byModel).toEqual([
      { modelId: "m1", costBrl: 11.5 },
      { modelId: "m2", costBrl: 4 },
    ]);
  });

  it("alerta a 90% e pausa a 100%, por agente", () => {
    expect(s.alerts).toContainEqual({ scope: "agent", id: "write", level: "warn", pct: 95 });
    expect(s.alerts).toContainEqual({ scope: "agent", id: "classify", level: "paused", pct: 100 });
    expect(s.alerts.find((a) => a.id === "verify")).toBeUndefined();
  });

  it("alerta no teto global (R$ 13,50 de R$ 30 não alerta; 27 alerta)", () => {
    expect(s.alerts.find((a) => a.scope === "global")).toBeUndefined();
    const big = summarizeCosts([call("write", "m1", 27, "2026-09-29T14:00:00Z")], agents, NOW, {
      days: 7,
      globalBudgetBrl: 30,
    });
    expect(big.alerts).toContainEqual({ scope: "global", id: "global", level: "warn", pct: 90 });
  });

  it("sem chamadas: tudo zero e sem alerta", () => {
    const z = summarizeCosts([], agents, NOW, { days: 3, globalBudgetBrl: 30 });
    expect(z.todayBrl).toBe(0);
    expect(z.alerts).toEqual([]);
    expect(z.byModel).toEqual([]);
  });
});
