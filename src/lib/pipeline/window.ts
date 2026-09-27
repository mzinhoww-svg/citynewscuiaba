/** Janela de 30 min do ciclo (UTC): arredonda para baixo em :00 ou :30. */
export const WINDOW_MINUTES = 30;

export function windowStart(now: Date): Date {
  const size = WINDOW_MINUTES * 60_000;
  return new Date(Math.floor(now.getTime() / size) * size);
}
