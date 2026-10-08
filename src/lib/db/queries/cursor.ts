/**
 * Paginação por cursor (keyset) para listas que não podem cortar em silêncio (UX-W1-T3).
 *
 * O cursor é opaco: base64url do JSON com os valores da chave de ordenação da última linha
 * mostrada. A chave sempre termina no `id`, então empates na ordenação nunca repetem nem pulam
 * itens. Os valores vêm da URL e entram num filtro `or` do PostgREST: por isso cada um é validado
 * (data ISO ou uuid) antes de virar texto do filtro.
 */

/** Página de uma lista: linhas, total real (sem o cursor) e o próximo cursor, se houver mais. */
export interface Page<T> {
  rows: T[];
  total: number;
  nextCursor: string | null;
}

export interface KeySpec {
  col: string;
  type: "ts" | "uuid";
  asc: boolean;
  /** Coluna pode ser nula: nulos vêm por último (ascendente) ou primeiro (descendente). */
  nullable?: boolean;
}

export type KeyValue = string | null;

const TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function encodeCursor(values: readonly KeyValue[]): string {
  return toBase64Url(JSON.stringify(values));
}

/** Valores do cursor validados contra a chave; `null` quando o cursor é inválido. */
export function decodeCursor(cursor: string, keys: readonly KeySpec[]): KeyValue[] | null {
  const text = fromBase64Url(cursor);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== keys.length) return null;
  const out: KeyValue[] = [];
  for (const [i, k] of keys.entries()) {
    const v: unknown = parsed[i];
    if (v === null) {
      if (!k.nullable) return null;
      out.push(null);
      continue;
    }
    if (typeof v !== "string" || !(k.type === "ts" ? TS : UUID).test(v)) return null;
    out.push(v);
  }
  return out;
}

/** Valores da chave de uma linha, na ordem da chave. */
export function cursorOf(keys: readonly KeySpec[], row: Record<string, unknown>): string {
  return encodeCursor(
    keys.map((k) => {
      const v = row[k.col];
      return typeof v === "string" ? v : null;
    }),
  );
}

const q = (v: string) => `"${v}"`;
const eq = (k: KeySpec, v: KeyValue) => (v === null ? `${k.col}.is.null` : `${k.col}.eq.${q(v)}`);
const nullsLast = (k: KeySpec) => k.asc;

/** Condições (alternativas) para "vem depois de `v`" na coluna `k`. */
function after(k: KeySpec, v: KeyValue): string[] {
  if (v === null) return k.nullable && !nullsLast(k) ? [`${k.col}.not.is.null`] : [];
  const cmp = `${k.col}.${k.asc ? "gt" : "lt"}.${q(v)}`;
  return k.nullable && nullsLast(k) ? [cmp, `${k.col}.is.null`] : [cmp];
}

/** Condições (alternativas) para "vem antes de `v`" na coluna `k`. */
function before(k: KeySpec, v: KeyValue): string[] {
  if (v === null) return k.nullable && nullsLast(k) ? [`${k.col}.not.is.null`] : [];
  const cmp = `${k.col}.${k.asc ? "lt" : "gt"}.${q(v)}`;
  return k.nullable && !nullsLast(k) ? [cmp, `${k.col}.is.null`] : [cmp];
}

function lexicographic(
  keys: readonly KeySpec[],
  values: readonly KeyValue[],
  step: (k: KeySpec, v: KeyValue) => string[],
  inclusive: boolean,
): string {
  const terms: string[] = [];
  for (const [i, k] of keys.entries()) {
    const prefix = keys.slice(0, i).map((p, j) => eq(p, values[j] ?? null));
    for (const c of step(k, values[i] ?? null))
      terms.push(prefix.length ? `and(${[...prefix, c].join(",")})` : c);
  }
  if (inclusive) terms.push(`and(${keys.map((k, j) => eq(k, values[j] ?? null)).join(",")})`);
  // Nenhuma alternativa: nada vem depois (o id nunca é nulo).
  return terms.length ? terms.join(",") : "id.is.null";
}

/** Filtro PostgREST (conteúdo de `.or()`) das linhas depois do cursor. */
export function afterKey(keys: readonly KeySpec[], values: readonly KeyValue[]): string {
  return lexicographic(keys, values, after, false);
}

/** Filtro PostgREST (conteúdo de `.or()`) das linhas até o cursor, inclusive. */
export function throughKey(keys: readonly KeySpec[], values: readonly KeyValue[]): string {
  return lexicographic(keys, values, before, true);
}
