import "server-only";
import type { OriginField } from "@/components";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import type { StudioArticle } from "@/lib/db/queries/studio-article";
import { labelsFor, type Label } from "@/lib/labels";

/** Rótulos de origem da matéria como o portal vai mostrar (texto → IA → imagem → publicação). */
export function articleLabels(a: StudioArticle): Label[] {
  const img = a.images[0];
  const { shown, hidden } = labelsFor(
    {
      kind: a.kind,
      sourceCount: new Set(a.sources.map((s) => s.sourceName)).size,
      hasAiSummary: (a.aiSummary?.length ?? 0) > 0,
      publishMode: a.publishMode,
      image: img
        ? {
            kind: img.kind,
            credit: img.credit ?? undefined,
            sourceName: img.sourceName ?? undefined,
          }
        : undefined,
      sponsored: false,
    },
    Number.POSITIVE_INFINITY,
  );
  return [...shown, ...hidden];
}

/** Origem de cada campo em texto (IA aceita por pessoa, edição humana ou pipeline sem edição). */
export function originNotes(
  a: StudioArticle,
): Partial<Record<OriginField, { text: string; ai: boolean }>> {
  const out: Partial<Record<OriginField, { text: string; ai: boolean }>> = {};
  for (const f of ["title", "dek", "seoTitle", "seoDescription"] as const) {
    const o = a.fieldOrigins[f];
    if (o?.origin === "ai") out[f] = { text: T.originAi(o.name), ai: true };
    else if (o?.origin === "human") out[f] = { text: T.originHuman(o.name), ai: false };
    else if (a.agentId && (f === "title" || f === "dek"))
      out[f] = { text: T.originPipeline, ai: true };
  }
  return out;
}
