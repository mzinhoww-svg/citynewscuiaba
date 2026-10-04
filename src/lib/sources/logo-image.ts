import "server-only";
import { err, ok, type Result } from "@/lib/result";
import { LOGO_MAX_BYTES, LOGO_MIN_SIDE, validateLogo, type LogoError, type LogoInfo } from "./logo";

/**
 * Logotipo achado na internet raramente chega pronto: JPEG, GIF, ICO, PNG de 400 KB ou 190 x 200.
 * Aqui o arquivo vira o que `validateLogo` aceita (PNG quadrado, até 200 KB, ≥ 96 px), ou é
 * recusado com o motivo. O tipo vem sempre dos bytes; SVG nunca passa.
 */

export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "avif" | "ico";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...b.subarray(at, at + len));

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp" && /^(avif|avis)$/.test(ascii(b, 8, 4)))
    return "avif";
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "ico";
  return null;
}

/** Maior imagem PNG embutida num `.ico` (as BMP antigas não são lidas). */
export function extractIcoPng(b: Uint8Array): Uint8Array | null {
  if (sniffImage(b) !== "ico") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = v.getUint16(4, true);
  let best: { bytes: Uint8Array; side: number } | null = null;
  for (let i = 0; i < Math.min(count, 32); i++) {
    const at = 6 + i * 16;
    if (at + 16 > b.length) break;
    const size = v.getUint32(at + 8, true);
    const offset = v.getUint32(at + 12, true);
    if (offset + size > b.length || size < 24) continue;
    const data = b.subarray(offset, offset + size);
    if (!PNG_SIG.every((s, j) => data[j] === s)) continue;
    const side = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(16);
    if (!best || side > best.side) best = { bytes: data.slice(), side };
  }
  return best?.bytes ?? null;
}

export interface NormalizedLogo extends LogoInfo {
  bytes: Uint8Array;
  /** `true` quando o arquivo original foi convertido, reduzido ou recebeu margem. */
  converted: boolean;
}

export type NormalizeError = LogoError | "format";

/** Diferença máxima entre lados para completar com margem em vez de recusar (12%). */
const NEAR_SQUARE = 0.12;
const SIDES = [512, 384, 256, 192, 128];

export async function normalizeLogo(
  input: Uint8Array,
): Promise<Result<NormalizedLogo, NormalizeError>> {
  if (input.length === 0) return err("missing");
  let bytes = input;
  let kind = sniffImage(bytes);
  if (kind === "ico") {
    const inner = extractIcoPng(bytes);
    if (!inner) return err("type");
    bytes = inner;
    kind = "png";
  }
  if (!kind) return err("type");

  if (kind === "png" || kind === "webp") {
    const direct = validateLogo(bytes);
    if (direct.ok) return ok({ ...direct.value, bytes, converted: bytes !== input });
    if (direct.error === "small") return err("small");
  }

  const { default: sharp } = await import("sharp");
  let width: number;
  let height: number;
  let hasAlpha: boolean;
  try {
    const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    hasAlpha = meta.hasAlpha ?? false;
  } catch {
    return err("unreadable");
  }
  if (width <= 0 || height <= 0) return err("unreadable");
  const longest = Math.max(width, height);
  if (longest < LOGO_MIN_SIDE) return err("small");
  if (Math.abs(width - height) / longest > NEAR_SQUARE) return err("square");

  const background = hasAlpha
    ? { r: 255, g: 255, b: 255, alpha: 0 }
    : { r: 255, g: 255, b: 255, alpha: 1 };
  for (const cap of SIDES) {
    const side = Math.min(longest, cap);
    if (side < LOGO_MIN_SIDE) break;
    try {
      const out = new Uint8Array(
        await sharp(bytes, { limitInputPixels: 40_000_000 })
          .resize(side, side, { fit: "contain", background })
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer(),
      );
      if (out.length > LOGO_MAX_BYTES) continue;
      const checked = validateLogo(out);
      return checked.ok
        ? ok({ ...checked.value, bytes: out, converted: true })
        : err(checked.error);
    } catch {
      return err("unreadable");
    }
  }
  return err("size");
}
