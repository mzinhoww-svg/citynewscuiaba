import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { maskDetails, maskIpField, type AuditRow } from "@/lib/admin/audit-csv";
import { maskIps } from "@/lib/control/monitor";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { TextField } from "../ui/TextField";
import { FIELD_CLASS } from "./AdminFields";

export interface AuditFilterValues {
  ator?: string;
  acao?: string;
  objeto?: string;
  de?: string;
  ate?: string;
}

export interface AuditPanelProps {
  action: string;
  values: AuditFilterValues;
  rows: readonly AuditRow[];
  names: ReadonlyMap<string, string>;
  page: number;
  hasMore: boolean;
  /** Só admin vê o IP inteiro. */
  isAdmin: boolean;
  hrefFor: (page: number) => string;
  exportHref: string;
}

/** Auditoria (A10): filtros GET, tabela com `th scope="col"`, paginação e exportação CSV. */
export function AuditPanel({
  action,
  values,
  rows,
  names,
  page,
  hasMore,
  isAdmin,
  hrefFor,
  exportHref,
}: AuditPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action={action}
        aria-label={T.audit.filters}
        className="grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-card-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <TextField
          id="aud-ator"
          name="ator"
          label={T.audit.actor}
          defaultValue={values.ator ?? ""}
        />
        <TextField
          id="aud-acao"
          name="acao"
          label={T.audit.action}
          defaultValue={values.acao ?? ""}
        />
        <TextField
          id="aud-objeto"
          name="objeto"
          label={T.audit.object}
          defaultValue={values.objeto ?? ""}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="aud-de" className="type-label text-16 text-strong">
            {T.audit.from}
          </label>
          <input
            id="aud-de"
            name="de"
            type="date"
            defaultValue={values.de ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="aud-ate" className="type-label text-16 text-strong">
            {T.audit.to}
          </label>
          <input
            id="aud-ate"
            name="ate"
            type="date"
            defaultValue={values.ate ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="md">
            {T.audit.apply}
          </Button>
          <Button href={action} size="md" variant="text">
            {T.audit.clear}
          </Button>
          <Button href={exportHref} size="md" variant="outline" icon="copy">
            {T.audit.export}
          </Button>
          <span className="type-meta text-meta">{T.audit.exportNote}</span>
        </div>
      </form>
      {!isAdmin && <p className="type-meta text-meta">{T.audit.maskedNote}</p>}
      {rows.length === 0 ? (
        <EmptyState title={T.audit.empty} icon="search" as="h2">
          {T.audit.emptyBody}
        </EmptyState>
      ) : (
        <div
          role="region"
          aria-label={T.audit.caption}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">{T.audit.caption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                {[
                  T.audit.colWhen,
                  T.audit.colActor,
                  T.audit.colAction,
                  T.audit.colObject,
                  T.audit.colIp,
                  T.audit.colDetails,
                ].map((c) => (
                  <th key={c} scope="col" className="px-3 py-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-subtle align-top last:border-b-0">
                  <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-3 type-body">{names.get(r.actor) ?? r.actor}</td>
                  <td className="px-3 py-3 type-body font-semibold text-strong">{r.action}</td>
                  <td className="px-3 py-3 type-body break-all">
                    {isAdmin ? r.objectRef : maskIps(r.objectRef)}
                  </td>
                  <td className="px-3 py-3 type-body tabular-nums">
                    {maskIpField(r.ipHash, isAdmin) || "—"}
                  </td>
                  <td className="px-3 py-3 type-meta break-all">
                    {JSON.stringify(maskDetails(r.details, isAdmin))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label={T.audit.pagination} className="flex items-center gap-3">
        {page > 1 ? (
          <Button href={hrefFor(page - 1)} size="md" variant="outline">
            {T.audit.prev}
          </Button>
        ) : null}
        <span className="type-meta text-meta">{T.audit.page(page)}</span>
        {hasMore ? (
          <Button href={hrefFor(page + 1)} size="md" variant="outline">
            {T.audit.next}
          </Button>
        ) : null}
      </nav>
    </div>
  );
}
