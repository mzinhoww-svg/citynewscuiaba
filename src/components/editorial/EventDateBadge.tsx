import { formatDayMonth } from "@/lib/format/date";
import { cx } from "../cx";

export interface EventDateBadgeProps {
  startsAt: string;
  className?: string;
}

/**
 * Plaqueta de data do evento (agenda): dia grande e mês curto, no fuso de Cuiabá.
 *
 * ```tsx
 * <EventDateBadge startsAt={event.startsAt} />
 * ```
 */
export function EventDateBadge({ startsAt, className }: EventDateBadgeProps) {
  const [day = "", month = ""] = formatDayMonth(startsAt).split(" ");
  return (
    <time
      dateTime={startsAt}
      className={cx(
        "flex size-14 shrink-0 flex-col items-center justify-center rounded-xs bg-cerrado-soft text-service",
        className,
      )}
    >
      <span className="text-20 font-black leading-none tabular-nums">{day}</span>
      <span className="type-eyebrow text-service">{month}</span>
    </time>
  );
}
