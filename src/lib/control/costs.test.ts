import { costSummary, dayMinus, type CostRow } from "./costs";

const row = (
  day: string,
  agentId: string,
  costBrl: number,
  over: Partial<CostRow> = {},
): CostRow => ({
  day,
  agentId,
  modelId: "google/gemini-2.5-flash",
  costBrl,
  calls: 10,
  errors: 0,
  fallbacks: 0,
  tokensIn: 1000,
  tokensOut: 200,
  avgLatencyMs: 1000,
  ...over,
});

describe("costSummary", () => {
  const today = "2026-09-28";
  const s = costSummary({
    today,
    globalBudgetBrl: 30,
    published30d: 5,
    budgets: [
      { agentId: "write", dailyBudgetBrl: 10 },
      { agentId: "answer", dailyBudgetBrl: 6 },
      { agentId: "image", dailyBudgetBrl: 2 },
    ],
    rows: [
      row(today, "write", 9, { errors: 1, avgLatencyMs: 2000 }),
      row(today, "answer", 1.5, { modelId: "openai/gpt-4o-mini", fallbacks: 2 }),
      row("2026-09-25", "write", 4, { avgLatencyMs: 1000 }),
      row("2026-09-10", "answer", 5.5),
      // Fora dos 30 dias: não entra.
      row("2026-08-01", "write", 100),
    ],
  });

  it("totais de hoje, 7 e 30 dias e custo por matéria publicada", () => {
    expect([s.todayBrl, s.last7Brl, s.last30Brl]).toEqual([10.5, 14.5, 20]);
    expect(s.costPerArticleBrl).toBe(4);
    expect(s.errorRate7).toBe(0.0333);
  });

  it("série diária de 30 dias com zeros e hoje no fim", () => {
    expect(s.daily).toHaveLength(30);
    expect(s.daily[0]).toEqual({ day: "2026-08-30", costBrl: 0 });
    expect(s.daily.at(-1)).toEqual({ day: today, costBrl: 10.5 });
    expect(s.daily.find((d) => d.day === "2026-09-25")?.costBrl).toBe(4);
  });

  it("por agente: parte do orçamento, latência ponderada; agente sem gasto aparece zerado", () => {
    const write = s.perAgent.find((a) => a.agentId === "write")!;
    expect(write).toMatchObject({
      todayBrl: 9,
      budgetBrl: 10,
      budgetShare: 0.9,
      last7Brl: 13,
      calls7: 20,
      errors7: 1,
      avgLatencyMs7: 1500,
    });
    expect(s.perAgent.find((a) => a.agentId === "image")).toMatchObject({
      todayBrl: 0,
      budgetShare: 0,
      calls7: 0,
    });
    expect(s.perAgent[0]?.agentId).toBe("write");
  });

  it("por modelo em 30 dias", () => {
    expect(s.perModel.map((m) => [m.modelId, m.costBrl])).toEqual([
      ["google/gemini-2.5-flash", 18.5],
      ["openai/gpt-4o-mini", 1.5],
    ]);
  });

  it("sem publicação, custo por matéria é nulo", () => {
    expect(
      costSummary({ today, globalBudgetBrl: 30, published30d: 0, budgets: [], rows: [] })
        .costPerArticleBrl,
    ).toBeNull();
  });

  it("dayMinus atravessa mês", () => {
    expect(dayMinus("2026-03-01", 1)).toBe("2026-02-28");
  });
});
