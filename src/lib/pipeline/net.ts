/**
 * Acesso de rede do robô (SSRF): toda URL, inclusive cada salto de redirecionamento, passa por
 * esquema, nome de host, resolução de DNS (todos os endereços) e faixa de IP antes do pedido. O
 * corpo é lido em streaming e cortado no limite, com ou sem `content-length`.
 *
 * Limite conhecido: o `fetch` do Node resolve o nome de novo ao conectar. Um DNS que troca de
 * resposta entre a checagem e a conexão (rebinding) ainda teria uma janela curta; a checagem
 * por salto e o `redirect: "manual"` fecham os caminhos comuns (redirecionamento para rede
 * interna, nome que resolve para IP privado, formas numéricas alternativas).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { HttpFetch } from "./ports";

/** Todos os endereços (IPv4 e IPv6) de um nome. Injetável: testes nunca usam DNS real. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

export const systemResolve: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

export const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// Faixas proibidas
// ---------------------------------------------------------------------------
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function inV4Block(n: number, base: string, bits: number): boolean {
  const b = v4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return Math.floor(n / size) === Math.floor(b / size);
}

function isForbiddenV4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKS.some(([base, bits]) => inV4Block(n, base, bits));
}

/** IPv6 em 8 grupos de 16 bits (aceita `::` e IPv4 no fim); `null` se inválido. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    if (n === null) return null;
    s = `${s.slice(0, -tail[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h ? h.split(":") : []);
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every(Number.isFinite) ? groups : null;
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isForbiddenV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // ::/96 (inclui :: e ::1 e o IPv4 compatível) e ::ffff:0:0/96 (IPv4 mapeado).
  if (zeros(0, 6)) return true;
  if (zeros(0, 5) && g[5] === 0xffff) return true;
  // fc00::/7 (única local), fe80::/10 (enlace), ff00::/8 (multicast).
  if ((g[0]! & 0xfe00) === 0xfc00) return true;
  if ((g[0]! & 0xffc0) === 0xfe80) return true;
  if ((g[0]! & 0xff00) === 0xff00) return true;
  // NAT64 (64:ff9b::/96) e 6to4 (2002::/16) carregam um IPv4: vale a regra do IPv4.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isForbiddenV4(v4Of(g[6]!, g[7]!));
  if (g[0] === 0x2002) return isForbiddenV4(v4Of(g[1]!, g[2]!));
  return false;
}

/** Endereço IP (v4 ou v6) em faixa privada, reservada, de loopback, enlace ou multicast. */
export function isForbiddenAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const v = isIP(bare.split("%")[0] ?? "");
  if (v === 4) return isForbiddenV4(bare);
  if (v === 6) return isForbiddenV6(bare);
  return true;
}

/**
 * Host que o robô nunca acessa, antes do DNS: nomes internos e IP literal proibido. O parser de
 * URL já normaliza formas numéricas alternativas (`2130706433`, `0x7f.1`, `127.1`).
 */
export function isForbiddenHost(hostname: string): boolean {
  const h = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!h) return true;
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".home.arpa")
  )
    return true;
  if (isIP(h.split("%")[0] ?? "") !== 0) return isForbiddenAddress(h);
  // Número puro ou hexadecimal que o parser não normalizou: nunca é nome de site.
  return /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/.test(h);
}

/** Motivo para não acessar a URL (esquema, host, DNS), ou `null` se pode seguir. */
export async function urlProblem(url: URL, resolve: ResolveHost): Promise<string | null> {
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return `esquema não permitido: ${url.protocol}`;
  if (url.username || url.password) return "URL com credenciais não é permitida";
  const host = url.hostname;
  if (isForbiddenHost(host)) return `host não permitido: ${host}`;
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) return null;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch (e) {
    return `DNS falhou para ${host}: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (addresses.length === 0) return `DNS sem endereço para ${host}`;
  const bad = addresses.find(isForbiddenAddress);
  return bad ? `host ${host} resolve para endereço não permitido (${bad})` : null;
}

// ---------------------------------------------------------------------------
// GET seguro
// ---------------------------------------------------------------------------
export interface SafeGetDeps {
  http: HttpFetch;
  resolve: ResolveHost;
}

export interface SafeGetOptions {
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
  maxRedirects?: number;
  /** Regra extra por salto (ex.: imagem só do domínio da fonte). Motivo ou `null`. */
  allowUrl?: (url: URL) => string | null;
}

export type SafeGetResult =
  | { kind: "ok"; url: string; status: number; headers: Headers; body: Uint8Array }
  /** Resposta fora de 2xx (inclusive 304), sem corpo lido. */
  | { kind: "status"; url: string; status: number; headers: Headers }
  | { kind: "blocked"; reason: string }
  | { kind: "network_error"; message: string }
  | { kind: "too_large" };

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/** Lê o corpo em streaming e aborta ao passar de `max` bytes. `null` = passou do limite. */
export async function readLimited(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * GET com `redirect: "manual"`: segue até `maxRedirects` saltos, revalidando cada URL (esquema,
 * host, DNS e `allowUrl`). Corpo lido em streaming até `maxBytes`.
 */
export async function safeGet(
  deps: SafeGetDeps,
  url: string,
  opts: SafeGetOptions,
): Promise<SafeGetResult> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { kind: "blocked", reason: `URL inválida: ${url}` };
  }
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  // O primeiro pedido usa a URL como veio (o parser só normaliza para validar).
  let target = url;
  for (let hop = 0; ; hop++) {
    const problem = (await urlProblem(current, deps.resolve)) ?? opts.allowUrl?.(current) ?? null;
    if (problem) return { kind: "blocked", reason: problem };
    let res: Response;
    try {
      res = await deps.http(target, {
        headers: opts.headers,
        signal: opts.signal,
        redirect: "manual",
      });
    } catch (e) {
      return { kind: "network_error", message: message(e) };
    }
    if (REDIRECT.has(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      const location = res.headers.get("location");
      if (!location)
        return {
          kind: "status",
          url: target,
          status: res.status,
          headers: res.headers,
        };
      if (hop >= maxRedirects)
        return { kind: "blocked", reason: `mais de ${maxRedirects} redirecionamentos` };
      try {
        current = new URL(location, current);
        target = current.toString();
      } catch {
        return { kind: "blocked", reason: `redirecionamento inválido: ${location}` };
      }
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: "status", url: target, status: res.status, headers: res.headers };
    }
    let body: Uint8Array | null;
    try {
      body = await readLimited(res, opts.maxBytes);
    } catch (e) {
      return { kind: "network_error", message: message(e) };
    }
    if (!body) return { kind: "too_large" };
    return { kind: "ok", url: target, status: res.status, headers: res.headers, body };
  }
}

/** Prazo de uma chamada: o menor entre o tempo próprio e o sinal de prazo recebido. */
export function deadlineSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const own = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([own, signal]) : own;
}
