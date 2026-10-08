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

/**
 * Prefixos genéricos (spec: teatro, espaço, casa, centro; mais cine) separados só para comparar.
 * Cada um tem uma classe: prefixos de classes diferentes nunca casam ("Espaço Cultura" ≠ "Casa de
 * Cultura"); cine e teatro são da mesma ("Cine Teatro", sala de projeção e palco no mesmo lugar).
 */
const PREFIX_CLASS: Readonly<Record<string, string>> = {
  teatro: "palco",
  cine: "palco",
  espaco: "espaco",
  casa: "casa",
  centro: "centro",
};
const PREFIXES = Object.keys(PREFIX_CLASS);
const PREFIX = new RegExp(`^(${PREFIXES.join("|")})\\s+(?:(?:de|do|da|dos|das)\\s+)?`);
/** Cidade no fim ("- Cuiabá", "Cuiabá MT", "em Várzea Grande", "MT"). */
const CITY_SUFFIX = /(?:^|\s)(?:(?:em\s)?(?:cuiaba|varzea grande)(?:\smt)?|mt)$/;

/** Nome do lugar para comparar: prefixo genérico tirado (ou `null`) e o núcleo. */
export interface VenueKey {
  prefix: string | null;
  core: string;
}

/**
 * Forma de comparação do nome do lugar: fold, sem pontuação, espaços colapsados, sem a cidade no
 * fim e com um prefixo genérico do começo separado do núcleo (se sobrar nome depois dele).
 */
export function venueKey(name: string): VenueKey {
  let s = fold(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  for (let prev = ""; prev !== s;) {
    prev = s;
    s = s.replace(CITY_SUFFIX, "").trim();
  }
  const m = PREFIX.exec(s);
  const core = m ? s.slice(m[0].length) : "";
  return m && core.length > 0 ? { prefix: m[1] ?? null, core } : { prefix: null, core: s };
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

const usable = (k: VenueKey) => k.core.length >= MIN_KEY_LENGTH && !PREFIXES.includes(k.core);
const words = (core: string) => core.split(" ").length;

/**
 * Os dois nomes podem ser o mesmo lugar? Prefixos de classes diferentes, não; prefixo tirado de um
 * lado só ("Zulmira Canavarros" × "Teatro Zulmira Canavarros"), só com núcleo de 2+ palavras —
 * "Pantanal" não vira "Arena Pantanal" nem "UFMT" vira "Teatro da UFMT".
 */
function compatible(a: VenueKey, b: VenueKey): boolean {
  if (a.prefix && b.prefix) return PREFIX_CLASS[a.prefix] === PREFIX_CLASS[b.prefix];
  if (a.prefix || b.prefix) return words(a.core) >= 2 && words(b.core) >= 2;
  return true;
}

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
    .filter((v) => usable(v.key) && compatible(v.key, key));
  const unique = (ids: string[]) => {
    const set = new Set(ids);
    return set.size === 1 ? ([...set][0] ?? null) : null;
  };
  const equal = active.filter((v) => v.key.core === key.core).map((v) => v.id);
  if (equal.length > 0) return unique(equal);
  return unique(
    active.filter((v) => similarity(v.key.core, key.core) >= MIN_SIMILARITY).map((v) => v.id),
  );
}
