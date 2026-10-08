/**
 * Validação dos segredos do servidor (C4-02, C4-03). Pura, sem `node:*`: roda no `register()` de
 * `src/instrumentation.ts` e em `isCronAuthorized`.
 */

/** Tamanho mínimo do `CRON_SECRET` (32 caracteres aleatórios, `.env.example`). */
export const CRON_SECRET_MIN = 32;

export type CronSecretProblem = "missing" | "placeholder" | "short";

/** Problema do segredo de cron, ou `null` quando serve. O placeholder do `.env.example` nunca serve. */
export function cronSecretProblem(secret: string | undefined): CronSecretProblem | null {
  const s = secret?.trim() ?? "";
  if (!s) return "missing";
  if (/substituir/i.test(s)) return "placeholder";
  if (s.length < CRON_SECRET_MIN) return "short";
  return null;
}

type Env = Partial<
  Record<"NODE_ENV" | "CRON_SECRET" | "NEWSLETTER_TOKEN_SECRET" | "RATE_LIMIT_SALT", string>
>;

const CRON_TEXT: Record<CronSecretProblem, string> = {
  missing: "CRON_SECRET ausente: as rotas de cron e worker recusam tudo.",
  placeholder:
    "CRON_SECRET é o valor de exemplo do .env.example: as rotas de cron e worker recusam tudo.",
  short: `CRON_SECRET com menos de ${CRON_SECRET_MIN} caracteres: as rotas de cron e worker recusam tudo.`,
};

/**
 * Avisos de configuração em produção (log da inicialização). Segredo de cron fraco já é recusado
 * por `isCronAuthorized`; os derivados (newsletter, sal do limite de envios) ainda caem no
 * `CRON_SECRET` quando faltam, e um vazamento dele valeria pelos três.
 */
export function serverEnvWarnings(env: Env = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const out: string[] = [];
  const cron = cronSecretProblem(env.CRON_SECRET);
  if (cron) out.push(CRON_TEXT[cron]);
  if (!env.NEWSLETTER_TOKEN_SECRET?.trim())
    out.push("NEWSLETTER_TOKEN_SECRET ausente: os links da newsletter usam o CRON_SECRET.");
  if (!env.RATE_LIMIT_SALT?.trim())
    out.push("RATE_LIMIT_SALT ausente: o hash de IP do limite de envios usa o CRON_SECRET.");
  return out;
}
