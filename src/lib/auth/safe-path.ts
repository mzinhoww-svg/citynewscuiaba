/**
 * Destino interno seguro para redirecionar depois de entrar (`?next=`).
 *
 * O parser de URL do navegador descarta tab/CR/LF e trata `\` como `/`, então
 * `"/\t/evil.com"` vira `https://evil.com/`. Por isso: recusa qualquer caractere de
 * controle, espaço (inclusive Unicode) ou barra invertida, também depois de decodificar
 * (até 3 camadas de `%`), resolve contra uma origem sentinela e exige a mesma origem.
 * Devolve `pathname + search + hash` normalizado, ou `null`.
 */
const SENTINEL = "https://citynews.invalid";
const MAX_LENGTH = 2048;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\s\\\u200b-\u200f]/u;

function suspicious(value: string): boolean {
  return FORBIDDEN.test(value) || value.startsWith("//");
}

export function internalPath(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_LENGTH) return null;
  if (!next.startsWith("/")) return null;
  let layer = next;
  for (let i = 0; i < 4; i += 1) {
    if (suspicious(layer)) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(layer);
    } catch {
      return null;
    }
    if (decoded === layer) break;
    // Barras codificadas no começo (`/%2F%2Fhost`) viram `//host` num segundo parser.
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
    layer = decoded;
  }
  let url: URL;
  try {
    url = new URL(next, SENTINEL);
  } catch {
    return null;
  }
  if (url.origin !== SENTINEL) return null;
  if (url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
