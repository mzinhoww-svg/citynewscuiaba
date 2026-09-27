/**
 * Limites da busca com IA (spec §5.5; architecture §7): 20 perguntas por hora sem conta e 60 com
 * conta, em janela fixa de 1 h no banco (`hit_rate_limit`, 0003_rate_limits).
 */
export const ASK_LIMITS = { anon: 20, account: 60 } as const;
export const ASK_WINDOW_SECONDS = 3600;

export type AskAudience = keyof typeof ASK_LIMITS;

export function askBucket(audience: AskAudience): string {
  return audience === "account" ? "ask_account" : "ask_anon";
}

/** Início da próxima janela (hora cheia em UTC, como `hit_rate_limit`): quando o limite libera. */
export function askRetryAt(now: Date, windowSeconds = ASK_WINDOW_SECONDS): string {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms + ms).toISOString();
}
