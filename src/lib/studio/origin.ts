/**
 * Origem de navegação no Estúdio (item 58, E-26): o link para uma tela de detalhe leva `?de=`
 * com a lista de onde a pessoa veio (aba, filtros, página), e o "Voltar" da tela de detalhe
 * devolve para ela. O parâmetro chega da URL, então é dado não confiável: só caminhos internos
 * do Estúdio passam; qualquer outra coisa (outro host, protocolo, `//host`, barra invertida,
 * `..`, caracteres de controle) cai no `fallback`, sem redirecionamento aberto.
 *
 * ```ts
 * withOrigin(`/estudio/fila/${id}`, "/estudio/fila?aba=mine"); // "/estudio/fila/…?de=%2Festudio%2Ffila%3Faba%3Dmine"
 * originFrom(searchParams, "/estudio/fila"); // "/estudio/fila?aba=mine"
 * ```
 */

/** Nome do parâmetro de consulta que carrega a origem. */
export const ORIGIN_PARAM = "de";

const MAX_LENGTH = 2048;
const STUDIO_ROOT = /^\/estudio(?=$|[/?#])/;
// Espaço, controles (C0, DEL, C1) e barra invertida: nada disso aparece num caminho legítimo.
const FORBIDDEN = /[\s\u0000-\u001f\u007f-\u009f\\]/;

/** `true` quando `value` é um caminho interno do Estúdio seguro para usar como destino. */
export function isSafeOrigin(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  if (FORBIDDEN.test(value) || !STUDIO_ROOT.test(value)) return false;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (path.includes("//")) return false;
  for (const segment of path.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }
    if (decoded === "." || decoded === ".." || /[/\\]/.test(decoded)) return false;
  }
  return true;
}

/**
 * Origem segura lida de `searchParams` (`?de=`), ou `fallback`. Com o parâmetro repetido,
 * vale o primeiro valor.
 */
export function originFrom(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: string,
): string {
  const raw = searchParams[ORIGIN_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && isSafeOrigin(value) ? value : fallback;
}

/**
 * `href` com `?de=` apontando para `origin` (substitui um `de` que já exista e preserva o
 * fragmento). Origem insegura não é anexada: devolve `href` como veio.
 */
export function withOrigin(href: string, origin: string): string {
  if (!isSafeOrigin(origin)) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
  const kept = query
    .split("&")
    .filter((part) => part !== "" && part.split("=", 1)[0] !== ORIGIN_PARAM);
  kept.push(`${ORIGIN_PARAM}=${encodeURIComponent(origin)}`);
  return `${path}?${kept.join("&")}${hash}`;
}
