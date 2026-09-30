import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { AbTestCard, ShareChart } from "@/components/estudio";
import {
  AB_TEXT as T,
  EXPERIMENT_STATUS_TEXT,
  formatInt,
  formatPct,
  formatWeight,
} from "@/content/pt-BR/recommendation-admin";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { experimentById, recPanel } from "@/lib/db/queries/recommendation";
import { experimentVersion, proportionTest } from "@/lib/ranking/experiments";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../../../load-error";
import { endExperimentAction, promoteExperimentAction } from "../../actions";

export const metadata: Metadata = { title: "Teste A/B · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dec = (n: number) => n.toFixed(3).replace(".", ",");

/** O18 · Teste A/B: variantes, alocação, métricas por rótulo, significância, encerrar e promover. */
export default async function AbTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("metrics.view", undefined, {
    next: `/estudio/control/recomendacao/testes/${id}`,
  });
  const canManage = canAccess(session.roles, "rec.weights");
  const data = UUID.test(id)
    ? await loadOrNull("rec experiment", async () => {
        const [exp, panel] = await Promise.all([experimentById(id), recPanel()]);
        return { exp, panel };
      })
    : { value: { exp: null, panel: null } };

  if (data === null) {
    return (
      <section className="flex flex-col gap-6">
        <EmptyState
          as="h1"
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={`/estudio/control/recomendacao/testes/${id}`} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      </section>
    );
  }
  const { exp, panel } = data.value;
  if (!exp || !panel) {
    return (
      <section className="flex flex-col gap-6">
        <EmptyState
          as="h1"
          title={T.notFound}
          actions={
            <Button href="/estudio/control/recomendacao" size="md" variant="outline">
              {T.back}
            </Button>
          }
        >
          {T.notFoundBody}
        </EmptyState>
      </section>
    );
  }

  const rows = exp.variants.map((v, i) => {
    const label = experimentVersion(panel.config.version.split("+")[0] ?? "rec-v1", exp.id, i);
    const m = panel.byVersion.get(label);
    const r7 = panel.return7d.find((r) => r.algoVersion === label);
    return {
      index: i,
      name: v.name,
      version: v.weightsVersion,
      split: exp.split[i] ?? 0,
      label,
      impressions: m?.impressions ?? 0,
      clicks: m?.clicks ?? 0,
      ctr: m?.ctr ?? 0,
      return7d: r7 && r7.followed > 0 ? r7.returned / r7.followed : null,
      diversity: m?.diversity ?? 0,
      hideRate: m?.hideRate ?? 0,
    };
  });
  const a = rows[0];
  const b = rows[1];
  const test =
    a && b
      ? proportionTest({ n: a.impressions, k: a.clicks }, { n: b.impressions, k: b.clicks })
      : null;
  const best = [...rows].sort((x, y) => y.ctr - x.ctr)[0];
  const hasData = rows.some((r) => r.impressions > 0 || r.clicks > 0);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title(exp.name)}</h1>
        <p className="type-body text-meta">
          {T.status}: {EXPERIMENT_STATUS_TEXT[exp.status] ?? exp.status} · {T.started}:{" "}
          {formatDateTime(exp.startedAt)}
          {exp.endedAt && ` · ${T.ended}: ${formatDateTime(exp.endedAt)}`}
        </p>
        <div>
          <Button
            href="/estudio/control/recomendacao"
            size="sm"
            variant="outline"
            icon="arrow-left"
          >
            {T.back}
          </Button>
        </div>
      </header>

      <section aria-labelledby="variantes" className="flex flex-col gap-3">
        <h2 id="variantes" className="type-section text-strong">
          {T.variantsTitle}
        </h2>
        <div
          role="region"
          aria-label={T.variantsCaption}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <caption className="sr-only">{T.variantsCaption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                {(
                  [
                    "variant",
                    "version",
                    "split",
                    "label",
                    "impressions",
                    "clicks",
                    "ctr",
                    "return7d",
                    "diversity",
                    "hideRate",
                  ] as const
                ).map((k) => (
                  <th key={k} scope="col" className="px-3 py-3">
                    {T.col[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.index} className="border-b border-line-subtle last:border-0">
                  <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                    {r.name}
                  </th>
                  <td className="px-3 py-3 type-body">{r.version}</td>
                  <td className="px-3 py-3 type-body tabular-nums">{r.split}%</td>
                  <td className="px-3 py-3 type-meta text-meta">{r.label}</td>
                  <td className="px-3 py-3 type-body tabular-nums">{formatInt(r.impressions)}</td>
                  <td className="px-3 py-3 type-body tabular-nums">{formatInt(r.clicks)}</td>
                  <td className="px-3 py-3 type-body tabular-nums">{formatPct(r.ctr)}</td>
                  <td className="px-3 py-3 type-body tabular-nums">
                    {r.return7d === null ? "—" : formatPct(r.return7d)}
                  </td>
                  <td className="px-3 py-3 type-body tabular-nums">{formatWeight(r.diversity)}</td>
                  <td className="px-3 py-3 type-body tabular-nums">{formatPct(r.hideRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasData ? (
          <ShareChart
            label={T.chart}
            rows={rows.map((r) => ({
              label: r.name,
              value: r.ctr,
              detail: `${formatInt(r.clicks)} cliques`,
            }))}
            summary={best ? T.chartSummary(best.name, formatPct(best.ctr)) : ""}
            formatValue={formatPct}
            columns={{ label: T.col.variant, value: T.col.ctr }}
          />
        ) : (
          <p className="type-body text-meta">{T.noData}</p>
        )}
      </section>

      <section aria-labelledby="significancia" className="flex flex-col gap-3">
        <h2 id="significancia" className="type-section text-strong">
          {T.significanceTitle}
        </h2>
        <p className="type-body text-body">
          {test ? T.significance(dec(test.pValue), test.significant) : T.noData}
        </p>
      </section>

      <AbTestCard
        id={exp.id}
        status={exp.status}
        variants={rows.map((r) => ({ index: r.index, name: r.name, weightsVersion: r.version }))}
        canManage={canManage}
        end={endExperimentAction}
        promote={promoteExperimentAction}
      />
    </section>
  );
}
