import { PUBLISH_TEXT as T } from "@/content/pt-BR/studio";
import { zoneOffsetMinutes } from "@/lib/format/date";
import { err, ok, type Result } from "@/lib/result";

export const DESTINATIONS = ["home", "section", "topic", "newsletter"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export type When = "now" | { at: string };

export interface PublicationPlan {
  status: "published" | "scheduled";
  publishMode: "human";
  publishedAt: string | null;
  scheduledFor: string | null;
  destinations: Destination[];
}

const MAX_AHEAD_DAYS = 90;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Data e hora do formulário (fuso de Cuiabá). "2026-10-03T20:00" (datetime-local, sem fuso) é
 * lida como horário de Cuiabá; com fuso ou Z, vale o instante informado. Inválida = null.
 */
export function parseCuiabaDateTime(s: string): Date | null {
  const m = LOCAL.exec(s.trim());
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    const asUtc = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se ?? 0),
    );
    // Deslocamento de Cuiabá naquele dia (−240 min hoje; sem supor que não mude).
    const offset = zoneOffsetMinutes(new Date(asUtc + 4 * 3_600_000));
    return new Date(asUtc - offset * 60_000);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Plano de publicação (E06), função pura: agora = publicada com data de agora; agendada =
 * horário futuro de Cuiabá em UTC (até 90 dias). Modo sempre humano (publicação pelo Estúdio).
 * Destinos sem repetição, na ordem canônica.
 */
export function planPublication(
  input: { when: When; destinations: readonly string[] },
  now: Date,
): Result<PublicationPlan, string> {
  const destinations = DESTINATIONS.filter((d) => input.destinations.includes(d));
  if (input.when === "now") {
    return ok({
      status: "published",
      publishMode: "human",
      publishedAt: now.toISOString(),
      scheduledFor: null,
      destinations,
    });
  }
  const at = parseCuiabaDateTime(input.when.at);
  if (!at) return err(T.invalidDate);
  if (at.getTime() <= now.getTime()) return err(T.pastDate);
  if (at.getTime() - now.getTime() > MAX_AHEAD_DAYS * 86_400_000) return err(T.tooFar);
  return ok({
    status: "scheduled",
    publishMode: "human",
    publishedAt: null,
    scheduledFor: at.toISOString(),
    destinations,
  });
}
