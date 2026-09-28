/**
 * Prévia da descoberta (spec §7.1 passo 8): até 10 itens mais recentes, título saneado, sem corpo
 * nem imagem — item com padrão de instrução é descartado antes de qualquer modelo e contado.
 */
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { Discovery } from "./discover";
import { findTermsLinks } from "./terms";
import type { SourcePreview, SourcePreviewItem } from "./types";

const MAX_ITEMS = 10;

/** `SourcePreview` a partir da descoberta: nunca corpo, nunca imagem, nunca item com injeção. */
export function buildPreview(
  d: Discovery,
  meta: { siteName: string | null; description: string | null },
): SourcePreview {
  let droppedForInjection = 0;
  const candidates: SourcePreviewItem[] = [];
  for (const entry of d.entries) {
    const sanitized = sanitizeExternalText(entry.title);
    if (entry.injection || sanitized.injection) {
      droppedForInjection++;
      continue;
    }
    candidates.push({ title: sanitized.text, url: entry.url, publishedAt: entry.publishedAt });
  }
  candidates.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0;
  });
  const items = candidates.slice(0, MAX_ITEMS);
  const termsLinks = d.html ? findTermsLinks(d.html, d.baseUrl) : [];

  return {
    finalUrl: d.feedUrl ?? d.baseUrl,
    siteName: meta.siteName,
    description: meta.description,
    strategy: d.strategy,
    feedUrl: d.feedUrl,
    items,
    droppedForInjection,
    termsLinks,
  };
}
