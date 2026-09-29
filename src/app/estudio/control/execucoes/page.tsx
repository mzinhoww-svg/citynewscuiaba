import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, SortHeader } from "@/components";
import { brl, MONITOR_TEXT as T, RUN_STATE_LABEL } from "@/content/pt-BR/control-monitor";
import { requireRole } from "@/lib/auth/require-role";
import {
  formatDuration,
  nextSortParam,
  parseSort,
  sortRows,
  type RunState,
} from "@/lib/control/monitor";
import type { RunRow } from "@/lib/control/types";
import { listRuns } from "@/lib/db/queries/control";
import { formatDateTime } from "@/lib/format/date";

export const metadata: Metadata = { title: "Execuções · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/execucoes";
const KEYS = ["janela", "situacao", "duracao", "eventos", "falhas", "fila", "custo"] as const;
type Key = (typeof KEYS)[number];
const RANK: Record<RunState, number> = { failed: 0, partial: 1, running: 2, ok: 3 };

const value = (r: RunRow, k: Key): string | number => {
  switch (k) {
    case "janela":
      return Date.parse(r.startedAt);
    case "situacao":
      return RANK[r.status];
    case "duracao":
      return r.durationMs;
    case "eventos":
      return r.events;
    case "falhas":
      return r.errors;
    case "fila":
      return r.pending;
    case "custo":
      return r.costBrl;
  }
};

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("metrics.view", undefined, { next: NEXT });
  const sp = await searchParams;
  const raw = Array.isArray(sp.ordem) ? sp.ordem[0] : sp.ordem;
  const sort = parseSort<Key>(raw, KEYS, { key: "janela", dir: "desc" });

  let runs: RunRow[] | null = null;
  try {
    runs = await listRuns(50);
  } catch (e) {
    console.error("control execuções:", e instanceof Error ? e.message : e);
  }
  const href = (k: Key) => `${NEXT}?ordem=${nextSortParam(sort, k)}`;
  const head = (k: Key, label: string, numeric = false) => (
    <SortHeader
      label={label}
      numeric={numeric}
      active={sort.key === k}
      dir={sort.dir}
      href={href(k)}
    />
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.runs.title}</h1>
        <p className="type-body text-meta">{T.runs.intro}</p>
      </header>
      {runs === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.runs.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.runs.retry}
            </Button>
          }
        >
          {T.runs.errorBody}
        </EmptyState>
      ) : runs.length === 0 ? (
        <EmptyState title={T.runs.empty} icon="clock">
          {T.runs.emptyBody}
        </EmptyState>
      ) : (
        <div
          role="region"
          aria-label={T.runs.caption}
          tabIndex={0}
          className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">{T.runs.caption}</caption>
            <thead className="border-b border-line-subtle bg-section">
              <tr>
                {head("janela", T.runs.colWindow)}
                {head("situacao", T.runs.colState)}
                {head("duracao", T.runs.colDuration, true)}
                {head("eventos", T.runs.colEvents, true)}
                {head("falhas", T.runs.colErrors, true)}
                {head("fila", T.runs.colQueue, true)}
                {head("custo", T.runs.colCost, true)}
              </tr>
            </thead>
            <tbody>
              {sortRows(runs, sort, value).map((r) => {
                const when = formatDateTime(r.startedAt);
                return (
                  <tr key={r.id} className="border-b border-line-subtle align-top last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      <Link
                        href={`${NEXT}/${r.id}`}
                        aria-label={T.runs.open(when)}
                        className="text-link underline-offset-4 hover:underline"
                      >
                        {when}
                      </Link>
                      <span className="block type-meta font-normal text-meta">
                        {r.manual ? T.runs.manual : T.runs.scheduled}
                      </span>
                    </th>
                    <td className="px-3 py-3 type-body">{RUN_STATE_LABEL[r.status]}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">
                      {formatDuration(r.durationMs)}
                    </td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.events}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.errors}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">{r.pending}</td>
                    <td className="px-3 py-3 text-right type-body tabular-nums">
                      {brl(r.costBrl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
