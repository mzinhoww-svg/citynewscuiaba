"use client";

import { CONTROL_TEXT, SOURCE_STATUS_LABEL } from "@/content/pt-BR/control";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { SortHeader, useSort } from "./SortHeader";

const T = CONTROL_TEXT.health;

export interface SourceHealthItem {
  id: string;
  name: string;
  status: string;
  autoPaused: boolean;
  consecutiveFailures: number;
  errors24h: number;
  items24h: number;
  ok30d: number;
  total30d: number;
  lastFetchedAt: string | null;
  lastError: string | null;
}

export interface SourceHealthTableProps {
  rows: SourceHealthItem[];
  className?: string;
}

type Key = "name" | "status" | "failures" | "errors24h" | "items24h" | "success" | "last";

const successRate = (r: SourceHealthItem) => (r.total30d > 0 ? r.ok30d / r.total30d : null);

function value(r: SourceHealthItem, k: Key) {
  switch (k) {
    case "name":
      return r.name;
    case "status":
      return r.autoPaused ? T.autoPaused : (SOURCE_STATUS_LABEL[r.status] ?? r.status);
    case "failures":
      return r.consecutiveFailures;
    case "errors24h":
      return r.errors24h;
    case "items24h":
      return r.items24h;
    case "success":
      return successRate(r);
    case "last":
      return r.lastFetchedAt ? Date.parse(r.lastFetchedAt) : null;
  }
}

/**
 * Saúde das fontes (O01): status (com "Pausada automaticamente" para a pausa por 3 falhas seguidas),
 * falhas seguidas, erros e itens em 24 h, sucesso de 30 dias e última coleta. Colunas
 * ordenáveis; o problema aparece com ícone e texto, nunca só com cor.
 */
export function SourceHealthTable({ rows, className }: SourceHealthTableProps) {
  const { sort, sorted, onSort } = useSort<SourceHealthItem, Key>(
    rows,
    { key: "failures", dir: "desc" },
    value,
  );
  const col = T.col;
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
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <caption className="sr-only">{T.caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta">
          <tr>
            <SortHeader label={col.name} column="name" sort={sort} onSort={onSort} />
            <SortHeader label={col.status} column="status" sort={sort} onSort={onSort} />
            <SortHeader
              label={col.failures}
              column="failures"
              sort={sort}
              onSort={onSort}
              numeric
            />
            <SortHeader
              label={col.errors24h}
              column="errors24h"
              sort={sort}
              onSort={onSort}
              numeric
            />
            <SortHeader
              label={col.items24h}
              column="items24h"
              sort={sort}
              onSort={onSort}
              numeric
            />
            <SortHeader label={col.success} column="success" sort={sort} onSort={onSort} numeric />
            <SortHeader label={col.last} column="last" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rate = successRate(r);
            const problem = r.autoPaused || r.consecutiveFailures >= 3 || r.status === "degraded";
            return (
              <tr key={r.id} className="border-b border-line-subtle align-top last:border-b-0">
                <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                  {r.name}
                  {r.lastError && (
                    <p className="mt-1 max-w-prose type-meta font-normal text-meta">
                      {r.lastError}
                    </p>
                  )}
                </th>
                <td className="px-3 py-3 type-body">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1",
                      problem ? "font-semibold text-warn" : "text-body",
                    )}
                  >
                    {problem && <Icon name="triangle-alert" size={16} />}
                    {r.autoPaused ? T.autoPaused : (SOURCE_STATUS_LABEL[r.status] ?? r.status)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right type-body tabular-nums">
                  {r.consecutiveFailures}
                </td>
                <td className="px-3 py-3 text-right type-body tabular-nums">{r.errors24h}</td>
                <td className="px-3 py-3 text-right type-body tabular-nums">{r.items24h}</td>
                <td className="px-3 py-3 text-right type-body tabular-nums">
                  {rate === null ? CONTROL_TEXT.none : `${Math.round(rate * 100)}%`}
                </td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {r.lastFetchedAt ? formatDateTime(r.lastFetchedAt) : T.never}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
