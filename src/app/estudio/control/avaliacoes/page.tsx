import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert, StatGrid, Table } from "@/components";
import { EvalCasesTable, EvalRunner, StudioScreen } from "@/components/estudio";
import { AI_TEXT, GATE_LABEL, agentName, formatDec, formatPct } from "@/content/pt-BR/ai-control";
import type { GateFailure } from "@/lib/ai/eval";
import { REGRESSION_THRESHOLDS } from "@/lib/ai/eval";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { evalOverview } from "@/lib/db/queries/ai-control";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import { runEvaluationAction, toggleEvalCaseAction } from "../ai-actions";

export const metadata: Metadata = {
  title: "Avaliações e regressão · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const T = AI_TEXT.evals;
const isGate = (s: string): s is GateFailure => s in REGRESSION_THRESHOLDS;

export default async function EvaluationsPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/avaliacoes",
  });
  const canRun = canAccess(session.roles, "prompt.publish");
  const data = await loadOrNull("ai evals", () => evalOverview("answer"));

  return (
    <StudioScreen section={AI_TEXT.sectionLabel} title={T.title} intro={T.intro} gap="lg">
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={AI_TEXT.errorTitle}
          actions={
            <Button href="/estudio/control/avaliacoes" size="md" variant="outline">
              {AI_TEXT.retry}
            </Button>
          }
        >
          {AI_TEXT.errorBody}
        </EmptyState>
      ) : (
        (() => {
          const { runs, cases, prompts } = data.value;
          const latest = runs[0];
          const production = prompts.find((p) => p.status === "production");
          const failures = (latest?.gateFailures ?? []).filter(isGate);
          const m = latest?.metrics;
          const metricRows: [string, string][] = m
            ? [
                [T.metric.precision, formatPct(m.precision)],
                [T.metric.coverage, formatPct(m.coverage)],
                [T.metric.unsourced, String(m.unsourced)],
                [T.metric.hallucinationsPer100, formatDec(m.hallucinationsPer100)],
                [T.metric.refusalsCorrect, String(m.refusalsCorrect)],
                [T.metric.refusalsWrong, String(m.refusalsWrong)],
                [T.metric.p95, `${m.p95} ms`],
              ]
            : [];
          return (
            <>
              <section aria-labelledby="rodar" className="flex flex-col gap-3">
                <h2 id="rodar" className="type-section text-strong">
                  {T.run}
                </h2>
                <p className="type-body text-body">
                  {T.agent}: {agentName("answer")}
                </p>
                {canRun ? (
                  <EvalRunner
                    versions={prompts.map((p) => ({
                      value: String(p.version),
                      label:
                        p.status === "production"
                          ? T.production(p.version)
                          : T.version(
                              p.version,
                              AI_TEXT.governance.promptStatus[p.status] ?? p.status,
                            ),
                    }))}
                    defaultVersion={production ? String(production.version) : ""}
                    labels={{ version: T.promptVersion, run: T.run, running: T.running }}
                    run={runEvaluationAction}
                  />
                ) : (
                  <p className="type-meta text-meta">{T.readOnly}</p>
                )}
                <p className="type-meta text-meta">
                  <strong className="font-semibold text-strong">{T.thresholdsTitle}:</strong>{" "}
                  {T.thresholds}
                </p>
              </section>

              <section aria-labelledby="ultima" className="flex flex-col gap-3">
                <h2 id="ultima" className="type-section text-strong">
                  {T.latestTitle}
                </h2>
                {!latest ? (
                  <p className="type-body text-meta">{T.noRuns}</p>
                ) : (
                  <>
                    <InlineAlert
                      tone={failures.length === 0 ? "success" : "warn"}
                      role="none"
                      title={failures.length === 0 ? T.passed : T.failed}
                    >
                      <p>
                        {formatDateTime(latest.createdAt)} ·{" "}
                        {latest.promptVersion ? `v${latest.promptVersion}` : AI_TEXT.none} ·{" "}
                        {T.provider[latest.provider] ?? latest.provider}
                      </p>
                      {failures.length > 0 && (
                        <p>{T.failedList(failures.map((f) => GATE_LABEL[f]).join(", "))}</p>
                      )}
                    </InlineAlert>
                    <StatGrid
                      aria-label={T.metricsLabel}
                      columns={4}
                      className="xl:grid-cols-7"
                      items={metricRows.map(([k, v]) => ({ label: k, value: v }))}
                    />
                  </>
                )}
              </section>

              {runs.length > 0 && (
                <section aria-labelledby="historico" className="flex flex-col gap-3">
                  <h2 id="historico" className="type-section text-strong">
                    {T.historyTitle}
                  </h2>
                  <Table
                    caption={T.historyCaption}
                    minWidth="lg"
                    headers={[
                      T.historyCol.when,
                      T.historyCol.prompt,
                      T.historyCol.trigger,
                      T.historyCol.provider,
                      { label: T.historyCol.precision, align: "right" },
                      { label: T.historyCol.coverage, align: "right" },
                      { label: T.historyCol.refusals, align: "right" },
                      T.historyCol.result,
                    ]}
                  >
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b border-line-subtle last:border-b-0">
                        <th
                          scope="row"
                          className="px-3 py-2 type-body font-normal tabular-nums text-strong"
                        >
                          {formatDateTime(r.createdAt)}
                        </th>
                        <td className="px-3 py-2 type-body">
                          {r.promptVersion ? `v${r.promptVersion}` : AI_TEXT.none}
                        </td>
                        <td className="px-3 py-2 type-body">{T.trigger[r.trigger] ?? r.trigger}</td>
                        <td className="px-3 py-2 type-body">
                          {T.provider[r.provider] ?? r.provider}
                        </td>
                        <td className="px-3 py-2 text-right type-body tabular-nums">
                          {formatPct(r.metrics.precision)}
                        </td>
                        <td className="px-3 py-2 text-right type-body tabular-nums">
                          {formatPct(r.metrics.coverage)}
                        </td>
                        <td className="px-3 py-2 text-right type-body tabular-nums">
                          {r.metrics.refusalsWrong}
                        </td>
                        <td
                          className={
                            r.gateFailures.length === 0
                              ? "px-3 py-2 type-body text-service"
                              : "px-3 py-2 type-body font-semibold text-warn"
                          }
                        >
                          {r.gateFailures.length === 0 ? T.passed : T.failed}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </section>
              )}

              <section aria-labelledby="casos" className="flex flex-col gap-3">
                <h2 id="casos" className="type-section text-strong">
                  {T.casesTitle}
                </h2>
                {cases.length === 0 ? (
                  <p className="type-body text-meta">{T.noCasesList}</p>
                ) : (
                  <EvalCasesTable
                    caption={T.casesCaption}
                    columns={T.caseCol}
                    rows={cases.map((c) => ({
                      id: c.id,
                      key: c.key,
                      question: c.body?.question ?? AI_TEXT.none,
                      expect: c.body
                        ? c.body.expect.refuse
                          ? T.expectRefuse
                          : T.expectAnswer(c.body.expect.facts.length)
                        : AI_TEXT.none,
                      sources: c.body?.sources.length ?? 0,
                      active: c.active,
                      toggleLabel: c.active ? T.toggleOff(c.key) : T.toggleOn(c.key),
                    }))}
                    {...(canRun ? { toggle: toggleEvalCaseAction } : {})}
                  />
                )}
              </section>
            </>
          );
        })()
      )}
    </StudioScreen>
  );
}
