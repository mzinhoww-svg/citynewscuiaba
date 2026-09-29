"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import type { SourceFilters, SourceListRow } from "@/lib/db/queries/sources-admin";
import { BULK_MAX, BulkActionsBar } from "./BulkActionsBar";
import { formatDateTime } from "@/lib/format/date";
import { InlineAlert } from "../../ui/InlineAlert";
import { Icon } from "../../ui/Icon";
import { SortHeader } from "../SortHeader";
import { EditorialScore } from "./EditorialScore";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { sortHref } from "./list-url";
import { RowActions, type RowReply } from "./RowActions";
import { SourceRowMobile } from "./SourceRowMobile";
import { SourceStatusBadge } from "./SourceStatusBadge";

export interface SourcesTableProps {
  rows: SourceListRow[];
  filters: SourceFilters;
  /**
   * Estado vazio da página (sem fontes, ou nenhuma com os filtros). A tabela continua montada para
   * a mensagem da última ação não sumir quando o resultado deixa a lista vazia.
   */
  empty?: ReactNode;
}

interface Notice extends RowReply {
  skipped?: string[];
}

type BulkReply = Parameters<Parameters<typeof BulkActionsBar>[0]["onResult"]>[0];

/**
 * Lista de fontes (O03): tabela ordenável com `aria-sort` a partir de 1024 px e lista de itens
 * abaixo disso. Estado, relevância e saúde sempre têm texto. A seleção (até 50) alimenta a barra
 * de lote; o resultado das ações aparece numa região `status` que fica sempre no DOM.
 */
export function SourcesTable({ rows, filters, empty }: SourcesTableProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allOnPage = rows.length > 0 && ids.length === rows.length;

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allOnPage ? new Set() : new Set(rows.slice(0, BULK_MAX).map((r) => r.id)));

  const onBulk = (reply: BulkReply) => {
    const skipped = reply.ok
      ? (reply.data?.items ?? [])
          .filter((i) => i.outcome !== "applied")
          .map((i) => `${i.slug}: ${i.message ?? i.reason ?? ""}`)
      : [];
    setNotice({ ok: reply.ok, message: reply.message, skipped });
    if (reply.ok) setSelected(new Set());
  };
  const onRow = (reply: RowReply) => setNotice(reply);
  const sort = (key: keyof typeof T.sortable) => ({
    label: T.sortable[key],
    active: filters.sort === key,
    dir: filters.dir,
    href: sortHref(filters, key),
  });

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <BulkActionsBar ids={ids} onClear={() => setSelected(new Set())} onResult={onBulk} />
      )}

      <div role="status" aria-live="polite">
        {notice && (
          <InlineAlert role="none" tone={notice.ok ? "success" : "error"}>
            {notice.message}
            {notice.skipped && notice.skipped.length > 0 && (
              <>
                <span className="mt-2 block type-label">{T.bulk.skippedTitle}</span>
                <ul className="mt-1 list-disc pl-5 type-meta">
                  {notice.skipped.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </InlineAlert>
        )}
      </div>

      {rows.length === 0 ? (
        (empty ?? null)
      ) : (
        <>
          <div
            role="region"
            aria-label={T.tableCaption}
            tabIndex={0}
            className="relative hidden overflow-x-auto rounded-lg border border-line-subtle bg-card-white lg:block"
          >
            <table className="w-full min-w-[76rem] border-collapse text-left">
              <caption className="sr-only">{T.tableCaption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  <th scope="col" className="w-12 px-3 py-1">
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={toggleAll}
                      aria-label={T.selectAll}
                      className="size-5 accent-(--action-primary)"
                    />
                  </th>
                  <SortHeader {...sort("name")} />
                  <SortHeader {...sort("status")} />
                  <th scope="col" className="px-3 py-1 type-meta text-meta">
                    {T.columns.score}
                  </th>
                  <SortHeader {...sort("score")} />
                  <SortHeader {...sort("frequency")} />
                  <SortHeader {...sort("last")} />
                  <th scope="col" className="px-3 py-1 type-meta text-meta">
                    {T.columns.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-source={row.slug}
                    aria-selected={selected.has(row.id)}
                    className="border-b border-line-subtle align-top last:border-b-0"
                  >
                    <td className="px-3 py-3">
                      <input
                        id={`sel-${row.id}-t`}
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={T.selectRow(row.name)}
                        className="mt-0.5 size-5 accent-(--action-primary)"
                      />
                    </td>
                    <th scope="row" className="px-3 py-3 text-left">
                      <Link
                        href={`/estudio/control/fontes/${row.id}`}
                        className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="block break-all type-meta font-normal text-meta">
                        {row.baseUrl}
                      </span>
                      <span className="block type-meta font-normal text-meta">
                        {row.layer ? T.layerShort(row.layer) : T.noLayer}
                      </span>
                    </th>
                    <td className="px-3 py-3">
                      <SourceStatusBadge
                        status={row.status}
                        reason={row.statusReason}
                        archived={row.archived}
                      />
                      {row.pendingApproval && (
                        <span className="mt-1 flex items-center gap-1 type-meta text-warn">
                          <Icon name="triangle-alert" size={16} />
                          {T.approvalPending}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <EditorialScore score={row.editorialScore} className="whitespace-nowrap" />
                    </td>
                    <td className="px-3 py-3">
                      <HealthBadge state={row.health} score={row.operationalScore} />
                      {row.errors24h > 0 && (
                        <span className="block type-meta text-danger">
                          {T.errors24h(row.errors24h)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <FrequencyLabel
                        chosen={row.frequency.chosen}
                        effective={row.frequency.effective}
                        raisedBy={row.frequency.raisedBy}
                        nextAt={row.nextCollectionAt}
                        showNext={row.nextCollectionAt !== null}
                      />
                    </td>
                    <td className="px-3 py-3 type-meta text-strong">
                      {row.lastFetchedAt ? formatDateTime(row.lastFetchedAt) : T.neverCollected}
                    </td>
                    <td className="px-3 py-3">
                      <RowActions row={row} onResult={onRow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul aria-label={T.listLabel} className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {rows.map((row) => (
              <SourceRowMobile
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggle={toggle}
                onResult={onRow}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
