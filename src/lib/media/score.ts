import { DUPLICATE_MAX_DISTANCE } from "./checks";
import type { Candidate } from "./types";

/**
 * Nota 0 a 100 de uma imagem candidata (spec 2026-10-02 §4.10): resolução, proporção, nitidez
 * (só quando medida) e penalidades por indício de marca d'água e texto sensacionalista. Função
 * pura: não olha rede nem banco. Largura abaixo de 600 px reprova (nota 0).
 */
export const MIN_SCORE_WIDTH_PX = 600;
const GOOD_WIDTH_PX = 1200;
const GREAT_WIDTH_PX = 1600;

const WATERMARK_PENALTY = 25;
const SENSATIONAL_PENALTY = 40;

const RESOLUTION_MAX = 40;
const ASPECT_MAX = 30;
const SHARPNESS_MAX = 20;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function resolutionPoints(width: number): number {
  if (width >= GREAT_WIDTH_PX) return RESOLUTION_MAX;
  if (width >= GOOD_WIDTH_PX)
    return 34 + ((width - GOOD_WIDTH_PX) / (GREAT_WIDTH_PX - GOOD_WIDTH_PX)) * 6;
  // 600 a 1199: sobe de 8 a 30; ainda abaixo da faixa boa.
  return 8 + ((width - MIN_SCORE_WIDTH_PX) / (GOOD_WIDTH_PX - MIN_SCORE_WIDTH_PX)) * 22;
}

/** Paisagem entre 3:2 e 16:9 é a ideal; quadrada e retrato perdem pontos. */
function aspectPoints(width: number, height: number): number {
  const r = width / height;
  if (r >= 1.45 && r <= 1.85) return ASPECT_MAX;
  if (r >= 1.3 && r < 1.45) return 22;
  if (r > 1.85 && r <= 2.1) return 22;
  if (r >= 1) return 12;
  return 3; // retrato
}

export function scoreImage(c: Candidate): number {
  if (!Number.isFinite(c.width) || !Number.isFinite(c.height) || c.height <= 0) return 0;
  if (c.width < MIN_SCORE_WIDTH_PX) return 0;
  const parts = [resolutionPoints(c.width), aspectPoints(c.width, c.height)];
  let max = RESOLUTION_MAX + ASPECT_MAX;
  if (c.sharpness !== undefined && Number.isFinite(c.sharpness)) {
    parts.push(clamp(c.sharpness, 0, 1) * SHARPNESS_MAX);
    max += SHARPNESS_MAX;
  }
  let score = (parts.reduce((a, b) => a + b, 0) / max) * 100;
  if (c.watermark) score -= WATERMARK_PENALTY;
  if (c.sensational) score -= SENSATIONAL_PENALTY;
  return Math.round(clamp(score, 0, 100) * 10) / 10;
}

const sourceKey = (c: Pick<Candidate, "sourceId" | "sourceName">): string | undefined =>
  c.sourceId ?? c.sourceName;

function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** As duas imagens são de fontes diferentes e de fotos diferentes (phash acima do limite)? */
function pairs(
  cover: Pick<Candidate, "sourceId" | "sourceName" | "phash" | "imageUrl">,
  c: Candidate,
) {
  const a = sourceKey(cover);
  const b = sourceKey(c);
  if (a !== undefined && b !== undefined && a === b) return false;
  if (cover.imageUrl && c.imageUrl && cover.imageUrl === c.imageUrl) return false;
  if (cover.phash !== undefined && c.phash !== undefined)
    return hamming(cover.phash, c.phash) > DUPLICATE_MAX_DISTANCE;
  return true;
}

/**
 * Capa = maior nota; imagem do texto = a melhor das demais que seja de OUTRA fonte e de outra foto
 * (phash a mais de `DUPLICATE_MAX_DISTANCE` da capa). Mesma fonte nunca forma par. Com `fixed.cover`
 * (capa que a matéria já tem), só escolhe a imagem do texto. Empate: a primeira da lista.
 */
export function pickCoverAndInline(
  cands: readonly Candidate[],
  fixed?: { cover: Pick<Candidate, "sourceId" | "sourceName" | "phash" | "imageUrl"> },
): { cover?: Candidate; inline?: Candidate } {
  const ranked = cands
    .map((c, i) => ({ c, i, s: scoreImage(c) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.c);
  const out: { cover?: Candidate; inline?: Candidate } = {};
  let cover: Pick<Candidate, "sourceId" | "sourceName" | "phash" | "imageUrl"> | undefined =
    fixed?.cover;
  if (!cover) {
    out.cover = ranked[0];
    cover = out.cover;
  }
  if (!cover) return {};
  const inline = ranked.find((c) => c !== out.cover && pairs(cover, c));
  if (inline) out.inline = inline;
  return out;
}

/** Depois de qual parágrafo entra a imagem do texto: 3 (corpo ≥ 4), 2 (2 ou 3); sem imagem abaixo de 2. */
export function inlinePosition(paragraphs: number): number | null {
  if (!Number.isFinite(paragraphs) || paragraphs < 2) return null;
  return paragraphs >= 4 ? 3 : 2;
}
