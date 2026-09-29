"use client";

import { useMemo, useState } from "react";
import { ageLabel, MONITOR_TEXT as T, SOURCE_STATE_LABEL } from "@/content/pt-BR/control-monitor";
import { sortRows, type Sort, type SourceHealthKey } from "@/lib/control/monitor";
import type { SourceHealthRow } from "@/lib/control/types";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { SortHeader } from "./SortHeader";

type Key = "name" | "state" | "failures" | "success" | "items" | "last";

export interface SourceHealthTableProps {
  rows: readonly SourceHealthRow[];
  at: string;
  className?: string;
}

/** Pior estado primeiro na ordenação por estado. */
const STATE_RANK: Record<SourceHealthKey, number> = {
  paused_auto: 0,
  blocked: 1,
  degraded: 2,
  paused: 3,
  ok: 4,
};

/**
 * Saúde de cada fonte (O01/O02/O06): estado, falhas seguidas, coletas ok em 30 dias, itens em
 * 24 h, última coleta e último erro. Três falhas seguidas aparecem como "Pausada (auto)".
 * Estado sempre em texto com ícone.
 */
export function SourceHealthTable({ rows, at, className }: SourceHealthTableProps) {
  const [sort, setSort] = useState<Sort<Key>>({ key: "state", dir: "asc" });
  const now = new Date(at);
  const sorted = useMemo(
    () =>
      sortRows(rows, sort, (r, k) => {
        switch (k) {
          case "name":
            return r.name;
          case "state":
            return STATE_RANK[r.state] * 1000 - r.consecutiveFailures;
          case "failures":
            return r.consecutiveFailures;
          case "success":
            return r.fetchTotal === 0 ? null : r.fetchOk / r.fetchTotal;
          case "items":
            return r.items24h;
          case "last":
            return r.lastFetchedAt ? Date.parse(r.lastFetchedAt) : null;
        }
      }),
    [rows, sort],
  );
  const head = (key: Key, label: string, numeric = false) => (
    <SortHeader
      label={label}
      numeric={numeric}
      active={sort.key === key}
      dir={sort.dir}
      onSort={() =>
        setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))
      }
    />
  );
  if (rows.length === 0)
    return <p className={cx("type-body text-meta", className)}>{T.sources.empty}</p>;
  return (
    <div
      role="region"
      aria-label={T.sources.caption}
      tabIndex={0}
      className={cx(
        "relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table className="w-full min-w-[48rem] border-collapse text-left">
        <caption className="sr-only">{T.sources.caption}</caption>
        <thead className="border-b border-line-subtle bg-section">
          <tr>
            {head("name", T.sources.colSource)}
            {head("state", T.sources.colState)}
            {head("failures", T.sources.colFailures, true)}
            {head("success", T.sources.colSuccess, true)}
            {head("items", T.sources.colItems, true)}
            {head("last", T.sources.colLast)}
            <th scope="col" className="px-3 py-1 type-meta text-meta">
              {T.sources.colError}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const bad = r.state === "paused_auto" || r.state === "blocked";
            return (
              <tr
                key={r.slug}
                data-source={r.slug}
                data-state={r.state}
                className="border-b border-line-subtle align-top last:border-b-0"
              >
                <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                  {r.name}
                </th>
                <td className="px-3 py-3 type-body">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1",
                      bad && "font-semibold text-danger",
                      r.state === "degraded" && "text-warn",
                    )}
                  >
                    {r.state !== "ok" && (
                      <Icon name={bad ? "circle-alert" : "triangle-alert"} size={16} />
                    )}
                    {SOURCE_STATE_LABEL[r.state]}
                  </span>
                  {r.state === "paused_auto" && (
                    <span className="block type-meta text-meta">{T.sources.autoNote}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right type-body tabular-nums">
                  {r.consecutiveFailures}
                </td>
                <td className="px-3 py-3 text-right type-body tabular-nums">
                  {r.fetchTotal === 0 ? "—" : `${r.fetchOk}/${r.fetchTotal}`}
                </td>
                <td className="px-3 py-3 text-right type-body tabular-nums">{r.items24h}</td>
                <td className="px-3 py-3 type-body">
                  {r.lastFetchedAt ? ageLabel(r.lastFetchedAt, now) : T.sources.never}
                </td>
                <td className="px-3 py-3 type-body">{r.lastError ?? T.sources.noError}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
