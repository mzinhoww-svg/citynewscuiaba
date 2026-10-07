import type { ImageIssue, MediaChoiceKind } from "./types";
import { fold } from "@/lib/text/fold";

/** Lado maior mínimo. A spec §6.5 pedia 1200; o dono relaxou para 600 em 03/10/2026. */
export const MIN_LONG_SIDE_PX = 600;
/** Distância de Hamming do dHash (64 bits) até a qual duas imagens são a mesma foto. */
export const DUPLICATE_MAX_DISTANCE = 8;

export interface ImageFacts {
  width: number;
  height: number;
  phashDistances: readonly number[];
  watermark: boolean;
  sensational?: boolean;
}

/**
 * Verificações da spec §6.5: resolução, hash perceptual contra o acervo, marca d'água e
 * sensacionalismo. Na reprodução a marca d'água da fonte não reprova: a imagem é usada inteira,
 * sem recorte de crédito nem de marca (A-010).
 */
export function checkImage(
  img: ImageFacts,
  use: MediaChoiceKind = "licensed",
): { ok: boolean; issues: ImageIssue[] } {
  const issues: ImageIssue[] = [];
  const longSide = Math.max(img.width, img.height);
  if (!Number.isFinite(longSide) || longSide < MIN_LONG_SIDE_PX) issues.push("low_res");
  if (img.phashDistances.some((d) => Number.isFinite(d) && d <= DUPLICATE_MAX_DISTANCE))
    issues.push("duplicate");
  if (img.watermark && use !== "reproduction") issues.push("watermark");
  if (img.sensational) issues.push("sensational");
  return { ok: issues.length === 0, issues };
}

/**
 * Pista de marca d'água pela URL (bancos de imagem e arquivos de prévia). Não há detector por
 * pixel no MVP: a verificação visual fica com a revisão humana (registrado em A-037).
 */
export function watermarkHint(url: string): boolean {
  return /watermark|marca[-_]?d[-_]?agua|[?&]wm=1|\/preview[-_/]|\b(?:shutterstock|gettyimages|istockphoto|depositphotos|dreamstime|123rf|alamy)\b|stockbank/.test(
    fold(url),
  );
}

const SENSATIONAL = [
  "imagens fortes",
  "cenas fortes",
  "chocante",
  "banho de sangue",
  "ensanguentad",
  "cadaver",
  "corpo e encontrado",
  "corpo encontrado",
  "decapitad",
  "esquartejad",
  "carbonizad",
  "brutal",
  "macabr",
];

/** Título ou legenda que indica imagem sensacionalista (bloqueio da spec §6.5). */
export function isSensationalText(text: string): boolean {
  const t = fold(text);
  return SENSATIONAL.some((w) => t.includes(w));
}
