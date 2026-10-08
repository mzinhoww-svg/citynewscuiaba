import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { EVENT_TABS_TEXT as T } from "@/content/pt-BR/sources-admin-events";
import { RUN_STATUS_TEXT } from "@/content/pt-BR/studio-agenda";
import type { AgendaSourceRun } from "@/lib/db/queries/agenda-runs";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { Table } from "../../ui/Table";

export interface AgendaRunsTableProps {
  runs: readonly AgendaSourceRun[];
  className?: string;
}

/**
 * Últimas execuções da coleta da Agenda para uma fonte de eventos (AGM-T6, aba Coleta): quando,
 * tipo, situação em texto (com ícone, nunca só cor) e contagens. `<th scope="col">`.
 */
export function AgendaRunsTable({ runs, className }: AgendaRunsTableProps) {
  if (runs.length === 0)
    return <p className={cx("type-body text-meta", className)}>{T.runsEmpty}</p>;
  return (
    <Table
      caption={T.runsTitle}
      minWidth="sm"
      className={className}
      headers={[
        T.runs.when,
        T.runs.type,
        T.runs.status,
        T.runs.found,
        T.runs.approved,
        T.runs.rejected,
        T.runs.created,
        T.runs.updated,
        T.runs.aiPages,
      ]}
    >
      {runs.map((r) => {
        const ok = r.status === "ok";
        const label = r.status ? RUN_STATUS_TEXT[r.status] : T.unknownStatus;
        return (
          <tr key={r.id} className="border-b border-line-section type-body">
            <td className="px-3 py-2 whitespace-nowrap text-strong">{fullDateTime(r.startedAt)}</td>
            <td className="px-3 py-2 whitespace-nowrap text-strong">
              {T.trigger[r.trigger] ?? r.trigger}
            </td>
            <td className="px-3 py-2 text-strong">
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  name={r.status === null ? "clock" : ok ? "check" : "circle-alert"}
                  size={16}
                  className={r.status === null ? "text-meta" : ok ? "text-service" : "text-danger"}
                />
                {label}
                {r.detail ? <span className="type-meta text-meta"> · {r.detail}</span> : null}
              </span>
            </td>
            <td className="px-3 py-2 text-strong">{r.found}</td>
            <td className="px-3 py-2 text-strong">{r.approved}</td>
            <td className="px-3 py-2 text-strong">{r.rejected}</td>
            <td className="px-3 py-2 text-strong">{r.created}</td>
            <td className="px-3 py-2 text-strong">{r.updated}</td>
            <td className="px-3 py-2 text-strong">{r.aiPages}</td>
          </tr>
        );
      })}
    </Table>
  );
}
