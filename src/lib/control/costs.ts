/**
 * Custos e limites da IA (O09): resumo puro sobre as linhas de `ai_cost_daily` (dia de Cuiabá,
 * agente, modelo). Meta: custo por notícia publicada ≤ R$ 4 (spec §10); alerta a 90% e pausa a
 * 100% do orçamento diário.
 */

export interface CostRow {
  /** Dia de Cuiabá, "AAAA-MM-DD". */
  day: string;
  agentId: string;
  modelId: string;
  costBrl: number;
  calls: number;
  errors: number;
  fallbacks: number;
  tokensIn: number;
  tokensOut: number;
  avgLatencyMs: number;
}

export const COST_PER_ARTICLE_TARGET_BRL = 4;

export interface AgentCost {
  agentId: string;
  todayBrl: number;
  budgetBrl: number | null;
  /** Parte do orçamento do dia já usada (0 a 1+); `null` sem orçamento. */
  budgetShare: number | null;
  last7Brl: number;
  calls7: number;
  errors7: number;
  fallbacks7: number;
  avgLatencyMs7: number;
}

export interface ModelCost {
  modelId: string;
  costBrl: number;
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

export interface CostSummary {
  todayBrl: number;
  last7Brl: number;
  last30Brl: number;
  globalBudgetBrl: number;
  /** Série diária dos últimos 30 dias (dias sem gasto entram com 0), do mais antigo ao de hoje. */
  daily: { day: string; costBrl: number }[];
  perAgent: AgentCost[];
  perModel: ModelCost[];
  /** Gasto de 30 dias ÷ matérias publicadas em 30 dias; `null` sem publicação. */
  costPerArticleBrl: number | null;
  errorRate7: number;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** "AAAA-MM-DD" `n` dias antes de `day` (datas de calendário, sem fuso). */
export function dayMinus(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function costSummary(input: {
  rows: CostRow[];
  today: string;
  budgets: { agentId: string; dailyBudgetBrl: number }[];
  globalBudgetBrl: number;
  published30d: number;
}): CostSummary {
  const { rows, today } = input;
  const from7 = dayMinus(today, 6);
  const from30 = dayMinus(today, 29);
  const in30 = rows.filter((r) => r.day >= from30 && r.day <= today);
  const in7 = in30.filter((r) => r.day >= from7);
  const sum = (xs: CostRow[], k: "costBrl" | "calls" | "errors" | "fallbacks") =>
    xs.reduce((s, r) => s + r[k], 0);

  const byDay = new Map<string, number>();
  for (const r of in30) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.costBrl);
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = dayMinus(today, 29 - i);
    return { day, costBrl: round(byDay.get(day) ?? 0) };
  });

  const agents = [
    ...new Set([...input.budgets.map((b) => b.agentId), ...in30.map((r) => r.agentId)]),
  ];
  const perAgent = agents
    .map((agentId): AgentCost => {
      const mine7 = in7.filter((r) => r.agentId === agentId);
      const todayBrl = sum(
        mine7.filter((r) => r.day === today),
        "costBrl",
      );
      const budget = input.budgets.find((b) => b.agentId === agentId)?.dailyBudgetBrl ?? null;
      const calls7 = sum(mine7, "calls");
      return {
        agentId,
        todayBrl: round(todayBrl, 4),
        budgetBrl: budget,
        budgetShare: budget && budget > 0 ? round(todayBrl / budget, 3) : null,
        last7Brl: round(sum(mine7, "costBrl"), 4),
        calls7,
        errors7: sum(mine7, "errors"),
        fallbacks7: sum(mine7, "fallbacks"),
        avgLatencyMs7:
          calls7 > 0
            ? Math.round(mine7.reduce((s, r) => s + r.avgLatencyMs * r.calls, 0) / calls7)
            : 0,
      };
    })
    .sort((a, b) => b.last7Brl - a.last7Brl || a.agentId.localeCompare(b.agentId));

  const models = new Map<string, ModelCost>();
  for (const r of in30) {
    const m = models.get(r.modelId) ?? {
      modelId: r.modelId,
      costBrl: 0,
      calls: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    m.costBrl += r.costBrl;
    m.calls += r.calls;
    m.tokensIn += r.tokensIn;
    m.tokensOut += r.tokensOut;
    models.set(r.modelId, m);
  }
  const perModel = [...models.values()]
    .map((m) => ({ ...m, costBrl: round(m.costBrl, 4) }))
    .sort((a, b) => b.costBrl - a.costBrl);

  const last30 = sum(in30, "costBrl");
  const calls7 = sum(in7, "calls");
  return {
    todayBrl: round(
      sum(
        in30.filter((r) => r.day === today),
        "costBrl",
      ),
    ),
    last7Brl: round(sum(in7, "costBrl")),
    last30Brl: round(last30),
    globalBudgetBrl: input.globalBudgetBrl,
    daily,
    perAgent,
    perModel,
    costPerArticleBrl: input.published30d > 0 ? round(last30 / input.published30d) : null,
    errorRate7: calls7 > 0 ? round(sum(in7, "errors") / calls7, 4) : 0,
  };
}
