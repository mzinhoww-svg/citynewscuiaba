"use client";

import Link from "next/link";
import { CONTROL_TEXT, RUN_STATE_LABEL, formatBrl, formatMin } from "@/content/pt-BR/control";
import type { RunState } from "@/lib/control";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { SortHeader, useSort } from "./SortHeader";

const T = CONTROL_TEXT.runs;

export interface RunsTableRow {
  id: string;
  startedAt: string;
  manual: boolean;
  state: RunState;
  durationMin: number | null;
  ok: number;
  failed: number;
  pending: number;
  /** `null` quando o papel não vê custos. */
  costBrl: number | null;
}

type Key = "when" | "state" | "duration" | "ok" | "failed" | "pending" | "cost";

function value(r: RunsTableRow, k: Key) {
  switch (k) {
    case "when":
      return Date.parse(r.startedAt);
    case "state":
      return RUN_STATE_LABEL[r.state];
    case "duration":
      return r.durationMin;
    case "ok":
      return r.ok;
    case "failed":
      return r.failed;
    case "pending":
      return r.pending;
    case "cost":
      return r.costBrl;
  }
}

/** Histórico de ciclos (O07), com colunas ordenáveis e link para o detalhe. */
export function RunsTable({ rows, className }: { rows: RunsTableRow[]; className?: string }) {
  const { sort, sorted, onSort } = useSort<RunsTableRow, Key>(
    rows,
    { key: "when", dir: "desc" },
    value,
  );
  const showCost = rows.some((r) => r.costBrl !== null);
  const c = T.col;
  return (
    <div
      role="region"
      aria-label={T.caption}
      tabIndex={0}
      className={cx(
        "relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table className="w-full min-w-[48rem] border-collapse text-left">
        <caption className="sr-only">{T.caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta">
          <tr>
            <SortHeader label={c.when} column="when" sort={sort} onSort={onSort} />
            <SortHeader label={c.state} column="state" sort={sort} onSort={onSort} />
            <SortHeader label={c.duration} column="duration" sort={sort} onSort={onSort} numeric />
            <SortHeader label={c.ok} column="ok" sort={sort} onSort={onSort} numeric />
            <SortHeader label={c.failed} column="failed" sort={sort} onSort={onSort} numeric />
            <SortHeader label={c.pending} column="pending" sort={sort} onSort={onSort} numeric />
            {showCost && (
              <SortHeader label={c.cost} column="cost" sort={sort} onSort={onSort} numeric />
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-line-subtle last:border-b-0">
              <th scope="row" className="px-3 py-3 type-body font-normal">
                <Link
                  href={`/estudio/control/execucoes/${r.id}`}
                  aria-label={T.open(formatDateTime(r.startedAt))}
                  className="font-semibold tabular-nums text-link underline-offset-4 hover:underline"
                >
                  {formatDateTime(r.startedAt)}
                </Link>
                {r.manual && (
                  <span className="ml-2 type-meta text-meta">{CONTROL_TEXT.cycle.manual}</span>
                )}
              </th>
              <td
                className={cx(
                  "px-3 py-3 type-body",
                  r.state === "partial" || r.state === "failed" ? "font-semibold text-warn" : "",
                )}
              >
                {RUN_STATE_LABEL[r.state]}
              </td>
              <td className="px-3 py-3 text-right type-body tabular-nums">
                {formatMin(r.durationMin)}
              </td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.ok}</td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.failed}</td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.pending}</td>
              {showCost && (
                <td className="px-3 py-3 text-right type-body tabular-nums">
                  {r.costBrl === null ? CONTROL_TEXT.none : formatBrl(r.costBrl)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
