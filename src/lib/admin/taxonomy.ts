/**
 * Taxonomia (A05): sugestão de tags duplicadas e regras de nome. Puro. A sugestão é
 * determinística (forma normalizada: sem acento, minúscula, sem plural simples) e aparece na
 * tela como sugestão; a mesclagem é sempre decisão humana e preserva vínculos
 * (`taxonomy_merge_tags`, 0038).
 */

export interface TagUsage {
  tag: string;
  articles: number;
  items: number;
}

export interface MergeSuggestion {
  /** Tag que fica (a mais usada; empate pelo nome mais curto, depois alfabético). */
  into: string;
  /** Tags que seriam mesclhadas nela. */
  from: string[];
  reason: "accent" | "case" | "plural" | "spacing";
}

export function normalizeTag(tag: string): string {
  return tag
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Forma de agrupamento: normalizada e sem plural simples em "s" (ônibus não tem). */
function groupKey(tag: string): string {
  const n = normalizeTag(tag);
  return n.length > 3 && n.endsWith("s") && !n.endsWith("ss") && !n.endsWith("us")
    ? n.slice(0, -1)
    : n;
}

const uses = (t: TagUsage) => t.articles + t.items;

function reasonFor(a: string, b: string): MergeSuggestion["reason"] {
  if (a.toLowerCase() === b.toLowerCase()) return "case";
  if (normalizeTag(a) === normalizeTag(b)) {
    return /[\s_]/.test(a + b) ? "spacing" : "accent";
  }
  return "plural";
}

/** Agrupa tags com a mesma forma normalizada; devolve só grupos com 2+ tags. */
export function suggestTagMerges(tags: readonly TagUsage[]): MergeSuggestion[] {
  const groups = new Map<string, TagUsage[]>();
  for (const t of tags) {
    const k = groupKey(t.tag);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: MergeSuggestion[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sorted = [...g].sort(
      (a, b) => uses(b) - uses(a) || a.tag.length - b.tag.length || a.tag.localeCompare(b.tag),
    );
    const into = sorted[0]!.tag;
    const from = sorted.slice(1).map((t) => t.tag);
    out.push({ into, from, reason: reasonFor(into, from[0]!) });
  }
  return out.sort((a, b) => a.into.localeCompare(b.into, "pt-BR"));
}

/** Slug de editoria, subeditoria ou lugar. */
export function slugify(name: string): string {
  return normalizeTag(name).replace(/[^a-z0-9-]/g, "");
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
