import { durationLabel, FREQUENCY_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";

export interface FrequencyLabelProps {
  /** Frequência escolhida; `null` segue o padrão global. */
  chosen: number | null;
  /** Frequência efetiva (Crawl-delay e termos podem elevar a escolhida ou o padrão). */
  effective: number;
  raisedBy: "robots" | "terms" | null;
  /** Próxima coleta prevista (ISO); `null` se a fonte não coleta. Só aparece com `showNext`. */
  nextAt?: string | null;
  showNext?: boolean;
  className?: string;
}

const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Cuiaba",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Rótulo curto da frequência: "30 min · padrão", "10 min · via rápida", "20 min · via rápida (robots)". */
export function frequencyText(
  p: Pick<FrequencyLabelProps, "chosen" | "effective" | "raisedBy">,
): string {
  if (p.effective < 30) return T.fast(p.effective, p.raisedBy);
  if (p.raisedBy) return T.raised(p.effective, p.raisedBy);
  return p.chosen === null ? T.default(p.effective) : T.chosen(p.effective);
}

/**
 * Frequência de coleta de uma fonte. Mostra a efetiva e quem a elevou (`raisedBy`, A-115); com
 * `showNext` acrescenta a próxima coleta prevista ("Próxima coleta 16:00", horário de Cuiabá).
 */
export function FrequencyLabel({
  chosen,
  effective,
  raisedBy,
  nextAt,
  showNext = false,
  className,
}: FrequencyLabelProps) {
  const base = frequencyText({ chosen, effective, raisedBy });
  const d = nextAt ? new Date(nextAt) : null;
  const next =
    showNext && (d === null || Number.isNaN(d.getTime()))
      ? T.noNext
      : showNext && d
        ? T.next(clock.format(d))
        : null;
  const why = raisedBy ? (raisedBy === "robots" ? T.raisedByRobots : T.raisedByTerms) : null;
  return (
    <span
      className={cx("inline-flex flex-col type-meta text-strong", className)}
      title={why ?? undefined}
    >
      <span>{base}</span>
      {why && <span className="text-meta">{why}</span>}
      {next && <span className="text-meta">{next}</span>}
    </span>
  );
}

export { durationLabel };
