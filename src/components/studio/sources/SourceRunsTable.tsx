import { RUNS as T } from "@/content/pt-BR/sources-admin-detail";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export interface RunRowView {
  id: number;
  at: string;
  level: "info" | "warn" | "error" | "security";
  message: string;
}

export interface SourceRunsTableProps {
  rows: readonly RunRowView[];
  className?: string;
}

const ICON: Record<RunRowView["level"], IconName> = {
  info: "check",
  warn: "triangle-alert",
  error: "circle-alert",
  security: "shield",
};
const TONE: Record<RunRowView["level"], string> = {
  info: "text-service",
  warn: "text-warn",
  error: "text-danger",
  security: "text-danger",
};

/**
 * Últimas coletas da fonte (eventos da etapa `fetch`): quando, resultado com ícone e texto, e o
 * detalhe registrado pelo pipeline. A tabela rola na horizontal dentro de uma região focável.
 */
export function SourceRunsTable({ rows, className }: SourceRunsTableProps) {
  if (rows.length === 0) return <p className={cx("type-body text-meta", className)}>{T.empty}</p>;
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
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <caption className="sr-only">{T.caption}</caption>
        <thead className="border-b border-line-subtle bg-section">
          <tr>
            <th scope="col" className="px-3 py-2 type-meta text-meta">
              {T.colWhen}
            </th>
            <th scope="col" className="px-3 py-2 type-meta text-meta">
              {T.colResult}
            </th>
            <th scope="col" className="px-3 py-2 type-meta text-meta">
              {T.colDetail}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-level={r.level}
              className="border-b border-line-subtle align-top last:border-b-0"
            >
              <td className="px-3 py-3 type-body whitespace-nowrap tabular-nums">
                {formatDateTime(r.at)}
              </td>
              <td className="px-3 py-3 type-body">
                <span className={cx("inline-flex items-center gap-1 font-semibold", TONE[r.level])}>
                  <Icon name={ICON[r.level]} size={16} />
                  {T.level[r.level]}
                </span>
              </td>
              <td className="px-3 py-3 type-body break-words">{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
