import type { CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";

export interface BarChartProps {
  /** Nome do gráfico (ex.: "Leituras por hora"). */
  label: string;
  values: number[];
  /** Rótulos do eixo (podem ser menos que os valores). */
  labels?: string[];
  /** Rótulo de cada valor na tabela de resumo; padrão "1", "2"… */
  valueLabels?: string[];
  height?: number;
  highlight?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Gráfico de barras verticais simples (leituras por hora) em Cerrado, com destaque Urucum.
 *
 * ```tsx
 * <BarChart label="Leituras por hora" values={[8, 5, 0, 9, 6]} labels={["0h", "12h", "24h"]} highlight={3} />
 * ```
 * - Barras sólidas (sem gradiente decorativo). Resumo textual em tabela oculta (DESIGN.md §9).
 */
export function BarChart({
  label,
  values,
  labels = [],
  valueLabels,
  height = 100,
  highlight,
  className,
  style,
}: BarChartProps) {
  const max = Math.max(...values, 1);
  return (
    <figure className={className} style={style}>
      <div role="img" aria-label={label} className="flex items-end gap-1.5" style={{ height }}>
        {values.map((v, i) => (
          <div
            key={i}
            className={cx(
              "min-h-0.5 flex-1 rounded-t-xs",
              i === highlight ? "bg-urucum" : v ? "bg-cerrado" : "bg-transparent",
            )}
            style={{ height: `${(v / max) * 100}%` }}
          />
        ))}
      </div>
      {labels.length > 0 && (
        <div
          aria-hidden="true"
          className="mt-2.5 flex justify-between text-12 font-semibold text-placeholder"
        >
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>
          {label} · {UI.chartSummary}
        </caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{valueLabels?.[i] ?? String(i + 1)}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
