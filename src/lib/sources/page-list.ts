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

const SAFE_SELECTOR = /^[\w\s.#\-,:>[\]="'*~+()]+$/;

/** Recusa seletor com marcação, chaves de bloco CSS ou `@regra`, ou comprimento excessivo. */
export function isSafeSelector(s: string): boolean {
  if (!s || s.length > 200) return false;
  return SAFE_SELECTOR.test(s);
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
