import { fold } from "@/lib/text/fold";

/** Lugar do Guia como o casamento precisa (`venues.id`, `name`, `status`). */
export interface VenueCandidate {
  id: string;
  name: string;
  status: string;
}

/** Só lugar ativo do Guia recebe vínculo (`venues.status`: active | suspended | inactive). */
const ACTIVE = "active";
/** Similaridade mínima (Levenshtein normalizado) quando não há nome igual. */
const MIN_SIMILARITY = 0.9;
/** Nome normalizado mais curto que isto nunca casa ("Ará", "Bar X"). */
const MIN_KEY_LENGTH = 4;

/** Prefixos genéricos tirados só para comparar ("Teatro X" casa com "X"). */
const PREFIXES = ["teatro", "espaco", "casa", "centro", "cine", "arena", "bar", "restaurante"];
const PREFIX = new RegExp(`^(?:${PREFIXES.join("|")})\\s+(?:(?:de|do|da|dos|das)\\s+)?`);
/** Cidade no fim ("- Cuiabá", "Cuiabá MT", "em Várzea Grande", "MT"). */
const CITY_SUFFIX = /(?:^|\s)(?:(?:em\s)?(?:cuiaba|varzea grande)(?:\smt)?|mt)$/;

/**
 * Forma de comparação do nome do lugar: fold, sem pontuação, espaços colapsados, sem a cidade no
 * fim e sem um prefixo genérico no começo (se sobrar nome depois dele).
 */
export function venueKey(name: string): string {
  let s = fold(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  for (let prev = ""; prev !== s;) {
    prev = s;
    s = s.replace(CITY_SUFFIX, "").trim();
  }
  const stripped = s.replace(PREFIX, "");
  return stripped.length > 0 ? stripped : s;
}

/** Distância de edição (inserção, remoção, troca), em duas linhas. */
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? Math.max(a.length, b.length);
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

const usable = (key: string) => key.length >= MIN_KEY_LENGTH && !PREFIXES.includes(key);

/**
 * Lugar do Guia para o texto de local do evento (spec 2026-10-08 agenda rica §5): nome
 * normalizado igual, ou similaridade ≥ 0,9, com **um único** lugar ativo. Zero candidatos ou
 * dois ou mais (dois "Teatro Municipal") → `null`: sem vínculo automático, a redação escolhe.
 */
export function matchVenue(text: string, venues: readonly VenueCandidate[]): string | null {
  const key = venueKey(text);
  if (!usable(key)) return null;
  const active = venues
    .filter((v) => v.status === ACTIVE)
    .map((v) => ({ id: v.id, key: venueKey(v.name) }))
    .filter((v) => usable(v.key));
  const unique = (ids: string[]) => {
    const set = new Set(ids);
    return set.size === 1 ? ([...set][0] ?? null) : null;
  };
  const equal = active.filter((v) => v.key === key).map((v) => v.id);
  if (equal.length > 0) return unique(equal);
  return unique(active.filter((v) => similarity(v.key, key) >= MIN_SIMILARITY).map((v) => v.id));
}
