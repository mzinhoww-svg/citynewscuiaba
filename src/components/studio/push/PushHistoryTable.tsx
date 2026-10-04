"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT, PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { HistoryFilter, HistoryRow } from "@/lib/db/queries/push-admin";
import type { PushKind, SendStatus } from "@/lib/push/types";
import { cx } from "../../cx";
import { CollapsibleFilters } from "../../ui/CollapsibleFilters";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { NativeSelect } from "../sources/fields";
import { PushStatusBadge } from "./PushStatusBadge";

export interface PushHistoryTableProps {
  rows: readonly HistoryRow[];
  total: number;
  filter: HistoryFilter;
  pageSize: number;
  /** `/estudio/admin/notificacoes/historico`. */
  basePath: string;
  className?: string;
}

const KINDS: PushKind[] = ["urgent", "highlight", "follow"];
const STATUSES: SendStatus[] = [
  "pending_approval",
  "scheduled",
  "queued",
  "dispatching",
  "sent",
  "paused",
  "cancelled",
  "rejected",
  "expired",
];

export function historyQuery(f: HistoryFilter, page?: number): string {
  const params = new URLSearchParams();
  params.set("periodo", f.days === null ? "tudo" : String(f.days));
  if (f.kind) params.set("tipo", f.kind);
  if (f.status) params.set("estado", f.status);
  const p = page ?? f.page;
  if (p > 1) params.set("pagina", String(p));
  return params.toString();
}

const pct = (v: number | null) =>
  v === null ? T.none : `${(v * 100).toFixed(1).replace(".", ",")}%`;

/**
 * Histórico (spec §10.4): filtros na URL (formulário GET, funciona sem JS), tabela completa com
 * `<th scope="col">`, CTR "entre quem permite métricas", paginação e "Exportar CSV" (rota GET com
 * os mesmos filtros; sem dado de inscrição).
 */
export function PushHistoryTable({
  rows,
  total,
  filter,
  pageSize,
  basePath,
  className,
}: PushHistoryTableProps) {
  const uid = useId().replace(/:/g, "");
  const [period, setPeriod] = useState(filter.days === null ? "tudo" : String(filter.days));
  const [kind, setKind] = useState(filter.kind ?? "");
  const [status, setStatus] = useState(filter.status ?? "");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hrefFor = (p: number) => `${basePath}?${historyQuery(filter, p)}`;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <CollapsibleFilters
        activeCount={[filter.days !== 30, filter.kind, filter.status].filter(Boolean).length}
        clearHref={basePath}
        actions={
          <Button
            href={`${basePath}/exportar?${historyQuery(filter, 1)}`}
            download
            size="md"
            variant="outline"
            icon="download"
          >
            {T.export}
          </Button>
        }
      >
        <form
          method="get"
          action={basePath}
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:w-40">
            <label htmlFor={`${uid}-periodo`} className="type-label text-16 text-strong">
              {T.filters.period}
            </label>
            <NativeSelect
              id={`${uid}-periodo`}
              name="periodo"
              value={period}
              onChange={setPeriod}
              options={(["7", "30", "90", "tudo"] as const).map((v) => ({
                value: v,
                label: T.periods[v === "tudo" ? "tudo" : (Number(v) as 7 | 30 | 90)],
              }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:w-52">
            <label htmlFor={`${uid}-tipo`} className="type-label text-16 text-strong">
              {T.filters.kind}
            </label>
            <NativeSelect
              id={`${uid}-tipo`}
              name="tipo"
              value={kind}
              onChange={setKind}
              options={[
                { value: "", label: T.filters.all },
                ...KINDS.map((k) => ({ value: k, label: PUSH_ADMIN_TEXT.kind[k] })),
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:w-52">
            <label htmlFor={`${uid}-estado`} className="type-label text-16 text-strong">
              {T.filters.status}
            </label>
            <NativeSelect
              id={`${uid}-estado`}
              name="estado"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: T.filters.all },
                ...STATUSES.map((s) => ({ value: s, label: PUSH_ADMIN_TEXT.status[s] })),
              ]}
            />
          </div>
          <Button type="submit" size="md" variant="outline">
            {T.filters.apply}
          </Button>
        </form>
      </CollapsibleFilters>
      <p className="type-meta text-meta">
        {T.ctrNote} {T.exportNote}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={T.empty} icon="history">
          {T.emptyHint}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label={T.title} tabIndex={0}>
          <table className="w-full min-w-5xl border-collapse type-body">
            <thead>
              <tr className="border-b border-line-section text-left type-meta text-meta">
                {Object.values(T.columns).map((h) => (
                  <th key={h} scope="col" className="py-2 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-section align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-strong">
                    <Link
                      href={`${basePath}/${r.id}`}
                      className="text-link underline-offset-4 hover:underline"
                    >
                      {fullDateTime(r.createdAt)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-strong">{PUSH_ADMIN_TEXT.kind[r.kind]}</td>
                  <td className="py-2 pr-3 text-strong">
                    <p>{r.article.title}</p>
                    <p className="type-meta text-meta">{r.title}</p>
                  </td>
                  <td className="py-2 pr-3 text-strong">{r.requestedBy?.name ?? T.system}</td>
                  <td className="py-2 pr-3 text-strong">{r.approvedBy?.name ?? T.none}</td>
                  <td className="py-2 pr-3 text-strong">{r.audienceLabel}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.targets}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.sent}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.accepted}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.failed}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.removed}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.skipped}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.delivered}</td>
                  <td className="py-2 pr-3 text-right text-strong">{r.clicked}</td>
                  <td className="py-2 pr-3 text-right text-strong">{pct(r.ctr)}</td>
                  <td className="py-2">
                    <PushStatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Paginação do histórico"
          className="flex items-center justify-between gap-4"
        >
          {filter.page > 1 ? (
            <Link href={hrefFor(filter.page - 1)} className="type-body text-link">
              {T.prev}
            </Link>
          ) : (
            <span />
          )}
          <p className="type-meta text-meta">{T.page(filter.page, totalPages)}</p>
          {filter.page < totalPages ? (
            <Link href={hrefFor(filter.page + 1)} className="type-body text-link">
              {T.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
