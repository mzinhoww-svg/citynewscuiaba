import { parseHTML } from "linkedom";
import { parseFeedDate } from "@/lib/pipeline/parse-date";
import type { RawEntry } from "@/lib/pipeline/types";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { PageSelectors } from "./types";
import { registrableHost } from "./url";

export const MAX_PAGE_LIST_ITEMS = 50;
const TITLE_MAX = 300;
const SELECTOR_MAX = 200;
/** Letras, dígitos, espaço e a pontuação de seletores CSS comuns; nada de `<`, `{`, `}`, `@`, `;`, `\`. */
const SAFE_SELECTOR = /^[A-Za-z0-9 ._#\-[\]="'^$*|~,>+:()/]+$/;

/** Seletor CSS aceito (vem do formulário ou da IA): curto, sem `<`, `{`, `}`, `@`, `;`, `\` nem controle. */
export function isSafeSelector(s: string): boolean {
  if (typeof s !== "string" || s.trim().length === 0 || s.length > SELECTOR_MAX) return false;
  return SAFE_SELECTOR.test(s);
}

/**
 * Itens de uma página-lista (seção sem feed) pelos seletores. Só título, link e data: sem corpo.
 * Só links do mesmo site registrável da página, até 50, sem repetir URL. Nunca lança.
 */
export function extractPageList(html: string, pageUrl: string, sel: PageSelectors): RawEntry[] {
  const selectors = [sel.item, sel.link, sel.title, ...(sel.date ? [sel.date] : [])];
  if (!selectors.every(isSafeSelector)) return [];
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  const site = registrableHost(page.hostname);
  try {
    const { document } = parseHTML(html);
    const out: RawEntry[] = [];
    const seen = new Set<string>();
    for (const item of Array.from(document.querySelectorAll(sel.item))) {
      if (out.length >= MAX_PAGE_LIST_ITEMS) break;
      const linkEl = item.querySelector(sel.link) ?? (item.matches(sel.link) ? item : null);
      const href = linkEl?.getAttribute("href")?.trim();
      if (!href) continue;
      let url: URL;
      try {
        url = new URL(href, page);
      } catch {
        continue;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (registrableHost(url.hostname) !== site) continue;
      url.hash = "";
      const key = url.toString();
      if (seen.has(key)) continue;
      const titleEl = item.querySelector(sel.title) ?? (item.matches(sel.title) ? item : null);
      const title = sanitizeExternalText(titleEl?.textContent ?? "", TITLE_MAX);
      if (!title.text) continue;
      seen.add(key);
      let publishedAt: string | null = null;
      if (sel.date) {
        const dateEl = item.querySelector(sel.date);
        const raw = dateEl?.getAttribute("datetime") ?? dateEl?.textContent ?? "";
        publishedAt = raw.trim() ? parseFeedDate(raw.trim()) : null;
      }
      out.push({
        title: title.text.replace(/\s*\n\s*/g, " "),
        url: key,
        publishedAt,
        excerpt: null,
        author: null,
        imageUrl: null,
        injection: title.injection,
        injectionMatches: title.matches,
      });
    }
    return out;
  } catch {
    return [];
  }
}
