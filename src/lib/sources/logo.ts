/**
 * Logotipo da fonte (D-F25): PNG ou WebP, até 200 KB, quadrado, pelo menos 96 px de lado.
 * O tipo vem dos bytes (assinatura do arquivo), nunca do nome nem do `type` enviado pelo
 * navegador: SVG (que pode carregar script) e qualquer outro formato são recusados.
 */
import { err, ok, type Result } from "@/lib/result";

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MIN_SIDE = 96;

export type LogoError = "missing" | "type" | "size" | "square" | "small" | "unreadable";
export interface LogoInfo {
  contentType: "image/png" | "image/webp";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...b.subarray(at, at + len));

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
  const chunk = ascii(b, 12, 4);
  const u24 = (at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  if (chunk === "VP8X" && b.length >= 30) return { width: u24(24) + 1, height: u24(27) + 1 };
  if (chunk === "VP8 " && b.length >= 30) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
    const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}

export function validateLogo(bytes: Uint8Array): Result<LogoInfo, LogoError> {
  if (bytes.length === 0) return err("missing");
  let contentType: LogoInfo["contentType"];
  let size: { width: number; height: number } | null;
  if (PNG_SIGNATURE.every((v, i) => bytes[i] === v)) {
    contentType = "image/png";
    size = pngSize(bytes);
  } else if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    contentType = "image/webp";
    size = webpSize(bytes);
  } else {
    return err("type");
  }
  if (bytes.length > LOGO_MAX_BYTES) return err("size");
  if (!size || size.width <= 0 || size.height <= 0) return err("unreadable");
  if (size.width !== size.height) return err("square");
  if (size.width < LOGO_MIN_SIDE) return err("small");
  return ok({ contentType, ...size });
}
