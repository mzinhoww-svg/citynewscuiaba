import { CHECKLIST_TEXT as T } from "@/content/pt-BR/studio";

/** O que o checklist de publicação enxerga de uma matéria (E02/E06). Função pura. */
export interface DraftView {
  title: string;
  dek: string;
  sectionSlug: string | null;
  tags: string[];
  /** Local: bairros citados (a taxonomia de lugares do portal). */
  neighborhoods: string[];
  /** A regra ativa da categoria exige fonte primária? */
  requirePrimary: boolean;
  sources: { role: "primary" | "secondary" | "context"; confirmed: boolean }[];
  /** `alt` nulo = não escrito; `""` = imagem decorativa, marcada de propósito. */
  images: { credit: string | null; alt: string | null }[];
  seoTitle: string | null;
  seoDescription: string | null;
  /** Sugestões de IA ainda sem decisão (aceitar ou descartar). */
  openSuggestions: number;
  /**
   * Rascunho sem IA (B-015): `true` enquanto o corpo ainda tiver texto das fontes (regra em
   * `studio_fallback_pending`, migration 0023); `false` depois de reescrito; `null`/ausente
   * quando a matéria não nasceu de rascunho sem IA (o item nem aparece).
   */
  fallbackPending?: boolean | null;
}

export type ChecklistKey =
  "ai_fallback" | "title_dek" | "taxonomy" | "primary_source" | "images" | "seo" | "ai_suggestions";

export interface ChecklistItem {
  key: ChecklistKey;
  ok: boolean;
  label: string;
  /** Motivo legível quando o item não passa. */
  reason?: string;
}

export interface Checklist {
  items: ChecklistItem[];
  complete: boolean;
  /** Primeiro motivo pendente, mostrado ao lado do botão Aprovar desabilitado. */
  blocker?: string;
}

/** Limites de edição da matéria (item 48): o título passa disso e o editor avisa. */
export const ARTICLE_LIMITS = { title: 110 } as const;

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;

const filled = (s: string | null | undefined) => typeof s === "string" && s.trim().length > 0;

function item(key: ChecklistKey, label: string, reason: string | null): ChecklistItem {
  return reason === null ? { key, ok: true, label } : { key, ok: false, label, reason };
}

/**
 * Checklist de publicação: rascunho sem IA reescrito (quando for o caso); título e linha fina; editoria, tags e local; fonte primária quando a
 * regra da categoria exige; crédito e texto alternativo em toda imagem; título e descrição de
 * SEO; sugestões de IA resolvidas. Aprovar fica desabilitado com `blocker` visível.
 */
export function checklist(a: DraftView): Checklist {
  const titleDek = filled(a.title) && filled(a.dek) ? null : T.reason.titleDek;
  const taxonomy =
    filled(a.sectionSlug) && a.tags.some(filled) && a.neighborhoods.some(filled)
      ? null
      : T.reason.taxonomy;
  const primary =
    !a.requirePrimary || a.sources.some((s) => s.role === "primary" && s.confirmed)
      ? null
      : T.reason.primary;
  const images = a.images.some((i) => !filled(i.credit))
    ? T.reason.credit
    : a.images.some((i) => i.alt === null || (i.alt !== "" && !filled(i.alt)))
      ? T.reason.alt
      : null;
  const seo =
    !filled(a.seoTitle) || !filled(a.seoDescription)
      ? T.reason.seo
      : (a.seoTitle ?? "").trim().length > SEO_TITLE_MAX
        ? T.reason.seoTitleLong(SEO_TITLE_MAX)
        : (a.seoDescription ?? "").trim().length > SEO_DESCRIPTION_MAX
          ? T.reason.seoDescriptionLong(SEO_DESCRIPTION_MAX)
          : null;
  const ai = a.openSuggestions > 0 ? T.reason.suggestions(a.openSuggestions) : null;

  const fallback =
    a.fallbackPending === undefined || a.fallbackPending === null
      ? []
      : [item("ai_fallback", T.label.aiFallback, a.fallbackPending ? T.reason.aiFallback : null)];

  const items = [
    ...fallback,
    item("title_dek", T.label.titleDek, titleDek),
    item("taxonomy", T.label.taxonomy, taxonomy),
    item("primary_source", a.requirePrimary ? T.label.primary : T.label.primaryOptional, primary),
    item("images", T.label.images, images),
    item("seo", T.label.seo, seo),
    item("ai_suggestions", T.label.suggestions, ai),
  ];
  const blocker = items.find((i) => !i.ok)?.reason;
  return blocker ? { items, complete: false, blocker } : { items, complete: true };
}
