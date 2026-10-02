import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert } from "@/components";
import { CostChart } from "@/components/estudio";
import { AI_TEXT, agentName, formatInt, formatPct } from "@/content/pt-BR/ai-control";
import { formatBrl } from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { costOverview } from "@/lib/db/queries/ai-control";
import { formatDate } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Custos e limites · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const T = AI_TEXT.costs;
const dayLabel = (day: string) => formatDate(day).slice(0, 5);

export default async function CostsPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/custos",
  });
  const can = controlAbilities(session.roles);
  const data = can.costs ? await loadOrNull("ai costs", () => costOverview()) : null;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{AI_TEXT.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {!can.costs ? (
        <InlineAlert tone="info" role="none">
          {T.noAccess}
        </InlineAlert>
      ) : data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={AI_TEXT.errorTitle}
          actions={
            <Button href="/estudio/control/custos" size="md" variant="outline">
              {AI_TEXT.retry}
            </Button>
          }
        >
          {AI_TEXT.errorBody}
        </EmptyState>
      ) : (
        (() => {
          const s = data.value;
          const peak = s.daily.reduce((a, b) => (b.costBrl > a.costBrl ? b : a), s.daily[0]!);
          const avg = s.daily.reduce((x, d) => x + d.costBrl, 0) / Math.max(1, s.daily.length);
          const over = s.daily.filter((d) => d.costBrl > s.globalBudgetBrl * 0.9).length;
          const stats = [
            {
              label: T.today,
              value: formatBrl(s.todayBrl),
              detail: T.budgetOf(formatBrl(s.globalBudgetBrl)),
              attention: s.todayBrl > s.globalBudgetBrl * 0.9,
            },
            { label: T.last7, value: formatBrl(s.last7Brl) },
            { label: T.last30, value: formatBrl(s.last30Brl) },
            {
              label: T.perArticle,
              value:
                s.costPerArticleBrl === null ? T.perArticleNone : formatBrl(s.costPerArticleBrl),
              detail: T.perArticleTarget,
              attention: s.costPerArticleBrl !== null && s.costPerArticleBrl > 4,
            },
            { label: T.errorRate, value: formatPct(s.errorRate7), attention: s.errorRate7 > 0.02 },
          ];
          if (s.last30Brl === 0 && s.perModel.length === 0)
            return (
              <EmptyState icon="percent" title={T.empty}>
                {T.intro}
              </EmptyState>
            );
          return (
            <>
              <section aria-label={T.kpis}>
                <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  {stats.map((st) => (
                    <div
                      key={st.label}
                      className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
                    >
                      <dt className="type-meta text-meta">{st.label}</dt>
                      <dd
                        className={
                          st.attention
                            ? "text-24 font-bold leading-tight tabular-nums text-warn"
                            : "text-24 font-bold leading-tight tabular-nums text-strong"
                        }
                      >
                        {st.value}
                      </dd>
                      {st.detail && <dd className="type-meta text-meta">{st.detail}</dd>}
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="grafico" className="flex flex-col gap-3">
                <h2 id="grafico" className="type-section text-strong">
                  {T.chartTitle}
                </h2>
                <CostChart
                  label={T.chartLabel(formatBrl(s.globalBudgetBrl))}
                  days={s.daily}
                  budgetBrl={s.globalBudgetBrl}
                  formatDay={dayLabel}
                  formatMoney={formatBrl}
                  summary={T.chartSummaryLine(
                    formatBrl(peak.costBrl),
                    formatDate(peak.day),
                    formatBrl(avg),
                    over,
                  )}
                  budgetLabel={T.budgetLine}
                  outOfScale={T.outOfScale}
                  columns={{ day: T.chartDay, cost: T.chartCost }}
                />
              </section>

              <section aria-labelledby="agentes" className="flex flex-col gap-3">
                <h2 id="agentes" className="type-section text-strong">
                  {T.agentsTitle}
                </h2>
                <div
                  role="region"
                  aria-label={T.agentsCaption}
                  tabIndex={0}
                  className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
                >
                  <table className="w-full min-w-[56rem] border-collapse text-left">
                    <caption className="sr-only">{T.agentsCaption}</caption>
                    <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                      <tr>
                        <th scope="col" className="px-3 py-3">
                          {T.agentCol.agent}
                        </th>
                        {(
                          [
                            "today",
                            "budget",
                            "used",
                            "last7",
                            "calls",
                            "errors",
                            "fallbacks",
                            "latency",
                          ] as const
                        ).map((k) => (
                          <th key={k} scope="col" className="px-3 py-3 text-right">
                            {T.agentCol[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.perAgent.map((a) => (
                        <tr key={a.agentId} className="border-b border-line-subtle last:border-b-0">
                          <th scope="row" className="px-3 py-2 type-body font-semibold text-strong">
                            {agentName(a.agentId)}
                          </th>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatBrl(a.todayBrl)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {a.budgetBrl === null ? AI_TEXT.none : formatBrl(a.budgetBrl)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {a.budgetShare === null ? (
                              AI_TEXT.none
                            ) : (
                              <span
                                className={
                                  a.budgetShare >= 0.9 ? "font-semibold text-warn" : undefined
                                }
                              >
                                {formatPct(a.budgetShare)}
                                {a.budgetShare >= 1
                                  ? ` · ${T.overBudget}`
                                  : a.budgetShare >= 0.9
                                    ? ` · ${T.nearBudget}`
                                    : ""}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatBrl(a.last7Brl)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatInt(a.calls7)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatInt(a.errors7)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatInt(a.fallbacks7)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {a.calls7 > 0 ? `${formatInt(a.avgLatencyMs7)} ms` : AI_TEXT.none}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section aria-labelledby="modelos" className="flex flex-col gap-3">
                <h2 id="modelos" className="type-section text-strong">
                  {T.modelsTitle}
                </h2>
                <div
                  role="region"
                  aria-label={T.modelsCaption}
                  tabIndex={0}
                  className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
                >
                  <table className="w-full min-w-[36rem] border-collapse text-left">
                    <caption className="sr-only">{T.modelsCaption}</caption>
                    <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                      <tr>
                        <th scope="col" className="px-3 py-3">
                          {T.modelCol.model}
                        </th>
                        <th scope="col" className="px-3 py-3 text-right">
                          {T.modelCol.cost}
                        </th>
                        <th scope="col" className="px-3 py-3 text-right">
                          {T.modelCol.calls}
                        </th>
                        <th scope="col" className="px-3 py-3 text-right">
                          {T.modelCol.tokens}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.perModel.map((m) => (
                        <tr key={m.modelId} className="border-b border-line-subtle last:border-b-0">
                          <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                            {m.modelId}
                          </th>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatBrl(m.costBrl)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatInt(m.calls)}
                          </td>
                          <td className="px-3 py-2 text-right type-body tabular-nums">
                            {formatInt(m.tokensIn)} / {formatInt(m.tokensOut)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          );
        })()
      )}
    </section>
  );
}
