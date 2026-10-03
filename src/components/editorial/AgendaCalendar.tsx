import Link from "next/link";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface CalendarDay {
  /** AAAA-MM-DD */
  key: string;
  count: number;
  /** Lista do dia com os mesmos filtros. */
  href: string;
  /** "sábado, 3 de outubro" para o nome acessível. */
  label: string;
}

export interface AgendaCalendarProps {
  /** AAAA-MM */
  month: string;
  /** "outubro de 2026" */
  title: string;
  days: CalendarDay[];
  prevHref: string;
  nextHref: string;
  /** Hoje (AAAA-MM-DD), destacado com borda. */
  today?: string;
  /** Mini-calendário lateral (desktop): células baixas, só a contagem em número. */
  compact?: boolean;
  /** Nome da região (padrão: o título do mês). */
  label?: string;
  className?: string;
}

/**
 * Calendário mensal da agenda (P09): contagem de eventos por dia, cada dia com evento leva à
 * lista daquele dia mantendo os filtros. Tabela com cabeçalhos de coluna e nomes completos.
 *
 * ```tsx
 * <AgendaCalendar month="2026-10" title="outubro de 2026" days={days} prevHref="…" nextHref="…" />
 * ```
 */
export function AgendaCalendar({
  month,
  title,
  days,
  prevHref,
  nextHref,
  today,
  compact = false,
  label,
  className,
}: AgendaCalendarProps) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  const total = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const byKey = new Map(days.map((d) => [d.key, d]));
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const navClass =
    "inline-flex size-tap items-center justify-center rounded-pill border border-line-control bg-card-white text-strong hover:bg-section";

  return (
    <section
      aria-labelledby={compact ? undefined : "calendario-titulo"}
      aria-label={compact ? label : undefined}
      className={cx("flex flex-col", compact ? "gap-2" : "gap-4", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <Link href={prevHref} aria-label={AGENDA.prevMonth} className={navClass}>
          <Icon name="chevron-left" size={20} />
        </Link>
        <h2
          id={compact ? undefined : "calendario-titulo"}
          className={cx(
            "text-strong first-letter:uppercase",
            compact ? "type-label text-16" : "type-section",
          )}
        >
          {title}
        </h2>
        <Link href={nextHref} aria-label={AGENDA.nextMonth} className={navClass}>
          <Icon name="chevron-right" size={20} />
        </Link>
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {AGENDA.weekdays.map((d, i) => (
              <th
                key={d}
                scope="col"
                abbr={AGENDA.weekdaysLong[i]}
                className="pb-2 text-center type-meta text-meta"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, i) => {
                if (day === null) return <td key={i} className="border border-line-subtle" />;
                const key = `${month}-${String(day).padStart(2, "0")}`;
                const info = byKey.get(key);
                return (
                  <td
                    key={i}
                    className={cx(
                      compact
                        ? "h-11 border border-line-subtle p-0 align-top"
                        : "h-16 border border-line-subtle p-0 align-top sm:h-20",
                      info ? "bg-cerrado-soft" : "bg-card-white",
                    )}
                  >
                    {info ? (
                      <Link
                        href={info.href}
                        aria-label={AGENDA.dayLink(info.label, info.count)}
                        className={cx(
                          "flex h-full min-h-tap flex-col justify-between p-1.5 text-strong no-underline hover:bg-card-white sm:p-2",
                          key === today && "outline-2 -outline-offset-2 outline-line-strong",
                        )}
                      >
                        <span className="text-14 font-bold tabular-nums">{day}</span>
                        <span className="text-12 font-semibold text-service tabular-nums">
                          <span className={compact ? undefined : "sm:hidden"}>{info.count}</span>
                          {!compact && (
                            <span className="hidden sm:inline">{AGENDA.dayEvents(info.count)}</span>
                          )}
                        </span>
                      </Link>
                    ) : (
                      <span
                        className={cx(
                          "flex h-full flex-col p-1.5 text-14 tabular-nums text-meta sm:p-2",
                          key === today && "outline-2 -outline-offset-2 outline-line-strong",
                        )}
                      >
                        {day}
                        <span className="sr-only">, {AGENDA.noEventsDay}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
