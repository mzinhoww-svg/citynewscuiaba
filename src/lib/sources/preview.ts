import { parseHTML } from "linkedom";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { Discovery } from "./discover";
import { findTermsLinks } from "./terms";
import type { SourcePreview, SourcePreviewItem } from "./types";

export const PREVIEW_ITEMS = 10;
const TITLE_MAX = 300;
const SITE_NAME_MAX = 120;
const DESCRIPTION_MAX = 300;

const time = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/**
 * Prévia da descoberta: os 10 itens mais recentes, só título, link e data (sem corpo, resumo nem
 * imagem). Título com instrução embutida é descartado antes de qualquer modelo e contado.
 */
export function buildPreview(
  d: Discovery,
  meta: { siteName: string | null; description: string | null },
): SourcePreview {
  const items: SourcePreviewItem[] = [];
  let dropped = 0;
  for (const e of d.entries) {
    const title = sanitizeExternalText(e.title, TITLE_MAX);
    if (e.injection || title.injection) {
      dropped++;
      continue;
    }
    if (!title.text) continue;
    items.push({ title: title.text, url: e.url, publishedAt: e.publishedAt });
  }
  items.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
  return {
    finalUrl: d.finalUrl,
    siteName: meta.siteName,
    description: meta.description,
    strategy: d.strategy,
    feedUrl: d.feedUrl,
    items: items.slice(0, PREVIEW_ITEMS),
    droppedForInjection: dropped,
    termsLinks: d.html ? findTermsLinks(d.html, d.finalUrl) : [],
  };
}

/** Nome e descrição do site (`og:site_name` ou `<title>`; `description`), sanitizados. Injeção vira `null`. */
export function siteMeta(html: string): { siteName: string | null; description: string | null } {
  if (!html) return { siteName: null, description: null };
  try {
    const { document } = parseHTML(html);
    const attr = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? "";
    const clean = (raw: string, max: number): string | null => {
      const s = sanitizeExternalText(raw, max);
      return s.text && !s.injection ? s.text.replace(/\s*\n\s*/g, " ") : null;
    };
    return {
      siteName: clean(
        attr('meta[property="og:site_name"]') ||
          (document.querySelector("title")?.textContent ?? ""),
        SITE_NAME_MAX,
      ),
      description: clean(
        attr('meta[name="description"]') || attr('meta[property="og:description"]'),
        DESCRIPTION_MAX,
      ),
    };
  } catch {
    return { siteName: null, description: null };
  }
}
