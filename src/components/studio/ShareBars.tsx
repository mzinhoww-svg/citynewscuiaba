import { formatPercent } from "@/lib/format/number";

export interface ShareBarsItem {
  key: string;
  label: string;
  share: number;
}

export interface ShareBarsProps {
  items: readonly ShareBarsItem[];
  /** Nome acessível do gráfico. */
  label: string;
  /** Resumo em texto dos mesmos números (o gráfico é complementar; a tabela ao lado é a fonte). */
  summary: string;
}

const ROW = 28;
const LABEL_W = 160;
const BAR_W = 320;

/** Participação por fonte em barras horizontais (SVG próprio), com resumo textual. */
export function ShareBars({ items, label, summary }: ShareBarsProps) {
  const max = Math.max(0.0001, ...items.map((i) => i.share));
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${LABEL_W + BAR_W + 56} ${Math.max(1, items.length) * ROW}`}
        className="h-auto w-full max-w-2xl"
      >
        {items.map((it, i) => (
          <g key={it.key} transform={`translate(0 ${i * ROW})`}>
            <text x={0} y={ROW / 2} dominantBaseline="middle" fontSize={13} fill="var(--text-body)">
              {it.label.length > 24 ? `${it.label.slice(0, 23)}…` : it.label}
            </text>
            <rect
              x={LABEL_W}
              y={6}
              width={BAR_W}
              height={ROW - 12}
              rx={4}
              fill="var(--bg-section)"
            />
            <rect
              x={LABEL_W}
              y={6}
              width={Math.max(2, (it.share / max) * BAR_W)}
              height={ROW - 12}
              rx={4}
              fill="var(--cn-tinta)"
            />
            <text
              x={LABEL_W + BAR_W + 8}
              y={ROW / 2}
              dominantBaseline="middle"
              fontSize={13}
              fill="var(--text-body)"
            >
              {formatPercent(it.share)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="type-meta text-meta">{summary}</figcaption>
    </figure>
  );
}
