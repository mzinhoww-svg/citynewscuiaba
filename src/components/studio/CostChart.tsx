import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";

export interface CostChartProps {
  days: readonly { date: string; costBrl: number }[];
  /** Teto diário geral (linha de referência). */
  limitBrl: number;
}

const W = 560;
const H = 180;
const PAD_L = 8;
const PAD_B = 22;
const PAD_T = 12;

/**
 * Gasto por dia em colunas (SVG próprio). O gráfico é ilustração para leitores de tela: o
 * resumo em texto logo abaixo traz os mesmos números. A linha tracejada marca o teto diário.
 */
export function CostChart({ days, limitBrl }: CostChartProps) {
  const max = Math.max(limitBrl, ...days.map((d) => d.costBrl), 0.0001);
  const inner = H - PAD_B - PAD_T;
  const slot = (W - PAD_L) / Math.max(days.length, 1);
  const bar = Math.max(4, slot * 0.6);
  const yLimit = PAD_T + inner - (limitBrl / max) * inner;
  const parts = days.map((d) => T.chartDay(d.date, d.costBrl)).join("; ");
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={T.chartLabel(days.length)}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-3xl"
      >
        <line
          x1={PAD_L}
          x2={W}
          y1={yLimit}
          y2={yLimit}
          stroke="var(--text-meta)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {days.map((d, i) => {
          const h = d.costBrl > 0 ? Math.max(2, (d.costBrl / max) * inner) : 0;
          const x = PAD_L + i * slot + (slot - bar) / 2;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={PAD_T + inner - h}
                width={bar}
                height={h}
                rx={2}
                fill="var(--cn-tinta)"
              />
              <text
                x={x + bar / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-meta)"
              >
                {d.date.slice(8, 10)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="type-meta text-meta">{T.chartSummary(parts)}</figcaption>
    </figure>
  );
}
