import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, StatGrid, Table } from "@/components";
import { PhaseChart, ReprocessForm, StudioScreen } from "@/components/estudio";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import {
  CONTROL_TEXT as T,
  LEVEL_LABEL,
  RUN_STATE_LABEL,
  formatBrl,
  formatMin,
  stepLabel,
} from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { runDetail } from "@/lib/db/queries/control";
import { formatDateTime } from "@/lib/format/date";
import { REPROCESS_STEPS } from "@/lib/pipeline/reprocess";
import { STEP_NAMES } from "@/lib/pipeline/types";
import { loadOrNull } from "../../../load-error";
import { reprocessRunAction } from "../../actions";

export const metadata: Metadata = { title: "Ciclo · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const R = T.run;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("metrics.view", undefined, {
    next: `/estudio/control/execucoes/${id}`,
  });
  if (!UUID.test(id)) notFound();
  const can = controlAbilities(session.roles);
  const data = await loadOrNull("control run", () => runDetail(id, { maskIp: !can.admin }));
  if (data !== null && data.value === null) notFound();

  const back = (
    <Link
      href="/estudio/control/execucoes"
      className="type-meta font-medium text-link underline-offset-4 hover:underline"
    >
      {R.back}
    </Link>
  );
  if (data === null || data.value === null)
    return (
      <section className="flex flex-col gap-6">
        {back}
        <EmptyState
          as="h1"
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={`/estudio/control/execucoes/${id}`} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      </section>
    );

  const { run, phases, steps, failures } = data.value;
  const ordered = [...steps].sort(
    (a, b) =>
      STEP_NAMES.indexOf(a.step as (typeof STEP_NAMES)[number]) -
      STEP_NAMES.indexOf(b.step as (typeof STEP_NAMES)[number]),
  );
  const facts: [string, string][] = [
    [R.fields.window, formatDateTime(run.windowStart)],
    [R.fields.started, formatDateTime(run.startedAt)],
    [R.fields.state, RUN_STATE_LABEL[run.state]],
    [R.fields.duration, formatMin(run.durationMin)],
    ...(run.fetchEnqueued !== null
      ? [[R.fields.fetch, String(run.fetchEnqueued)] as [string, string]]
      : []),
    ...(can.costs
      ? [
          [R.fields.cost, formatBrl(run.costBrl)] as [string, string],
          [R.fields.calls, String(run.aiCalls)] as [string, string],
        ]
      : []),
  ];

  return (
    <StudioScreen
      title={R.title(formatDateTime(run.startedAt))}
      gap="lg"
      breadcrumbs={[
        { href: "/estudio/control", label: STUDIO_TEXT.sections.control },
        { href: "/estudio/control/execucoes", label: T.runs.title },
        {
          href: `/estudio/control/execucoes/${run.id}`,
          label: R.title(formatDateTime(run.startedAt)),
        },
      ]}
      intro={run.manual ? <p className="type-meta text-meta">{R.fields.manual}</p> : undefined}
    >
      <section aria-labelledby="resumo" className="flex flex-col gap-3">
        <h2 id="resumo" className="type-section text-strong">
          {R.summaryTitle}
        </h2>
        <StatGrid columns={3} items={facts.map(([k, v]) => ({ label: k, value: v }))} />
        {can.costs && <p className="type-meta text-meta">{T.runs.costNote}</p>}
      </section>

      <section aria-labelledby="fases" className="flex flex-col gap-3">
        <h2 id="fases" className="type-section text-strong">
          {R.phasesTitle}
        </h2>
        {phases.length === 0 ? (
          <p className="type-body text-meta">{R.phasesEmpty}</p>
        ) : (
          <PhaseChart label={R.phasesChart} phases={phases} />
        )}
      </section>

      {ordered.length > 0 && (
        <section aria-labelledby="etapas" className="flex flex-col gap-3">
          <h2 id="etapas" className="type-section text-strong">
            {R.stepsTitle}
          </h2>
          <Table
            caption={R.stepsCaption}
            minWidth="sm"
            headers={[
              R.stepsCol.step,
              { label: R.stepsCol.ok, align: "right" },
              { label: R.stepsCol.warn, align: "right" },
              { label: R.stepsCol.error, align: "right" },
              R.stepsCol.window,
            ]}
          >
            {ordered.map((s) => (
              <tr key={s.step} className="border-b border-line-subtle last:border-b-0">
                <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                  {stepLabel(s.step)}
                </th>
                <td className="px-3 py-2 text-right type-body tabular-nums">{s.ok}</td>
                <td className="px-3 py-2 text-right type-body tabular-nums">{s.warn}</td>
                <td className="px-3 py-2 text-right type-body tabular-nums">
                  {s.error + s.security}
                </td>
                <td className="px-3 py-2 type-meta tabular-nums text-body">
                  {formatDateTime(s.firstAt)} – {formatDateTime(s.lastAt)}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}

      <section aria-labelledby="falhas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="falhas" className="type-section text-strong">
            {R.failuresTitle}
          </h2>
          {can.logs && (
            <Link
              href={`/estudio/control/logs?ciclo=${run.id}`}
              className="type-body font-medium text-link underline-offset-4 hover:underline"
            >
              {R.logsLink}
            </Link>
          )}
        </div>
        {failures.length === 0 ? (
          <p className="type-body text-meta">{R.failuresEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white">
            {failures.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 px-4 py-3">
                <p className="type-meta font-semibold text-strong">
                  {LEVEL_LABEL[f.level] ?? f.level} · {stepLabel(f.step)} ·{" "}
                  <span className="font-normal break-all">{f.itemRef}</span>
                </p>
                <p className="type-meta text-body">{f.message}</p>
                <p className="type-meta text-meta">
                  <time dateTime={f.at}>{formatDateTime(f.at)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can.operate && (
        <section aria-labelledby="reprocessar" className="flex flex-col gap-3">
          <h2 id="reprocessar" className="type-section text-strong">
            {T.reprocess.title}
          </h2>
          <ReprocessForm
            steps={REPROCESS_STEPS}
            defaultStep="classify"
            reprocess={async (i) => {
              "use server";
              return reprocessRunAction({ runId: id, ...i });
            }}
          />
        </section>
      )}
    </StudioScreen>
  );
}
