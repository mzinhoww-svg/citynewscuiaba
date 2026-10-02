import { LABEL_TEXT, META_SEPARATOR, sourceCountText } from "@/content/pt-BR/labels";

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
