import { LABEL_TEXT, META_SEPARATOR, PUBLIC_LABEL, sourceCountText } from "@/content/pt-BR/labels";

export { LABEL_TEXT };

export type LabelKind =
  | "original"
  | "normalized"
  | "aggregated"
  | "ai_summary"
  | "auto_published"
  | "human_reviewed"
  | "image_original"
  | "image_reproduction"
  | "image_licensed"
  | "image_illustrative"
  | "image_ai"
  | "sponsored";

export type Label = { kind: LabelKind; text: string; detail?: string };

export type ImageKind = "original" | "reproduction" | "licensed" | "illustrative" | "ai_generated";

export interface LabelInput {
  kind: "original" | "normalized" | "aggregated";
  sourceCount?: number;
  sourceName?: string;
  hasAiSummary: boolean;
  publishMode: "human" | "auto" | null;
  reviewerName?: string;
  image?: { kind: ImageKind; credit?: string; sourceName?: string };
  sponsored: boolean;
}

const IMAGE_LABEL: Record<ImageKind, LabelKind> = {
  original: "image_original",
  reproduction: "image_reproduction",
  licensed: "image_licensed",
  illustrative: "image_illustrative",
  ai_generated: "image_ai",
};

function label(kind: LabelKind, detail?: string): Label {
  const text = LABEL_TEXT[kind];
  return detail ? { kind, text, detail } : { kind, text };
}

function joinDetail(parts: Array<string | undefined>): string | undefined {
  const filled = parts.filter((p): p is string => Boolean(p && p.trim()));
  return filled.length > 0 ? filled.join(META_SEPARATOR) : undefined;
}

function textLabel(input: LabelInput): Label {
  switch (input.kind) {
    case "original":
      return label("original");
    case "normalized":
      // Só conta positiva e inteira vira detalhe; 0, ausente ou inválida não mostram número.
      return label(
        "normalized",
        input.sourceCount !== undefined &&
          Number.isInteger(input.sourceCount) &&
          input.sourceCount > 0
          ? sourceCountText(input.sourceCount)
          : undefined,
      );
    case "aggregated":
      return label("aggregated", input.sourceName);
  }
}

function imageLabel(image: NonNullable<LabelInput["image"]>): Label {
  const kind = IMAGE_LABEL[image.kind];
  switch (image.kind) {
    case "original":
      return label(kind, image.credit);
    case "reproduction":
      return label(kind, joinDetail([image.sourceName, image.credit]));
    case "licensed":
      return label(kind, joinDetail([image.sourceName, image.credit]));
    case "illustrative":
    case "ai_generated":
      return label(kind);
  }
}

/**
 * Rótulos de origem na ordem fixa: texto → IA → imagem → publicação → patrocinado.
 * Os `max` primeiros vão para `shown`; o excedente, para `hidden`. `max` não finito vale 4.
 * Conteúdo agregado nunca recebe rótulo de modo de publicação.
 */
export function labelsFor(input: LabelInput, max = 4): { shown: Label[]; hidden: Label[] } {
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 4;
  const all: Label[] = [textLabel(input)];
  if (input.hasAiSummary) all.push(label("ai_summary"));
  if (input.image) all.push(imageLabel(input.image));
  if (input.kind !== "aggregated") {
    if (input.publishMode === "human") all.push(label("human_reviewed", input.reviewerName));
    if (input.publishMode === "auto") all.push(label("auto_published"));
  }
  if (input.sponsored) all.push(label("sponsored"));
  return { shown: all.slice(0, limit), hidden: all.slice(limit) };
}

/** O que a tela pública precisa saber de uma matéria para dizer a origem. */
export interface PublicLabelInput {
  kind: "original" | "normalized" | "aggregated";
  sourceCount?: number;
  sponsored?: boolean;
}

export interface PublicLabels {
  /** No máximo 1 plaqueta por card, e só ORIGINAL CITYNEWS ou AGREGADO. */
  plaque?: "original" | "aggregated";
  /** Texto derivado: "Feito a partir de 2 fontes". */
  originText?: string;
  /** "Patrocinado": em texto, nunca uma segunda plaqueta. */
  sponsoredText?: string;
}

/**
 * Vocabulário público (spec 2026-10-03 R16 e R17): a leitora vê só de onde veio (plaqueta,
 * "Feito a partir de n fontes") e se é patrocinado. Revisão, modo de publicação, geração e IA
 * não saem daqui: `normalized`, `ai_summary`, `auto_published` e `human_reviewed` seguem como
 * nomes internos (dado e Estúdio). Conteúdo agregado só recebe a plaqueta AGREGADO.
 */
export function publicLabels(input: PublicLabelInput): PublicLabels {
  const out: PublicLabels = {};
  if (input.kind === "original") out.plaque = "original";
  if (input.kind === "aggregated") out.plaque = "aggregated";
  if (input.kind === "normalized") {
    const n = input.sourceCount;
    out.originText =
      n !== undefined && Number.isInteger(n) && n > 0
        ? PUBLIC_LABEL.derivedFrom(n)
        : PUBLIC_LABEL.derivedFromOthers;
  }
  if (input.sponsored) out.sponsoredText = PUBLIC_LABEL.sponsored;
  return out;
}

/** Legenda da foto em frase: "Foto: reprodução web · Fonte" (D-02). */
export function publicImageCaption(kind: ImageKind, detail?: string): string {
  const text = PUBLIC_LABEL.image[kind];
  return detail?.trim() ? `${text}${META_SEPARATOR}${detail.trim()}` : text;
}

/** A única plaqueta de um conjunto de rótulos de dados: ORIGINAL CITYNEWS ou AGREGADO · fonte. */
export function plaqueOf(set: { shown: Label[]; hidden: Label[] }): Label | undefined {
  return [...set.shown, ...set.hidden].find(
    (l) => l.kind === "original" || l.kind === "aggregated",
  );
}

/**
 * Rótulo de uma matéria do CityNews como fonte de uma resposta: plaqueta ORIGINAL CITYNEWS ou,
 * para texto derivado, a frase "Feito a partir de n fontes" (sem plaqueta).
 */
export function articleSourceLabel(input: PublicLabelInput): Label {
  const pub = publicLabels(input);
  if (pub.plaque === "original") return { kind: "original", text: PUBLIC_LABEL.plaque.original };
  return { kind: "normalized", text: pub.originText ?? PUBLIC_LABEL.derivedFromOthers };
}
