import "server-only";
import sharp from "sharp";
import { variantWidthsFor } from "./variants";

const QUALITY = 75;

/**
 * Variantes 480/960/1440 em WebP (qualidade 75) com `sharp`, sem ampliar: só as larguras menores
 * que o original. A imagem é só reduzida (sem recorte), então crédito e marca do original ficam
 * na variante (A-010). Arquivo ilegível devolve lista vazia: a rota serve o original.
 */
export async function makeVariants(buf: Uint8Array): Promise<{ width: number; buf: Buffer }[]> {
  try {
    const meta = await sharp(buf, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    if (!width) return [];
    const out: { width: number; buf: Buffer }[] = [];
    for (const w of variantWidthsFor(width)) {
      const resized = await sharp(buf, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
      out.push({ width: w, buf: resized });
    }
    return out;
  } catch {
    return [];
  }
}
