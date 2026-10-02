/**
 * Novas tentativas da spec §6.2: espera de 1, 4 e 10 min entre tentativas; depois, quarentena.
 * São 4 tentativas no total (a original e 3 novas).
 */
export const RETRY_DELAYS_SEC = [60, 240, 600] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length + 1;

export type RetryDecision = { action: "retry"; delaySec: number } | { action: "quarantine" };

/** `readCt` = tentativas já feitas, contando a que acabou de falhar. */
export function retryPolicy(readCt: number, opts: { retryable?: boolean } = {}): RetryDecision {
  if (opts.retryable === false) return { action: "quarantine" };
  const delay = RETRY_DELAYS_SEC[Math.max(1, Math.floor(readCt)) - 1];
  return delay === undefined ? { action: "quarantine" } : { action: "retry", delaySec: delay };
}
