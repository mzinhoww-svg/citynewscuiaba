import { MONITOR_TEXT as T, PHASE_LABEL, STEP_LABEL } from "@/content/pt-BR/control-monitor";
import { PHASES, phaseOf, type StepCount } from "@/lib/control/monitor";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface CycleStripProps {
  steps: readonly StepCount[];
  /** Título acima da faixa (padrão: "Ciclo de 30 minutos"). */
  title?: string;
  headingLevel?: "h2" | "h3";
  className?: string;
}

/**
 * As 20 etapas do ciclo agrupadas nas cinco fases, com o que aconteceu em cada uma no ciclo
 * mais recente: eventos ok, avisos, falhas e mensagens na fila. O estado vem em texto e ícone
 * (falha e fila têm ícone próprio), nunca só em cor. Sem estado: serve de servidor e de cliente.
 */
export function CycleStrip({
  steps,
  title = T.cycle.title,
  headingLevel = "h2",
  className,
}: CycleStripProps) {
  const Heading = headingLevel;
  const ok = steps.reduce((n, s) => n + s.ok, 0);
  const err = steps.reduce((n, s) => n + s.errors, 0);
  const pending = steps.reduce((n, s) => n + s.pending, 0);
  return (
    <section aria-label={T.cycle.caption} className={cx("flex flex-col gap-3", className)}>
      <Heading className="type-section text-strong">{title}</Heading>
      <p className="type-meta text-meta">{T.cycle.summary(ok, err, pending)}</p>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {PHASES.map((phase) => {
          const own = steps.filter((s) => phaseOf(s.step) === phase);
          return (
            <li key={phase} className="rounded-lg border border-line-subtle bg-card-white p-3">
              <p className="mb-2 type-eyebrow text-eyebrow uppercase">{PHASE_LABEL[phase]}</p>
              <ul className="flex flex-col gap-2">
                {own.map((s) => {
                  const idle = s.ok + s.warn + s.errors + s.pending === 0;
                  return (
                    <li key={s.step} data-step={s.step} className="flex flex-col gap-1">
                      <span className="type-label text-strong">{STEP_LABEL[s.step]}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-meta">
                        {idle ? (
                          <span>{T.cycle.stepIdle}</span>
                        ) : (
                          <>
                            {s.ok > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="check" size={14} />
                                {T.cycle.stepOk(s.ok)}
                              </span>
                            )}
                            {s.warn > 0 && (
                              <span className="inline-flex items-center gap-1 text-warn">
                                <Icon name="triangle-alert" size={14} />
                                {T.cycle.stepWarn(s.warn)}
                              </span>
                            )}
                            {s.errors > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-danger">
                                <Icon name="circle-alert" size={14} />
                                {T.cycle.stepErr(s.errors)}
                              </span>
                            )}
                            {s.pending > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="clock" size={14} />
                                {T.cycle.stepPending(s.pending)}
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
