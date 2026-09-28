"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  clockTime,
  formatMinutes,
  fullDateTime,
  FREQUENCY_TEXT,
  LAYER_TEXT,
  PRIORITY_TEXT,
  SOURCES_LIST_TEXT as T,
} from "@/content/pt-BR/sources-admin";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import {
  bulkSourcesAction,
  collectNowAction,
  sourceStatusAction,
} from "@/app/estudio/control/fontes/actions";
import type { SourceListRow, SourceSort } from "@/lib/db/queries/sources-admin";
import { FAST_FREQUENCIES } from "@/lib/sources";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { BulkActionsBar, type FrequencyOption } from "./BulkActionsBar";
import { EditorialScore } from "./EditorialScore";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { SourceRowMobile } from "./SourceRowMobile";
import { SourceStatusBadge } from "./SourceStatusBadge";

export interface SourcesTableProps {
  rows: SourceListRow[];
  sort: SourceSort;
  dir?: "asc" | "desc";
  /** Rota base do painel (link de detalhe e de ordenação). */
  basePath?: string;
  /** Filtros atuais além de ordenação e página, para preservar na troca de coluna. */
  query?: Record<string, string>;
  className?: string;
}

function sortHref(
  col: SourceSort,
  current: SourceSort,
  dir: "asc" | "desc",
  basePath: string,
  query: Record<string, string>,
): string {
  const params = new URLSearchParams(query);
  const nextDir =
    current === col ? (dir === "asc" ? "desc" : "asc") : col === "name" ? "asc" : "desc";
  params.set("ordem", col);
  params.set("dir", nextDir);
  return `${basePath}?${params.toString()}`;
}

const BULK_FREQUENCIES: FrequencyOption[] = [
  { value: "padrao", label: "Padrão global" },
  ...[...FAST_FREQUENCIES, 30, 60, 120, 240, 360, 720, 1440].map((m) => ({
    value: String(m),
    label: (FAST_FREQUENCIES as readonly number[]).includes(m)
      ? `${formatMinutes(m)} · via rápida`
      : formatMinutes(m),
  })),
];

/**
 * Tabela ordenável da lista de fontes (spec §8, O03): seleção, ordenação por `aria-sort`, ações
 * por linha e barra de lote. Em 360 px vira lista de cartões (`SourceRowMobile`), sem tabela.
 *
 * ```tsx
 * <SourcesTable rows={rows} sort="score" dir="desc" />
 * ```
 */
