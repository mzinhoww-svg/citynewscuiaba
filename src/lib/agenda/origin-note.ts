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

/**
 * Data para "Informações confirmadas pela organização em …", ou `null` quando a frase não vale.
 * Evento com fonte registrada já tem a nota de origem (que pode pedir "Confirme na fonte") e
 * o coletor marca `confirmed_at` em todo evento gravado: afirmar a organização ali seria falso.
 * Redação nunca afirma confirmação da organização. Fica só para linhas antigas sem fonte.
 */
export function organizerConfirmedDate(
  e: Pick<EventView, "origin" | "sourceName" | "confirmedAt">,
): string | null {
  if (e.origin === "newsroom" || e.sourceName || !e.confirmedAt) return null;
  return e.confirmedAt;
}
