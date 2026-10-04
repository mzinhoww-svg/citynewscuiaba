/**
 * Disjuntor da publicação automática (AUT-T4, A8; limites do dono em A-123): 300 por hora, 3.000
 * por dia, pico de denúncias e
 * falha de IA. NÃO é freio editorial: protege contra erro de pipeline. Aberto, pausa a publicação
 * automática (`publish_breaker_trip`: desliga `auto_publish`, manda o resto do ciclo para revisão)
 * e avisa o plantão. Religar `auto_publish`: regra 8 do CLAUDE.md.
 */

export type BreakerReason = "hourly" | "daily" | "reports" | "ai_failures";

export interface BreakerLimits {
  hourly: number;
  daily: number;
  reportsPerHour: number;
  aiFailuresPerHour: number;
}

export const DEFAULT_BREAKER_LIMITS: BreakerLimits = {
  hourly: 300,
  daily: 3000,
  reportsPerHour: 10,
  aiFailuresPerHour: 15,
};

/** Falha de IA só conta se passa de metade das chamadas da hora (um pico isolado não abre). */
export const AI_FAILURE_RATE = 0.5;

export interface BreakerCounts {
  /** Publicações automáticas na última hora (desde o último reset). */
  publishedLastHour: number;
  /** Publicações automáticas no dia civil de Cuiabá (desde o último reset). */
  publishedToday: number;
  reportsLastHour: number;
  aiCallsLastHour: number;
  aiFailuresLastHour: number;
}

export interface BreakerCheck {
  open: boolean;
  reason: BreakerReason | null;
}

/**
 * A próxima publicação passaria do limite? `counts` é o que já foi publicado: com 60 na hora, a
 * 61ª abre o disjuntor. Ordem dos motivos: hora, dia, denúncias, IA.
 */
export function check(
  _now: Date,
  counts: BreakerCounts,
  limits: BreakerLimits = DEFAULT_BREAKER_LIMITS,
): BreakerCheck {
  if (counts.publishedLastHour >= limits.hourly) return { open: true, reason: "hourly" };
  if (counts.publishedToday >= limits.daily) return { open: true, reason: "daily" };
  if (counts.reportsLastHour >= limits.reportsPerHour) return { open: true, reason: "reports" };
  if (
    counts.aiFailuresLastHour >= limits.aiFailuresPerHour &&
    counts.aiCallsLastHour > 0 &&
    counts.aiFailuresLastHour / counts.aiCallsLastHour >= AI_FAILURE_RATE
  )
    return { open: true, reason: "ai_failures" };
  return { open: false, reason: null };
}

export const breaker = { check };

/** Banco do disjuntor (service role): contagens, limites e a abertura. */
export interface BreakerStore {
  counts(now: Date): Promise<{ counts: BreakerCounts; limits: BreakerLimits; tripped: boolean }>;
  /** Abre o disjuntor (idempotente). `true` se esta chamada abriu. */
  trip(reason: BreakerReason, detail: Record<string, unknown>): Promise<boolean>;
}

/** Motivo em português, com o limite em vigor. */
export function breakerText(reason: BreakerReason, limits: BreakerLimits): string {
  switch (reason) {
    case "hourly":
      return `mais de ${limits.hourly} publicações automáticas na hora`;
    case "daily":
      return `mais de ${limits.daily} publicações automáticas no dia`;
    case "reports":
      return `pico de denúncias na última hora (${limits.reportsPerHour} ou mais)`;
    case "ai_failures":
      return "falhas de IA em mais da metade das chamadas da última hora";
  }
}
