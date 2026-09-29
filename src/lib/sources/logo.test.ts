import { validateLogo } from "./logo";

function png(w: number, h: number, extra = 0): Uint8Array {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

function webpX(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([...Buffer.from("RIFF")], 0);
  b.set([...Buffer.from("WEBP")], 8);
  b.set([...Buffer.from("VP8X")], 12);
  const put24 = (at: number, n: number) => {
    b[at] = n & 0xff;
    b[at + 1] = (n >> 8) & 0xff;
    b[at + 2] = (n >> 16) & 0xff;
  };
  put24(24, w - 1);
  put24(27, h - 1);
  return b;
}

function webpLossy(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([...Buffer.from("RIFF")], 0);
  b.set([...Buffer.from("WEBP")], 8);
  b.set([...Buffer.from("VP8 ")], 12);
  b.set([0x9d, 0x01, 0x2a], 23);
  new DataView(b.buffer).setUint16(26, w, true);
  new DataView(b.buffer).setUint16(28, h, true);
  return b;
}

describe("validateLogo (D-F25)", () => {
  it("PNG quadrado de 128 px passa", () => {
    expect(validateLogo(png(128, 128))).toEqual({
      ok: true,
      value: { contentType: "image/png", width: 128, height: 128 },
    });
  });

  it("WebP (VP8X e VP8) quadrado passa", () => {
    expect(validateLogo(webpX(96, 96))).toMatchObject({
      ok: true,
      value: { contentType: "image/webp", width: 96 },
    });
    expect(validateLogo(webpLossy(200, 200))).toMatchObject({ ok: true, value: { width: 200 } });
  });

  it("SVG e outros formatos são recusados pelo conteúdo, não pelo nome", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(validateLogo(svg)).toEqual({ ok: false, error: "type" });
    expect(validateLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      ok: false,
      error: "type",
    });
  });

  it("maior que 200 KB, não quadrado ou pequeno demais é recusado", () => {
    expect(validateLogo(png(128, 128, 200 * 1024))).toEqual({ ok: false, error: "size" });
    expect(validateLogo(png(128, 96))).toEqual({ ok: false, error: "square" });
    expect(validateLogo(png(64, 64))).toEqual({ ok: false, error: "small" });
  });

  it("vazio é recusado", () => {
    expect(validateLogo(new Uint8Array())).toEqual({ ok: false, error: "missing" });
  });
});
