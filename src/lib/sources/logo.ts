import { err, ok, type Result } from "@/lib/result";

/** Logo da fonte: PNG ou WebP quadrado, de 96 px a 200 KB. SVG é recusado (pode carregar script). */
export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MIN_SIDE = 96;

export type LogoError = "type" | "size" | "unreadable" | "square" | "small";

export interface LogoInfo {
  format: "png" | "webp";
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, s: string): boolean =>
  s.split("").every((c, i) => b[at + i] === c.charCodeAt(0));

const u32be = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) * 2 ** 24 + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0);
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Formato e dimensões pelos bytes (não confia no tipo declarado). `null` se não for PNG nem WebP legível. */
export function readLogoInfo(bytes: Uint8Array): LogoInfo | null {
  if (
    bytes.length >= 24 &&
    PNG_SIGNATURE.every((v, i) => bytes[i] === v) &&
    ascii(bytes, 12, "IHDR")
  ) {
    return { format: "png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (bytes.length >= 30 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
    if (ascii(bytes, 12, "VP8 ")) {
      return {
        format: "webp",
        width: u16le(bytes, 26) & 0x3fff,
        height: u16le(bytes, 28) & 0x3fff,
      };
    }
    if (ascii(bytes, 12, "VP8L") && bytes[20] === 0x2f) {
      const bits =
        (bytes[21] ?? 0) |
        ((bytes[22] ?? 0) << 8) |
        ((bytes[23] ?? 0) << 16) |
        ((bytes[24] ?? 0) << 24);
      return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (ascii(bytes, 12, "VP8X")) {
      return { format: "webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    }
  }
  return null;
}

/** Confere tipo, tamanho, dimensões e proporção do arquivo enviado. */
export function validateLogo(bytes: Uint8Array, declaredType: string): Result<LogoInfo, LogoError> {
  if (declaredType !== "image/png" && declaredType !== "image/webp") return err("type");
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return err("size");
  const info = readLogoInfo(bytes);
  if (!info) return err("unreadable");
  const declared = declaredType === "image/png" ? "png" : "webp";
  if (info.format !== declared) return err("type");
  if (info.width !== info.height) return err("square");
  if (info.width < LOGO_MIN_SIDE) return err("small");
  return ok(info);
}
