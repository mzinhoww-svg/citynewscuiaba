import "server-only";

/**
 * Chaves VAPID (spec 2026-09-28 §14, §17, D-P25). A privada só existe aqui; nunca em log,
 * teste ou fixture. Sem as três variáveis o push degrada: o portal não oferece avisos e A09
 * lista só os nomes do que falta.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export const VAPID_VARS = [
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

type Env = Record<string, string | undefined>;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function valid(env: Env): env is Env & Record<(typeof VAPID_VARS)[number], string> {
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const priv = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  return (
    BASE64URL.test(pub) &&
    pub.length >= 80 &&
    BASE64URL.test(priv) &&
    priv.length >= 40 &&
    /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)
  );
}

/** Nomes das variáveis ausentes ou inválidas (só nomes, nunca valores). */
export function missingVapidVars(env: Env = process.env): string[] {
  const out: string[] = [];
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()) out.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!env.VAPID_PRIVATE_KEY?.trim()) out.push("VAPID_PRIVATE_KEY");
  if (!env.VAPID_SUBJECT?.trim()) out.push("VAPID_SUBJECT");
  if (out.length === 0 && !valid(env)) return [...VAPID_VARS];
  return out;
}

export function vapidConfig(env: Env = process.env): VapidConfig | null {
  if (!valid(env)) return null;
  return {
    publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
    privateKey: env.VAPID_PRIVATE_KEY.trim(),
    subject: env.VAPID_SUBJECT.trim(),
  };
}

/** Push disponível no servidor: chaves válidas, ou provedor falso (unit, CI, e2e sem chave). */
export function pushEnabled(env: Env = process.env): boolean {
  return env.PUSH_PROVIDER === "fake" || vapidConfig(env) !== null;
}
