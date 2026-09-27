/**
 * Referência a um item de coleção (`collection_items.content_ref`): `article:<uuid>`,
 * `topic:<uuid>`, `event:<uuid>` ou `aggregated:<uuid>` (item de outro veículo, que continua
 * abrindo no original). O valor vem do banco, mas só uuid válido chega a um filtro `in`.
 */
export type ContentKind = "article" | "topic" | "event" | "aggregated";

export interface ContentRef {
  kind: ContentKind;
  id: string;
}

const KINDS: readonly ContentKind[] = ["article", "topic", "event", "aggregated"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContentRef(ref: string): ContentRef | null {
  const i = ref.indexOf(":");
  if (i < 0) return null;
  const kind = KINDS.find((k) => k === ref.slice(0, i));
  const id = ref.slice(i + 1);
  return kind && UUID.test(id) ? { kind, id } : null;
}

export function groupRefs(refs: readonly string[]): Record<ContentKind, string[]> {
  const out: Record<ContentKind, string[]> = { article: [], topic: [], event: [], aggregated: [] };
  for (const r of refs) {
    const p = parseContentRef(r);
    if (p) out[p.kind].push(p.id);
  }
  return out;
}
