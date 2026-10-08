import { AGENDA } from "@/content/pt-BR/portal-agenda";
import type { EventView } from "@/lib/db/queries/types";

/**
 * Frases públicas de origem e confirmação do evento (spec da agenda multifonte, §7).
 * Redação, sugestão de leitor e evento sem fonte registrada não têm nota (o rótulo de origem
 * continua o de sempre). Fonte que confirma o próprio evento não se "confirma" a si mesma.
 */
export function originNote(
  e: Pick<EventView, "origin" | "sourceName" | "confirmedByName" | "confirmed">,
): string[] {
  if (e.origin === "newsroom" || e.origin === "reader" || !e.sourceName) return [];
  const from = AGENDA.withInfoFrom(e.sourceName);
  if (e.confirmedByName) return [from, AGENDA.confirmedBy(e.confirmedByName)];
  return e.confirmed ? [from] : [from, AGENDA.confirmAtSource];
}
