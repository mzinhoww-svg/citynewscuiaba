import { MONITOR_TEXT as T, PHASE_LABEL } from "@/content/pt-BR/control-monitor";
import { formatDuration, type PhaseSummary } from "@/lib/control/monitor";

export interface PhaseChartProps {
  phases: readonly PhaseSummary[];
}

const ROW = 28;
const LABEL_W = 112;
const BAR_W = 360;

/**
 * Duração por fase em barras horizontais (SVG próprio). O gráfico é decorativo para leitores
 * de tela: o resumo em texto logo abaixo carrega os mesmos números.
 */
export function PhaseChart({ phases }: PhaseChartProps) {
  const max = Math.max(1, ...phases.map((p) => p.durationMs));
  const height = phases.length * ROW;
  const parts = phases
    .map(
      (p) =>
        `${PHASE_LABEL[p.phase]} ${p.events === 0 ? T.run.phaseNone : formatDuration(p.durationMs)}`,
    )
    .join("; ");
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={T.run.phasesChart}
        viewBox={`0 0 ${LABEL_W + BAR_W + 8} ${height}`}
        className="h-auto w-full max-w-2xl"
      >
        {phases.map((p, i) => {
          const w = p.events === 0 ? 0 : Math.max(3, (p.durationMs / max) * BAR_W);
          return (
            <g key={p.phase} transform={`translate(0 ${i * ROW})`}>
              <text
                x={0}
                y={ROW / 2}
                dominantBaseline="middle"
                fontSize={13}
                fill="var(--text-body)"
              >
                {PHASE_LABEL[p.phase]}
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
                width={w}
                height={ROW - 12}
                rx={4}
                fill={p.errors > 0 ? "var(--text-danger)" : "var(--cn-tinta)"}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="type-meta text-meta">{T.run.phasesSummary(parts)}</figcaption>
    </figure>
  );
}
