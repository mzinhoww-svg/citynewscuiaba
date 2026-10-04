import { FUNNEL_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { formatCount, formatPct, STAGE_LABEL, type FunnelRow } from "@/lib/push/funnel";
import { cx } from "../../cx";
import { Table } from "../../ui/Table";

export interface FunnelChartProps {
  rows: FunnelRow[];
  /** Resumo textual por regra (`funnelSummary`), visível e no nome do gráfico. */
  summary: string;
  className?: string;
}

/**
 * Funil do app (spec §10.6): barras horizontais SVG, uma por etapa, com número e % da anterior;
 * cores dos tokens, sem gradiente; `role="img"` com o resumo textual e tabela equivalente.
 */
export function FunnelChart({ rows, summary, className }: FunnelChartProps) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const w = (n: number) => Math.max(n > 0 ? 1 : 0, (n / max) * 100);
  return (
    <figure className={cx("flex flex-col gap-4", className)}>
      <figcaption className="type-body text-strong">{summary}</figcaption>
      <div role="img" aria-label={`${T.chart}. ${summary}`} className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div
            key={r.stage}
            className="grid grid-cols-[minmax(7rem,12rem)_1fr_minmax(6rem,auto)] items-center gap-3"
          >
            <span aria-hidden="true" className="type-meta font-semibold text-strong">
              {i + 1}. {STAGE_LABEL[r.stage]}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 100 10"
              preserveAspectRatio="none"
              className="h-7 w-full rounded-xs bg-section"
            >
              <rect
                x={0}
                y={0}
                width={w(r.n)}
                height={10}
                className={i < 4 ? "fill-cerrado" : "fill-urucum"}
              />
            </svg>
            <span aria-hidden="true" className="type-meta text-strong">
              {formatCount(r.n)}
              {r.pctOfPrevious !== null && (
                <span className="text-meta"> · {formatPct(r.pctOfPrevious)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <Table
        caption={T.chart}
        headers={[
          T.columns.stage,
          { label: T.columns.n, align: "right" },
          { label: T.columns.pct, align: "right" },
        ]}
        className="type-body"
      >
        {rows.map((r, i) => (
          <tr key={r.stage} className="border-b border-line-section">
            <th scope="row" className="px-3 py-2 text-left font-normal text-strong">
              {i + 1}. {STAGE_LABEL[r.stage]}
            </th>
            <td className="px-3 py-2 text-right text-strong">{formatCount(r.n)}</td>
            <td className="px-3 py-2 text-right text-strong">
              {r.pctOfPrevious === null ? T.none : formatPct(r.pctOfPrevious)}
            </td>
          </tr>
        ))}
      </Table>
    </figure>
  );
}
