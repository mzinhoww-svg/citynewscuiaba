/** Janela de 30 min do ciclo (UTC): arredonda para baixo em :00 ou :30. */
export const WINDOW_MINUTES = 30;

export function windowStart(now: Date): Date {
  const size = WINDOW_MINUTES * 60_000;
  return new Date(Math.floor(now.getTime() / size) * size);
}

/** Janela de 10 min da via rápida (UTC): arredonda para baixo em :00, :10, :20... */
export const FAST_WINDOW_MINUTES = 10;

export function fastWindowStart(now: Date): Date {
  const size = FAST_WINDOW_MINUTES * 60_000;
  return new Date(Math.floor(now.getTime() / size) * size);
}