export function SourcesTable({
  rows,
  sort,
  dir = "desc",
  basePath = "/estudio/control/fontes",
  query = {},
  className,
}: SourcesTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) =>
      rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)),
    );

  const selectedIds = useMemo(() => [...selected], [selected]);

  function runBulk(action: "pause" | "activate" | "frequency", frequencyMinutes?: number | null) {
    const form = new FormData();
    for (const id of selectedIds) form.append("ids", id);
    form.set("action", action);
    if (action === "frequency")
      form.set("frequencyMinutes", frequencyMinutes === null ? "padrao" : String(frequencyMinutes));
    startTransition(async () => {
      const r = await bulkSourcesAction(form);
      setAnnouncement(r.message);
      if (r.ok) setSelected(new Set());
    });
  }

  function runCollectNow(id: string) {
    const form = new FormData();
    form.set("id", id);
    startTransition(async () => {
      const r = await collectNowAction(form);
      setAnnouncement(r.message);
    });
  }

  function runPauseResume(row: SourceListRow) {
    const form = new FormData();
    form.set("id", row.id);
    form.set("version", String(row.version));
    form.set("action", row.displayStatus === "paused" ? "resume" : "pause");
    startTransition(async () => {
      const r = await sourceStatusAction(form);
      setAnnouncement(r.message);
    });
  }

  const hrefFor = (id: string) => `${basePath}/${id}`;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Desktop: tabela (>= md) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-max border-collapse text-left">
          <thead>
            <tr className="border-b border-line-section">
              <th scope="col" className="p-3">
                <input
                  type="checkbox"
                  aria-label={T.columns.selectAll}
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-5 accent-action-primary"
                />
              </th>
              <SortableHeader
                col="name"
                label={T.columns.source}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.status}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.layer}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.locality}
              </th>
              <SortableHeader
                col="score"
                label={T.columns.score}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.priority}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.frequency}
              </th>
              <SortableHeader
                col="health"
                label={T.columns.health}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <SortableHeader
                col="last"
                label={T.columns.lastFetch}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.nextFetch}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.errors}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const canCollectNow =
                row.displayStatus === "active" || row.displayStatus === "degraded";
              const canPause = row.displayStatus === "active" || row.displayStatus === "degraded";
              const canResume = row.displayStatus === "paused";
              return (
                <tr key={row.id} className="border-b border-line-subtle align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={T.columns.selectOne(row.name)}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-5 accent-action-primary"
                    />
                  </td>
                  <td className="p-3">
                    <Link
                      href={hrefFor(row.id)}
                      className="type-body font-semibold text-strong no-underline hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="type-meta text-meta">{row.domain}</p>
                  </td>
                  <td className="p-3">
                    <SourceStatusBadge status={row.displayStatus} reason={row.statusReason} />
                  </td>
                  <td className="p-3 type-meta text-strong">
                    {row.layer ? LAYER_TEXT[row.layer] : "—"}
                  </td>
                  <td className="p-3 type-meta text-strong">
                    {LOCALITY_TEXT[row.locality] ?? row.locality}
                  </td>
                  <td className="p-3">
                    <EditorialScore score={row.editorialScore} />
                  </td>
                  <td className="p-3 type-meta text-strong">{PRIORITY_TEXT[row.priority]}</td>
                  <td className="p-3">
                    <FrequencyLabel
                      frequencyMinutes={row.frequencyMinutes}
                      effective={row.effective}
                    />
                  </td>
                  <td className="p-3">
                    <HealthBadge score={row.operationalScore} label={row.health} />
                  </td>
                  <td className="p-3 type-meta text-strong">
                    {row.lastFetchedAt ? fullDateTime(row.lastFetchedAt) : T.never}
                  </td>
                  <td className="p-3 type-meta text-strong">
                    {row.nextCollectionAt ? clockTime(row.nextCollectionAt) : FREQUENCY_TEXT.noNext}
                  </td>
                  <td className="p-3 type-meta text-strong">{row.errors24h}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {canCollectNow && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => runCollectNow(row.id)}
                          aria-label={`${T.rowActions.collectNow} · ${row.name}`}
                          className="hit-area inline-flex items-center gap-1 rounded-pill border border-line-control px-2.5 type-meta text-strong disabled:opacity-60"
                        >
                          <Icon name="refresh-cw" size={14} />
                          {T.rowActions.collectNow}
                        </button>
                      )}
                      {(canPause || canResume) && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => runPauseResume(row)}
                          aria-label={`${canResume ? T.rowActions.resume : T.rowActions.pause} · ${row.name}`}
                          className="hit-area inline-flex items-center gap-1 rounded-pill border border-line-control px-2.5 type-meta text-strong disabled:opacity-60"
                        >
                          <Icon name="circle-pause" size={14} />
                          {canResume ? T.rowActions.resume : T.rowActions.pause}
                        </button>
                      )}
                      <Link
                        href={hrefFor(row.id)}
                        className="hit-area inline-flex items-center gap-1 rounded-pill border border-line-control px-2.5 type-meta text-strong no-underline"
                      >
                        {T.rowActions.open}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: lista de cartões (< md), sem rolagem horizontal */}
      <ul className="flex flex-col md:hidden">
        {rows.map((row) => (
          <SourceRowMobile
            key={row.id}
            row={row}
            href={hrefFor(row.id)}
            selected={selected.has(row.id)}
            onToggle={() => toggle(row.id)}
            onCollectNow={() => runCollectNow(row.id)}
            onPauseResume={() => runPauseResume(row)}
            busy={pending}
          />
        ))}
      </ul>

      <BulkActionsBar
        count={selected.size}
        busy={pending}
        onPause={() => runBulk("pause")}
        onActivate={() => runBulk("activate")}
        onApplyFrequency={(minutes) => runBulk("frequency", minutes)}
        onClear={() => setSelected(new Set())}
        frequencyOptions={BULK_FREQUENCIES}
      />
    </div>
  );
}

interface SortableHeaderProps {
  col: SourceSort;
  label: string;
  sort: SourceSort;
  dir: "asc" | "desc";
  basePath: string;
  query: Record<string, string>;
}

function SortableHeader({ col, label, sort, dir, basePath, query }: SortableHeaderProps) {
  const active = sort === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="p-3"
    >
      <Link
        href={sortHref(col, sort, dir, basePath, query)}
        className="inline-flex items-center gap-1 type-meta font-semibold text-strong no-underline hover:underline"
      >
        {label}
        {active && (
          <Icon
            name={dir === "asc" ? "arrow-up" : "chevron-down"}
            size={14}
            className="text-meta"
          />
        )}
      </Link>
    </th>
  );
}
