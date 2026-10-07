/**
 * Resposta 410 da matéria arquivada ou despublicada (P25, Review Focus 2). O App Router não
 * define status de página além de 404, então o proxy consulta `public_article_gone` e marca a
 * resposta com 410; a página mostra o motivo. Resultado guardado em memória por slug.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MATERIA = /^\/materia\/([^/]+)\/?$/;

/** Slug da página da matéria (não do histórico); null para qualquer outra rota. */
export function goneSlugFromPath(pathname: string): string | null {
  const m = MATERIA.exec(pathname);
  const slug = m?.[1];
  return slug && slug.length <= 200 && SLUG.test(slug) ? slug : null;
}

export type GoneLookup = (slug: string) => Promise<string | null>;

interface Options {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/** Resultado de uma checagem feita: `reason` é o motivo da retirada, ou `null` se está no ar. */
export interface GoneHint {
  reason: string | null;
}

/**
 * Checagem com cache em memória por slug. Devolve `null` quando a consulta falhou (não checado):
 * banco fora, a página decide (motivo ou erro); nunca derrubar a leitura por isso.
 */
export function createGoneResolver(
  lookup: GoneLookup,
  { ttlMs = 60_000, maxEntries = 500, now = Date.now }: Options = {},
): (slug: string) => Promise<GoneHint | null> {
  const cache = new Map<string, { reason: string | null; until: number }>();
  return async (slug) => {
    const hit = cache.get(slug);
    if (hit && hit.until > now()) return { reason: hit.reason };
    let reason: string | null;
    try {
      reason = await lookup(slug);
    } catch {
      return null;
    }
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value ?? "");
    cache.set(slug, { reason, until: now() + ttlMs });
    return { reason };
  };
}

export function createGoneChecker(
  lookup: GoneLookup,
  opts: Options = {},
): (slug: string) => Promise<boolean> {
  const resolve = createGoneResolver(lookup, opts);
  return async (slug) => !!(await resolve(slug))?.reason;
}

/*
 * Cabeçalho de requisição que o proxy passa à página da matéria (UX-W5-T2, item 81): a página não
 * repete `public_article_gone` quando o proxy já consultou. Confiança: o proxy SEMPRE apaga o valor
 * que veio do cliente antes de definir o seu (e não define nada quando não checou). Requisições de
 * prefetch não passam pelo proxy (`config.matcher`), então nelas o cabeçalho só pode ser do cliente
 * e `proxyGoneHint` o ignora. Um valor forjado só pesa quando a matéria não está no ar (a página
 * confere a linha pública antes de olhar o cabeçalho) e a página é dinâmica (sem cache
 * compartilhado): no pior caso quem forjou vê um 404 ou um motivo escrito por ele mesmo.
 */
export const GONE_CHECKED_HEADER = "x-cn-gone-checked";

/** Motivo maior que isso não veio do banco: o cabeçalho é descartado. */
const MAX_HEADER = 1200;

/** `0` = checado e no ar; `1;<motivo codificado>` = retirada (motivo em ASCII seguro para cabeçalho). */
export function goneHeaderValue(reason: string | null): string {
  return reason ? `1;${encodeURIComponent(reason)}` : "0";
}

export function parseGoneHeader(value: string | null): GoneHint | null {
  if (!value || value.length > MAX_HEADER) return null;
  if (value === "0") return { reason: null };
  if (!value.startsWith("1;") || value.length === 2) return null;
  try {
    return { reason: decodeURIComponent(value.slice(2)) };
  } catch {
    return null;
  }
}

interface HeaderReader {
  get(name: string): string | null;
}

/** Resultado da checagem do proxy para a requisição atual; `null` = a página consulta sozinha. */
export function proxyGoneHint(headers: HeaderReader): GoneHint | null {
  if (headers.get("next-router-prefetch") !== null || headers.get("purpose") === "prefetch") {
    return null;
  }
  return parseGoneHeader(headers.get(GONE_CHECKED_HEADER));
}

/** Consulta pelo PostgREST com a chave anônima (a função é pública e só devolve o motivo). */
export function supabaseGoneLookup(url: string, anonKey: string, timeoutMs = 1500): GoneLookup {
  return async (slug) => {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/public_article_gone`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`public_article_gone ${res.status}`);
    const reason: unknown = await res.json();
    return typeof reason === "string" && reason ? reason : null;
  };
}
