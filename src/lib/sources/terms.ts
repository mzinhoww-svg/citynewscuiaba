import { parseHTML } from "linkedom";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { registrableHost } from "./url";

const TERMS_TEXT =
  /termos|pol[ií]tica de uso|condi[cç][oõ]es de uso|direitos autorais|copyright|reprodu[cç][aã]o/i;
const MAX_LINKS = 5;

/**
 * Links para termos de uso e direitos autorais do mesmo site (só http/https, sem fragmento, sem
 * repetir), até 5. Só o texto do link decide; nada é baixado aqui.
 */
export function findTermsLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const site = registrableHost(base.hostname);
  const out: string[] = [];
  try {
    const { document } = parseHTML(html);
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      if (out.length >= MAX_LINKS) break;
      const label = sanitizeExternalText(a.textContent ?? "", 120).text;
      if (!TERMS_TEXT.test(label)) continue;
      let url: URL;
      try {
        url = new URL(a.getAttribute("href") ?? "", base);
      } catch {
        continue;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (registrableHost(url.hostname) !== site) continue;
      url.hash = "";
      const href = url.toString();
      if (!out.includes(href)) out.push(href);
    }
  } catch {
    return out;
  }
  return out;
}
