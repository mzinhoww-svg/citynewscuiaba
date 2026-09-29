import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { REGRESSION_LIMITS } from "@/lib/ai/eval-limits";
import { EmptyState } from "../ui/EmptyState";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

export interface EvalMetricsView {
  precision: number;
  coverage: number;
  unsourced: number;
  hallucinationsPer100: number;
  refusalsCorrect: number;
  refusalsWrong: number;
  p95: number;
  errors: number;
}

export interface EvalRunView {
  id: string;
  createdAt: string;
  promptVersion: number;
  provider: string;
  cases: number;
  metrics: EvalMetricsView;
}

export interface EvalCaseView {
  id: string;
  question: string;
  refuse: boolean;
  sources: number;
  publishers: number;
}

/** Dentro dos limites de aceite da regressão (`REGRESSION_LIMITS`). */
export function withinLimits(m: EvalMetricsView): boolean {
  const l = REGRESSION_LIMITS;
  return (
    m.precision >= l.minPrecision &&
    m.hallucinationsPer100 <= l.maxHallucinationsPer100 &&
    m.unsourced <= l.maxUnsourced &&
    m.coverage >= l.minCoverage &&
    m.refusalsWrong <= l.maxRefusalsWrong &&
    m.errors === 0
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Cuiaba",
    dateStyle: "short",
    timeStyle: "short",
  });

function Verdict({ ok }: { ok: boolean }) {
  return (
    <span className={`font-semibold ${ok ? "text-strong" : "text-danger"}`}>
      {ok ? T.verdictPass : T.verdictFail}
    </span>
  );
}

/** Última execução em números grandes, com o resultado por escrito (nunca só cor). */
function LastRun({ run }: { run: EvalRunView }) {
  const m = run.metrics;
  const items: [string, string][] = [
    [T.metricLabels.precision, T.pct1(m.precision)],
    [T.metricLabels.coverage, T.pct1(m.coverage)],
    [T.metricLabels.unsourced, String(m.unsourced)],
    [T.metricLabels.hallucinations, m.hallucinationsPer100.toLocaleString("pt-BR")],
    [T.metricLabels.refusalsCorrect, String(m.refusalsCorrect)],
    [T.metricLabels.refusalsWrong, String(m.refusalsWrong)],
    [T.metricLabels.p95, T.ms(m.p95)],
  ];
  return (
    <section aria-labelledby="ai-last" className="flex flex-col gap-3">
      <h2 id="ai-last" className="type-section text-strong">
        {T.lastTitle}
      </h2>
      <p className="type-meta text-meta">
        {when(run.createdAt)} · {T.promptVersion(run.promptVersion)} ·{" "}
        {T.providerName[run.provider] ?? run.provider} · <Verdict ok={withinLimits(m)} />
      </p>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <dt className="type-meta text-meta">{label}</dt>
            <dd className="text-28 font-bold tabular-nums leading-tight text-strong">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface EvalPanelProps {
  cases: EvalCaseView[];
  runs: EvalRunView[];
}

/** Casos, limites de aceite, última execução e histórico da regressão (O14). */
export function EvalPanel({ cases, runs }: EvalPanelProps) {
  const last = runs[0];
  return (
    <div className="flex flex-col gap-10">
      {last ? <LastRun run={last} /> : null}

      <section aria-labelledby="ai-cases" className="flex flex-col gap-3">
        <h2 id="ai-cases" className="type-section text-strong">
          {T.casesTitle}
        </h2>
        <AiOpsTable
          caption={T.casesCaption}
          minWidthClass="min-w-[48rem]"
          columns={[T.colCase, T.colQuestion, T.colSources, T.colExpected]}
        >
          {cases.map((c) => (
            <tr key={c.id} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {c.id}
              </th>
              <td className={CELL}>{c.question}</td>
              <td className={CELL}>{T.sourcesCount(c.sources, c.publishers)}</td>
              <td className={CELL}>{c.refuse ? T.expectRefuse : T.expectAnswer}</td>
            </tr>
          ))}
        </AiOpsTable>
        <h3 className="type-meta font-semibold text-strong">{T.limitsTitle}</h3>
        <ul className="list-disc pl-5 type-meta text-meta">
          {T.limitsList(REGRESSION_LIMITS).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-history" className="flex flex-col gap-3">
        <h2 id="ai-history" className="type-section text-strong">
          {T.historyTitle}
        </h2>
        {runs.length === 0 ? (
          <EmptyState title={T.historyEmptyTitle}>{T.historyEmptyBody}</EmptyState>
        ) : (
          <AiOpsTable
            caption={T.historyCaption}
            minWidthClass="min-w-[64rem]"
            columns={[
              T.colWhen,
              T.colPrompt,
              T.colProvider,
              T.colPrecision,
              T.colCoverage2,
              T.colUnsourced,
              T.colHalluc,
              T.colRefusalsOk,
              T.colRefusalsBad,
              T.colP95,
              T.colVerdict,
            ]}
          >
            {runs.map((r) => (
              <tr key={r.id} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {when(r.createdAt)}
                </th>
                <td className={CELL}>{T.promptVersion(r.promptVersion)}</td>
                <td className={CELL}>{T.providerName[r.provider] ?? r.provider}</td>
                <td className={`${CELL} tabular-nums`}>{T.pct1(r.metrics.precision)}</td>
                <td className={`${CELL} tabular-nums`}>{T.pct1(r.metrics.coverage)}</td>
                <td className={`${CELL} tabular-nums`}>{r.metrics.unsourced}</td>
                <td className={`${CELL} tabular-nums`}>
                  {r.metrics.hallucinationsPer100.toLocaleString("pt-BR")}
                </td>
                <td className={`${CELL} tabular-nums`}>{r.metrics.refusalsCorrect}</td>
                <td className={`${CELL} tabular-nums`}>{r.metrics.refusalsWrong}</td>
                <td className={`${CELL} tabular-nums`}>{T.ms(r.metrics.p95)}</td>
                <td className={CELL}>
                  <Verdict ok={withinLimits(r.metrics)} />
                </td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </section>
    </div>
  );
}
