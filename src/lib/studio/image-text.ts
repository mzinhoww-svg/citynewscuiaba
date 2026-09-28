import { IMAGE_TEXT } from "@/content/pt-BR/studio";

/** Limites do texto alternativo e da legenda (migration 0026 confere os mesmos). */
export const ALT_MAX = 250;
export const CAPTION_MAX = 300;

/**
 * Texto da imagem na matéria (E04/E10). `decorative` grava alt vazio de propósito (a imagem
 * não acrescenta informação); sem ele, o texto alternativo é obrigatório. Funções puras, usadas
 * no formulário e na ação.
 */
export interface ImageText {
  alt: string;
  caption: string;
  decorative: boolean;
}

export function normalizeImageText(i: ImageText): ImageText {
  return {
    alt: i.decorative ? "" : i.alt.trim(),
    caption: i.caption.trim(),
    decorative: i.decorative,
  };
}

/** Primeiro problema do texto da imagem, em pt-BR; `null` quando pode gravar. */
export function imageTextError(raw: ImageText): string | null {
  const i = normalizeImageText(raw);
  if (!i.decorative && i.alt === "") return IMAGE_TEXT.altRequired;
  if (i.alt.length > ALT_MAX) return IMAGE_TEXT.altTooLong(ALT_MAX);
  if (i.caption.length > CAPTION_MAX) return IMAGE_TEXT.captionTooLong(CAPTION_MAX);
  return null;
}
