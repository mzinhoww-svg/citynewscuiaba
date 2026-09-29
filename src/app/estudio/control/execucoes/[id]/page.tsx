import type { Metadata } from "next";
import {
  Button,
  EmptyState,
  InlineAlert,
  PhaseChart,
  Select,
  SortHeader,
  TextField,
} from "@/components";
import {
  brl,
  LEVEL_LABEL,
  MONITOR_TEXT as T,
  RUN_STATE_LABEL,
  STEP_LABEL,
} from "@/content/pt-BR/control-monitor";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import {
  formatDuration,
  nextSortParam,
  parseSort,
  phaseSummaries,
  sortRows,
  stepCounts,
} from "@/lib/control/monitor";
import { runDetail, type RunDetail } from "@/lib/db/queries/control";
import { formatDateTime } from "@/lib/format/date";
import { STEP_NAMES, type StepName } from "@/lib/pipeline/types";
import { reprocessRunAction } from "./actions";

export const metadata: Metadata = { title: "Ciclo · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ["etapa", "ok", "avisos", "falhas"] as const;
type Key = (typeof KEYS)[number];
type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ERRORS: Record<string, string> = {
  forbidden: T.reprocess.forbidden,
  invalid: T.reprocess.invalid,
  failed: T.reprocess.failed,
  not_found: T.run.notFound,
};

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const next = `/estudio/control/execucoes/${id}`;
  const session = await requireRole("metrics.view", undefined, { next });
  const canAct = canAccess(session.roles, "source.manage");
  const sp = await searchParams;
  const sort = parseSort<Key>(first(sp.ordem), KEYS, { key: "etapa", dir: "asc" });
  const ok = first(sp.ok);
  const error = ERRORS[first(sp.erro) ?? ""];

  let detail: RunDetail | null = null;
  let failed = false;
  if (UUID.test(id)) {
    try {
      detail = await runDetail(id);
    } catch (e) {
      failed = true;
      console.error("control ciclo:", e instanceof Error ? e.message : e);
    }
  }

  const back = (
    <Button href="/estudio/control/execucoes" size="md" variant="outline">
      {T.run.back}
    </Button>
  );
  if (failed)
    return (
      <EmptyState tone="error" icon="circle-alert" title={T.run.errorTitle} as="h1" actions={back}>
        {T.runs.errorBody}
      </EmptyState>
    );
  if (!detail)
    return (
      <EmptyState title={T.run.notFound} icon="search" as="h1" actions={back}>
        {T.run.notFoundBody}
      </EmptyState>
    );

  const { run, steps, failures } = detail;
  const phases = phaseSummaries(steps);
  const counts = stepCounts(steps, {}).filter((s) => s.ok + s.warn + s.errors > 0);
  const stepIndex = (s: StepName) => STEP_NAMES.indexOf(s);
  const rows = sortRows(counts, sort, (r, k) =>
    k === "etapa" ? stepIndex(r.step) : k === "ok" ? r.ok : k === "avisos" ? r.warn : r.errors,
  );
  const href = (k: Key) => `${next}?ordem=${nextSortParam(sort, k)}`;
  const head = (k: Key, label: string, numeric = false) => (
    <SortHeader
      label={label}
      numeric={numeric}
      active={sort.key === k}
      dir={sort.dir}
      href={href(k)}
    />
  );
  const when = formatDateTime(run.startedAt);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {back}
        <h1 className="type-screen-title text-strong">{T.run.title(when)}</h1>
        <p className="type-body text-meta">
          {RUN_STATE_LABEL[run.status]} · {run.manual ? T.runs.manual : T.runs.scheduled} ·{" "}
          {formatDuration(run.durationMs)} · {run.events} {T.run.events.toLowerCase()} ·{" "}
          {T.run.cost}: {brl(run.costBrl)}
        </p>
      </header>
      {ok !== undefined && /^\d+$/.test(ok) && (
        <InlineAlert tone="success" role="status">
          {T.failures.done(Number(ok))}
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="error" role="alert">
          {error}
        </InlineAlert>
      )}

      <section aria-labelledby="run-fases" className="flex flex-col gap-3">
        <h2 id="run-fases" className="type-section text-strong">
          {T.run.phasesTitle}
        </h2>
        <PhaseChart phases={phases} />
      </section>

      <section aria-labelledby="run-etapas" className="flex flex-col gap-3">
        <h2 id="run-etapas" className="type-section text-strong">
          {T.run.stepsTitle}
        </h2>
        {rows.length === 0 ? (
          <p className="type-body text-meta">{T.live.feedEmpty}</p>
        ) : (
          <div
            role="region"
            aria-label={T.run.stepsCaption}
            tabIndex={0}
            className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <caption className="sr-only">{T.run.stepsCaption}</caption>
              <thead className="border-b border-line-subtle bg-section">
                <tr>
                  {head("etapa", T.run.colStep)}
                  {head("ok", LEVEL_LABEL.info, true)}
                  {head("avisos", LEVEL_LABEL.warn, true)}
                  {head("falhas", T.runs.colErrors, true)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.step} className="border-b border-line-subtle last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {STEP_LABEL[r.step]}
                    </th>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.ok}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.warn}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="run-falhas" className="flex flex-col gap-3">
        <h2 id="run-falhas" className="type-section text-strong">
          {T.run.failuresTitle}
        </h2>
        {failures.length === 0 ? (
          <p className="type-body text-meta">{T.run.failuresEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {failures.map((e) => (
              <li key={e.id} className="rounded-lg border border-line-subtle bg-card-white p-3">
                <span className="flex flex-wrap gap-x-3 type-meta text-meta">
                  <span className="font-semibold text-strong">{LEVEL_LABEL[e.level]}</span>
                  <span>{STEP_LABEL[e.step as StepName] ?? e.step}</span>
                  <span>{formatDateTime(e.at)}</span>
                  {e.itemRef && <span className="break-all">{e.itemRef}</span>}
                </span>
                <span className="type-body">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
        <Button
          href={`/estudio/control/logs?ciclo=${run.id}`}
          size="md"
          variant="outline"
          icon="search"
        >
          {T.run.seeLogs}
        </Button>
      </section>

      {canAct && (
        <section aria-labelledby="run-reprocessar" className="flex flex-col gap-3">
          <h2 id="run-reprocessar" className="type-section text-strong">
            {T.reprocess.title}
          </h2>
          <p className="type-body text-meta">{T.reprocess.intro}</p>
          <form
            action={reprocessRunAction}
            className="grid max-w-xl grid-cols-1 gap-4 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <input type="hidden" name="runId" value={run.id} />
            <Select
              id="rp-etapa"
              name="fromStep"
              label={T.reprocess.step}
              defaultValue="classify"
              options={STEP_NAMES.filter((s) => s !== "tick").map((s) => ({
                value: s,
                label: STEP_LABEL[s],
              }))}
            />
            <div className="flex flex-col gap-1">
              <label className="flex min-h-tap items-center gap-3 type-label text-strong">
                <input type="checkbox" name="keep" defaultChecked className="size-5" />
                {T.reprocess.keep}
              </label>
              <p className="type-meta text-meta">{T.reprocess.keepHint}</p>
            </div>
            <TextField
              id="rp-confirmacao"
              name="confirmacao"
              label={T.reprocess.confirmLabel}
              hint={T.reprocess.confirmHint}
              autoComplete="off"
            />
            <div>
              <Button type="submit" size="md" icon="refresh-cw">
                {T.reprocess.submit}
              </Button>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}
