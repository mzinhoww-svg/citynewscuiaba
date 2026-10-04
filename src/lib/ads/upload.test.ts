import { describe, expect, it } from "vitest";
import { imageInfo, validateUpload } from "./upload";

function png(w: number, h: number, extra = 0): Uint8Array {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  // SOI, APP0 curto, SOF0 com altura e largura.
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (h >> 8) & 0xff,
    h & 0xff,
    (w >> 8) & 0xff,
    w & 0xff,
    0x03,
  ]);
}

describe("imagem enviada (ADS-T4)", () => {
  it("lê tipo e dimensões de PNG e JPEG; recusa o resto", () => {
    expect(imageInfo(png(970, 250))).toEqual({
      type: "image/png",
      ext: "png",
      width: 970,
      height: 250,
    });
    expect(imageInfo(jpeg(300, 250))).toEqual({
      type: "image/jpeg",
      ext: "jpg",
      width: 300,
      height: 250,
    });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8X"));
    webp.set([(728 - 1) & 0xff, (728 - 1) >> 8, 0, 89, 0, 0], 24);
    expect(imageInfo(webp)).toEqual({ type: "image/webp", ext: "webp", width: 728, height: 90 });
    expect(imageInfo(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(imageInfo(new Uint8Array())).toBeNull();
  });

  it("aceita o tamanho exato do formato ou o dobro (tela de alta densidade)", () => {
    expect(validateUpload(png(970, 250), { width: 970, height: 250 }).ok).toBe(true);
    expect(validateUpload(png(1940, 500), { width: 970, height: 250 }).ok).toBe(true);
    const wrong = validateUpload(png(970, 251), { width: 970, height: 250 });
    expect(wrong.ok ? "" : wrong.error).toBe("dimensions");
  });

  it("recusa tipo fora de PNG, JPEG e WebP e peça acima de 200 KB", () => {
    const svg = validateUpload(new TextEncoder().encode("<svg/>"), { width: 970, height: 250 });
    expect(svg.ok ? "" : svg.error).toBe("type");
    const heavy = validateUpload(png(970, 250, 205 * 1024), { width: 970, height: 250 });
    expect(heavy.ok ? "" : heavy.error).toBe("size");
  });
});
