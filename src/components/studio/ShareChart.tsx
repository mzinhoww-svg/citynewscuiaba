import { cx } from "../cx";

export interface ShareChartProps {
  /** Nome acessível do gráfico. */
  label: string;
  rows: { label: string; value: number; detail?: string }[];
  /** Resumo em texto visível (DESIGN.md §9). */
  summary: string;
  formatValue: (n: number) => string;
  columns: { label: string; value: string };
  className?: string;
}

/**
 * Barras horizontais em SVG próprio (O17/O18): uma barra por linha, valor ao lado, resumo em
 * texto visível e tabela oculta com todos os valores. Sem gradiente; cor da marca (Cerrado).
 */
export function ShareChart({
  label,
  rows,
  summary,
  formatValue,
  columns,
  className,
}: ShareChartProps) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const rowH = 28;
  const h = rows.length * rowH;
  return (
    <figure className={cx("flex flex-col gap-2", className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 100 ${h}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
        style={{ height: h }}
      >
        {rows.map((r, i) => (
          <g key={r.label}>
            <rect x={0} y={i * rowH + 4} width={100} height={rowH - 8} className="fill-section" />
            <rect
              x={0}
              y={i * rowH + 4}
              width={Math.max(0.5, (r.value / max) * 100)}
              height={rowH - 8}
              className="fill-cerrado"
            />
          </g>
        ))}
      </svg>
      <ul aria-hidden="true" className="flex flex-col gap-1 type-meta text-body">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3 tabular-nums">
            <span>{r.label}</span>
            <span className="text-strong">
              {formatValue(r.value)}
              {r.detail ? ` · ${r.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="type-body text-body">{summary}</figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{columns.label}</th>
            <th scope="col">{columns.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>
                {formatValue(r.value)}
                {r.detail ? ` (${r.detail})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
