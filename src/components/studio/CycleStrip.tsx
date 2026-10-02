import Link from "next/link";
import { CONTROL_TEXT, RUN_STATE_LABEL } from "@/content/pt-BR/control";
import type { RunState } from "@/lib/control";
import { formatDateTime, formatHour } from "@/lib/format/date";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface CycleStripItem {
  id: string;
  startedAt: string;
  state: RunState;
  manual: boolean;
  events: number;
  failed: number;
}

export interface CycleStripProps {
  label: string;
  runs: CycleStripItem[];
  className?: string;
}

const STATE_ICON: Record<RunState, IconName> = {
  running: "refresh-cw",
  partial: "triangle-alert",
  ok: "check",
  empty: "circle-help",
  failed: "circle-alert",
};

const STATE_INK: Record<RunState, string> = {
  running: "text-link",
  partial: "text-warn",
  ok: "text-service",
  empty: "text-meta",
  failed: "text-danger",
};

/**
 * Faixa dos ciclos recentes (O01): um link por ciclo, com hora, situação em texto e ícone e
 * quantidade de eventos. Situação nunca depende só de cor.
 */
export function CycleStrip({ label, runs, className }: CycleStripProps) {
  const T = CONTROL_TEXT.cycle;
  return (
    <nav aria-label={label} className={className}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {runs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/estudio/control/execucoes/${r.id}`}
              aria-label={T.link(formatDateTime(r.startedAt), RUN_STATE_LABEL[r.state])}
              className="flex h-full min-h-tap flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-3 no-underline hover:border-line-control"
            >
              <span className="type-body font-semibold tabular-nums text-strong">
                {formatHour(r.startedAt)}
                {r.manual && <span className="ml-1 type-meta text-meta">· {T.manual}</span>}
              </span>
              <span className={cx("inline-flex items-center gap-1 type-meta", STATE_INK[r.state])}>
                <Icon name={STATE_ICON[r.state]} size={14} />
                {RUN_STATE_LABEL[r.state]}
              </span>
              <span className="type-meta text-meta">{T.events(r.events)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
