import { CONTROL_TEXT, PHASE_LABEL, formatMin } from "@/content/pt-BR/control";
import type { PhaseSpan } from "@/lib/control";
import { cx } from "../cx";

export interface PhaseChartProps {
  label: string;
  phases: PhaseSpan[];
  className?: string;
}

/**
 * Gráfico de fases de um ciclo (O07): uma barra por fase, do início ao último evento, em
 * minutos desde o início do ciclo. SVG próprio por linha (rótulos em HTML, sem distorção) e
 * resumo textual visível de cada fase (DESIGN.md §9). Fase com falha usa Atenção e o texto diz
 * quantas falharam.
 */
export function PhaseChart({ label, phases, className }: PhaseChartProps) {
  const T = CONTROL_TEXT.run;
  const total = Math.max(1, ...phases.map((p) => p.startMin + p.durationMin));
  const pct = (m: number) => (m / total) * 100;
  return (
    <figure className={cx("flex flex-col gap-3", className)}>
      <div role="img" aria-label={label} className="flex flex-col gap-2">
        {phases.map((p) => (
          <div key={p.phase} className="grid grid-cols-[8rem_1fr] items-center gap-3">
            <span aria-hidden="true" className="type-meta font-semibold text-strong">
              {PHASE_LABEL[p.phase]}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 100 10"
              preserveAspectRatio="none"
              className="h-6 w-full rounded-xs bg-section"
            >
              <rect
                x={Math.min(99, pct(p.startMin))}
                y={0}
                width={Math.max(1, pct(p.durationMin))}
                height={10}
                className={p.failed > 0 ? "fill-warn" : "fill-cerrado"}
              />
            </svg>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="grid grid-cols-[8rem_1fr] gap-3 type-meta tabular-nums text-meta"
        >
          <span />
          <span className="flex justify-between">
            <span>0 min</span>
            <span>{formatMin(Math.round(total * 10) / 10)}</span>
          </span>
        </div>
      </div>
      <figcaption>
        <p className="sr-only">
          {label} · {CONTROL_TEXT.chartSummary}
        </p>
        <ul className="flex flex-col gap-1 type-meta text-body">
          {phases.map((p) => (
            <li key={p.phase}>
              {T.phaseLine(
                PHASE_LABEL[p.phase],
                formatMin(p.startMin),
                formatMin(p.durationMin),
                p.ok,
                p.failed,
              )}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
