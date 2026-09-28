/**
 * Extração `page_list` (spec §7.1 passo 6): seção sem feed, seletores da IA (validados) apontando
 * para os cartões de matéria. Só metadados — nunca corpo — e só links do mesmo site registrável.
 */
import { parseHTML } from "linkedom";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { parseFeedDate } from "@/lib/pipeline/parse-date";
import type { RawEntry } from "@/lib/pipeline/types";
import { hostKey } from "./url";
import type { PageSelectors } from "./types";

const MAX_ITEMS = 50;
const TITLE_MAX = 300;

/** Comprimento máximo do seletor completo (FS-T4 fix round 1: era 200). */
const MAX_SELECTOR_CHARS = 120;
/** Até 3 partes compostas por seletor (combinadas por espaço ou `>`). */
const MAX_COMPOUND_PARTS = 3;
/**
 * Qualquer um destes caracteres recusa o seletor inteiro: `*` (universal), `:` (pseudo-classe ou
 * pseudo-elemento, cobre `:has`/`:not`/`:is`/`:where` e qualquer outro), `[`/`]` (seletor de
 * atributo, ex.: `a[href^="javascript:"]`), `"`/`'` (string), `\` (escape), `,` (lista de
 * seletores), `~`/`+` (combinadores irmãos).
 */
const FORBIDDEN_CHARS = /[*:[\]"'\\,~+]/;
/**
 * Uma "parte composta": um seletor de tipo opcional seguido de zero ou mais seletores de classe
 * ou id (`article.card`, `h2`, `#main`, `.item`) — nunca vazia, nunca só símbolo.
 */
const COMPOUND_PART =
  /^(?:[a-zA-Z][a-zA-Z0-9-]*(?:[.#][a-zA-Z_][\w-]*)*|(?:[.#][a-zA-Z_][\w-]*)+)$/;

/**
 * Gramática de permissão (FS-T4 fix round 1, review): só seletor de tipo, classe e id,
 * combinados por espaço (descendente) ou `>` (filho direto), até 3 partes compostas. Recusa `*`,
 * qualquer pseudo-classe/pseudo-elemento (`:has`, `:not`, `:is`, `:where`…), seletor de atributo,
 * vírgula (lista), `~`/`+`, string, escape com barra invertida e seletor com mais de 120
 * caracteres.
 */
export function isSafeSelector(s: string): boolean {
  if (!s || s.length > MAX_SELECTOR_CHARS) return false;
  if (FORBIDDEN_CHARS.test(s)) return false;

  const childGroups = s.trim().split(/\s*>\s*/);
  if (childGroups.some((g) => g.length === 0)) return false;
  const parts = childGroups.flatMap((g) => g.split(/\s+/).filter(Boolean));
  if (parts.length === 0 || parts.length > MAX_COMPOUND_PARTS) return false;

  return parts.every((p) => COMPOUND_PART.test(p));
}

function absoluteUrl(href: string, base: string): URL | null {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Um item por elemento casado com `sel.item`; descarta sem título, sem link http(s) ou de outro
 * site. Até `MAX_ITEMS`, título truncado a `TITLE_MAX` caracteres, sem corpo.
 */
export function extractPageList(html: string, pageUrl: string, sel: PageSelectors): RawEntry[] {
  if (![sel.item, sel.link, sel.title, ...(sel.date ? [sel.date] : [])].every(isSafeSelector)) {
    return [];
  }
  const { document } = parseHTML(html);
  const base = new URL(pageUrl);
  const entries: RawEntry[] = [];

  for (const item of Array.from(document.querySelectorAll(sel.item))) {
    if (entries.length >= MAX_ITEMS) break;
    const linkEl = item.querySelector(sel.link);
    const href = linkEl?.getAttribute("href")?.trim();
    if (!href) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url || hostKey(url) !== hostKey(base)) continue;

    const titleText = item.querySelector(sel.title)?.textContent?.trim() ?? "";
    const sanitized = sanitizeExternalText(titleText, TITLE_MAX);
    if (!sanitized.text) continue;

    const dateEl = sel.date ? item.querySelector(sel.date) : null;
    const dateRaw = dateEl?.getAttribute("datetime")?.trim() || dateEl?.textContent?.trim() || "";
    const publishedAt = dateRaw ? parseFeedDate(dateRaw) : null;

    entries.push({
      title: sanitized.text,
      url: url.toString(),
      publishedAt,
      excerpt: null,
      author: null,
      imageUrl: null,
      injection: sanitized.injection,
      injectionMatches: sanitized.matches,
    });
  }
  return entries;
}
