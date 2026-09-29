/*
 * Custos da IA (Control Center O09; P5-T6). Funções puras sobre linhas de `ai_calls`: gasto por
 * dia, por agente (contra o orçamento diário) e por modelo, e os alertas de orçamento
 * (arquitetura §11: alerta a 90%; spec §9: pausa a 100%). Dias em Cuiabá (UTC−4).
 */

export interface CostCall {
  agentId: string;
  modelId: string;
  costBrl: number;
  /** ISO 8601. */
  at: string;
}

export interface CostAgent {
  id: string;
  dailyBudgetBrl: number;
}

export interface AgentCost {
  agentId: string;
  spentTodayBrl: number;
  budgetBrl: number;
  /** Percentual do orçamento diário, arredondado. */
  pct: number;
}

export interface BudgetAlert {
  scope: "agent" | "global";
  id: string;
  /** `warn`: ≥ 90% do orçamento; `paused`: ≥ 100% (o agente para de chamar o modelo). */
  level: "warn" | "paused";
  pct: number;
}

export interface CostSummary {
  days: { date: string; costBrl: number }[];
  byAgent: AgentCost[];
  byModel: { modelId: string; costBrl: number }[];
  todayBrl: number;
  globalBudgetBrl: number;
  alerts: BudgetAlert[];
}

const OFFSET_MS = -4 * 3600_000;
const DAY_MS = 86_400_000;
const WARN_AT = 90;
const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** Data (AAAA-MM-DD) do dia em Cuiabá. */
export function cuiabaDay(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function level(pct: number): BudgetAlert["level"] | null {
  if (pct >= 100) return "paused";
  return pct >= WARN_AT ? "warn" : null;
}

export function summarizeCosts(
  calls: readonly CostCall[],
  agents: readonly CostAgent[],
  now: Date,
  opts: { days: number; globalBudgetBrl: number },
): CostSummary {
  const today = cuiabaDay(now);
  const dates = Array.from({ length: opts.days }, (_, i) =>
    cuiabaDay(new Date(now.getTime() - (opts.days - 1 - i) * DAY_MS)),
  );
  const perDay = new Map(dates.map((d) => [d, 0]));
  const perAgentToday = new Map<string, number>();
  const perModel = new Map<string, number>();

  for (const c of calls) {
    const day = cuiabaDay(new Date(c.at));
    if (!perDay.has(day)) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + c.costBrl);
    perModel.set(c.modelId, (perModel.get(c.modelId) ?? 0) + c.costBrl);
    if (day === today)
      perAgentToday.set(c.agentId, (perAgentToday.get(c.agentId) ?? 0) + c.costBrl);
  }

  const byAgent: AgentCost[] = agents.map((a) => {
    const spent = round(perAgentToday.get(a.id) ?? 0);
    return {
      agentId: a.id,
      spentTodayBrl: spent,
      budgetBrl: a.dailyBudgetBrl,
      pct: a.dailyBudgetBrl > 0 ? Math.round((spent / a.dailyBudgetBrl) * 100) : 0,
    };
  });
  const todayBrl = round(perDay.get(today) ?? 0);
  const globalPct =
    opts.globalBudgetBrl > 0 ? Math.round((todayBrl / opts.globalBudgetBrl) * 100) : 0;

  const alerts: BudgetAlert[] = [];
  for (const a of byAgent) {
    const l = level(a.pct);
    if (l) alerts.push({ scope: "agent", id: a.agentId, level: l, pct: a.pct });
  }
  const g = level(globalPct);
  if (g) alerts.push({ scope: "global", id: "global", level: g, pct: globalPct });

  return {
    days: dates.map((date) => ({ date, costBrl: round(perDay.get(date) ?? 0) })),
    byAgent,
    byModel: [...perModel.entries()]
      .map(([modelId, costBrl]) => ({ modelId, costBrl: round(costBrl) }))
      .sort((a, b) => b.costBrl - a.costBrl || a.modelId.localeCompare(b.modelId)),
    todayBrl,
    globalBudgetBrl: opts.globalBudgetBrl,
    alerts,
  };
}
