/**
 * Allowlist de serviços de push e defesa contra SSRF (spec §13, §14; Review Focus 4 do plano).
 * O servidor faz `POST` no endpoint que o navegador informou: só `https`, porta 443, sem
 * credenciais, host na lista, e DNS sem IP privado (na criação e de novo no envio).
 */
import { isForbiddenAddress, type ResolveHost } from "@/lib/pipeline/net";

export const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "*.push.apple.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "*.notify.windows.com",
] as const;

export const ENDPOINT_MAX = 1024;

export type EndpointProblem = "invalid" | "too_long" | "scheme" | "credentials" | "port" | "host";

function normalizeHost(h: string): string {
  return h.toLowerCase().replace(/\.$/, "");
}

function hostMatches(host: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host.endsWith(`.${base}`) && host.length > base.length + 1;
  }
  return host === pattern;
}

/** `host` ou `host:porta` de teste (G15); porta ausente = qualquer. */
function testHostMatches(url: URL, host: string, testHosts: readonly string[]): boolean {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return testHosts.some((t) => {
    const [h, p] = t.toLowerCase().split(":");
    return h === host && (!p || p === port);
  });
}

export function endpointProblem(
  raw: string,
  testHosts: readonly string[] = [],
): EndpointProblem | null {
  if (typeof raw !== "string" || raw.length === 0) return "invalid";
  if (raw.length > ENDPOINT_MAX) return "too_long";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }
  if (url.username || url.password) return "credentials";
  const host = normalizeHost(url.hostname);
  if (!host) return "invalid";
  if (testHosts.length && testHostMatches(url, host, testHosts)) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return "scheme";
    return null;
  }
  if (url.protocol !== "https:") return "scheme";
  if (url.port && url.port !== "443") return "port";
  if (!PUSH_HOSTS.some((p) => hostMatches(host, p))) return "host";
  return null;
}

/** Hosts extras só em teste; ignorados em produção fora do Playwright (G15). */
export function testHostsFromEnv(env: Record<string, string | undefined>): string[] {
  const raw = env.PUSH_ENDPOINT_TEST_HOSTS?.trim();
  if (!raw) return [];
  // Em produção da Vercel nunca vale, nem com CN_E2E (reabriria o SSRF, PWA-16); o Playwright
  // local (next start, NODE_ENV=production) precisa de CN_E2E=1.
  if (env.VERCEL_ENV === "production") return [];
  if (env.NODE_ENV === "production" && env.CN_E2E !== "1") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9.-]+(:\d{1,5})?$/.test(s));
}

/** O host resolve só para endereços públicos? Falha de DNS ou IP privado → `false`. */
export async function endpointResolvesSafely(
  url: URL,
  resolve: ResolveHost,
  testHosts: readonly string[] = [],
): Promise<boolean> {
  const host = normalizeHost(url.hostname);
  if (testHosts.length && testHostMatches(url, host, testHosts)) return true;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return !addresses.some(isForbiddenAddress);
}

export function endpointHost(raw: string): string | null {
  try {
    return normalizeHost(new URL(raw).hostname) || null;
  } catch {
    return null;
  }
}
