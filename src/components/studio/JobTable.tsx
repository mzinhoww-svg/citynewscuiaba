"use client";

import { useMemo, useState } from "react";
import {
  ageLabel,
  MONITOR_TEXT as T,
  QUEUE_LABEL,
  STEP_LABEL,
} from "@/content/pt-BR/control-monitor";
import { sortRows, type Sort } from "@/lib/control/monitor";
import type { QueueRow } from "@/lib/control/types";
import { STEP_NAMES, type StepName } from "@/lib/pipeline/types";
import { cx } from "../cx";
import { SortHeader } from "./SortHeader";

type Key = "queue" | "step" | "total" | "ready" | "retrying" | "oldest" | "reads";

export interface JobTableProps {
  rows: readonly QueueRow[];
  /** Instante do retrato (a idade da mensagem mais antiga é calculada contra ele). */
  at: string;
  className?: string;
}

const stepIndex = (s: string) => STEP_NAMES.indexOf(s as StepName);

/**
 * Mensagens na fila por etapa (O02/O06). Ordenação no cliente com `aria-sort`; a tabela nunca
 * fica só em cor: mais antiga e nova tentativa vêm em texto.
 */
export function JobTable({ rows, at, className }: JobTableProps) {
  const [sort, setSort] = useState<Sort<Key>>({ key: "step", dir: "asc" });
  const now = new Date(at);
  const sorted = useMemo(
    () =>
      sortRows(rows, sort, (r, k) => {
        switch (k) {
          case "queue":
            return r.queue;
          case "step":
            return stepIndex(r.step);
          case "total":
            return r.total;
          case "ready":
            return r.ready;
          case "retrying":
            return r.retrying;
          case "oldest":
            return r.oldestAt ? Date.parse(r.oldestAt) : null;
          case "reads":
            return r.maxReads;
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
    return <p className={cx("type-body text-meta", className)}>{T.jobs.empty}</p>;
  return (
    <div
      role="region"
      aria-label={T.jobs.caption}
      tabIndex={0}
      className={cx(
        "relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">{T.jobs.caption}</caption>
        <thead className="border-b border-line-subtle bg-section">
          <tr>
            {head("queue", T.jobs.colQueue)}
            {head("step", T.jobs.colStep)}
            {head("total", T.jobs.colTotal, true)}
            {head("ready", T.jobs.colReady, true)}
            {head("retrying", T.jobs.colRetrying, true)}
            {head("oldest", T.jobs.colOldest)}
            {head("reads", T.jobs.colReads, true)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={`${r.queue}:${r.step}`}
              data-step={r.step}
              className="border-b border-line-subtle last:border-b-0"
            >
              <td className="px-3 py-3 type-body">{QUEUE_LABEL[r.queue] ?? r.queue}</td>
              <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                {STEP_LABEL[r.step as StepName] ?? r.step}
              </th>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.total}</td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.ready}</td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.retrying}</td>
              <td className="px-3 py-3 type-body">{ageLabel(r.oldestAt, now)}</td>
              <td className="px-3 py-3 text-right type-body tabular-nums">{r.maxReads}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
