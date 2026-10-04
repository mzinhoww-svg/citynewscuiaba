import { err, ok, type Result } from "../result";
import { SLOT_MAX_KB } from "./slots";

/*
 * Imagem de banner enviada pelo Estúdio (ADS-T4). O tipo e as dimensões vêm dos bytes, nunca do
 * nome do arquivo nem do tipo declarado pelo navegador: só PNG, JPEG e WebP (sem SVG, que pode
 * carregar script). A peça tem o tamanho exato do formato ou o dobro (tela de alta densidade),
 * até 200 KB.
 */

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageInfo {
  type: ImageType;
  ext: "png" | "jpg" | "webp";
  width: number;
  height: number;
}

export type UploadError = "type" | "size" | "dimensions";

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 24 || !PNG_SIG.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== "IHDR")
    return null;
  return { type: "image/png", ext: "png", width: u32(b, 16), height: u32(b, 20) };
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC): trazem altura e largura.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: "image/jpeg", ext: "jpg", width: u16(b, i + 7), height: u16(b, i + 5) };
    }
    i += 2 + u16(b, i + 2);
  }
  return null;
}

function webpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  const info = (width: number, height: number): ImageInfo => ({
    type: "image/webp",
    ext: "webp",
    width,
    height,
  });
  if (chunk === "VP8X") return info(le24(b, 24) + 1, le24(b, 27) + 1);
  if (chunk === "VP8 ") return info(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  if (chunk === "VP8L") {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return info((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return null;
}

/** Tipo e dimensões lidos dos bytes; `null` se não for PNG, JPEG ou WebP. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  return pngInfo(bytes) ?? jpegInfo(bytes) ?? webpInfo(bytes);
}

/** Confere tipo, peso (até 200 KB) e dimensões (exatas ou o dobro) da imagem para o formato. */
export function validateUpload(
  bytes: Uint8Array,
  format: { width: number; height: number },
): Result<ImageInfo, UploadError> {
  const info = imageInfo(bytes);
  if (!info) return err("type");
  if (bytes.length > SLOT_MAX_KB * 1024) return err("size");
  const fits = [1, 2].some(
    (k) => info.width === format.width * k && info.height === format.height * k,
  );
  if (!fits) return err("dimensions");
  return ok(info);
}
