import { agentLabel } from "@/content/pt-BR/control-ai";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import type { CostSummary } from "@/lib/ai/costs";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";
import { CostChart } from "./CostChart";

export interface CostPanelProps {
  summary: CostSummary;
  days: number;
}

const stateText = (pct: number) =>
  pct >= 100 ? T.statePaused : pct >= 90 ? T.stateWarn : T.stateOk;

/** Custos e limites da IA (O09): teto do dia, alertas, gráfico, por agente e por modelo. */
export function CostPanel({ summary, days }: CostPanelProps) {
  const globalPct =
    summary.globalBudgetBrl > 0
      ? Math.round((summary.todayBrl / summary.globalBudgetBrl) * 100)
      : 0;
  const kpis: [string, string][] = [
    [T.costsKpiToday, T.brlFine(summary.todayBrl)],
    [T.costsKpiGlobal, T.brl(summary.globalBudgetBrl)],
    [T.costsKpiPct, `${globalPct}%`],
  ];
  return (
    <div className="flex flex-col gap-10">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <dt className="type-meta text-meta">{label}</dt>
            <dd className="text-28 font-bold tabular-nums leading-tight text-strong">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="ai-alerts" className="flex flex-col gap-3">
        <h2 id="ai-alerts" className="type-section text-strong">
          {T.alertsTitle}
        </h2>
        {summary.alerts.length === 0 ? (
          <p className="type-body text-meta">{T.alertsNone}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.alerts.map((a) => (
              <li key={`${a.scope}-${a.id}`}>
                <InlineAlert tone={a.level === "paused" ? "error" : "warn"} role="none">
                  {T.alertLine(
                    a.scope === "global" ? T.globalLabel : agentLabel(a.id),
                    a.level === "paused" ? T.alertPaused : T.alertWarn,
                    a.pct,
                  )}
                </InlineAlert>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ai-chart" className="flex flex-col gap-3">
        <h2 id="ai-chart" className="type-section text-strong">
          {T.chartTitle}
        </h2>
        <CostChart days={summary.days} limitBrl={summary.globalBudgetBrl} />
        <p className="type-meta text-meta">{T.periodNote(days)}</p>
      </section>

      <section aria-labelledby="ai-by-agent" className="flex flex-col gap-3">
        <h2 id="ai-by-agent" className="type-section text-strong">
          {T.byAgentTitle}
        </h2>
        <AiOpsTable
          caption={T.byAgentCaption}
          columns={[T.colAgent, T.colSpent, T.colBudget, T.colUsed, T.colState]}
        >
          {summary.byAgent.map((a) => (
            <tr key={a.agentId} className={ROW}>
              <th scope="row" className={`${CELL} text-strong`}>
                <span className="block font-semibold">{agentLabel(a.agentId)}</span>
                <span className="block type-meta text-meta">{a.agentId}</span>
              </th>
              <td className={`${CELL} tabular-nums`}>{T.brlFine(a.spentTodayBrl)}</td>
              <td className={`${CELL} tabular-nums`}>{T.brl(a.budgetBrl)}</td>
              <td className={`${CELL} tabular-nums`}>{a.pct}%</td>
              <td className={`${CELL} font-semibold text-strong`}>
                <span className="inline-flex items-center gap-1">
                  {a.pct >= 90 && <Icon name="triangle-alert" size={16} />}
                  {stateText(a.pct)}
                </span>
              </td>
            </tr>
          ))}
        </AiOpsTable>
        <p className="type-meta text-meta">{T.budgetLimit}</p>
      </section>

      <section aria-labelledby="ai-by-model" className="flex flex-col gap-3">
        <h2 id="ai-by-model" className="type-section text-strong">
          {T.byModelTitle}
        </h2>
        {summary.byModel.length === 0 ? (
          <p className="type-body text-meta">{T.byModelEmpty}</p>
        ) : (
          <AiOpsTable caption={T.byModelCaption} columns={[T.colModel, T.colCost]}>
            {summary.byModel.map((m) => (
              <tr key={m.modelId} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {m.modelId}
                </th>
                <td className={`${CELL} tabular-nums`}>{T.brlFine(m.costBrl)}</td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </section>
    </div>
  );
}
