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

export function createGoneChecker(
  lookup: GoneLookup,
  { ttlMs = 60_000, maxEntries = 500, now = Date.now }: Options = {},
): (slug: string) => Promise<boolean> {
  const cache = new Map<string, { gone: boolean; until: number }>();
  return async (slug) => {
    const hit = cache.get(slug);
    if (hit && hit.until > now()) return hit.gone;
    let gone = false;
    try {
      gone = (await lookup(slug)) !== null;
    } catch {
      // Banco fora: a página decide (motivo ou erro); nunca derrubar a leitura por isso.
      return false;
    }
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value ?? "");
    cache.set(slug, { gone, until: now() + ttlMs });
    return gone;
  };
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
