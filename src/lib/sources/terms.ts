/**
 * Termos de uso do site (spec §7.1 passo 7): links cujo texto fala de termos, política de uso,
 * condições de uso, direitos autorais, copyright ou reprodução, só do mesmo site, até 5.
 */
import { parseHTML } from "linkedom";
import { hostKey } from "./url";

const TERMS_TEXT =
  /termos|pol[ií]tica de uso|condi[cç][oõ]es de uso|direitos autorais|copyright|reprodu[cç][aã]o/i;
const MAX_LINKS = 5;

/** `href` absolutos, do mesmo site de `baseUrl`, cujo texto do link case a régua de termos. */
export function findTermsLinks(html: string, baseUrl: string): string[] {
  const { document } = parseHTML(html);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (out.length >= MAX_LINKS) break;
    const text = a.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || !TERMS_TEXT.test(text)) continue;
    const href = a.getAttribute("href");
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (hostKey(url) !== hostKey(base)) continue;
    const normalized = url.toString();
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}
