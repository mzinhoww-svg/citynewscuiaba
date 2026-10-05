import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { COLLECTION_TAB_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import type { SourceRun } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { Table } from "../../ui/Table";

export interface SourceRunsTableProps {
  runs: readonly SourceRun[];
  className?: string;
}

/** "skipped:fast_lane_full" → "Pulada · via rápida cheia"; resultado desconhecido volta cru. */
export function outcomeText(outcome: string): { text: string; ok: boolean | null } {
  const key = outcome.startsWith("skipped:") ? outcome.slice("skipped:".length) : outcome;
  const text = T.outcome[key] ?? outcome;
  const ok =
    key === "ok" || key === "success" || key === "not_modified"
      ? true
      : key === "failed" || key === "error"
        ? false
        : null;
  return { text, ok };
}

/**
 * Últimos 10 runs que tocaram a fonte (spec §8, aba Coleta): quando, tipo (ciclo, via rápida,
 * manual) e resultado em texto, com o motivo quando pulada. `<th scope="col">`.
 */
export function SourceRunsTable({ runs, className }: SourceRunsTableProps) {
  if (runs.length === 0)
    return <p className={cx("type-body text-meta", className)}>{T.runsEmpty}</p>;
  return (
    // Região rolável com foco por teclado (axe scrollable-region-focusable, FS-T9).
    <Table
      caption={T.runsTitle}
      minWidth="sm"
      className={className}
      headers={[T.runs.when, T.runs.type, T.runs.result, T.runs.run]}
    >
      {runs.map((r) => {
        const o = outcomeText(r.outcome);
        return (
          <tr key={`${r.runId}-${r.outcome}`} className="border-b border-line-section type-body">
            <td className="px-3 py-2 whitespace-nowrap text-strong">{fullDateTime(r.startedAt)}</td>
            <td className="px-3 py-2 whitespace-nowrap text-strong">
              {T.trigger[r.trigger] ?? r.trigger}
            </td>
            <td className="px-3 py-2 text-strong">
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  name={o.ok === null ? "clock" : o.ok ? "check" : "circle-alert"}
                  size={16}
                  className={o.ok === null ? "text-meta" : o.ok ? "text-service" : "text-danger"}
                />
                {o.text}
              </span>
            </td>
            <td className="px-3 py-2 type-meta text-meta">{r.runId.slice(0, 8)}</td>
          </tr>
        );
      })}
    </Table>
  );
}
