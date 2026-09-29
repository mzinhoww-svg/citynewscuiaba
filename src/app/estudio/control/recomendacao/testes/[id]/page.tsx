import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, ExperimentControls, InlineAlert, ShareBars } from "@/components";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import {
  getExperiment,
  getExperimentMetrics,
  type ExperimentRow,
} from "@/lib/db/queries/recommendation";
import { formatDateTime } from "@/lib/format/date";
import { formatDecimal2, formatInt, formatPercent } from "@/lib/format/number";
import { compareToControl, type VariantMetrics } from "@/lib/ranking";
import { endExperimentAction, promoteWinnerAction, startExperimentAction } from "../../actions";

export const metadata: Metadata = { title: "Teste A/B · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const BACK = "/estudio/control/recomendacao";
const region = "overflow-x-auto rounded-lg border border-line-subtle bg-card-white";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = `${BACK}/testes/${id}`;
  const session = await getSession();
  if (!session) redirect(loginRedirect(here));
  if (!canAccess(session.roles, "metrics.view")) redirect(loginRedirect(here, "sem-permissao"));
  const canManage = canAccess(session.roles, "rec.weights");

  let exp: ExperimentRow | null = null;
  let metrics: VariantMetrics[] = [];
  let truncated = false;
  let hasData = false;
  try {
    exp = await getExperiment(id);
    if (exp) ({ metrics, truncated, hasData } = await getExperimentMetrics(exp));
  } catch (e) {
    console.error("estudio teste A/B:", e instanceof Error ? e.message : e);
    return (
      <section className="flex flex-col gap-6">
        <h1 className="type-screen-title text-strong">{T.testsTitle}</h1>
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={here} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      </section>
    );
  }

  if (!exp) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="type-screen-title text-strong">{T.testNotFoundTitle}</h1>
        <EmptyState
          icon="search"
          title={T.testNotFoundTitle}
          actions={
            <Button href={BACK} size="md" variant="outline">
              {T.backToPanel}
            </Button>
          }
        >
          {T.testNotFoundBody}
        </EmptyState>
      </section>
    );
  }

  const cmp = compareToControl(metrics);
  const state =
    exp.status === "running"
      ? `${T.runningState} ${exp.startsAt ? formatDateTime(exp.startsAt) : ""}`
      : exp.status === "ended"
        ? `${T.endedState} ${exp.endedAt ? formatDateTime(exp.endedAt) : ""}`
        : T.draftState;
  const summary = metrics
    .map((m) => `${T.variantLabel(m.variant, m.variant === 0)} ${formatPercent(m.ctr)}`)
    .join("; ");

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Button href={BACK} size="sm" variant="text" icon="arrow-left">
          {T.backToPanel}
        </Button>
        <h1 className="type-screen-title text-strong">{exp.name}</h1>
        {exp.hypothesis && <p className="type-body text-meta">{exp.hypothesis}</p>}
        <p className="type-body font-semibold text-strong">{state}</p>
      </header>

      <ExperimentControls
        id={exp.id}
        status={exp.status}
        variantCount={exp.variants.length}
        winner={exp.winner}
        canManage={canManage}
        start={startExperimentAction}
        end={endExperimentAction}
        promote={promoteWinnerAction}
      />

      <section aria-labelledby="teste-metricas" className="flex flex-col gap-4">
        <h2 id="teste-metricas" className="type-section text-strong">
          {T.metricsTitle}
        </h2>
        <p className="type-meta text-meta">{T.metricsNote}</p>
        {!hasData ? (
          <InlineAlert tone="info" role="none">
            {T.metricsEmpty}
          </InlineAlert>
        ) : (
          <>
            {truncated && (
              <InlineAlert tone="warn" role="none">
                {T.metricsTruncated}
              </InlineAlert>
            )}
            <ShareBars
              items={metrics.map((m) => ({
                key: String(m.variant),
                label: T.variantLabel(m.variant, m.variant === 0),
                share: m.ctr,
              }))}
              label={T.chartLabel}
              summary={T.chartSummary(summary)}
            />
          </>
        )}
        <div role="region" aria-label={T.metricsCaption} tabIndex={0} className={region}>
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">{T.metricsCaption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                {[
                  T.colVariant,
                  T.colReaders,
                  T.colViews,
                  T.colClicks,
                  T.colCtr,
                  T.colReturn,
                  T.colDiversity,
                  T.colDismiss,
                  T.colSignificance,
                ].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exp.variants.map((v, i) => {
                const m = metrics[i];
                const c = cmp.find((x) => x.variant === i);
                return (
                  <tr
                    key={`${v.weightsVersion}-${i}`}
                    className="border-b border-line-subtle last:border-b-0"
                  >
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {T.variantLabel(i, i === 0)}
                      <span className="block type-meta font-normal text-meta">
                        {T.weightsVersion(v.weightsVersion)}
                        {exp.winner === i ? ` · ${T.colWinner}` : ""}
                      </span>
                    </th>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatInt(m?.readers ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatInt(m?.viewed ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatInt(m?.clicked ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatPercent(m?.ctr ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatPercent(m?.returnRate ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatDecimal2(m?.diversity ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatPercent(m?.dismissRate ?? 0)}
                    </td>
                    <td className="px-3 py-3 type-body">
                      {i === 0
                        ? T.noControl
                        : c?.significant
                          ? T.significant(c.lift === null ? "—" : formatPercent(c.lift))
                          : T.notSignificant}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
