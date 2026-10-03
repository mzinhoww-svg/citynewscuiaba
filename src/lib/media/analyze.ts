import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { err, ok, type Result } from "@/lib/result";
import { MAX_IMAGE_BYTES } from "./limits";
import type { ImageAnalysis } from "./types";

const FORMATS: Record<string, ImageAnalysis["format"]> = {
  jpeg: "jpeg",
  jpg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  heif: "avif",
  avif: "avif",
};

/**
 * Mede a imagem baixada: formato (só raster; SVG é recusado), dimensões, hash perceptual (dHash
 * de 64 bits sobre 9 × 8 em cinza) e SHA-256 dos bytes. O arquivo não é alterado: a cópia guardada
 * é a original, sem recorte de crédito nem de marca (A-010).
 */
export async function analyzeImage(bytes: Uint8Array): Promise<Result<ImageAnalysis, string>> {
  if (bytes.byteLength === 0) return err("arquivo vazio");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return err("imagem maior que 10 MB");
  try {
    const img = sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 });
    const meta = await img.metadata();
    const format = FORMATS[meta.format ?? ""];
    if (!format) return err(`formato não aceito: ${meta.format ?? "desconhecido"}`);
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return err("imagem sem dimensões");

    const px = await sharp(bytes)
      .rotate()
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();
    let phash = 0n;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (px[y * 9 + x]! > px[y * 9 + x + 1]!) phash |= 1n << BigInt(y * 8 + x);

    const sharpness = await measureSharpness(bytes);

    return ok({
      format,
      contentType: format === "jpeg" ? "image/jpeg" : `image/${format}`,
      width,
      height,
      phash,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
      ...(sharpness === null ? {} : { sharpness }),
    });
  } catch (e) {
    return err(`imagem inválida: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Nitidez 0 a 1: variância do laplaciano em cinza, em miniatura de 256 px de largura, comprimida
 * por v / (v + 100). Imagem lisa ou desfocada fica perto de 0. Falha de leitura = sem nota.
 */
async function measureSharpness(bytes: Uint8Array): Promise<number | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .grayscale()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    if (w < 3 || h < 3) return null;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - w]! - data[i + w]!;
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return Math.round((variance / (variance + 100)) * 1000) / 1000;
  } catch {
    return null;
  }
}
