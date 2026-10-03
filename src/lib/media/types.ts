/**
 * Mídia (spec §6.5, A-010). Tipos do domínio: nada aqui conhece banco, Storage ou rede.
 */

/** `sources.image_policy`. `reproduction` = imagem da matéria original com rótulo REPRODUÇÃO. */
export type ImagePolicy = "none" | "with_agreement" | "licensed_only" | "reproduction";

/** Resultado da cascata. `typographic` = card tipográfico da editoria (sem imagem). */
export type MediaChoiceKind =
  "original" | "reproduction" | "licensed" | "illustrative" | "ai_generated" | "typographic";

export type ImageIssue = "low_res" | "duplicate" | "watermark" | "sensational";

/** Imagem candidata, já medida (dimensões e hash perceptual) quando veio de fora. */
export interface Candidate {
  /**
   * Link da origem: página da matéria original (imagem da fonte) ou caminho do acervo. É o link
   * exibido no crédito de REPRODUÇÃO.
   */
  url: string;
  /** URL do arquivo de imagem na fonte (proveniência). */
  imageUrl?: string;
  /** Asset já existente em `media_assets` (acervo, licenciada). */
  assetId?: string;
  /** Fonte que trouxe a imagem (`sources.id`): duas imagens da mesma fonte nunca formam par. */
  sourceId?: string;
  sourceName?: string;
  author?: string;
  width: number;
  height: number;
  /** Adequação semântica ao assunto, 0 a 1 (acervo e licenciadas). */
  fit?: number;
  /** Distâncias de Hamming do hash perceptual contra o acervo (outras origens). */
  phashDistances: number[];
  watermark: boolean;
  /** Título ou legenda sensacionalista associado à imagem. */
  sensational?: boolean;
  /** dHash da própria imagem (compara capa e imagem do texto entre si). */
  phash?: bigint;
  /** Nitidez medida, 0 a 1 (`ImageAnalysis.sharpness`); ausente = não entra na nota. */
  sharpness?: number;
}

export interface MediaCredit {
  sourceName: string;
  author?: string;
  /** Link para o original. */
  url: string;
}

export interface MediaChoice {
  kind: MediaChoiceKind;
  asset?: Candidate;
  credit: MediaCredit | null;
  rationale: string;
}

/** Dimensões e hash de uma imagem baixada (ver `analyze.ts`). */
export interface ImageAnalysis {
  format: "jpeg" | "png" | "webp" | "gif" | "avif";
  contentType: string;
  width: number;
  height: number;
  /** dHash de 64 bits sem sinal. */
  phash: bigint;
  sha256: string;
  bytes: number;
  /** Nitidez 0 a 1 (variância do laplaciano em miniatura); opcional. */
  sharpness?: number;
}
