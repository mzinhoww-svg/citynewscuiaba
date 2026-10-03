import { AGENDA } from "@/content/pt-BR/portal-agenda";
import type { RecurringDate } from "@/lib/agenda/recurring";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface RecurringDatesProps {
  items: readonly (RecurringDate & { next: Date })[];
  /** Nível do título (a seção que contém decide). */
  headingLevel?: 2 | 3;
  /** Mostra a frase de apresentação. */
  intro?: boolean;
  id: string;
  className?: string;
}

/**
 * "Datas e eventos recorrentes de Cuiabá": lista de datas fixas do calendário da cidade, cada
 * uma com o link da fonte que a confirma. Usada quando há poucos eventos próximos, para a Agenda
 * nunca ficar vazia. Só recebe datas verificáveis (`src/lib/agenda/recurring.ts`).
 */
export function RecurringDates({
  items,
  headingLevel = 3,
  intro = true,
  id,
  className,
}: RecurringDatesProps) {
  if (items.length === 0) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={cx("flex min-w-0 flex-col gap-3", className)}>
      <Heading id={id} className="type-section text-strong">
        {AGENDA.recurring.title}
      </Heading>
      {intro && <p className="type-meta text-meta">{AGENDA.recurring.intro}</p>}
      <ul className="flex flex-col">
        {items.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-0.5 border-t border-line-subtle py-3 first:border-t-0"
          >
            <p className="type-headline-sm text-strong">{r.title}</p>
            <p className="type-meta text-meta first-letter:uppercase">
              {AGENDA.recurring.whenWhere(r.when, r.place)}
            </p>
            <a
              href={r.source}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${AGENDA.recurring.sourceAria(r.title, r.sourceName)} (${AGENDA.newTab})`}
              className="inline-flex min-h-6 items-center gap-1.5 self-start type-meta font-semibold text-link underline underline-offset-4"
            >
              {AGENDA.recurring.sourceLabel(r.sourceName)}
              <Icon name="external-link" size={14} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
