import sharp from "sharp";
import { extractIcoPng, normalizeLogo, sniffImage } from "./logo-image";
import { validateLogo } from "./logo";

async function raster(
  w: number,
  h: number,
  fmt: "png" | "jpeg" | "webp" | "gif" = "png",
): Promise<Uint8Array> {
  const img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } },
  });
  return new Uint8Array(await img[fmt]().toBuffer());
}

function ico(png: Uint8Array, dim: number): Uint8Array {
  const head = new Uint8Array(6 + 16);
  const v = new DataView(head.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, 1, true);
  head[6] = dim >= 256 ? 0 : dim;
  head[7] = dim >= 256 ? 0 : dim;
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true);
  return new Uint8Array([...head, ...png]);
}

describe("sniffImage", () => {
  it("reconhece pelos bytes, não pelo nome", async () => {
    expect(sniffImage(await raster(8, 8, "png"))).toBe("png");
    expect(sniffImage(await raster(8, 8, "jpeg"))).toBe("jpeg");
    expect(sniffImage(await raster(8, 8, "webp"))).toBe("webp");
    expect(sniffImage(await raster(8, 8, "gif"))).toBe("gif");
    expect(
      sniffImage(Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))),
    ).toBeNull();
    expect(sniffImage(new Uint8Array([0, 0, 1, 0, 1, 0]))).toBe("ico");
  });
});

describe("normalizeLogo", () => {
  it("PNG quadrado válido passa sem mexer", async () => {
    const bytes = await raster(192, 192);
    const r = await normalizeLogo(bytes);
    expect(r.ok && r.value.bytes).toBe(bytes);
    expect(r.ok && r.value.converted).toBe(false);
  });

  it("JPEG quadrado vira PNG e passa em validateLogo", async () => {
    const r = await normalizeLogo(await raster(300, 300, "jpeg"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.converted).toBe(true);
      expect(validateLogo(r.value.bytes).ok).toBe(true);
      expect(r.value.contentType).toBe("image/png");
    }
  });

  it("ICO com PNG dentro é extraído", async () => {
    const inner = await raster(256, 256);
    expect(extractIcoPng(ico(inner, 256))).toEqual(inner);
    const r = await normalizeLogo(ico(inner, 256));
    expect(r.ok).toBe(true);
  });

  it("ICO só com BMP é recusado", async () => {
    const r = await normalizeLogo(ico(new Uint8Array(40).fill(1), 32));
    expect(r).toEqual({ ok: false, error: "type" });
  });

  it("não quadrado é recusado; quase quadrado é ajustado com margem", async () => {
    expect(await normalizeLogo(await raster(400, 200))).toEqual({ ok: false, error: "square" });
    const near = await normalizeLogo(await raster(200, 188));
    expect(near.ok).toBe(true);
    if (near.ok) expect(validateLogo(near.value.bytes).ok).toBe(true);
  });

  it("menor que 96 px é recusado, mesmo quadrado", async () => {
    expect(await normalizeLogo(await raster(64, 64))).toEqual({ ok: false, error: "small" });
  });

  it("SVG e lixo são recusados", async () => {
    const svg = Uint8Array.from(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>'),
    );
    expect(await normalizeLogo(svg)).toEqual({ ok: false, error: "type" });
    expect(await normalizeLogo(new Uint8Array(0))).toEqual({ ok: false, error: "missing" });
  });

  it("imagem grande é reduzida até caber em 200 KB", async () => {
    const noise = Buffer.alloc(1200 * 1200 * 3);
    let x = 123456789;
    for (let i = 0; i < noise.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      noise[i] = x & 0xff;
    }
    const big = new Uint8Array(
      await sharp(noise, { raw: { width: 1200, height: 1200, channels: 3 } })
        .png()
        .toBuffer(),
    );
    expect(big.length).toBeGreaterThan(200 * 1024);
    const r = await normalizeLogo(big);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bytes.length).toBeLessThanOrEqual(200 * 1024);
  });
});
