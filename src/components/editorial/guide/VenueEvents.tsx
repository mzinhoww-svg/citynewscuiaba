import { GUIDE } from "@/content/pt-BR/guide";
import type { EventView } from "@/lib/db/queries/types";
import { EventCard } from "../EventCard";

export interface VenueEventsProps {
  /** Próximos eventos do lugar (até 5, já no ar e em ordem de início). */
  events: readonly EventView[];
}

/**
 * "Próximos eventos aqui" na página do lugar do Guia (ARD-T3): os eventos da Agenda ligados ao
 * lugar, no mesmo card da agenda (link para `/agenda/[slug]`). Sem eventos, a seção não aparece.
 *
 * ```tsx
 * <VenueEvents events={events} />
 * ```
 */
export function VenueEvents({ events }: VenueEventsProps) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="eventos-do-lugar" className="flex flex-col gap-2">
      <h2 id="eventos-do-lugar" className="type-section text-strong">
        {GUIDE.venue.upcomingEvents}
      </h2>
      <ul className="flex flex-col">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}
