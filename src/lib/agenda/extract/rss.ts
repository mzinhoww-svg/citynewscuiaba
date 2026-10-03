import { sanitizeExternalText } from "@/lib/security/sanitize";
import { parsePtDate } from "../ptdate";
import type { RawEvent } from "../types";

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  if (!m) return null;
  const v = (m[1] ?? "").trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
  return v === "" ? null : v;
}

/**
 * Itens de feed RSS cuja chamada ou resumo traz data de evento ("17 de outubro às 19h", "08/11").
 * A data de publicação do item não vale como data do evento: sem data no texto, o item é ignorado.
 */
export function extractRss(xml: string, now: Date): RawEvent[] {
  const out: RawEvent[] = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const block = m[1] ?? "";
    const rawTitle = tag(block, "title");
    if (!rawTitle) continue;
    const title = sanitizeExternalText(rawTitle, 200).text;
    const summary = sanitizeExternalText(tag(block, "description") ?? "", 600).text;
    const when = parsePtDate(`${title}. ${summary}`, now);
    if (!when) continue;
    const place = /\bLocal:\s*([^.]+)/i.exec(summary)?.[1]?.trim() ?? null;
    const [venue, ...rest] = (place ?? "").split(",").map((s) => s.trim());
    out.push({
      title: title.replace(/[,\s-]*\d{1,2}(\/\d{1,2}| de [a-zç]+).*$/i, "").trim() || title,
      start: when.time ? `${when.date}T${when.time}` : when.date,
      venue: venue || null,
      address: rest.join(", ") || null,
      city: /cuiab[aá]/i.test(summary)
        ? "Cuiabá"
        : /v[aá]rzea grande/i.test(summary)
          ? "Várzea Grande"
          : null,
      url: tag(block, "link"),
      priceCents: /entrada (franca|gratuita)|gratuit[oa]|\bfranca\b/i.test(summary) ? 0 : undefined,
      category: tag(block, "category"),
    });
  }
  return out;
}
