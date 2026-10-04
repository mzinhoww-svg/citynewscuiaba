/*
 * Janelas do destaque automático (R28 do dono, que substitui as 3 h fixas da spec de destaques):
 * o automático dura 1 h; uma matéria muito relevante segura a posição por 3 h. As duas janelas
 * começam nas horas cheias (1 h) e nos múltiplos de 3 h a partir das 00h do fuso America/Cuiaba
 * (UTC-4, sem horário de verão).
 */
export const FEATURED_TZ = "America/Cuiaba";
export type WindowHours = 1 | 3;

const HOUR_MS = 3_600_000;

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: FEATURED_TZ,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Hora, minuto e segundo locais de Cuiabá. */
function localClock(now: Date): { h: number; m: number; s: number } {
  const all = clock.formatToParts(now);
  const get = (type: string): number => Number(all.find((p) => p.type === type)?.value ?? 0);
  return { h: get("hour") % 24, m: get("minute"), s: get("second") };
}

/** Início da janela (em Cuiabá) que contém `now`: o mesmo para qualquer instante dentro dela. */
export function windowStart(now: Date, hours: WindowHours = 1): Date {
  const { h, m, s } = localClock(now);
  const sinceStart = (h % hours) * HOUR_MS + m * 60_000 + s * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() - sinceStart);
}

/** Fim (exclusivo) da janela que contém `now`. */
export function windowEnd(now: Date, hours: WindowHours = 1): Date {
  return new Date(windowStart(now, hours).getTime() + hours * HOUR_MS);
}
