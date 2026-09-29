import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, readLogoInfo, validateLogo } from "./logo";

function png(w: number, h: number, extra = 0): Uint8Array {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}
function webpLossy(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
  new DataView(b.buffer).setUint16(26, w, true);
  new DataView(b.buffer).setUint16(28, h, true);
  return b;
}
function webpLossless(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
  b[20] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14);
  new DataView(b.buffer).setUint32(21, bits >>> 0, true);
  return b;
}
function webpExtended(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const put = (at: number, v: number) => {
    b[at] = v & 255;
    b[at + 1] = (v >> 8) & 255;
    b[at + 2] = (v >> 16) & 255;
  };
  put(24, w - 1);
  put(27, h - 1);
  return b;
}

describe("readLogoInfo", () => {
  it("lê PNG e as três variantes de WebP", () => {
    expect(readLogoInfo(png(128, 128))).toEqual({ format: "png", width: 128, height: 128 });
    expect(readLogoInfo(webpLossy(200, 200))).toEqual({ format: "webp", width: 200, height: 200 });
    expect(readLogoInfo(webpLossless(150, 150))).toEqual({
      format: "webp",
      width: 150,
      height: 150,
    });
    expect(readLogoInfo(webpExtended(96, 96))).toEqual({ format: "webp", width: 96, height: 96 });
  });
  it("SVG e lixo não são lidos", () => {
    expect(
      readLogoInfo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBeNull();
    expect(readLogoInfo(new Uint8Array(50))).toBeNull();
  });
});

describe("validateLogo", () => {
  it("aceita PNG e WebP quadrados de 96 px ou mais até 200 KB", () => {
    expect(validateLogo(png(96, 96), "image/png").ok).toBe(true);
    expect(validateLogo(webpLossy(256, 256), "image/webp").ok).toBe(true);
  });
  it("recusa SVG pelo tipo declarado", () => {
    expect(validateLogo(png(128, 128), "image/svg+xml")).toEqual({ ok: false, error: "type" });
  });
  it("recusa tipo declarado que não bate com os bytes", () => {
    expect(validateLogo(png(128, 128), "image/webp")).toEqual({ ok: false, error: "type" });
  });
  it("recusa arquivo grande, retangular, pequeno e ilegível", () => {
    expect(validateLogo(png(128, 128, LOGO_MAX_BYTES), "image/png")).toEqual({
      ok: false,
      error: "size",
    });
    expect(validateLogo(png(128, 100), "image/png")).toEqual({ ok: false, error: "square" });
    expect(validateLogo(png(64, 64), "image/png")).toEqual({ ok: false, error: "small" });
    expect(validateLogo(new Uint8Array(100), "image/png")).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(validateLogo(new Uint8Array(0), "image/png")).toEqual({ ok: false, error: "size" });
  });
});
