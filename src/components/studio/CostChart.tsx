import { cx } from "../cx";

export interface CostChartProps {
  /** Nome acessível do gráfico. */
  label: string;
  days: { day: string; costBrl: number }[];
  budgetBrl: number;
  /** Rótulos prontos (pt-BR). */
  formatDay: (day: string) => string;
  formatMoney: (n: number) => string;
  summary: string;
  budgetLabel: string;
  /** Texto quando o orçamento fica acima da escala (ex.: "acima da escala"). */
  outOfScale: string;
  columns: { day: string; cost: string };
  className?: string;
}

/**
 * Gasto diário de IA (O09): barras em SVG próprio com a linha tracejada do orçamento. Dia acima
 * de 90% do orçamento usa Atenção. Resumo em texto visível e tabela oculta com todos os valores
 * (DESIGN.md §9: gráfico nunca é a única forma do dado).
 */
export function CostChart({
  label,
  days,
  budgetBrl,
  formatDay,
  formatMoney,
  summary,
  budgetLabel,
  outOfScale,
  columns,
  className,
}: CostChartProps) {
  const peak = Math.max(...days.map((d) => d.costBrl), 0);
  // Gasto muito abaixo do orçamento: a escala segue o maior dia e a linha do orçamento sai do
  // gráfico (a legenda avisa), para as barras não virarem traços.
  const budgetInScale = peak >= budgetBrl * 0.25;
  const max = budgetInScale ? Math.max(budgetBrl, peak) : Math.max(peak * 1.25, 0.01);
  const w = 100 / Math.max(1, days.length);
  const y = (v: number) => 100 - (v / max) * 100;
  return (
    <figure className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between type-meta tabular-nums text-meta">
        <span aria-hidden="true">{formatMoney(max)}</span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-6 border-t-2 border-dashed border-warn"
          />
          {budgetLabel}: {formatMoney(budgetBrl)}
          {!budgetInScale && ` (${outOfScale})`}
        </span>
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-40 w-full rounded-sm bg-section"
      >
        {days.map((d, i) => (
          <rect
            key={d.day}
            x={i * w + w * 0.15}
            y={y(d.costBrl)}
            width={w * 0.7}
            height={Math.max(0, 100 - y(d.costBrl))}
            className={d.costBrl > budgetBrl * 0.9 ? "fill-warn" : "fill-cerrado"}
          />
        ))}
        {budgetInScale && (
          <line
            x1={0}
            x2={100}
            y1={y(budgetBrl)}
            y2={y(budgetBrl)}
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="stroke-warn"
          />
        )}
      </svg>
      <div aria-hidden="true" className="flex justify-between type-meta tabular-nums text-meta">
        <span>{days[0] ? formatDay(days[0].day) : ""}</span>
        <span>{days.at(-1) ? formatDay(days.at(-1)!.day) : ""}</span>
      </div>
      <figcaption className="type-body text-body">{summary}</figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{columns.day}</th>
            <th scope="col">{columns.cost}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{formatDay(d.day)}</th>
              <td>{formatMoney(d.costBrl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
