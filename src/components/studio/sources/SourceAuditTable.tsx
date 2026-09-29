import Link from "next/link";
import {
  AUDIT_FIELD_LABEL,
  HISTORY as T,
  auditValueText,
} from "@/content/pt-BR/sources-admin-detail";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface AuditRowView {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
  action: string;
  changes: { field: string; from: unknown; to: unknown }[];
  reason: string | null;
  batchId: string | null;
  approvalId: string | null;
}

export interface SourceAuditTableProps {
  rows: readonly AuditRowView[];
  page: number;
  total: number;
  pageSize: number;
  /** Endereço da aba, para os links de página (`?pagina=`). */
  basePath: string;
  className?: string;
}

const who = (r: AuditRowView): string =>
  r.actorName ?? (r.actor === "sistema" ? T.system : T.unknownPerson);

/**
 * Auditoria da fonte (quem, quando, o quê, antes → depois, motivo e aprovação). Só leitura; a
 * tabela rola na horizontal dentro de uma região focável em 360 px. Paginação por links.
 */
export function SourceAuditTable({
  rows,
  page,
  total,
  pageSize,
  basePath,
  className,
}: SourceAuditTableProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (rows.length === 0) return <p className={cx("type-body text-meta", className)}>{T.empty}</p>;
  const link = (n: number) => (n <= 1 ? basePath : `${basePath}?pagina=${n}`);
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div
        role="region"
        aria-label={T.caption}
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
      >
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <caption className="sr-only">{T.caption}</caption>
          <thead className="border-b border-line-subtle bg-section">
            <tr>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colWhen}
              </th>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colWho}
              </th>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colAction}
              </th>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colChanges}
              </th>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colReason}
              </th>
              <th scope="col" className="px-3 py-2 type-meta text-meta">
                {T.colApproval}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                data-action={r.action}
                className="border-b border-line-subtle align-top last:border-b-0"
              >
                <td className="px-3 py-3 type-body whitespace-nowrap tabular-nums">
                  {formatDateTime(r.at)}
                </td>
                <td className="px-3 py-3 type-body">{who(r)}</td>
                <td className="px-3 py-3 type-body font-semibold text-strong">
                  {T.actions[r.action] ?? r.action}
                </td>
                <td className="px-3 py-3 type-body">
                  {r.changes.length === 0 ? (
                    T.none
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {r.changes.map((c, i) => (
                        <li key={`${c.field}-${i}`}>
                          <span className="font-semibold text-strong">
                            {AUDIT_FIELD_LABEL[c.field] ?? c.field}
                          </span>
                          : {auditValueText(c.field, c.from)}{" "}
                          <span>
                            <span className="sr-only">para</span>
                            <Icon
                              name="move-right"
                              size={14}
                              className="inline align-text-bottom"
                            />
                          </span>{" "}
                          {auditValueText(c.field, c.to)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-3 type-body">{r.reason ?? T.none}</td>
                <td className="px-3 py-3 type-body">
                  {r.approvalId ? (
                    <span className="inline-flex items-center gap-1 text-service">
                      <Icon name="check" size={16} />
                      {T.approved}
                    </span>
                  ) : r.batchId ? (
                    T.batch
                  ) : (
                    T.none
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label={T.navLabel} className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta text-meta">
          {T.page(page, pages)} · {T.totalRows(total)}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={link(page - 1)}
              className="inline-flex min-h-tap items-center rounded-pill border border-line-control px-4 type-body font-semibold text-strong no-underline hover:bg-section"
            >
              {T.prev}
            </Link>
          )}
          {page < pages && (
            <Link
              href={link(page + 1)}
              className="inline-flex min-h-tap items-center rounded-pill border border-line-control px-4 type-body font-semibold text-strong no-underline hover:bg-section"
            >
              {T.nextPage}
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
